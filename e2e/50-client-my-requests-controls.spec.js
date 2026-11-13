// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /client/requests with its own client and four requests: one waiting for approval,
// one approved, one whose job is on hold, and one dismissed. Checked:
// - search by the REQ code shown on screen, and a no-match message;
// - the filter wording (same as the Dashboard) and its empty-state title;
// - the preferred date shown before a visit is booked;
// - no noise chips ("Normal", "Client Portal");
// - a dismissed request that no longer says "Waiting for office review" and offers no Dismiss;
// - no Dismiss for a paused job: the technician already set off, so the office cancels it (server 409);
// - the Dismiss dialog: a reason is required, a server refusal stays inside the dialog, then success
//   with a notice;
// - View details, 44 px buttons and no sideways scroll on a phone.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const reqCode = (id) => `REQ-${String(id).padStart(4, '0')}`;

test.describe('Client My Requests controls', () => {
  test.describe.configure({ timeout: 300000 });

  test('50 - every My Requests control works', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });
    const call = async (method, path, auth, data) => {
      const response = await request[method](path, { headers: as(auth), ...(data !== undefined ? { data } : {}) });
      const body = await response.json().catch(() => ({}));
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      return body;
    };
    const stamp = Date.now();
    const service = await call('post', '/api/admin/services/', superAuth, {
      name: `E2E My Requests ${stamp}`, description: 'My Requests check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const techName = `mrtech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Req', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const clientName = `mrclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Req', last_name: `Client${stamp}`, phone: '09171234572', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);

    let nextDay = 100;
    const newRequest = async (note) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: note, priority: 'Normal',
            location_address: 'Track Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) return { ...(await response.json()), visitDate };
      }
      throw new Error('No bookable day found.');
    };
    const ticketFor = async (requestId) => list(await call('get', `/api/services/service-tickets/?request=${requestId}`, superAuth))
      .find((entry) => Number(entry.request) === Number(requestId) || Number(entry.request_id) === Number(requestId));

    const waiting = await newRequest(`Waiting ${stamp}`);
    const approved = await newRequest(`Approved ${stamp}`);
    await call('post', `/api/services/service-requests/${approved.id}/approve/`, superAuth);
    const held = await newRequest(`Held ${stamp}`);
    await call('post', `/api/services/service-requests/${held.id}/approve/`, superAuth);
    const heldTicket = await ticketFor(held.id);
    await call('post', `/api/services/service-tickets/${heldTicket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: held.visitDate });
    await call('post', `/api/technician/jobs/${heldTicket.id}/start-navigation/`, techAuth);
    await call('post', `/api/technician/jobs/${heldTicket.id}/status/`, techAuth, { status: 'on_hold', reason: 'Road closed by flooding.', notes: 'Road closed by flooding.' });
    const dismissed = await newRequest(`Dismissed ${stamp}`);
    await call('post', `/api/services/service-requests/${dismissed.id}/cancel/`, clientAuth, { reason: 'Sent twice.' });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);
    await page.goto('/client/requests');
    const filter = page.getByRole('combobox', { name: 'Show requests' });
    await expect(filter).toBeVisible({ timeout: 30000 });
    await filter.selectOption('all');
    const card = (id) => page.locator('article').filter({ has: page.getByRole('button', { name: reqCode(id), exact: true }) });

    // ── Filter wording, the preferred date, no noise chips ──
    const options = await filter.locator('option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Waiting for approval', 'Approved, waiting to start', 'Dismissed or not accepted']));
    await expect(card(waiting.id)).toContainText(/Preferred [A-Z][a-z]{2} \d{1,2}, 20\d\d/);
    await expect(card(waiting.id)).not.toContainText('Client Portal');
    await expect(card(waiting.id).getByText('Normal', { exact: true })).toHaveCount(0);

    // ── A dismissed request: closed step, no Dismiss ──
    await expect(card(dismissed.id)).toContainText('Closed, no further work');
    await expect(card(dismissed.id)).not.toContainText('Waiting for office review');
    await expect(card(dismissed.id).getByRole('button', { name: /Dismiss/ })).toHaveCount(0);

    // ── A paused job cannot be dismissed online: the technician already set off ──
    await expect(card(held.id).getByRole('button', { name: /Dismiss/ })).toHaveCount(0);

    // ── Search by the REQ code shown on screen, and a no-match message ──
    const search = page.getByRole('searchbox', { name: 'Search requests' });
    await search.fill(reqCode(approved.id));
    await expect(page.locator('article')).toHaveCount(1);
    await expect(card(approved.id)).toBeVisible();
    await search.fill('zz-nothing-matches');
    await expect(page.getByText('Nothing matches "zz-nothing-matches".', { exact: false })).toBeVisible();
    await search.fill('');
    await filter.selectOption('completed');
    await expect(page.getByText('No requests: Completed')).toBeVisible();
    await filter.selectOption('all');

    // ── Dismiss: a reason is required, a refusal stays in the dialog, then it works ──
    const dismiss = card(waiting.id).getByRole('button', { name: `Dismiss request ${waiting.id}` });
    expect((await dismiss.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await dismiss.click();
    const dialog = page.getByRole('dialog', { name: 'Dismiss service request?' });
    await dialog.getByRole('button', { name: 'Dismiss request', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Please give a short reason');
    expect((await call('get', `/api/services/service-requests/${waiting.id}/`, clientAuth)).status).toBe('Pending');
    await dialog.getByRole('textbox').fill('Booked with another company.');
    const cancelUrl = `**/api/services/service-requests/${waiting.id}/cancel/`;
    await page.route(cancelUrl, (route) => route.fulfill({ status: 409, json: { error: 'Please contact our office.' } }));
    await dialog.getByRole('button', { name: 'Dismiss request', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Please contact our office.');
    await expect(dialog).toBeVisible();
    await page.unroute(cancelUrl);
    await dialog.getByRole('button', { name: 'Dismiss request', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: `${reqCode(waiting.id)} was dismissed.` })).toBeVisible();
    expect((await call('get', `/api/services/service-requests/${waiting.id}/`, clientAuth)).status).toBe('Cancelled');

    // ── View details ──
    const view = card(approved.id).getByRole('button', { name: 'View details' });
    expect((await view.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await view.click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${approved.id}\\?entity=request$`));
    await page.goBack();

    // ── Phone layout ──
    await expect(filter).toBeVisible({ timeout: 30000 });
    expect((await page.getByRole('button', { name: 'Create Service Request' }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await context.close();

    // ── PC/laptop: the eye opens a quick view; the REQ link still opens the full page ──
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const desk = await laptop.newPage();
    await desk.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(desk, clientAuth);
    await desk.goto('/client/requests');
    await desk.getByRole('combobox', { name: 'Show requests' }).selectOption('all');
    const eye = desk.getByRole('button', { name: `Quick view ${reqCode(held.id)}` });
    await expect(eye).toBeVisible({ timeout: 30000 });
    await eye.click();
    const quick = desk.getByRole('dialog', { name: reqCode(held.id) });
    await expect(quick).toBeVisible();
    await expect(quick).toContainText(service.name);
    await expect(quick).toContainText(`Req Tech${stamp}`);
    await expect(quick).toContainText('Track Street, Brgy. Pulo');
    await expect(quick).toContainText(`Held ${stamp}`);
    await expect(quick.getByRole('button', { name: 'Open full details' })).toBeFocused();
    await desk.screenshot({ path: 'test-results/screenshots/50-client-my-requests-quick-view.png' });
    await desk.keyboard.press('Escape');
    await expect(quick).toHaveCount(0);

    // The paused job's quick view offers no Dismiss.
    await eye.click();
    await expect(quick.getByRole('button', { name: 'Dismiss request' })).toHaveCount(0);
    await desk.keyboard.press('Escape');

    // Dismiss from the quick view opens the dismiss dialog for that request.
    await desk.getByRole('button', { name: `Quick view ${reqCode(approved.id)}` }).click();
    const approvedQuick = desk.getByRole('dialog', { name: reqCode(approved.id) });
    await approvedQuick.getByRole('button', { name: 'Dismiss request' }).click();
    await expect(approvedQuick).toHaveCount(0);
    const dismissDialog = desk.getByRole('dialog', { name: 'Dismiss service request?' });
    await expect(dismissDialog).toContainText(reqCode(approved.id));
    await dismissDialog.getByRole('button', { name: 'Keep request' }).click();

    // A dismissed request's quick view offers no Dismiss; Open full details opens the page.
    await desk.getByRole('button', { name: `Quick view ${reqCode(dismissed.id)}` }).click();
    const dismissedQuick = desk.getByRole('dialog', { name: reqCode(dismissed.id) });
    await expect(dismissedQuick).toContainText('Closed, no further work');
    await expect(dismissedQuick.getByRole('button', { name: 'Dismiss request' })).toHaveCount(0);
    await dismissedQuick.getByRole('button', { name: 'Open full details' }).click();
    await expect(desk).toHaveURL(new RegExp(`/client/requests/${dismissed.id}\\?entity=request$`));
    await desk.goBack();

    // The REQ link still goes straight to the full page.
    await desk.getByRole('button', { name: reqCode(approved.id), exact: true }).locator('visible=true').first().click();
    await expect(desk).toHaveURL(new RegExp(`/client/requests/${approved.id}\\?entity=request$`));
    await laptop.close();
  });
});
