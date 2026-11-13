// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// A job longer than one work day appears on every day it takes, on both calendars, and skips the
// weekend: a 3-work-day job starting on a Friday is shown Friday ("Day 1 of 3"), Monday ("Day 2 of
// 3") and Tuesday ("Day 3 of 3"), not on Saturday or Sunday. The overdue rule and capacity for
// long jobs are covered by backend tests (services.tests.test_work_calendar).

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data) => {
    const options = { headers };
    if (data !== undefined) options.data = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return { get: (path) => call('get', path), post: (path, data) => call('post', path, data ?? {}), put: (path, data) => call('put', path, data) };
};

const monthsFromNow = (dateKey) => {
  const [year, month] = dateKey.split('-').map(Number);
  const now = new Date();
  return (year * 12 + (month - 1)) - (now.getFullYear() * 12 + now.getMonth());
};
const shiftKey = (key, days) => localKey(new Date(new Date(`${key}T00:00:00`).getTime() + days * 86400000));

test.describe('Long jobs on the calendars', () => {
  test.describe.configure({ timeout: 300000 });

  test('38 - a 3-day job starting Friday shows Friday, Monday and Tuesday on both calendars', async ({ page, browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();
    const service = await admin.post('/api/admin/services/', {
      name: `E2E Long ${stamp}`, description: 'Three working days.', estimated_duration: 3 * 480, estimated_cost: 1000,
      max_daily_assignments: 5, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Install', description: 'Install.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `long${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Long', last_name: `Job${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });

    // Book on a Friday that has availability.
    let created;
    let friday;
    for (let offset = 6; offset < 58 && !created; offset += 1) {
      const candidate = new Date(Date.now() + offset * 86400000);
      if (candidate.getDay() !== 5) continue;
      friday = localKey(candidate);
      const response = await request.post('/api/services/service-requests/', {
        headers: { Authorization: `Token ${clientAuth.token}` },
        data: {
          service_type: service.id, description: `E2E long job ${stamp}`, priority: 'Normal',
          location_address: 'Long Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: friday, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        },
      });
      if (response.ok()) created = await response.json();
    }
    expect(created, 'a Friday with availability').toBeTruthy();
    await admin.post(`/api/services/service-requests/${created.id}/approve/`);
    const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
      .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: friday });
    const code = `TKT-${String(ticket.id).padStart(4, '0')}`;
    const monday = shiftKey(friday, 3);
    const tuesday = shiftKey(friday, 4);

    // ── The server lists the three work days ──
    const techAuth = loadAuthStateFromBackend(username);
    const techApi = apiAs(request, techAuth);
    const schedule = await techApi.get(`/api/technician/schedule/?start=${friday}&end=${shiftKey(friday, 10)}`);
    const job = schedule.jobs.find((entry) => entry.id === ticket.id);
    expect(job.work_days).toEqual([
      { date: friday, day: 1, of: 3 },
      { date: monday, day: 2, of: 3 },
      { date: tuesday, day: 3, of: 3 },
    ]);

    // ── Technician schedule (phone list): Day 1, 2 and 3 on Friday, Monday and Tuesday ──
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const phonePage = await phone.newPage();
    await seedAuthState(phonePage, techAuth);
    await phonePage.goto('/technician/schedule');
    await expect(phonePage.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    const nextMonth = phonePage.getByRole('button', { name: 'Next month' });
    for (let step = 0; step < monthsFromNow(friday); step += 1) await nextMonth.click();
    const daySection = (key) => phonePage.getByRole('region', {
      name: new RegExp(new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
    });
    await expect(daySection(friday).getByText('Day 1 of 3')).toBeVisible();
    await expect(daySection(friday).getByRole('button', { name: `Open ${code}` })).toBeVisible();
    for (let step = monthsFromNow(friday); step < monthsFromNow(monday); step += 1) await nextMonth.click();
    await expect(daySection(monday).getByText('Day 2 of 3')).toBeVisible();
    for (let step = monthsFromNow(monday); step < monthsFromNow(tuesday); step += 1) await nextMonth.click();
    await expect(daySection(tuesday).getByText('Day 3 of 3')).toBeVisible();
    // Not on the weekend in between.
    await expect(phonePage.getByRole('region', {
      name: new RegExp(new Date(`${shiftKey(friday, 1)}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
    }).getByRole('button', { name: `Open ${code}` })).toHaveCount(0);
    await phone.close();

    // ── Admin calendar: the same three days ──
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, loadAuthStateFromBackend('superadmin_test'));
    await page.goto('/admin/calendar');
    const adminNext = page.getByRole('button', { name: 'Next month' });
    await expect(adminNext).toBeVisible({ timeout: 30000 });
    for (let step = 0; step < monthsFromNow(tuesday); step += 1) await adminNext.click();
    const events = await (await request.get(`/api/admin/calendar/?start=${friday}&end=${tuesday}`, {
      headers: { Authorization: `Token ${loadAuthStateFromBackend('superadmin_test').token}` },
    })).json();
    const event = events.events.find((entry) => entry.ticket_id === ticket.id);
    expect(event.work_days.map((entry) => entry.date)).toEqual([friday, monday, tuesday]);
    await expect(page.getByText(/Day 3 of 3/).first()).toBeVisible();
  });
});
