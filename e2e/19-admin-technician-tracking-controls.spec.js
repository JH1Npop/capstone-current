// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/technician-tracking, for admin and superadmin. A fresh technician with a
// live GPS position is assigned a real ticket and starts driving to it (Navigating), so the map,
// filters, search, details and centring can be checked against /api/tracking/.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
let nextDay = 57;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data) => {
    const response = await request[method](path, data === undefined ? { headers } : { headers, data });
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return { get: (path) => call('get', path), post: (path, data) => call('post', path, data ?? {}), put: (path, data) => call('put', path, data) };
};

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Technician tracking controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`19 - ${username}: every Technician Tracking control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Tracking ${tag} ${stamp}`,
        description: 'Created by the technician tracking controls check.',
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
      const techUsername = `tracker${tag}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username: techUsername,
        email: `${techUsername}@afntest.com`,
        password: 'TestPass123!',
        password_confirm: 'TestPass123!',
        first_name: 'Tracker',
        last_name: `${tag}${stamp}`,
        phone: '09171234567',
        role: 'technician',
        status: 'active',
        is_available: true,
      });
      const techName = `Tracker ${tag}${stamp}`;
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
      await techApi.post('/api/services/technician/location/', { latitude: 14.2701, longitude: 121.1202, accuracy: 9 });

      const visitDate = dayKey(nextDay++);
      const created = await client.post('/api/services/service-requests/', {
        service_type: service.id,
        description: `E2E tracking ${stamp}`,
        priority: 'Normal',
        location_address: 'Tracking Street, Brgy. Pulo',
        location_city: 'Cabuyao',
        location_province: 'Laguna',
        preferred_date: visitDate,
        latitude: '14.2786',
        longitude: '121.125',
      });
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
      await techApi.post('/api/services/technician/location/', { latitude: 14.2721, longitude: 121.1215, accuracy: 9 });

      // ── Tracking accuracy: a rough Wi-Fi/cell reading does not move a precise recent position,
      // and a cached reading older than 2 minutes is not saved ──
      const rough = await techApi.post('/api/services/technician/location/', { latitude: 14.33, longitude: 121.2, accuracy: 1800 });
      expect(rough).toMatchObject({ accepted: false, reason: 'rough_reading' });
      const cached = await techApi.post('/api/services/technician/location/', { latitude: 14.2722, longitude: 121.1216, accuracy: 9, reading_age_ms: 180000 });
      expect(cached).toMatchObject({ accepted: false, reason: 'stale_reading' });
      const kept = (await admin.get('/api/tracking/')).techMarkers.find((marker) => marker.id === tech.id);
      expect(kept).toMatchObject({ lat: 14.2721, lng: 121.1215, gpsAccuracy: 9, gpsState: 'fresh' });

      // ── Reroute: about 3 km off the planned road, the server plans a new route from the
      // technician to the job (at most once a minute per job, so keep reporting until it lands) ──
      const OFF_ROUTE = { latitude: 14.25, longitude: 121.1, accuracy: 9 };
      const routeOf = async () => (await admin.get('/api/tracking/')).ticketMarkers.find((marker) => marker.id === ticket.id)?.routeGeometry;
      await expect.poll(async () => {
        await techApi.post('/api/services/technician/location/', OFF_ROUTE);
        return (await routeOf())?.reason;
      }, { timeout: 90000, intervals: [1000, 5000, 10000] }).toBe('off_route');
      const rerouted = await routeOf();
      const [firstLng, firstLat] = rerouted.coordinates[0];
      const [lastLng, lastLat] = rerouted.coordinates[rerouted.coordinates.length - 1];
      expect(firstLat).toBeCloseTo(OFF_ROUTE.latitude, 3);
      expect(firstLng).toBeCloseTo(OFF_ROUTE.longitude, 3);
      expect(lastLat).toBeCloseTo(14.2786, 3);
      expect(lastLng).toBeCloseTo(121.125, 3);

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/technician-tracking');
      await expect(page.getByRole('status')).toContainText('Live', { timeout: 30000 });
      const tracking = await admin.get('/api/tracking/');
      const techs = tracking.techMarkers;
      const shown = page.getByRole('status').getByText(/^\d+\/\d+ shown$/);
      await expect(shown).toHaveText(`${techs.length}/${techs.length} shown`);
      // Every technician with a position and a reported accuracy gets an accuracy circle on the map.
      const withAccuracy = techs.filter((t) => t.lat != null && t.lng != null && Number(t.gpsAccuracy) > 0);
      await expect(page.locator('path.tech-accuracy-circle')).toHaveCount(withAccuracy.length);

      // ── Summary tiles agree with /api/tracking/ ──
      const tile = (label) => page.locator('div.rounded-lg.bg-slate-50').filter({ hasText: label });
      await expect(tile('Online technicians')).toContainText(String(techs.filter((t) => t.gpsState === 'fresh').length));
      await expect(tile('On active jobs')).toContainText(String(techs.filter((t) => t.status === 'on_job').length));
      await expect(tile('GPS attention')).toContainText(String(techs.filter((t) => t.gpsState !== 'fresh').length));

      // ── Technician Status and GPS Health filters: every option ──
      await expect(page.getByRole('combobox', { name: 'Technician Status' })).toHaveCount(0);
      const filtersButton = page.getByRole('button', { name: /^Filters/ });
      await expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
      await filtersButton.click();
      await expect(filtersButton).toHaveAttribute('aria-expanded', 'true');
      const statusFilter = page.getByRole('combobox', { name: 'Technician Status' });
      for (const value of ['available', 'on_job', 'offline', 'all']) {
        await statusFilter.selectOption(value);
        const count = value === 'all' ? techs.length : techs.filter((t) => t.status === value).length;
        await expect(shown).toHaveText(`${count}/${techs.length} shown`);
      }
      const gpsFilter = page.getByRole('combobox', { name: 'GPS Health' });
      for (const value of ['fresh', 'stale', 'missing', 'all']) {
        await gpsFilter.selectOption(value);
        const count = value === 'all' ? techs.length : techs.filter((t) => t.gpsState === value).length;
        await expect(shown).toHaveText(`${count}/${techs.length} shown`);
      }

      // ── Ticket Display: a technician driving to the job (Navigating) counts as started ──
      const ticketDisplay = page.getByRole('combobox', { name: 'Ticket Display' });
      const jobSites = page.locator('div.rounded-lg').filter({ has: page.getByRole('heading', { name: 'Active Job Sites' }) });
      await ticketDisplay.selectOption('in_progress');
      await expect(jobSites.getByText(`${ticketCode(ticket.id)} | ${service.name}`)).toBeVisible();
      await ticketDisplay.selectOption('all');
      await expect(jobSites.getByText(`${ticketCode(ticket.id)} | ${service.name}`)).toBeVisible();
      // The job card counts down from the technician's position and says the route was replanned.
      const jobRow = jobSites.locator('div.grid').filter({ hasText: `${ticketCode(ticket.id)} | ${service.name}` });
      await expect(jobRow.getByText(/ to go$/)).toBeVisible();
      await expect(jobRow.getByText(/^about \d+ min left$/)).toBeVisible();
      await expect(jobRow.getByText(/^Rerouted (just now|\d+ min ago)$/)).toBeVisible();

      // ── Search by ticket ID, then a search with no match ──
      const search = page.getByRole('searchbox', { name: /Find technician or job/i });
      await search.fill(ticketCode(ticket.id));
      await expect(shown).toHaveText(`1/${techs.length} shown`);
      const techList = page.locator('div.rounded-lg').filter({ has: page.getByRole('heading', { name: 'Technicians' }) });
      await expect(techList.getByText(techName, { exact: true })).toBeVisible();
      await search.fill('zz-no-such-technician');
      await expect(techList.getByText('No technician or job matches "zz-no-such-technician".')).toBeVisible();
      await search.fill(techName);

      // ── View details: contact links, the job with its own ticket link, Close details ──
      await techList.getByRole('button', { name: 'View details' }).click();
      const details = page.getByRole('dialog', { name: techName });
      await expect(details).toBeVisible();
      await expect(details.getByText('Fresh', { exact: true })).toBeVisible();
      await expect(details.getByText('+/-9 m')).toBeVisible();
      await expect(details.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:09171234567');
      await expect(details.getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:${techUsername}@afntest.com`);
      await expect(details.getByText(`${ticketCode(ticket.id)} · ${service.name}`)).toBeVisible();
      await expect(details.getByText('En route', { exact: true })).toBeVisible();
      // The same road distance and ETA still to go as the job card, counted from where the technician is.
      await expect(details.getByText(/ to go$/)).toBeVisible();
      await expect(details.getByText(/^about \d+ min left$/)).toBeVisible();
      await expect(techList.getByRole('button', { name: 'Details open' })).toBeVisible();
      await details.getByRole('button', { name: 'Close details' }).click();
      await expect(details).toBeHidden();

      // ── Center on the technician, then Show all markers ──
      await techList.getByRole('button', { name: 'Center', exact: true }).click();
      await expect(page.getByText(`Focused: ${techName}`)).toBeVisible();
      await expect(techList.getByRole('button', { name: 'Centered' })).toBeVisible();
      await expect(details).toHaveCount(0);
      await page.getByRole('button', { name: 'Show all markers' }).click();
      await expect(page.getByText(/^Focused:/)).toHaveCount(0);

      // ── Trail and auto-refresh: centering on a technician draws their last 60 minutes as a violet
      // dotted line; a new position shows up within one 15-second refresh without pressing Refresh,
      // and the trail grows with it ──
      const trailLine = page.locator('.leaflet-overlay-pane path[stroke="#7c3aed"]');
      await expect(trailLine).toHaveCount(0);
      await techList.getByRole('button', { name: 'Center', exact: true }).click();
      await expect(page.getByText(`${techName}: last 60 min`)).toBeVisible();
      await expect(trailLine).toHaveCount(1);
      const trailBefore = await trailLine.getAttribute('d');
      await techApi.post('/api/services/technician/location/', { latitude: 14.2525, longitude: 121.1025, accuracy: 9 });
      await expect.poll(() => trailLine.getAttribute('d'), { timeout: 25000 }).not.toBe(trailBefore);
      await page.getByRole('button', { name: 'Show all markers' }).click();
      await expect(trailLine).toHaveCount(0);
      await expect(page.getByText(`${techName}: last 60 min`)).toHaveCount(0);
      // The details window shows the refreshed position, and "Show trail on map" closes it and centers.
      await techList.getByRole('button', { name: 'View details' }).click();
      await expect(details.getByText('14.252500, 121.102500')).toBeVisible();
      await details.getByRole('button', { name: 'Show trail on map' }).click();
      await expect(details).toHaveCount(0);
      await expect(page.getByText(`Focused: ${techName}`)).toBeVisible();
      await expect(trailLine).toHaveCount(1);
      await page.getByRole('button', { name: 'Show all markers' }).click();

      // ── Center on the job site ──
      await jobSites.locator('div.grid').filter({ hasText: ticketCode(ticket.id) }).getByRole('button', { name: 'Center' }).click();
      await expect(page.getByText(`Focused: ${ticketCode(ticket.id)}`)).toBeVisible();
      await page.getByRole('button', { name: 'Show all markers' }).click();

      // ── The job's Open ticket link opens that ticket on Service Tickets ──
      await techList.getByRole('button', { name: 'View details' }).click();
      await expect(details).toBeVisible();
      await details.getByRole('link', { name: `Open ticket ${ticketCode(ticket.id)}` }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/service-tickets\\?ticketId=${ticket.id}$`));
      await expect(page.getByRole('dialog', { name: ticketCode(ticket.id) })).toBeVisible({ timeout: 30000 });

      // ── Refresh ──
      await page.goto('/admin/technician-tracking');
      await expect(page.getByRole('status')).toContainText('Live', { timeout: 30000 });
      await page.route('**/api/tracking/', async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        const marker = body.techMarkers?.find((entry) => Number(entry.id) === Number(tech.id));
        if (marker) {
          marker.lastLocationUpdate = new Date(Date.now() - (1097 * 60000)).toISOString();
          marker.gpsState = 'stale';
        }
        await route.fulfill({ response, json: body });
      }, { times: 1 });
      const refreshed = page.waitForResponse((r) => r.url().includes('/api/tracking/') && r.request().method() === 'GET');
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await refreshed;
      await expect(techList.getByText(/Updated 18 hours ago/)).toBeVisible();
    });
  });
}
