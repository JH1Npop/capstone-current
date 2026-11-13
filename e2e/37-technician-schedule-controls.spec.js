// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /technician/schedule, with its own technicians and jobs: month navigation and
// Today, the month count, client names (not usernames), Details and Navigate opening the right
// job, Show Completed Jobs (a finished job appears, without a Navigate button), the legend listing
// the statuses on the calendar, Upcoming Tasks (only from today on, not finished), a failed load
// keeping the calendar with Try again, the phone calendar (tap a day, open its job), and a
// technician without navigation access seeing no Navigate buttons.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const code = (id) => `TKT-${String(id).padStart(4, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let nextDay = 8;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data, multipart = false) => {
    const options = { headers };
    if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return {
    get: (path) => call('get', path),
    post: (path, data, multipart) => call('post', path, data ?? {}, multipart),
    put: (path, data) => call('put', path, data),
  };
};

const monthsFromNow = (dateKey) => {
  const [year, month] = dateKey.split('-').map(Number);
  const now = new Date();
  return (year * 12 + (month - 1)) - (now.getFullYear() * 12 + now.getMonth());
};

test.describe('Technician schedule controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('37 - every Technician Schedule control works', async ({ page, browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();
    const service = await admin.post('/api/admin/services/', {
      name: `E2E Sched ${stamp}`, description: 'Technician schedule check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const makeTech = async (suffix) => {
      const username = `sched${suffix}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Sched', last_name: `${suffix}${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
      });
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      return { ...tech, username };
    };
    const tech = await makeTech('Main');
    const noNav = await makeTech('NoNav');
    await admin.put(`/api/users/${noNav.id}/capabilities/`, { capabilities: ['technician.dashboard.view', 'technician.jobs.view', 'technician.schedule.view'] });
    const makeJob = async (techId) => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        visitDate = dayKey(nextDay++);
        const response = await request.post('/api/services/service-requests/', {
          headers: { Authorization: `Token ${clientAuth.token}` },
          data: {
            service_type: service.id, description: `E2E schedule ${stamp}`, priority: 'Normal',
            location_address: 'Sched Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
        else expect(await response.text()).toContain('no appointment availability');
      }
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: techId, dispatch_stage: 'service', scheduled_date: visitDate });
      return { id: ticket.id, date: visitDate };
    };
    const upcoming = await makeJob(tech.id);
    const finished = await makeJob(tech.id);
    const noNavJob = await makeJob(noNav.id);
    // Finish one job for real.
    const techAuth = loadAuthStateFromBackend(tech.username);
    const techApi = apiAs(request, techAuth);
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await techApi.post(`/api/technician/jobs/${finished.id}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${finished.id}/arrive/`, SITE);
    await techApi.post(`/api/technician/jobs/${finished.id}/status/`, { status: 'in_progress' });
    await techApi.post('/api/checklist/', {
      jobId: finished.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
      notes: 'Done.', maintenance_required: false,
    });
    await techApi.post(`/api/services/service-tickets/${finished.id}/complete_work/`, {
      completion_notes: 'Work finished.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
    }, true);

    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, techAuth);
    await page.goto('/technician/schedule');
    const next = page.getByRole('button', { name: 'Next month' });
    await expect(next).toBeVisible({ timeout: 30000 });

    // ── Go to the month of the upcoming job ──
    for (let step = 0; step < monthsFromNow(upcoming.date); step += 1) await next.click();
    const monthName = new Date(`${upcoming.date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    await expect(page.getByRole('heading', { name: monthName })).toBeVisible();
    await expect(page.getByText(/scheduled tasks? this month$/)).toBeVisible();

    // ── The job shows the client's name and opens the right pages ──
    const details = page.getByRole('button', { name: `Details for ${code(upcoming.id)}` });
    await expect(details).toBeVisible();
    const cell = page.locator('div.rounded-lg').filter({ has: details });
    await expect(cell).toContainText('Test Client');
    await expect(cell).not.toContainText('client_test');
    await details.click();
    await expect(page).toHaveURL(new RegExp(`/technician/my-jobs\\?ticketId=${upcoming.id}`));
    await page.goBack();
    await expect(next).toBeVisible();
    for (let step = 0; step < monthsFromNow(upcoming.date); step += 1) await next.click();
    await page.getByRole('button', { name: `Navigate to ${code(upcoming.id)}` }).click();
    await expect(page).toHaveURL(new RegExp(`/technician/map-navigation\\?ticketId=${upcoming.id}`));
    await page.goBack();
    await expect(next).toBeVisible();

    // ── Upcoming Tasks: from today on and not finished ──
    for (let step = 0; step < monthsFromNow(upcoming.date); step += 1) await next.click();
    const upcomingSection = page.locator('div.border-t').filter({ has: page.getByRole('heading', { name: 'Upcoming Tasks' }) });
    await expect(upcomingSection.getByRole('button', { name: `Open ${code(upcoming.id)}` })).toBeVisible();
    await expect(upcomingSection.getByRole('button', { name: `Open ${code(finished.id)}` })).toHaveCount(0);

    // ── Show Completed Jobs: the finished job appears, with no Navigate button ──
    for (let step = monthsFromNow(upcoming.date); step < monthsFromNow(finished.date); step += 1) await next.click();
    await expect(page.getByRole('button', { name: `Details for ${code(finished.id)}` })).toHaveCount(0);
    await page.getByLabel('Show Completed Jobs').check();
    await expect(page.getByRole('button', { name: `Details for ${code(finished.id)}` })).toBeVisible();
    await expect(page.getByRole('button', { name: `Navigate to ${code(finished.id)}` })).toHaveCount(0);
    // The legend lists what is on the calendar (here, Completed).
    await expect(page.locator('div.flex.flex-wrap.gap-3').getByText('Completed', { exact: true })).toBeVisible();
    await page.getByLabel('Show Completed Jobs').uncheck();

    // ── A failed load keeps the calendar and its controls, with Try again ──
    await page.route('**/api/technician/schedule/*', (route) => route.fulfill({ status: 500, json: { detail: 'Schedule is unavailable.' } }));
    await next.click();
    const alert = page.getByRole('alert').filter({ hasText: /schedule/i });
    await expect(alert).toBeVisible();
    await expect(next).toBeVisible();
    await page.unroute('**/api/technician/schedule/*');
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(alert).toHaveCount(0);

    // ── Today returns to the current month ──
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.getByRole('heading', { name: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) })).toBeVisible();

    // ── Phone calendar: tap the job's day, then open it ──
    await page.setViewportSize({ width: 390, height: 844 });
    for (let step = 0; step < monthsFromNow(upcoming.date); step += 1) await next.click();
    const dayLabel = new Date(`${upcoming.date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    await page.getByRole('button', { name: new RegExp(`^${dayLabel}, \\d+ scheduled task`) }).click();
    await page.getByRole('button', { name: `Open ${code(upcoming.id)}` }).first().click();
    await expect(page).toHaveURL(new RegExp(`/technician/my-jobs\\?ticketId=${upcoming.id}`));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // ── Without navigation access there are no Navigate buttons ──
    const noNavContext = await browser.newContext();
    const noNavPage = await noNavContext.newPage();
    await seedAuthState(noNavPage, loadAuthStateFromBackend(noNav.username));
    await noNavPage.goto('/technician/schedule');
    const noNavNext = noNavPage.getByRole('button', { name: 'Next month' });
    await expect(noNavNext).toBeVisible({ timeout: 30000 });
    for (let step = 0; step < monthsFromNow(noNavJob.date); step += 1) await noNavNext.click();
    await expect(noNavPage.getByRole('button', { name: `Details for ${code(noNavJob.id)}` })).toBeVisible();
    await expect(noNavPage.getByRole('button', { name: /^Navigate to / })).toHaveCount(0);
    await noNavContext.close();

    // ── Phone: the list is the default, with Open / Navigate / Call, and closed days show ──
    const clientRecord = list(await admin.get('/api/users/?page_size=200')).find((entry) => entry.username === 'client_test');
    const originalPhone = (await admin.get(`/api/admin/clients/${clientRecord.id}/`)).phone || '';
    const taken = new Set([upcoming.date, finished.date, noNavJob.date]);
    const shifted = (offset) => localKey(new Date(new Date(`${upcoming.date}T00:00:00`).getTime() + offset * 86400000));
    const closedDay = [1, -1, 2, -2, 3].map(shifted).find((key) => !taken.has(key) && key.slice(0, 7) === upcoming.date.slice(0, 7));
    const closure = (data) => admin.post('/api/admin/calendar/closures/', { date: closedDay, time_slot: 'all_day', ...data });
    try {
      await admin.put(`/api/admin/clients/${clientRecord.id}/`, { first_name: 'Test', last_name: 'Client', phone: '09171234567', status: 'active' });
      await closure({ action: 'close', reason: 'E2E closed day' });
      const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const phonePage = await phoneContext.newPage();
      await phonePage.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(phonePage, techAuth);
      await phonePage.goto('/technician/schedule');
      const listButton = phonePage.getByRole('button', { name: 'List', exact: true });
      await expect(listButton).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
      const phoneNext = phonePage.getByRole('button', { name: 'Next month' });
      for (let step = 0; step < monthsFromNow(upcoming.date); step += 1) await phoneNext.click();
      await expect(phonePage.getByRole('button', { name: `Open ${code(upcoming.id)}` })).toBeVisible();
      await expect(phonePage.getByRole('button', { name: `Navigate to ${code(upcoming.id)}` })).toBeVisible();
      await expect(phonePage.getByRole('link', { name: 'Call Test Client' }).first()).toHaveAttribute('href', 'tel:09171234567');
      await expect(phonePage.getByText('Closed: All day · E2E closed day')).toBeVisible();
      // Buttons are big enough for a thumb.
      const openBox = await phonePage.getByRole('button', { name: `Open ${code(upcoming.id)}` }).boundingBox();
      expect(openBox.height).toBeGreaterThanOrEqual(44);
      await phonePage.getByRole('button', { name: `Open ${code(upcoming.id)}` }).click();
      await expect(phonePage).toHaveURL(new RegExp(`/technician/my-jobs\\?ticketId=${upcoming.id}`));
      await phonePage.goBack();
      // Month view is one tap away, and the choice is remembered.
      await phonePage.getByRole('button', { name: 'Month', exact: true }).click();
      await expect(phonePage.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await phonePage.reload();
      await expect(phonePage.getByRole('button', { name: 'Month', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
      expect(await phonePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      await phoneContext.close();
    } finally {
      await closure({ action: 'reopen' });
      await admin.put(`/api/admin/clients/${clientRecord.id}/`, { first_name: 'Test', last_name: 'Client', phone: originalPhone, status: 'active' });
    }
  });
});
