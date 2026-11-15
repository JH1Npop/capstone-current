// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Coverage Heatmap drill-down end to end, on real data. Four jobs are completed for real at known
// sites (two in Brgy. Balibago and one in Brgy. Dita, City of Santa Rosa; one in Brgy. Lecheria,
// City of Calamba). The City / municipality view is then walked on a computer and a phone: open
// the town, check its panel and barangays against the API, open a barangay, step back, and check
// the spotlight, the legend, the phone summary card and that nothing overflows.

const SANTA_ROSA = '0403428000';
const BALIBAGO = '0403428002';
const DITA = '0403428005';
const SITES = [
  { lat: 14.2840, lng: 121.0920, address: 'E2E Drill 1, Brgy. Balibago', city: 'Santa Rosa' },
  { lat: 14.2840, lng: 121.0920, address: 'E2E Drill 2, Brgy. Balibago', city: 'Santa Rosa' },
  { lat: 14.2770, lng: 121.0990, address: 'E2E Drill 3, Brgy. Dita', city: 'Santa Rosa' },
  { lat: 14.2000, lng: 121.1600, address: 'E2E Drill 4, Brgy. Lecheria', city: 'Calamba' },
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SHOTS = 'test-results/screenshots';
const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));

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

test.describe.configure({ mode: 'serial', timeout: 420000 });

let density;

test('66.0 - four real jobs are completed at known barangays', async ({ request }) => {
  const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
  const client = apiAs(request, loadAuthStateFromBackend('client_test'));
  const stamp = Date.now();
  const service = await admin.post('/api/admin/services/', {
    name: `E2E Drill ${stamp}`,
    description: 'Created by the coverage heatmap drill-down check.',
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
  const techUsername = `drill${stamp}`.toLowerCase();
  const tech = await admin.post('/api/admin/technicians/', {
    username: techUsername,
    email: `${techUsername}@afntest.com`,
    password: 'TestPass123!',
    password_confirm: 'TestPass123!',
    first_name: 'Drill',
    last_name: `Tech${stamp}`,
    phone: '09171234567',
    role: 'technician',
    status: 'active',
    is_available: true,
  });
  await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
  const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
  await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.11, accuracy: 9 });

  let day = 140;
  for (const site of SITES) {
    const visitDate = dayKey(day++);
    const created = await client.post('/api/services/service-requests/', {
      service_type: service.id,
      description: `E2E drill-down ${stamp}`,
      priority: 'Normal',
      location_address: site.address,
      location_city: site.city,
      location_province: 'Laguna',
      preferred_date: visitDate,
      latitude: String(site.lat),
      longitude: String(site.lng),
    });
    await admin.post(`/api/services/service-requests/${created.id}/approve/`);
    const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
      .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
    await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, { latitude: site.lat, longitude: site.lng });
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
  }

  density = await admin.get('/api/services/coverage-heatmap/service_density/');
  const town = density.geographic_levels.municipality.find((row) => row.psgc === SANTA_ROSA);
  expect(town.count).toBeGreaterThanOrEqual(3);
  const barangays = density.geographic_levels.barangay_boundary.filter((row) => row.municipality_psgc === SANTA_ROSA);
  expect(barangays.find((row) => row.psgc === BALIBAGO).count).toBeGreaterThanOrEqual(2);
  expect(barangays.find((row) => row.psgc === DITA).count).toBeGreaterThanOrEqual(1);
  expect(density.heatmap_data.some((point) => point.barangay_psgc === BALIBAGO && point.area_psgc === SANTA_ROSA)).toBeTruthy();
});

const openCityView = async (page) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
  });
  await seedAuthState(page, loadAuthStateFromBackend('superadmin_test'));
  await page.goto('/admin/coverage-heatmap');
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 30000 });
  await page.getByRole('combobox', { name: 'Geographic level' }).selectOption('city');
  await expect.poll(() => page.locator('.leaflet-overlay-pane path.leaflet-interactive').count(), { timeout: 15000 }).toBeGreaterThanOrEqual(142);
  return errors;
};

const noHorizontalOverflow = async (page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(1);
};

test('66.1 - computer: open a town, then a barangay, and step back', async ({ page }) => {
  test.skip(!density, 'needs 66.0');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = await openCityView(page);
  const town = density.geographic_levels.municipality.find((row) => row.psgc === SANTA_ROSA);
  const townRank = density.geographic_levels.municipality.findIndex((row) => row.psgc === SANTA_ROSA) + 1;
  const barangays = density.geographic_levels.barangay_boundary
    .filter((row) => row.municipality_psgc === SANTA_ROSA)
    .sort((a, b) => b.count - a.count || a.area_name.localeCompare(b.area_name));
  const balibago = barangays.find((row) => row.psgc === BALIBAGO);
  await page.screenshot({ path: `${SHOTS}/66-desktop-1-towns.png` });

  // Open the town from the ranked list (the keyboard route).
  await expect(page.locator('.area-spotlight-veil')).toHaveCount(0);
  await page.getByRole('button', { name: `Show details for ${town.address}` }).click();
  const panel = page.locator('section[aria-labelledby="selected-area-heading"]');
  await expect(panel.locator('#selected-area-heading')).toHaveText('City of Santa Rosa');
  await expect(panel).toContainText('Laguna');
  await expect(panel.locator('dd').first()).toHaveText(String(town.count));
  await expect(panel).toContainText(`${Math.round((town.count / density.total_jobs) * 100)}%`);
  await expect(panel).toContainText(`#${townRank}`);
  await expect(panel).toContainText(`Barangays with jobs (${barangays.length} of 18)`);
  for (const row of barangays) {
    await expect(panel.getByRole('button', { name: `Show barangay ${row.area_name}` })).toContainText(`${row.count} job`);
  }
  // Spotlight on, barangay outlines drawn, legend on the barangay scale.
  await expect(page.locator('.area-spotlight-veil')).toHaveCount(1);
  await expect.poll(() => page.locator('.leaflet-overlay-pane path.leaflet-interactive').count()).toBeGreaterThanOrEqual(142 + 18);
  const legend = page.getByRole('img', { name: 'Service density scale, lower to higher jobs per area' });
  await expect(legend).toContainText('jobs per barangay');
  await expect(legend).toContainText(String(barangays[0].count));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/66-desktop-2-town.png` });

  // Open the busiest barangay by clicking its outline on the map (barangay outlines have a slate edge).
  await page.locator(`.leaflet-overlay-pane path.leaflet-interactive[stroke="#475569"][fill="#dc2626"]`).first().dispatchEvent('click');
  await expect(panel.locator('#selected-area-heading')).toHaveText(barangays[0].area_name);
  await expect(panel).toContainText('Barangay');
  await expect(panel).toContainText('City of Santa Rosa, Laguna');
  await expect(panel).toContainText('Share of town');
  await expect(panel).toContainText(`${Math.round((barangays[0].count / town.count) * 100)}%`);
  await expect(panel.getByRole('button', { name: 'Back to City of Santa Rosa' })).toBeVisible();
  await expect(page.locator('.area-spotlight-veil')).toHaveCount(1);
  if (barangays[0].psgc === BALIBAGO) {
    await expect(panel).toContainText('Heat points in this area (1)');
    await expect(panel).toContainText(`${balibago.count} jobs`);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${SHOTS}/66-desktop-3-barangay.png` });

  // "View by: Barangay" lists the same map-based barangays (no second, text-based count).
  await page.keyboard.press('Escape');
  await page.getByRole('combobox', { name: 'Geographic level' }).selectOption('barangay');
  const barangayList = page.getByRole('region', { name: 'Busiest barangays' });
  await expect(barangayList).toContainText(`${balibago.address}`);
  await expect(page.getByText(`Most completed jobs in one barangay`)).toBeVisible();
  await page.getByRole('combobox', { name: 'Geographic level' }).selectOption('city');
  await page.getByRole('button', { name: `Show details for ${town.address}` }).click();
  await panel.getByRole('button', { name: `Show barangay ${barangays[0].area_name}` }).click();
  await expect(panel.locator('#selected-area-heading')).toHaveText(barangays[0].area_name);

  // Step back: Escape to the town, the button to all areas; the spotlight goes away.
  await page.keyboard.press('Escape');
  await expect(panel.locator('#selected-area-heading')).toHaveText('City of Santa Rosa');
  await panel.getByRole('button', { name: 'Back to all areas' }).click();
  await expect(page.getByRole('region', { name: 'Busiest cities / municipalities' })).toBeVisible();
  await expect(page.locator('.area-spotlight-veil')).toHaveCount(0);
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});

test('66.2 - phone: summary card, details panel and barangay', async ({ page }) => {
  test.skip(!density, 'needs 66.0');
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = await openCityView(page);
  const town = density.geographic_levels.municipality.find((row) => row.psgc === SANTA_ROSA);
  const balibago = density.geographic_levels.barangay_boundary.find((row) => row.psgc === BALIBAGO);
  await noHorizontalOverflow(page);
  // Compact top bar on phones: "View by" on one row, both layer toggles side by side under it.
  const viewBy = await page.getByRole('combobox', { name: 'Geographic level' }).boundingBox();
  const densityToggle = await page.getByRole('button', { name: 'Service density', exact: true }).boundingBox();
  const coverageToggle = await page.getByRole('button', { name: 'Technician coverage', exact: true }).boundingBox();
  expect(Math.abs(densityToggle.y - coverageToggle.y), 'layer toggles share a row').toBeLessThan(2);
  expect(densityToggle.y).toBeGreaterThan(viewBy.y);
  await page.screenshot({ path: `${SHOTS}/66-phone-0-toolbar.png` });

  await page.getByRole('button', { name: `Show details for ${town.address}` }).click();
  const summary = page.getByRole('button', { name: 'View details' });
  await expect(summary).toBeVisible();
  await expect(page.locator('.coverage-map')).toContainText(`${town.count} completed job`);
  await page.locator('.coverage-map').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.locator('.coverage-map').screenshot({ path: `${SHOTS}/66-phone-1-town-map.png` });
  await summary.click();
  const panel = page.locator('section[aria-labelledby="selected-area-heading"]');
  await expect(panel.locator('#selected-area-heading')).toBeInViewport();
  await page.screenshot({ path: `${SHOTS}/66-phone-2-panel.png` });

  await panel.getByRole('button', { name: 'Show barangay Balibago' }).click();
  await expect(panel.locator('#selected-area-heading')).toHaveText('Balibago');
  await expect(page.locator('.coverage-map')).toContainText('Brgy. Balibago');
  await expect(page.locator('.coverage-map')).toContainText(`${balibago.count} completed jobs`);
  await page.locator('.coverage-map').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  await page.locator('.coverage-map').screenshot({ path: `${SHOTS}/66-phone-3-barangay-map.png` });
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
