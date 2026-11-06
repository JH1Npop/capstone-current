// @ts-check
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/job-history. Job History is a superadmin capability by default
// (users/rbac.py), so admin_test must be kept out; superadmin_test gets the full check against
// /api/services/coverage-heatmap/completed_jobs/ after 11 real jobs are completed for one service.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SITE = { latitude: 14.2786, longitude: 121.125 };
const JOBS = 11;

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

test.describe('Job History controls', () => {
  test.describe.configure({ timeout: 480000 });

  test('21.A - admin_test cannot open Job History (not in the default admin role)', async ({ page }) => {
    await seedAuthState(page, loadAuthStateFromBackend('admin_test'));
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('link', { name: 'Job History' })).toHaveCount(0);
    await page.goto('/admin/job-history');
    await expect.poll(async () => !page.url().includes('/admin/job-history')
      || /You do not have the necessary permissions/.test(await page.locator('body').innerText())).toBe(true);
  });

  test('21.S - superadmin_test: every Job History control works', async ({ page, request }) => {
    const auth = loadAuthStateFromBackend('superadmin_test');
    const admin = apiAs(request, auth);
    const client = apiAs(request, loadAuthStateFromBackend('client_test'));
    const stamp = Date.now();

    // ── 11 real completed jobs for one service; one has a unique address ──
    const service = await admin.post('/api/admin/services/', {
      name: `E2E History ${stamp}`,
      description: 'Created by the job history controls check.',
      estimated_duration: 60,
      estimated_cost: 5000,
      max_daily_assignments: 5,
      is_active: true,
      requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
      inspection_procedures: [],
      deposit_policy: 'none',
      deposit_value: 0,
    });
    const techUsername = `hist${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username: techUsername,
      email: `${techUsername}@afntest.com`,
      password: 'TestPass123!',
      password_confirm: 'TestPass123!',
      first_name: 'Historia',
      last_name: `Tech${stamp}`,
      phone: '09171234567',
      role: 'technician',
      status: 'active',
      is_available: true,
    });
    const techName = `Historia Tech${stamp}`;
    await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });

    const uniqueAddress = `${stamp} Kalayaan Road`;
    const tickets = [];
    for (let index = 0; index < JOBS; index += 1) {
      const visitDate = dayKey(5 + index);
      const created = await client.post('/api/services/service-requests/', {
        service_type: service.id,
        description: `E2E history ${index} ${stamp}`,
        priority: 'Normal',
        location_address: index === 0 ? uniqueAddress : 'History Street, Brgy. Pulo',
        location_city: 'Cabuyao',
        location_province: 'Laguna',
        preferred_date: visitDate,
        latitude: String(SITE.latitude),
        longitude: String(SITE.longitude),
      });
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
      await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
      await techApi.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
      await techApi.post('/api/checklist/', {
        jobId: ticket.id,
        completed: { 0: true },
        checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
        notes: 'Done.',
        maintenance_required: false,
      });
      await techApi.post(`/api/services/service-tickets/${ticket.id}/complete_work/`, {
        completion_notes: `Finished job ${index}.`,
        completion_photo_files: { name: `done-${index}.png`, mimeType: 'image/png', buffer: PNG },
      }, { multipart: true });
      tickets.push(ticket.id);
    }
    const history = async (params = {}) => admin.get(`/api/services/coverage-heatmap/completed_jobs/?${new URLSearchParams(params)}`);
    const everything = await history();

    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, auth);
    await page.goto('/admin/job-history');
    const recordsShown = page.getByText(/^\d+ records? shown$/);
    await expect(recordsShown).toHaveText(`${everything.total} record${everything.total === 1 ? '' : 's'} shown`, { timeout: 30000 });

    // ── Summary cards match the API ──
    const card = (title) => page.locator('div.rounded-2xl').filter({ has: page.getByText(title, { exact: true }) });
    await expect(card('Completed Jobs').first()).toContainText(String(everything.total));
    await expect(card('Rated Jobs')).toContainText(String(everything.rated_jobs));
    await expect(card('Service Types')).toContainText(String(everything.service_types_served));
    await expect(card('With Checklist')).toContainText(String(everything.jobs_with_checklist));
    await expect(card('With Warranty')).toContainText(String(everything.jobs_with_warranty));

    // ── Service filter isolates the 11 jobs ──
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('combobox', { name: 'Service' }).selectOption(String(service.id));
    await expect(recordsShown).toHaveText(`${JOBS} records shown`);
    const showing = page.getByText(/^Showing \d+-\d+ of \d+ jobs$/);
    const pageLabel = page.getByText(/^Page \d+ of \d+$/);
    await expect(showing).toHaveText(`Showing 1-10 of ${JOBS} jobs`);
    await expect(pageLabel).toHaveText('Page 1 of 2');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(10);

    // ── Pagination: Next really loads page 2, Previous returns ──
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pageLabel).toHaveText('Page 2 of 2');
    await expect(showing).toHaveText(`Showing 11-11 of ${JOBS} jobs`);
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await expect(pageLabel).toHaveText('Page 1 of 2');
    await expect(rows).toHaveCount(10);

    // ── Rows per page ──
    await page.getByRole('combobox', { name: 'Rows' }).selectOption('25');
    await expect(pageLabel).toHaveText('Page 1 of 1');
    await expect(rows).toHaveCount(JOBS);
    await page.getByRole('combobox', { name: 'Rows' }).selectOption('10');
    await expect(rows).toHaveCount(10);

    // ── Sorting by ticket: descending first, then ascending ──
    const sorted = [...tickets].sort((a, b) => a - b);
    const ticketHeader = page.getByRole('button', { name: /^Ticket/ });
    await ticketHeader.click();
    await expect(rows.first()).toContainText(ticketCode(sorted[sorted.length - 1]));
    await ticketHeader.click();
    await expect(rows.first()).toContainText(ticketCode(sorted[0]));
    // A new sort always starts on page 1.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(pageLabel).toHaveText('Page 2 of 2');
    await ticketHeader.click();
    await expect(pageLabel).toHaveText('Page 1 of 2');

    // ── Search by address and by technician name ──
    const search = page.getByRole('searchbox', { name: /Find a completed job/i });
    await search.fill('Kalayaan');
    await expect(recordsShown).toHaveText('1 record shown');
    await expect(rows.first()).toContainText(ticketCode(tickets[0]));
    await search.fill(techName.split(' ')[0]);
    await expect(recordsShown).toHaveText(`${JOBS} records shown`);
    await page.getByRole('button', { name: 'Clear search' }).click();

    // ── Period, client and technician filters agree with the API ──
    await page.getByRole('combobox', { name: 'Completed during' }).selectOption('7');
    const lastWeek = await history({ days: 7, service_type: service.id });
    await expect(recordsShown).toHaveText(`${lastWeek.total} records shown`);
    expect(lastWeek.total).toBe(JOBS);
    await page.getByRole('combobox', { name: 'Technician' }).selectOption(String(tech.id));
    await expect(recordsShown).toHaveText(`${JOBS} records shown`);
    const clientId = String(everything.client_options[0].id);
    await page.getByRole('combobox', { name: 'Client' }).selectOption(clientId);
    const narrowed = await history({ days: 7, service_type: service.id, technician: tech.id, client: clientId });
    await expect(recordsShown).toHaveText(`${narrowed.total} record${narrowed.total === 1 ? '' : 's'} shown`);
    await page.getByRole('button', { name: 'Remove Client filter' }).click();
    await page.getByRole('button', { name: 'Remove Technician filter' }).click();
    await page.getByRole('button', { name: 'Remove Completed during filter' }).click();
    await expect(recordsShown).toHaveText(`${JOBS} records shown`);

    // ── Export CSV: every filtered job, formatted ticket IDs ──
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^completed-jobs-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = fs.readFileSync(await download.path(), 'utf8').trim().split('\n');
    expect(lines[0]).toContain('"Ticket ID","Completed Date","Client","Technician","Service"');
    expect(lines).toHaveLength(JOBS + 1);
    // Each job exactly once (the export pages through the server; page 1 must not repeat).
    const exportedTickets = lines.slice(1).map((line) => line.split(',')[0]);
    expect(new Set(exportedTickets).size).toBe(JOBS);
    expect(lines.slice(1).join('\n')).toContain(`"${ticketCode(tickets[0])}"`);

    // ── Job details: close button, Escape, backdrop; proof preview closes on its own ──
    await page.getByRole('button', { name: 'Clear all' }).click();
    await search.fill('Kalayaan');
    await expect(recordsShown).toHaveText('1 record shown');
    const viewButton = page.getByRole('button', { name: `View job details for ${ticketCode(tickets[0])}` });
    const details = page.getByRole('dialog', { name: service.name });
    await viewButton.click();
    await expect(details).toBeVisible();
    await expect(details).toContainText(uniqueAddress);
    await expect(details).toContainText(techName);
    await expect(details.getByText('Ticket Timeline')).toBeVisible();
    await details.getByRole('button', { name: 'Close details' }).first().click();
    await expect(details).toBeHidden();
    await viewButton.click();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
    await viewButton.click();
    await page.mouse.click(5, 5);
    await expect(details).toBeHidden();

    await viewButton.click();
    const proof = details.getByRole('button', { name: /done-0\.png|Proof 1/ }).first();
    await proof.click();
    const preview = page.getByRole('dialog', { name: /done-0\.png|Proof 1/ });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('link', { name: 'Download' })).toHaveAttribute('href', /.+/);
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(details).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();

    // ── Load failure is reported ──
    await page.route('**/api/services/coverage-heatmap/completed_jobs/**', (route) => route.fulfill({ status: 500, json: { detail: 'History unavailable' } }));
    await page.reload();
    await expect(page.locator('div.bg-red-50').first()).toBeVisible({ timeout: 30000 });
  });
});
