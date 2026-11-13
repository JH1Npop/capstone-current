// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /technician/map-navigation, on a phone, with its own technician and jobs:
// the job picker (opened from the sidebar), opening a job starts nothing and tells nobody, Start
// trip (the client is told only then), Mark Arrived and Proceed to Job, Google Maps / Waze under More (at the pinned location),
// an on-hold job shown as preview only, a second trip refused while one job is under way, and the
// turn-by-turn step following the technician's real position.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
let nextDay = 12;

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

const phonePage = async (browser, auth, position) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.addInitScript((fix) => {
    window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    const reading = () => ({ coords: { ...fix, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok(reading()), watchPosition: (ok) => { ok(reading()); return 1; }, clearWatch: () => {} },
    });
  }, position);
  await seedAuthState(page, auth);
  return { context, page };
};

test.describe('Technician navigation controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('40 - every Technician Navigation control works', async ({ browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const clientApi = apiAs(request, clientAuth);
    const stamp = Date.now();
    const service = await admin.post('/api/admin/services/', {
      name: `E2E Nav ${stamp}`, description: 'Navigation check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `nav${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Nav', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const makeJob = async () => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: { Authorization: `Token ${clientAuth.token}` },
          data: {
            service_type: service.id, description: `E2E navigation ${stamp}`, priority: 'Normal',
            location_address: 'Nav Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
      }
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      return ticket.id;
    };
    const tripJob = await makeJob();
    const otherJob = await makeJob();
    const heldJob = await makeJob();
    const code = (id) => `TKT-${String(id).padStart(4, '0')}`;
    const techAuth = loadAuthStateFromBackend(username);
    const techApi = apiAs(request, techAuth);
    // One job is put on hold while under way.
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await techApi.post(`/api/technician/jobs/${heldJob}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${heldJob}/status/`, { status: 'on_hold', reason: 'Waiting for the client to be home.' });
    const status = async (id) => (await techApi.get(`/api/technician/jobs/${id}/`)).status;
    const onTheWayNotices = async (id) => list(await clientApi.get('/api/notifications/?page_size=200'))
      // Messages are shown with ticket codes (TKT-0004), not "ticket #4".
      .filter((entry) => String(entry.message).includes('is on the way to your service location') && String(entry.message).includes(code(id))).length;

    // A client number saved with spaces still dials (spaces are removed for the phone's dialer).
    const clientRecord = list(await admin.get('/api/users/?page_size=200')).find((entry) => entry.username === 'client_test');
    const originalPhone = (await admin.get(`/api/admin/clients/${clientRecord.id}/`)).phone || '';
    await admin.put(`/api/admin/clients/${clientRecord.id}/`, { first_name: 'Test', last_name: 'Client', phone: '0917 123 4567', status: 'active' });
    try {
    const { context, page } = await phonePage(browser, techAuth, SITE);
    let startRequests = 0;
    page.on('request', (call) => { if (call.url().includes('/start-navigation/')) startRequests += 1; });

    // ── From the sidebar: pick a job (the on-hold one is not offered) ──
    await page.goto('/technician/map-navigation');
    await expect(page.getByRole('heading', { name: 'Choose a job to navigate to' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('link', { name: `Navigate to ${code(tripJob)}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Navigate to ${code(otherJob)}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Navigate to ${code(heldJob)}` })).toHaveCount(0);
    await page.getByRole('link', { name: `Navigate to ${code(tripJob)}` }).click();

    // ── Opening the job and sharing location starts nothing and tells nobody ──
    const startTrip = page.getByRole('button', { name: 'Start trip' });
    await expect(startTrip).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Start location sharing', exact: true }).click();
    await page.waitForTimeout(1500);
    expect(startRequests).toBe(0);
    expect(await status(tripJob)).not.toBe('Navigating');
    expect(await onTheWayNotices(tripJob)).toBe(0);
    // Google Maps and Waze are an extra option under More, opening at the job's pinned location.
    await expect(page.getByRole('menuitem', { name: /Google Maps|Waze/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'More navigation options' }).click();
    const more = page.getByRole('menu', { name: 'Open in another app' });
    await expect(more.getByRole('menuitem', { name: 'Open in Google Maps' })).toHaveAttribute('href', `https://www.google.com/maps/dir/?api=1&destination=${SITE.latitude},${SITE.longitude}&travelmode=driving`);
    await expect(more.getByRole('menuitem', { name: 'Open in Waze' })).toHaveAttribute('href', `https://waze.com/ul?ll=${SITE.latitude},${SITE.longitude}&navigate=yes`);
    await page.keyboard.press('Escape');
    await expect(more).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Call Test Client' })).toHaveAttribute('href', 'tel:09171234567');
    const startBox = await startTrip.boundingBox();
    expect(startBox.height).toBeGreaterThanOrEqual(44);

    // ── Start trip: now the job is Navigating and the client is told ──
    await startTrip.click();
    await expect(page.getByRole('status').filter({ hasText: 'Trip started. The client has been told you are on the way.' })).toBeVisible();
    await expect.poll(() => status(tripJob)).toBe('Navigating');
    await expect.poll(() => onTheWayNotices(tripJob)).toBe(1);

    // ── Mark Arrived, then Proceed to Job ──
    await page.getByRole('button', { name: 'Mark Arrived' }).click();
    await expect.poll(() => status(tripJob)).toBe('Arrived on Site');
    await expect(page.getByRole('link', { name: 'Proceed to Job' })).toHaveAttribute('href', `/technician/my-jobs?ticketId=${tripJob}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // ── An on-hold job is preview only ──
    await page.goto(`/technician/map-navigation?ticketId=${heldJob}`);
    await expect(page.getByText('This job is on hold. Resume it from My Jobs before you travel.')).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Start trip' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark Arrived' })).toHaveCount(0);

    // ── A second trip is refused while another job is under way, with the reason ──
    const before = startRequests;
    await page.goto(`/technician/map-navigation?ticketId=${otherJob}`);
    await page.getByRole('button', { name: 'Start trip' }).click();
    await expect(page.getByRole('alert')).toContainText(`before navigating to another job`);
    expect(startRequests).toBe(before + 1);
    expect(await status(otherJob)).not.toBe('Navigating');
    await context.close();

    // ── Turn-by-turn follows where you are: standing at step 2's start, step 2 is current ──
    const route = {
      features: [{
        geometry: { coordinates: [[121.10, 14.27], [121.11, 14.275], [121.12, 14.278], [SITE.longitude, SITE.latitude]] },
        properties: { segments: [{ distance: 3000, steps: [
          { instruction: 'Head north on Pulo Road', distance: 900, way_points: [0, 1] },
          { instruction: 'Turn left onto Rizal Street', distance: 1100, way_points: [1, 2] },
          { instruction: 'Arrive at the site', distance: 1000, way_points: [2, 3] },
        ] }] },
      }],
    };
    const preview = await phonePage(browser, techAuth, { latitude: 14.275, longitude: 121.11 });
    await preview.page.route('**/api/services/ors/route/**', (call) => call.fulfill({ json: route }));
    await preview.page.goto(`/technician/map-navigation?ticketId=${otherJob}`);
    await preview.page.getByRole('button', { name: 'Start location sharing', exact: true }).click();
    await expect(preview.page.getByText('Next: Turn left onto Rizal Street')).toBeVisible({ timeout: 30000 });
    await expect(preview.page.getByText(/Turn-by-Turn Directions \(2\/3\)/)).toBeVisible();
    await preview.context.close();
    } finally {
      await admin.put(`/api/admin/clients/${clientRecord.id}/`, { first_name: 'Test', last_name: 'Client', phone: originalPhone, status: 'active' });
    }
  });
});
