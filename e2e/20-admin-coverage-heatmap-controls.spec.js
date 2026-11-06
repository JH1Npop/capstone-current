// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/coverage-heatmap, for admin and superadmin. A job is completed for real
// (assigned, started, finished) so the map has a known hotspot; every number on the page is then
// compared with /api/services/coverage-heatmap/service_density/ for the same filters.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SITE = { latitude: 14.2786, longitude: 121.125 };
let nextDay = 59;

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
  test.describe(`Coverage heatmap controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`20 - ${username}: every Coverage Heatmap control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';

      // ── A real completed job at a known site ──
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Heatmap ${tag} ${stamp}`,
        description: 'Created by the coverage heatmap controls check.',
        estimated_duration: 120,
        estimated_cost: 5000,
        max_daily_assignments: 5,
        is_active: true,
        requires_site_inspection: false,
        procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
        inspection_procedures: [],
        deposit_policy: 'none',
        deposit_value: 0,
      });
      const techUsername = `heat${tag}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username: techUsername,
        email: `${techUsername}@afntest.com`,
        password: 'TestPass123!',
        password_confirm: 'TestPass123!',
        first_name: 'Heat',
        last_name: `${tag}${stamp}`,
        phone: '09171234567',
        role: 'technician',
        status: 'active',
        is_available: true,
      });
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
      await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
      const visitDate = dayKey(nextDay++);
      const created = await client.post('/api/services/service-requests/', {
        service_type: service.id,
        description: `E2E heatmap ${stamp}`,
        priority: 'Normal',
        location_address: `Heatmap Street ${tag}, Brgy. Pulo`,
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
        completion_notes: 'Work finished and tested.',
        completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
      }, { multipart: true });
      await expect.poll(async () => (await admin.get(`/api/services/service-requests/${created.id}/`)).status).toBe('Completed');

      const density = async (params = {}) => admin.get(`/api/services/coverage-heatmap/service_density/?${new URLSearchParams(params)}`);
      const coverage = await admin.get('/api/services/coverage-heatmap/technician_coverage/');

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);

      const card = (title) => page.locator('div.rounded-2xl').filter({ has: page.getByText(title, { exact: true }) });
      const header = page.getByText(/^Showing \d+ completed jobs? grouped into \d+ mapped hotspots?\.$/);
      const expectNumbers = async (data) => {
        await expect(card('Completed jobs')).toContainText(String(data.total_jobs));
        await expect(card('Hotspots')).toContainText(String(data.total_points));
        await expect(card('Busiest hotspot')).toContainText(String(data.max_density));
        await expect(header).toHaveText(new RegExp(`^Showing ${data.total_jobs} completed jobs? grouped into `));
      };

      // ── Every number matches the API; the job count is not the hotspot count ──
      const all = await density();
      expect(all.total_jobs).toBeGreaterThanOrEqual(1);
      await page.goto('/admin/coverage-heatmap');
      await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30000 });
      await expectNumbers(all);
      await expect(card('Technicians with a location')).toContainText(String(coverage.total_technicians));

      // ── Service Mix chips sum the per-hotspot service counts ──
      const mix = {};
      for (const point of all.heatmap_data) for (const s of point.service_breakdown) mix[s.name] = (mix[s.name] || 0) + s.count;
      await expect(page.getByText(`${service.name}: ${mix[service.name]}`, { exact: true })).toBeVisible();

      // ── Busiest hotspots list (keyboard-readable popups) ──
      const hotspots = page.getByRole('region', { name: 'Busiest hotspots' });
      await expect(hotspots).toContainText(`Showing ${Math.min(10, all.heatmap_data.length)} of ${all.heatmap_data.length}`);
      await expect(hotspots.getByText(`Heatmap Street ${tag}, Brgy. Pulo`)).toBeVisible();
      await expect(hotspots).toContainText(`Heat ${tag}${stamp}`);

      // ── Each filter narrows to the API's numbers and keeps its own other choices ──
      await page.getByRole('button', { name: /^Filters/ }).click();
      const technicianSelect = page.getByRole('combobox', { name: 'Technician coverage' });
      await technicianSelect.selectOption(String(tech.id));
      const byTech = await density({ technician: tech.id });
      await expectNumbers(byTech);
      const technicianChoices = await technicianSelect.locator('option').count();
      expect(technicianChoices).toBe(1 + all.technician_options.length);
      await page.getByRole('button', { name: 'Remove Technician coverage filter' }).click();
      await expectNumbers(all);

      const serviceSelect = page.getByRole('combobox', { name: 'Service density' });
      await serviceSelect.selectOption(String(service.id));
      await expectNumbers(await density({ service_type: service.id }));
      expect(await serviceSelect.locator('option').count()).toBe(1 + all.service_options.length);

      const clientSelect = page.getByRole('combobox', { name: 'Client locations' });
      const clientId = String(all.client_options[0].id);
      await clientSelect.selectOption(clientId);
      await expectNumbers(await density({ client: clientId, service_type: service.id }));
      await page.getByRole('button', { name: 'Clear all' }).click();
      await expectNumbers(all);

      // ── Layers: each toggles, and both off explains the empty map ──
      const densityLayer = page.getByRole('button', { name: 'Service density', exact: true });
      const coverageLayer = page.getByRole('button', { name: 'Technician coverage', exact: true });
      await densityLayer.click();
      await expect(densityLayer).toHaveAttribute('aria-pressed', 'false');
      await coverageLayer.click();
      await expect(coverageLayer).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByText('Both layers are hidden. Turn on Service density or Technician coverage.')).toBeVisible();
      await densityLayer.click();
      await coverageLayer.click();
      await expect(page.getByText(/Both layers are hidden/)).toHaveCount(0);

      // ── A slow older response cannot overwrite a newer filter's numbers ──
      let delayNext = true;
      await page.route('**/api/services/coverage-heatmap/service_density/**', async (route) => {
        if (delayNext && !route.request().url().includes('technician=')) {
          delayNext = false;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        await route.continue();
      });
      await page.reload();
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('combobox', { name: 'Technician coverage' }).selectOption(String(tech.id));
      await page.waitForTimeout(3500);
      await expectNumbers(byTech);
      await page.unroute('**/api/services/coverage-heatmap/service_density/**');

      // ── Load failure is reported ──
      await page.route('**/api/services/coverage-heatmap/service_density/**', (route) => route.fulfill({ status: 500, json: { detail: 'Heatmap unavailable' } }));
      await page.reload();
      await expect(page.locator('div.bg-red-50').first()).toBeVisible({ timeout: 30000 });
    });
  });
}
