// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The technician's Field Service Report tab on /technician/checklist (maintenance job, phone):
// - it opens (the server used to fail with 500 for every technician, so nothing loaded or saved);
// - a filled report saves, comes back after a reload, and saving again updates the same report
//   (the form used to miss the paged list and create a new report on every save);
// - fields are labelled and 44 px; no sideways scroll.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };

test.describe('Technician field service report', () => {
  test.describe.configure({ timeout: 300000 });

  test('62 - the technician fills in, reloads and updates one field service report', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const clientAuth = loadAuthStateFromBackend('client_test');
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
      name: `E2E Aircon Maintenance ${stamp}`, description: 'Maintenance visit.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Clean filters', description: 'Clean.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const techName = `fsrtech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Report', last_name: `Tech${stamp}`, phone: '09171234576', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    let created;
    let visitDate;
    for (let day = 300; day < 320 && !created; day += 1) {
      visitDate = localKey(new Date(Date.now() + day * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: as(clientAuth),
        data: {
          service_type: service.id, description: `FSR ${stamp}`, priority: 'Normal',
          location_address: 'Report Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        },
      });
      if (response.ok()) created = await response.json();
    }
    await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
    const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
      .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
    await call('post', `/api/technician/jobs/${ticket.id}/start-navigation/`, techAuth);
    await call('post', `/api/technician/jobs/${ticket.id}/arrive/`, techAuth, SITE);
    await call('post', `/api/technician/jobs/${ticket.id}/status/`, techAuth, { status: 'in_progress' });
    const reports = async () => list(await call('get', `/api/services/field-service-reports/?ticket=${ticket.id}`, techAuth));

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, techAuth);
      const openReport = async () => {
        await page.goto(`/technician/checklist?ticketId=${ticket.id}`);
        await page.getByRole('button', { name: 'Field Service Report' }).click();
        await expect(page.getByLabel('Brand / Model')).toBeVisible({ timeout: 30000 });
      };

      // ── First save ──
      await openReport();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await page.getByLabel('Brand / Model').fill('Carrier Optima 1.5HP');
      await page.getByLabel('Serial Number').fill(`SN-${stamp}`);
      await page.getByLabel('Ampere Reading').fill('6.2 A');
      await page.getByLabel('Recommendations / Remarks').fill('Replace the capacitor next visit.');
      for (const control of [page.getByLabel('Brand / Model'), page.getByRole('button', { name: 'Save Field Service Report' })]) {
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button', { name: 'Save Field Service Report' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Field Service Report saved successfully.' })).toBeVisible();
      expect((await reports()).length).toBe(1);

      // ── It comes back after a reload; saving again updates the same report ──
      await openReport();
      await expect(page.getByLabel('Brand / Model')).toHaveValue('Carrier Optima 1.5HP');
      await expect(page.getByLabel('Serial Number')).toHaveValue(`SN-${stamp}`);
      await page.getByLabel('Ampere Reading').fill('6.0 A');
      await page.getByRole('button', { name: 'Save Field Service Report' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Field Service Report saved successfully.' })).toBeVisible();
      const saved = await reports();
      expect(saved.length).toBe(1);
      expect(saved[0].ampere_reading).toBe('6.0 A');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }
  });
});
