// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The shared Notifications page as a technician, on a phone: a real assignment notification
// (type ticket_assigned) is listed under "Updates" (it used to fit no tab), not under Success or
// Warnings; it shows a readable time ("Today, …") with the full date on hover; every control is at
// least 44 px; "Open job" marks it read and opens that job in My Jobs; and the page never scrolls
// sideways.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

test.describe('Technician notifications controls', () => {
  test.describe.configure({ timeout: 240000 });

  test('45 - every Notifications control works for a technician', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const clientAuth = loadAuthStateFromBackend('client_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });
    const call = async (method, path, auth, data) => {
      const response = await request[method](path, { headers: as(auth), ...(data !== undefined ? { data } : {}) });
      const body = await response.json().catch(() => ({}));
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      return body;
    };
    const stamp = Date.now();

    const service = await call('post', '/api/admin/services/', superAuth, {
      name: `E2E Notice ${stamp}`, description: 'Notification check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `notice${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Notice', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(username);

    // A real assignment: request → approve → assign to the new technician.
    let created;
    let visitDate;
    for (let day = 40; day < 60 && !created; day += 1) {
      visitDate = localKey(new Date(Date.now() + day * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: as(clientAuth),
        data: {
          service_type: service.id, description: `E2E notice ${stamp}`, priority: 'Normal',
          location_address: 'Notice Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: visitDate, latitude: '14.2786', longitude: '121.125',
        },
      });
      if (response.ok()) created = await response.json();
    }
    expect(created, 'a bookable day was found').toBeTruthy();
    await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
    const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
      .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
    const notices = list(await call('get', '/api/notifications/?page_size=200', techAuth));
    const assignment = notices.find((entry) => entry.type === 'ticket_assigned' && Number(entry.related_ticket) === Number(ticket.id));
    expect(assignment, 'the technician was notified of the assignment').toBeTruthy();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, techAuth);
    await page.goto('/technician/notifications');

    const card = page.locator('div.rounded-lg:not([role])').filter({ has: page.getByRole('heading', { name: assignment.title }) }).first();
    await expect(card).toBeVisible({ timeout: 30000 });

    // ── Tabs: an assignment is an update, not a success or a warning ──
    await page.getByRole('button', { name: 'Updates', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Updates', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toBeVisible();
    await page.getByRole('button', { name: 'Success', exact: true }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole('button', { name: 'Warnings', exact: true }).click();
    await expect(card).toHaveCount(0);
    // An empty tab offers a way back to everything.
    await page.getByRole('button', { name: 'View all notifications' }).click();
    await expect(page.getByRole('button', { name: /^All/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(card).toBeVisible();

    // ── Readable time, full date on hover ──
    const when = card.locator('time');
    await expect(when).toHaveText(/^Today, \d{1,2}:\d{2} [AP]M$/);
    await expect(when).toHaveAttribute('title', new RegExp(`${new Date().getFullYear()}`));

    // ── Phone: every control is at least 44 px, and nothing scrolls sideways ──
    const controls = [
      page.getByRole('button', { name: /^Unread/ }),
      page.getByRole('button', { name: 'Mark all as read' }),
      page.getByRole('button', { name: 'Delete all' }),
      card.getByRole('button', { name: /^Delete notification: / }),
      card.getByRole('button', { name: /^Mark as read: / }),
      card.getByRole('button', { name: 'Open job' }),
    ];
    for (const control of controls) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // ── The top-bar bell: 44 px, opens a labelled panel, Escape closes it and returns focus ──
    const bell = page.getByRole('button', { name: 'Open notifications' });
    expect((await bell.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await page.getByRole('button', { name: /sidebar/ }).first().boundingBox()).height).toBeGreaterThanOrEqual(44);
    await bell.click();
    await expect(bell).toHaveAttribute('aria-expanded', 'true');
    const panel = page.getByRole('dialog', { name: 'Recent notifications' });
    await expect(panel.getByRole('button', { name: new RegExp(assignment.title) })).toBeVisible();
    // Rounded: the panel opens with a short scale-in animation.
    expect(Math.round((await panel.getByRole('button', { name: 'Mark all read' }).boundingBox()).height)).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(bell).toBeFocused();
    await expect(bell).toHaveAttribute('aria-expanded', 'false');

    // ── "Open job" marks it read and opens that job ──
    await card.getByRole('button', { name: 'Open job' }).click();
    await expect(page).toHaveURL(new RegExp(`/technician/my-jobs\\?ticketId=${ticket.id}$`));
    await expect.poll(async () => list(await call('get', '/api/notifications/?page_size=200', techAuth))
      .find((entry) => entry.id === assignment.id)?.status).toBe('read');

    // ── A failed load offers "Try Again", which recovers ──
    // The unread count is held steady so the background refresh cannot reload the list by itself:
    // only "Try Again" can bring it back.
    const listUrl = /\/api\/notifications\/(\?.*)?$/;
    const countUrl = '**/api/notifications/unread_count/';
    let listFails = true;
    await page.route(listUrl, (route) => (listFails
      ? route.fulfill({ status: 500, json: { detail: 'Server busy.' } })
      : route.continue()));
    await page.route(countUrl, (route) => route.fulfill({ json: { unread_count: 0 } }));
    await page.goto('/technician/notifications');
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible({ timeout: 30000 });
    listFails = false;
    await page.getByRole('button', { name: 'Try Again' }).click();
    await expect(card).toBeVisible();
    await page.unroute(listUrl);
    await page.unroute(countUrl);

    // ── Mark all as read, then Dismiss the confirmation ──
    const sendDirect = async (text) => call('post', '/api/messages/', superAuth, { room_type: 'direct', receiver: tech.id, text });
    await sendDirect(`Please call the office ${stamp}`);
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    const confirmation = page.getByRole('status').filter({ hasText: 'All notifications marked as read.' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Dismiss' }).click();
    await expect(confirmation).toHaveCount(0);

    // ── Delete all → "Keep notifications" keeps them ──
    await page.getByRole('button', { name: 'Delete all' }).click();
    const deleteAll = page.getByRole('dialog', { name: 'Delete all notifications?' });
    await deleteAll.getByRole('button', { name: 'Keep notifications' }).click();
    await expect(deleteAll).toHaveCount(0);
    await expect(card).toBeVisible();

    // ── The bell's "Mark all read" clears the badge and the page list together ──
    await sendDirect(`Second note ${stamp}`);
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeVisible({ timeout: 30000 });
    await bell.click();
    await panel.getByRole('button', { name: 'Mark all read' }).click();
    await expect(panel.getByText('You are all caught up')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // ── More than ten: Previous / Next ──
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: 900000 + index, title: `Paged notice ${index + 1}`, message: 'Paging check.', type: 'info', status: 'read',
      created_at: new Date(Date.now() - index * 60000).toISOString(),
    }));
    // Like the server: ten to a page, chosen by ?page=.
    await page.route(listUrl, (route) => {
      const pageNumber = Number(new URL(route.request().url()).searchParams.get('page') || 1);
      return route.fulfill({ json: { count: many.length, next: null, previous: null, results: many.slice((pageNumber - 1) * 10, pageNumber * 10) } });
    });
    await page.reload();
    await expect(page.getByText('Showing 1-10 of 12 notifications')).toBeVisible({ timeout: 30000 });
    const next = page.getByRole('button', { name: 'Next', exact: true });
    expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await next.click();
    await expect(page.getByText('Showing 11-12 of 12 notifications')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paged notice 12' })).toBeVisible();
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(page.getByText('Showing 1-10 of 12 notifications')).toBeVisible();
    await page.unroute(listUrl);

    await context.close();
  });
});
