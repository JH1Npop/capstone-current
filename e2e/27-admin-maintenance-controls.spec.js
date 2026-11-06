// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/maintenance, for admin and superadmin. A real job is completed with
// maintenance required, which creates the schedule; then: summary cards that filter, status
// buttons, search, details (Escape), Reschedule, Stop and Resume reminders, Mark completed, the
// after-sales link (this client) and the job-history link (this job, only with access).

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SITE = { latitude: 14.2786, longitude: 121.125 };
let nextDay = 30;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data, { multipart = false } = {}) => {
    const options = { headers };
    if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return {
    get: (path) => call('get', path),
    post: (path, data, options) => call('post', path, data ?? {}, options),
    put: (path, data) => call('put', path, data),
  };
};

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Maintenance controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`27 - ${username}: every Maintenance control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';

      // ── A real completed job that requires maintenance ──
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Upkeep ${tag} ${stamp}`, description: 'Created by the maintenance controls check.',
        estimated_duration: 60, estimated_cost: 5000, max_daily_assignments: 5, is_active: true,
        requires_site_inspection: false,
        procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
        inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
      });
      const techUsername = `upkeep${tag}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username: techUsername, email: `${techUsername}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Upkeep', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
      });
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
      await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
      const visitDate = dayKey(nextDay++);
      const created = await client.post('/api/services/service-requests/', {
        service_type: service.id, description: `E2E upkeep ${stamp}`, priority: 'Normal',
        location_address: 'Upkeep Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
        preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
      });
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      const ticketCode = `TKT-${String(ticket.id).padStart(4, '0')}`;
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
      await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
      await techApi.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
      await techApi.post('/api/checklist/', {
        jobId: ticket.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
        notes: 'Done.', maintenance_required: true, maintenance_profile: 'commercial_area',
      });
      await techApi.post(`/api/services/service-tickets/${ticket.id}/complete_work/`, {
        completion_notes: 'Work finished.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
      }, { multipart: true });
      const scheduleFor = async () => list(await admin.get(`/api/services/maintenance-schedules/?status=all&search=${encodeURIComponent(service.name)}`))
        .find((entry) => entry.ticket_code === ticketCode);
      await expect.poll(scheduleFor, { timeout: 30000 }).toBeTruthy();
      const schedule = await scheduleFor();

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/maintenance');
      await expect(page.getByRole('heading', { name: 'Maintenance schedules' })).toBeVisible({ timeout: 30000 });

      // ── Summary cards match the API, use one colour, and filter ──
      const counts = await admin.get('/api/services/maintenance-schedules/summary/');
      const cards = page.getByRole('region', { name: 'Maintenance summary' });
      await expect(cards.getByRole('button', { name: /^Active/ })).toContainText(String(counts.active || 0));
      await cards.getByRole('button', { name: /^Stopped/ }).click();
      await expect(page).toHaveURL(/status=dismissed/);
      await expect(cards.getByRole('button', { name: /^Stopped/ })).toHaveAttribute('aria-pressed', 'true');
      await cards.getByRole('button', { name: /^Active/ }).click();
      await expect(page).not.toHaveURL(/status=/);

      // ── Search, details, Escape ──
      await page.getByRole('textbox', { name: 'Search maintenance' }).fill(service.name);
      const row = page.getByRole('button', { name: new RegExp(ticketCode) });
      await expect(row).toBeVisible();
      await row.click();
      const details = page.getByRole('dialog', { name: 'Maintenance details' });
      await expect(details).toContainText('Commercial Area');
      await page.keyboard.press('Escape');
      await expect(details).toBeHidden();

      // ── Reschedule (past dates not offered) ──
      await row.click();
      await details.getByRole('button', { name: 'Reschedule' }).click();
      const reschedule = page.getByRole('dialog', { name: 'Reschedule maintenance?' });
      await expect(reschedule.getByLabel('New maintenance date')).toHaveAttribute('min', localKey(new Date()));
      const newDate = dayKey(120);
      await reschedule.getByLabel('New maintenance date').fill(newDate);
      await reschedule.getByLabel('Reason').fill('Client asked for a later visit.');
      await reschedule.getByRole('button', { name: 'Save new date' }).click();
      await expect(page.getByRole('status')).toContainText('Maintenance date updated');
      await expect.poll(async () => (await scheduleFor()).next_due_date).toBe(newDate);

      // ── Stop reminders, find it under Stopped, Resume ──
      await row.click();
      await details.getByRole('button', { name: 'Stop reminders' }).click();
      const stop = page.getByRole('dialog', { name: 'Stop maintenance reminders?' });
      await stop.getByLabel('Reason').fill('Client is travelling for three months.');
      await stop.getByRole('button', { name: 'Stop reminders' }).click();
      await expect(page.getByRole('status')).toContainText('Maintenance reminders stopped.');
      await expect.poll(async () => (await scheduleFor()).status).toBe('dismissed');
      await page.getByRole('button', { name: 'Stopped', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Stopped', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await row.click();
      await details.getByRole('button', { name: 'Resume reminders' }).click();
      const resume = page.getByRole('dialog', { name: 'Resume maintenance reminders?' });
      await resume.getByLabel('Reason').fill('Client is back.');
      await resume.getByRole('button', { name: 'Resume reminders' }).click();
      await expect(page.getByRole('status')).toContainText('Maintenance reminders resumed.');
      await expect.poll(async () => (await scheduleFor()).status).not.toBe('dismissed');

      // ── Links: this client's after-sales; this job's history only with access ──
      await page.getByRole('button', { name: 'Active', exact: true }).click();
      await row.click();
      const jobHistory = details.getByRole('button', { name: 'Open job history' });
      if (username === 'superadmin_test') {
        await jobHistory.click();
        await expect(page).toHaveURL(new RegExp(`/admin/job-history\\?search=${ticketCode}$`));
        await expect(page.getByRole('searchbox', { name: /Find a completed job/i })).toHaveValue(ticketCode);
        await expect(page.getByText('1 record shown')).toBeVisible({ timeout: 30000 });
        await page.goBack();
        await page.getByRole('textbox', { name: 'Search maintenance' }).fill(service.name);
        await row.click();
      } else {
        await expect(jobHistory).toHaveCount(0);
      }
      await details.getByRole('button', { name: "Open this client's after-sales" }).click();
      await expect(page).toHaveURL(/\/admin\/after-sales-cases\?case_type=maintenance&search=/);
      await expect(page).toHaveURL(new RegExp(encodeURIComponent(schedule.client_email || schedule.client_name).replace(/[.]/g, '\\.')));

      // ── Mark completed ──
      await page.goto(`/admin/maintenance?search=${encodeURIComponent(service.name)}`);
      await row.click();
      await details.getByRole('button', { name: 'Mark completed' }).click();
      const complete = page.getByRole('dialog', { name: 'Mark maintenance completed?' });
      await complete.getByLabel('Reason').fill('Cleaned panels and checked connections.');
      await complete.getByRole('button', { name: 'Mark completed' }).click();
      await expect(page.getByRole('status')).toContainText('Maintenance marked completed.');
      await expect.poll(async () => (await scheduleFor()).status).toBe('completed');
      await page.getByRole('button', { name: 'Completed', exact: true }).click();
      await expect(row).toBeVisible();
    });
  });
}
