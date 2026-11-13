// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /client/dashboard, on a phone, with its own client so the numbers are exact.
// Empty: zeros, no next appointment, the "Create Request" suggestion. Then one request waiting for
// approval, one approved job booked ahead and one finished (unrated) job: each counted once and in
// one stage, the next appointment, the alert, both "View all" links, the waiting request, "Rate" on
// the finished job, "Try again" after a failed load, 44 px controls and no sideways scroll.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.describe('Client dashboard controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('47 - every Client Dashboard control works', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });
    const call = async (method, path, auth, data, multipart = false) => {
      const options = { headers: as(auth) };
      if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
      const response = await request[method](path, options);
      const body = await response.json().catch(() => ({}));
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      return body;
    };
    const stamp = Date.now();

    const service = await call('post', '/api/admin/services/', superAuth, {
      name: `E2E Client Dash ${stamp}`, description: 'Dashboard check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const techName = `cdtech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Dash', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const clientName = `cdclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Dash', last_name: `Client${stamp}`, phone: '09171234568', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);

    let nextDay = 80;
    const newRequest = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: `E2E dashboard ${stamp}`, priority: 'Normal',
            location_address: 'Dash Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) return { ...(await response.json()), visitDate };
      }
      throw new Error('No bookable day found.');
    };
    const approveAndAssign = async (created) => {
      await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
      const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: created.visitDate });
      return ticket;
    };

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);
    await page.goto('/client/dashboard');

    // ── Empty: zeros, no next appointment, a suggestion to book ──
    // The stat card (the first match: the same words also appear in the pipeline and a table header).
    const statValue = (title) => page.getByText(title, { exact: true }).first().locator('xpath=..');
    await expect(statValue('All requests')).toContainText('0', { timeout: 30000 });
    await expect(page.getByText('Next Appointment')).toHaveCount(0);
    const suggestion = page.getByRole('button', { name: /Create Request/ });
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await expect(page).toHaveURL(/\/client\/service-requests$/);

    // ── Three jobs: one waiting, one booked ahead, one finished ──
    const waiting = await newRequest();
    const booked = await approveAndAssign(await newRequest());
    const finishedRequest = await newRequest();
    const finished = await approveAndAssign(finishedRequest);
    await call('post', `/api/technician/jobs/${finished.id}/start-navigation/`, techAuth);
    await call('post', `/api/technician/jobs/${finished.id}/arrive/`, techAuth, SITE);
    await call('post', `/api/technician/jobs/${finished.id}/status/`, techAuth, { status: 'in_progress' });
    await call('post', '/api/checklist/', techAuth, {
      jobId: finished.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
      notes: 'Done.', maintenance_required: false,
    });
    await call('post', `/api/services/service-tickets/${finished.id}/complete_work/`, techAuth, {
      completion_notes: 'Finished and tested.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
    }, true);

    await page.goto('/client/dashboard');
    await expect(statValue('All requests')).toContainText('3', { timeout: 30000 });
    await expect(statValue('Waiting for approval').first()).toContainText('1');
    await expect(statValue('Open jobs')).toContainText('1');
    await expect(statValue('Completed')).toContainText('1');
    // Where the open jobs are, under the "Open jobs" card (non-breaking spaces between words).
    await expect(statValue('Open jobs').locator('xpath=..')).toContainText(/1\s+to\s+start · 0\s+in\s+progress · 0\s+on\s+hold/);
    await expect(page.getByRole('button', { name: /Create Request/ }).filter({ hasText: 'open services' })).toHaveCount(0);

    // ── Next appointment: the booked job, which opens its details ──
    const next = page.getByRole('button', { name: /Next Appointment/ });
    await expect(next).toContainText(service.name);
    await expect(next).toContainText(`Dash Tech${stamp}`);
    await next.click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${booked.id}\\?entity=ticket$`));
    await page.goBack();

    // ── The alert and both "View all" links go to My Requests ──
    const alert = page.getByRole('button', { name: /You have 1 request waiting for approval\./ });
    await alert.click();
    await expect(page).toHaveURL(/\/client\/requests$/);
    await page.goBack();
    for (const name of ['View all requests waiting for approval', 'View all open jobs']) {
      const link = page.getByRole('button', { name });
      expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await link.click();
      await expect(page).toHaveURL(/\/client\/requests$/);
      await page.goBack();
    }

    // ── The waiting request opens as a request ──
    const waitingSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Waiting for Approval' }) });
    await waitingSection.getByRole('button', { name: service.name }).click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${waiting.id}\\?entity=request$`));
    await page.goBack();

    // ── The finished job invites a rating ──
    const rate = page.getByRole('button', { name: `Rate ${service.name}` });
    expect((await rate.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await rate.click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${finished.id}\\?entity=ticket$`));
    await expect(page.getByRole('heading', { name: 'Rate This Service' })).toBeVisible({ timeout: 30000 });
    await page.goBack();

    // ── A failed load says so and "Try again" recovers ──
    const statsUrl = '**/api/dashboard/stats/**';
    let failing = true;
    await page.route(statsUrl, (route) => (failing ? route.fulfill({ status: 500, json: { error: 'Busy.' } }) : route.continue()));
    await page.reload();
    const problem = page.getByRole('alert');
    await expect(problem).toBeVisible({ timeout: 30000 });
    failing = false;
    await problem.getByRole('button', { name: 'Try again' }).click();
    await expect(problem).toHaveCount(0);
    await expect(statValue('All requests')).toContainText('3');
    await page.unroute(statsUrl);

    // ── Phone layout ──
    expect((await page.getByRole('button', { name: 'Create Service Request' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await context.close();
  });
});
