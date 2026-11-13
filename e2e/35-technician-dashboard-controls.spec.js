// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control and flow on /technician/dashboard. The spec makes its own technicians and jobs so
// each state can be reached for real:
//  - a job at the site ("Arrived on Site"): Current Focus, readiness, equipment reminder, Start Job,
//    then Continue Job and Open Checklist; a later job in Up Next and Upcoming Schedule; Recent
//    Activity newest first with its last update; real notifications (View all, Delete all with a
//    failure kept in its dialog, then the real delete); the four cards; Refresh and a failed refresh
//    keeping the data; location sharing (allowed: the position reaches the server; denied: a clear
//    message); the phone layout.
//  - a technician with only Dashboard and Jobs access and only a later job: "Next Job" instead of
//    "Current Focus", and every button for a page they cannot open is hidden.
// The server's business-day "today" and Recent Activity order are covered by backend tests.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const FIX = { latitude: 14.5995, longitude: 120.9842 };
let nextDay = 45;

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
  return {
    get: (path) => call('get', path),
    post: (path, data) => call('post', path, data ?? {}),
    put: (path, data) => call('put', path, data),
  };
};

const mockGeolocation = (page, { deny = false } = {}) => page.addInitScript(({ fix, denyAccess }) => {
  window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
  const reading = () => ({ coords: { ...fix, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
  const refusal = { code: 1, message: 'User denied Geolocation', PERMISSION_DENIED: 1 };
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      clearWatch: () => {},
      getCurrentPosition: (success, failure) => (denyAccess ? failure(refusal) : success(reading())),
      watchPosition: (success, failure) => { if (denyAccess) failure(refusal); else success(reading()); return 1; },
    },
  });
}, { fix: FIX, denyAccess: deny });

test.describe('Technician dashboard controls', () => {
  test.describe.configure({ timeout: 300000 });

  test('35 - every Technician Dashboard control and flow works', async ({ page, browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();

    // ── Data: a service with required equipment, two technicians, three jobs ──
    const service = await admin.post('/api/admin/services/', {
      name: `E2E Dash ${stamp}`, description: 'Technician dashboard check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 5, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
      required_equipment: [{ name: 'Clamp meter', quantity: 2 }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const makeTech = async (suffix) => {
      const username = `dash${suffix}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Dash', last_name: `${suffix}${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
      });
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      return { ...tech, username };
    };
    const lead = await makeTech('Lead');
    const limited = await makeTech('Limited');
    // A technician scoped to Dashboard and Jobs only.
    await admin.put(`/api/users/${limited.id}/capabilities/`, { capabilities: ['technician.dashboard.view', 'technician.jobs.view'] });

    const makeJob = async (techId, serviceId = service.id, stage = 'service') => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 15 && !created; attempt += 1) {
        visitDate = dayKey(nextDay++);
        const response = await request.post('/api/services/service-requests/', {
          headers: { Authorization: `Token ${clientAuth.token}` },
          data: {
            service_type: serviceId, description: `E2E dashboard ${stamp}`, priority: 'High',
            location_address: 'Dash Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
        else expect(await response.text()).toContain('no appointment availability');
      }
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: techId, dispatch_stage: stage, scheduled_date: visitDate });
      return ticket.id;
    };
    // Each job gets its own bookable day; the first one is then put under way (at the site).
    const atSiteJob = await makeJob(lead.id);
    const laterJob = await makeJob(lead.id);
    const limitedJob = await makeJob(limited.id);
    // An inspection job (the service needs a site inspection first), under way with a third technician.
    const inspectionService = await admin.post('/api/admin/services/', {
      name: `E2E Dash Inspect ${stamp}`, description: 'Inspection first.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 5, is_active: true, requires_site_inspection: true,
      procedures: [{ step: 1, title: 'Install', description: 'Install.', requires_photo: false }],
      inspection_procedures: [{ title: 'Roof is sound', description: 'Check the roof.' }], deposit_policy: 'none', deposit_value: 0,
    });
    const inspector = await makeTech('Insp');
    await admin.put(`/api/admin/technicians/${inspector.id}/`, { skills: [{ service_type: inspectionService.id, skill_level: 'expert' }] });
    const inspectionJob = await makeJob(inspector.id, inspectionService.id, 'inspection');

    const leadAuth = loadAuthStateFromBackend(lead.username);
    const leadApi = apiAs(request, leadAuth);
    await leadApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await leadApi.post(`/api/technician/jobs/${atSiteJob}/start-navigation/`);
    await leadApi.post(`/api/technician/jobs/${atSiteJob}/arrive/`, SITE);
    const leadNotifications = async () => list(await leadApi.get('/api/notifications/?page_size=200'));
    expect((await leadNotifications()).length, 'assigning jobs notifies the technician').toBeGreaterThan(0);

    // ── Open the dashboard (it should load once, not again when the name arrives) ──
    let dashboardLoads = 0;
    page.on('request', (call) => {
      if (call.method() === 'GET' && new URL(call.url()).pathname === '/api/technician/dashboard/') dashboardLoads += 1;
    });
    await mockGeolocation(page);
    await seedAuthState(page, leadAuth);
    await page.goto('/technician/dashboard');
    const focus = page.getByRole('heading', { level: 3, name: new RegExp(`^${ticketCode(atSiteJob)}: `) });
    await expect(focus).toBeVisible({ timeout: 30000 });
    await page.waitForTimeout(3000);
    // Development mode mounts effects twice, so 2 is the most a single load may cost.
    expect(dashboardLoads).toBeLessThanOrEqual(2);

    // ── Current job at the site: readiness, equipment, Up Next ──
    await expect(page.getByText('Current Focus', { exact: true })).toBeVisible();
    await expect(page.getByText('High priority job')).toBeVisible();
    const readiness = page.locator('div').filter({ has: page.getByText('Readiness Checklist', { exact: true }) }).last();
    await expect(readiness.getByText('Ready', { exact: true })).toBeVisible();
    await expect(readiness.getByText('Pending', { exact: true })).toBeVisible();
    await expect(readiness.getByText('1 item', { exact: true })).toBeVisible();
    const equipment = page.locator('div').filter({ has: page.getByText('Equipment Reminder', { exact: true }) }).last();
    await expect(equipment.getByText('Clamp meter')).toBeVisible();
    await expect(equipment.getByText('x2')).toBeVisible();
    const upNext = page.locator('div').filter({ has: page.getByText('Up Next', { exact: true }) }).last();
    await expect(upNext).toContainText(ticketCode(laterJob));
    await expect(page.getByRole('link', { name: 'Navigate to Job' })).toHaveAttribute('href', `/technician/map-navigation?ticketId=${atSiteJob}`);
    await expect(page.getByRole('link', { name: 'Request Equipment' })).toHaveAttribute('href', `/technician/my-jobs?ticketId=${atSiteJob}`);
    // The checklist is only offered once the job has started.
    await expect(page.getByRole('link', { name: 'Open Checklist' })).toHaveCount(0);

    // ── Start Job ──
    await page.getByRole('button', { name: 'Start Job' }).click();
    await expect(page.getByRole('status').filter({ hasText: `${ticketCode(atSiteJob)} is now in progress.` })).toBeVisible();
    await expect.poll(async () => (await leadApi.get(`/api/technician/jobs/${atSiteJob}/`)).status).toBe('In Progress');
    await expect(page.getByRole('button', { name: 'Start Job' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Continue Job' })).toHaveAttribute('href', `/technician/my-jobs?ticketId=${atSiteJob}`);
    const checklistLink = page.getByRole('link', { name: 'Open Checklist' });
    await expect(checklistLink).toHaveAttribute('href', `/technician/checklist?ticketId=${atSiteJob}`);
    await checklistLink.click();
    await expect(page).toHaveURL(new RegExp(`/technician/checklist\\?ticketId=${atSiteJob}`));
    await page.goBack();
    await expect(focus).toBeVisible();

    // ── Upcoming Schedule and Recent Activity open the right job ──
    await page.getByRole('button', { name: new RegExp(`^${service.name}`) }).filter({ hasText: 'Dash Street' }).first().click();
    await expect(page).toHaveURL(/\/technician\/my-jobs\?ticketId=\d+/);
    await page.goBack();
    await expect(focus).toBeVisible();
    const activityRows = page.locator('table tbody tr');
    await expect(activityRows.first()).toContainText(ticketCode(atSiteJob));
    await expect(activityRows.first().locator('td').nth(4)).not.toHaveText('-');
    await activityRows.first().getByRole('button', { name: `View job ${ticketCode(atSiteJob)}` }).click();
    await expect(page).toHaveURL(new RegExp(`/technician/my-jobs\\?ticketId=${atSiteJob}`));
    await page.goBack();
    await expect(focus).toBeVisible();

    // ── The four cards open the page they count ──
    for (const [name, url] of [
      [/^Upcoming Jobs:/, /\/technician\/schedule/],
      [/^Active Jobs:/, /\/technician\/my-jobs/],
      [/^Completed Today:/, /\/technician\/job-history/],
      [/^Unread Alerts:/, /\/technician\/notifications/],
    ]) {
      await page.getByRole('button', { name }).click();
      await expect(page).toHaveURL(url);
      await page.goBack();
      await expect(focus).toBeVisible();
    }
    for (const [name, url] of [['Check Schedule', '/technician/schedule'], ['View full schedule', '/technician/schedule'], ['Open history', '/technician/job-history'], ['View all', '/technician/notifications']]) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', url);
    }

    // ── Refresh, and a failed refresh keeps what is on screen ──
    const refreshed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/technician/dashboard/');
    await page.getByRole('button', { name: 'Refresh' }).click();
    expect((await refreshed).ok()).toBeTruthy();
    await page.route('**/api/technician/dashboard/*', (route) => route.fulfill({ status: 500, json: { detail: 'Dashboard is unavailable.' } }));
    await page.getByRole('button', { name: 'Refresh' }).click();
    const refreshAlert = page.getByRole('alert').filter({ hasText: 'Showing the last information we received.' });
    await expect(refreshAlert).toBeVisible();
    await expect(focus).toBeVisible();
    await page.unroute('**/api/technician/dashboard/*');
    await refreshAlert.getByRole('button', { name: 'Try again' }).click();
    await expect(refreshAlert).toHaveCount(0);

    // ── Location sharing: the position reaches the server ──
    await page.getByRole('button', { name: 'Start location sharing' }).click();
    const sharing = page.getByRole('status').filter({ hasText: 'Location sharing is on.' });
    await expect(sharing).toBeVisible();
    await expect(page.getByText(`${FIX.latitude.toFixed(6)}, ${FIX.longitude.toFixed(6)}`)).toBeVisible();
    await expect.poll(async () => Number((await leadApi.get('/api/technician/dashboard/')).technician.current_location?.latitude)).toBeCloseTo(FIX.latitude, 3);
    await sharing.getByRole('button', { name: 'Dismiss' }).click();
    await expect(sharing).toHaveCount(0);

    // ── Notifications: a failed Delete all stays in its dialog, then the real delete works ──
    await expect(page.getByRole('button', { name: 'Delete all' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete all' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete all notifications?' });
    await page.route('**/api/notifications/delete_all/', (route) => route.fulfill({ status: 500, json: { detail: 'Could not delete right now.' } }));
    await dialog.getByRole('button', { name: 'Delete all' }).click();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await page.unroute('**/api/notifications/delete_all/');
    await dialog.getByRole('button', { name: 'Delete all' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'All notifications deleted.' })).toBeVisible();
    await expect(page.getByText('No recent notifications.')).toBeVisible();
    await expect.poll(async () => (await leadNotifications()).length).toBe(0);

    // ── Phone layout: nothing spills sideways, and activity uses cards ──
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: `View job ${ticketCode(atSiteJob)}` }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // ── Location refused: a clear message, no "waiting" notice left behind ──
    const deniedContext = await browser.newContext();
    const deniedPage = await deniedContext.newPage();
    await mockGeolocation(deniedPage, { deny: true });
    await seedAuthState(deniedPage, leadAuth);
    await deniedPage.goto('/technician/dashboard');
    await expect(deniedPage.getByRole('heading', { level: 3, name: new RegExp(`^${ticketCode(atSiteJob)}: `) })).toBeVisible({ timeout: 30000 });
    await deniedPage.getByRole('button', { name: 'Start location sharing' }).click();
    await expect(deniedPage.getByText(/Turn on Location\/GPS and allow browser location access/)).toBeVisible();
    await expect(deniedPage.getByRole('status').filter({ hasText: 'Location sharing is on.' })).toHaveCount(0);
    await deniedContext.close();

    // ── A technician with only Dashboard and Jobs access, and only a later job ──
    const limitedContext = await browser.newContext();
    const limitedPage = await limitedContext.newPage();
    await mockGeolocation(limitedPage);
    await seedAuthState(limitedPage, loadAuthStateFromBackend(limited.username));
    await limitedPage.goto('/technician/dashboard');
    await expect(limitedPage.getByRole('heading', { level: 3, name: new RegExp(`^${ticketCode(limitedJob)}: `) })).toBeVisible({ timeout: 30000 });
    await expect(limitedPage.getByText('Next Job', { exact: true })).toBeVisible();
    await expect(limitedPage.getByText('Current Focus', { exact: true })).toHaveCount(0);
    for (const hidden of ['Check Schedule', 'View full schedule', 'Open history', 'Navigate to Job', 'Open Checklist']) {
      await expect(limitedPage.getByRole('link', { name: hidden, exact: true })).toHaveCount(0);
    }
    await expect(limitedPage.getByRole('button', { name: 'Navigate to Job' })).toHaveCount(0);
    // Cards for pages they cannot open are plain figures, not buttons.
    await expect(limitedPage.getByRole('button', { name: /^Upcoming Jobs:/ })).toHaveCount(0);
    await expect(limitedPage.getByRole('button', { name: /^Completed Today:/ })).toHaveCount(0);
    await expect(limitedPage.getByRole('button', { name: /^Active Jobs:/ })).toBeVisible();
    await expect(limitedPage.getByRole('link', { name: 'Open Job', exact: true })).toHaveAttribute('href', `/technician/my-jobs?ticketId=${limitedJob}`);
    await limitedContext.close();

    // ── An inspection job: the checklist link opens the inspection checklist, and no equipment request ──
    const inspectorAuth = loadAuthStateFromBackend(inspector.username);
    const inspectorApi = apiAs(request, inspectorAuth);
    expect((await inspectorApi.get(`/api/technician/jobs/${inspectionJob}/`)).ticket_type).toBe('inspection');
    await inspectorApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await inspectorApi.post(`/api/technician/jobs/${inspectionJob}/start-navigation/`);
    await inspectorApi.post(`/api/technician/jobs/${inspectionJob}/arrive/`, SITE);
    await inspectorApi.post(`/api/technician/jobs/${inspectionJob}/status/`, { status: 'in_progress' });
    const inspectorContext = await browser.newContext();
    const inspectorPage = await inspectorContext.newPage();
    await mockGeolocation(inspectorPage);
    await seedAuthState(inspectorPage, inspectorAuth);
    await inspectorPage.goto('/technician/dashboard');
    await expect(inspectorPage.getByRole('heading', { level: 3, name: new RegExp(`^${ticketCode(inspectionJob)}: `) })).toBeVisible({ timeout: 30000 });
    await expect(inspectorPage.getByRole('link', { name: 'Open Checklist' })).toHaveAttribute('href', `/technician/inspection-checklist?ticketId=${inspectionJob}`);
    await expect(inspectorPage.getByRole('link', { name: 'Request Equipment' })).toHaveCount(0);
    await inspectorContext.close();
  });
});
