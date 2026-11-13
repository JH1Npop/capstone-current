// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// /client/support with its own client (one approved request):
// - first visit: the new-case form is shown directly; a case with a related request is opened by
//   sending the first message, and its header shows the code, status and REQ link;
// - "Start new case" keeps the form open (background refresh does not switch away);
// - two cases opened in the same second both work (the server used to fail with a 500);
// - the office replies: the notification opens that case (?case=) with the reply;
// - the office resolves it: it moves to past cases, is read-only, and the server refuses new messages;
// - 44 px controls and no sideways scroll on a phone, plus a laptop screenshot.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const reqCode = (id) => `REQ-${String(id).padStart(4, '0')}`;

test.describe('Client support controls', () => {
  test.describe.configure({ timeout: 300000 });

  test('54 - every Client Support control works', async ({ browser, request }) => {
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
      name: `E2E Support ${stamp}`, description: 'Support check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const clientName = `spclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Support', last_name: `Client${stamp}`, phone: '09171234595', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);
    let booked;
    for (let day = 170; day < 190 && !booked; day += 1) {
      const response = await request.post('/api/services/service-requests/', {
        headers: as(clientAuth),
        data: {
          service_type: service.id, description: 'Support check', priority: 'Normal',
          location_address: 'Support Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: localKey(new Date(Date.now() + day * 86400000)), latitude: '14.2786', longitude: '121.125',
        },
      });
      if (response.ok()) booked = await response.json();
    }
    await call('post', `/api/services/service-requests/${booked.id}/approve/`, superAuth);

    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);
    const noSidewaysScroll = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    };

    // ── First visit: the form is there; the first message opens a case ──
    await page.goto('/client/support');
    await expect(page.getByText('New case: fill this in, then write your message below.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Start new case' })).toHaveCount(0);
    await page.getByLabel('Subject').fill('Inverter shows an error');
    await page.getByLabel('Category').selectOption('technical');
    await page.getByLabel('Related request').selectOption({ label: `${reqCode(booked.id)} · ${service.name}` });
    const message = page.getByRole('textbox', { name: 'Your message' });
    await message.fill('The inverter shows E21 since this morning.');
    for (const control of [page.getByLabel('Subject'), page.getByLabel('Related request'), page.getByRole('button', { name: 'Send' }), page.getByRole('button', { name: 'Refresh' })]) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('The inverter shows E21 since this morning.')).toBeVisible();
    const cases = async () => list(await call('get', '/api/messages/support-cases/', clientAuth));
    const caseA = (await cases()).find((entry) => entry.subject === 'Inverter shows an error');
    expect(caseA.ticket_id).toBeTruthy();
    expect(caseA.request_id).toBe(booked.id);
    await expect(page.getByText(`[CSC-${String(caseA.id).padStart(4, '0')}]`).last()).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(reqCode(booked.id)) })).toBeVisible();
    await noSidewaysScroll();

    // ── Start new case: the form stays open through a background refresh ──
    await page.getByRole('button', { name: 'Start new case' }).click();
    await expect(page.getByLabel('Subject')).toBeVisible();
    await page.waitForTimeout(6500);
    await expect(page.getByLabel('Subject')).toBeVisible();

    // ── Two cases in the same second both open ──
    const [first, second] = await Promise.all([
      request.post('/api/messages/support-cases/', { headers: as(clientAuth), data: { subject: 'Twin one', category: 'general', priority: 'normal' } }),
      request.post('/api/messages/support-cases/', { headers: as(clientAuth), data: { subject: 'Twin two', category: 'general', priority: 'normal' } }),
    ]);
    expect([first.status(), second.status()]).toEqual([201, 201]);

    // ── The office replies; the notification opens that case ──
    await call('post', '/api/messages/', superAuth, { room_type: 'group', group_key: caseA.group_key, text: 'Please restart the inverter and tell us if E21 returns.' });
    await page.goto('/client/notifications');
    const notice = page.locator('div.rounded-lg:not([role])', { hasText: `Customer support replied to case #${caseA.id}` }).first();
    await expect(notice).toBeVisible({ timeout: 30000 });
    await notice.getByRole('button', { name: 'Open support case' }).click();
    await expect(page).toHaveURL(new RegExp(`/client/support\\?case=${caseA.id}$`));
    await expect(page.getByText('Please restart the inverter and tell us if E21 returns.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('group', { name: 'Open cases' }).getByRole('button', { pressed: true })).toContainText('Inverter shows an error');

    // ── Laptop screenshot of the conversation ──
    const laptopPage = await laptop.newPage();
    await seedAuthState(laptopPage, clientAuth);
    await laptopPage.goto(`/client/support?case=${caseA.id}`);
    await expect(laptopPage.getByText('Please restart the inverter and tell us if E21 returns.')).toBeVisible({ timeout: 30000 });
    await laptopPage.screenshot({ path: 'test-results/screenshots/54-client-support-laptop.png' });
    await laptop.close();

    // ── The office resolves it: past case, read-only, server refuses new messages ──
    await call('patch', `/api/messages/support-cases/${caseA.id}/`, superAuth, { status: 'resolved' });
    await page.goto(`/client/support?case=${caseA.id}`);
    await expect(page.getByText('This case is resolved. Start a new case if you still need help.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('textbox', { name: 'Your message' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Hide past cases \(1\)/ })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Past cases' })).toContainText('Inverter shows an error');
    const refused = await request.post('/api/messages/', { headers: as(clientAuth), data: { room_type: 'group', group_key: caseA.group_key, text: 'One more thing' } });
    expect(refused.status()).toBe(400);
    await noSidewaysScroll();
    await context.close();
  });
});
