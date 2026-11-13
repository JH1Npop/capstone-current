// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Adds `count` plain update notifications for one user, straight in the e2e database.
const addNotifications = (username, count) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  const script = [
    'from django.contrib.auth import get_user_model',
    'from notifications.models import Notification',
    `user = get_user_model().objects.get(username=${JSON.stringify(username)})`,
    `Notification.objects.bulk_create([Notification(user=user, title=f"Office update {n}", message=f"Office update number {n}.", type="info") for n in range(1, ${Number(count) + 1})])`,
  ].join('; ');
  execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

// /client/notifications with its own client, technician and job:
// - every notice from the real job flow has a title (none reads "Notification"), and the ones that
//   ask the client to act name the action ("Review quotation") and open that request;
// - tabs filter, the Unread count matches the server, Mark as read / Mark all as read work;
// - a new notice appears without reloading; pages of 10 (a notice with no request says "Open My Requests"); Delete one; Delete all asks first;
// - 44 px controls and no sideways scroll on a phone, plus a laptop screenshot.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };

test.describe('Client notifications controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('55 - every Notifications control works', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });
    const call = async (method, path, auth, data) => {
      const options = { headers: as(auth) };
      if (data !== undefined) options.data = data;
      const response = await request[method](path, options);
      const body = await response.json().catch(() => ({}));
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      return body;
    };
    const stamp = Date.now();
    const service = await call('post', '/api/admin/services/', superAuth, {
      name: `E2E Notices ${stamp}`, description: 'Notices check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const techName = `nttech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Notice', last_name: `Tech${stamp}`, phone: '09171234568', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const clientName = `ntclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Notice', last_name: `Client${stamp}`, phone: '09171234596', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);

    let booked;
    for (let day = 190; day < 210 && !booked; day += 1) {
      const visitDate = localKey(new Date(Date.now() + day * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: as(clientAuth),
        data: {
          service_type: service.id, description: 'Notices check', priority: 'Normal',
          location_address: 'Notice Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        },
      });
      if (response.ok()) booked = { ...(await response.json()), visitDate };
    }
    await call('post', `/api/services/service-requests/${booked.id}/approve/`, superAuth);
    const ticket = list(await call('get', `/api/services/service-tickets/?request=${booked.id}`, superAuth))
      .find((entry) => Number(entry.request) === Number(booked.id) || Number(entry.request_id) === Number(booked.id));
    await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: booked.visitDate });
    await call('post', `/api/technician/jobs/${ticket.id}/start-navigation/`, techAuth);
    await call('post', `/api/technician/jobs/${ticket.id}/arrive/`, techAuth, SITE);
    const quotationNumber = `QUO-N${stamp}`;
    await call('post', '/api/services/quotations/', superAuth, {
      ticket: ticket.id, client: booked.client ?? booked.client_id, quotation_number: quotationNumber, total_amount: 'PHP 8,000.00', status: 'Sent', validity_days: 30,
      bill_of_materials: [{ description: 'Cleaning kit', qty: '1', unit: 'set', amount: '8,000.00' }],
    });

    // Every notice the job produced for the client has a title and is linked to the request.
    const notices = list(await call('get', '/api/notifications/', clientAuth));
    expect(notices.length).toBeGreaterThanOrEqual(5);
    for (const notice of notices) {
      expect(notice.title, notice.message).toBeTruthy();
      expect(notice.related_request, notice.title).toBe(booked.id);
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);
    const card = (title) => page.locator('div.rounded-lg:not([role])', { has: page.getByRole('heading', { name: title, exact: true }) });
    const unreadTab = page.getByRole('button', { name: /^Unread/ });
    const noSidewaysScroll = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    };

    // ── The job's notices are titled and open the request ──
    await page.goto('/client/notifications');
    await expect(card('Technician on the way')).toBeVisible({ timeout: 30000 });
    await expect(card('Technician arrived')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notification', exact: true })).toHaveCount(0);
    await expect(unreadTab).toContainText(String(notices.length));
    for (const control of [unreadTab, page.getByRole('button', { name: 'Mark all as read' }), page.getByRole('button', { name: 'Delete all' })]) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await noSidewaysScroll();

    // ── Tabs filter ──
    await page.getByRole('button', { name: 'Success' }).click();
    await expect(page.getByRole('button', { name: 'Success' })).toHaveAttribute('aria-pressed', 'true');
    await expect(card(`Service Request #${booked.id} Approved`)).toBeVisible();
    await expect(card('Technician on the way')).toHaveCount(0);
    await page.getByRole('button', { name: 'Updates' }).click();
    await expect(card('Technician on the way')).toBeVisible();
    await page.getByRole('button', { name: 'All', exact: true }).click();

    // ── Mark as read lowers the Unread count ──
    await card('Technician arrived').getByRole('button', { name: 'Mark as read: Technician arrived' }).click();
    await expect(card('Technician arrived').getByRole('button', { name: /Mark as read/ })).toHaveCount(0);
    await expect(unreadTab).toContainText(String(notices.length - 1));

    // ── "Review quotation" opens the request with the quotation and marks the notice read ──
    const quoteCard = card(`Quotation ${quotationNumber} ready`);
    await quoteCard.getByRole('button', { name: 'Review quotation' }).click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${booked.id}\\?entity=request$`));
    await expect(page.getByText(quotationNumber).first()).toBeVisible({ timeout: 30000 });
    const quoteNotice = list(await call('get', '/api/notifications/', clientAuth)).find((entry) => entry.title === `Quotation ${quotationNumber} ready`);
    expect(quoteNotice.status).toBe('read');

    // ── A new notice appears without reloading ──
    await page.goto('/client/notifications');
    await expect(card('Technician on the way')).toBeVisible({ timeout: 30000 });
    const supportCase = await call('post', '/api/messages/support-cases/', clientAuth, { subject: 'Live notice', category: 'general', priority: 'normal' });
    await call('patch', `/api/messages/support-cases/${supportCase.id}/`, superAuth, { status: 'resolved' });
    const resolvedCard = card(`Support case #${supportCase.id} resolved`);
    await expect(resolvedCard).toBeVisible({ timeout: 30000 });
    await expect(resolvedCard.getByRole('button', { name: 'Open support case' })).toBeVisible();

    // ── Pages of 10 ──
    addNotifications(clientName, 12);
    await page.reload();
    const firstPage = await call('get', '/api/notifications/', clientAuth);
    const total = firstPage.count ?? list(firstPage).length;
    await expect(page.getByText(`Showing 1-10 of ${total} notifications`)).toBeVisible({ timeout: 30000 });
    // A notice with no linked request opens the list and says so.
    await expect(card('Office update 1').getByRole('button', { name: 'Open My Requests' })).toHaveCount(await card('Office update 1').count());
    await expect(page.getByRole('button', { name: 'Open request' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(new RegExp(`Showing 11-\\d+ of ${total} notifications`))).toBeVisible();
    await page.getByRole('button', { name: 'Previous' }).click();

    // ── Delete one ──
    const doomed = (await page.getByRole('heading', { name: /^Office update \d+$/ }).first().textContent()).trim();
    await page.getByRole('button', { name: `Delete notification: ${doomed}` }).click();
    await expect(page.getByRole('status').filter({ hasText: `Deleted "${doomed}".` })).toBeVisible();
    await expect(page.getByRole('heading', { name: doomed, exact: true })).toHaveCount(0);

    // ── Mark all as read ──
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'All notifications marked as read.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
    await expect(unreadTab).toHaveText('Unread');
    expect((await call('get', '/api/notifications/unread_count/', clientAuth)).unread_count).toBe(0);

    // ── Laptop screenshot ──
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const laptopPage = await laptop.newPage();
    await seedAuthState(laptopPage, clientAuth);
    await laptopPage.goto('/client/notifications');
    await expect(laptopPage.getByText(/Showing 1-10 of/)).toBeVisible({ timeout: 30000 });
    await laptopPage.screenshot({ path: 'test-results/screenshots/55-client-notifications-laptop.png' });
    await laptop.close();

    // ── Delete all asks first; "Keep notifications" keeps them ──
    await page.getByRole('button', { name: 'Delete all' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Delete all notifications?');
    await dialog.getByRole('button', { name: 'Keep notifications' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText(/Showing 1-10 of/)).toBeVisible();
    await page.getByRole('button', { name: 'Delete all' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete all' }).click();
    await expect(page.getByText('You have no new notifications right now.')).toBeVisible();
    expect(list(await call('get', '/api/notifications/', clientAuth))).toHaveLength(0);
    await noSidewaysScroll();
    await context.close();
  });
});
