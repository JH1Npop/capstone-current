// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The office cancels a job while the technician is on the way (every job type and cancel point is
// covered on the server in backend/services/tests/test_job_type_cancel_matrix.py). On screen:
// - office: Dismiss ticket from the ticket's actions, with the required reason;
// - lead technician, map still open: Mark Arrived answers "The office cancelled ... no longer on your
//   job list" (it used to say "Start navigation before marking arrival"); after a reload the page says the
//   office cancelled the job (it used to say "This job is finished") and the job is gone from My Jobs;
// - crew member: a "Cancelled" notice (they used to get nothing), with no button to a job that is gone;
// - client: a "Cancelled" notice (it used to say "Status Updated") that opens the request, which offers
//   no Dismiss and no Request Reschedule.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;

const phoneContext = async (browser, position) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript((fix) => {
    window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    const reading = () => ({ coords: { ...fix, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok(reading()), watchPosition: (ok) => { ok(reading()); return 1; }, clearWatch: () => {} },
    });
  }, position);
  return context;
};

test.describe('Job cancelled while the technician is on the way', () => {
  test.describe.configure({ timeout: 300000 });

  test('63 - office, lead, crew and client each see the cancellation plainly', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
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
      name: `E2E Cancel Mid Trip ${stamp}`, description: 'Cancel check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const makeTech = async (label, phone) => {
      const username = `cmt${label}${stamp}`.toLowerCase();
      const tech = await call('post', '/api/admin/technicians/', superAuth, {
        username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: label, last_name: `Tech${stamp}`, phone, role: 'technician', status: 'active', is_available: true,
      });
      await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const auth = loadAuthStateFromBackend(username);
      await call('post', '/api/services/technician/location/', auth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
      return { ...tech, auth };
    };
    const lead = await makeTech('Lead', '09171234581');
    const crew = await makeTech('Crew', '09171234582');
    const clientName = `cmclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Cancel', last_name: `Client${stamp}`, phone: '09171234583', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);

    let created;
    let visitDate;
    for (let day = 330; day < 350 && !created; day += 1) {
      visitDate = localKey(new Date(Date.now() + day * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: as(clientAuth),
        data: {
          service_type: service.id, description: `Cancel mid trip ${stamp}`, priority: 'Normal',
          location_address: 'Cancel Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        },
      });
      if (response.ok()) created = await response.json();
    }
    await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
    const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
      .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, {
      technician_id: lead.id, crew_ids: [crew.id], dispatch_stage: 'service', scheduled_date: visitDate,
    });
    await call('post', `/api/technician/jobs/${ticket.id}/start-navigation/`, lead.auth);
    const code = ticketCode(ticket.id);

    const leadContext = await phoneContext(browser, SITE);
    const crewContext = await phoneContext(browser, SITE);
    const clientContext = await phoneContext(browser, SITE);
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    try {
      // ── Lead technician: on the way, map open ──
      const leadPage = await leadContext.newPage();
      await seedAuthState(leadPage, lead.auth);
      await leadPage.goto(`/technician/map-navigation?ticketId=${ticket.id}`);
      const sharing = leadPage.getByRole('button', { name: 'Start location sharing', exact: true });
      const markArrived = leadPage.getByRole('button', { name: 'Mark Arrived' });
      await expect(sharing.or(markArrived)).toBeVisible({ timeout: 30000 });
      if (await sharing.isVisible()) await sharing.click();
      await expect(markArrived).toBeEnabled();

      // ── Office: Dismiss ticket, with the reason ──
      const office = await laptop.newPage();
      await seedAuthState(office, superAuth);
      await office.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
      await office.getByRole('dialog', { name: code }).getByRole('button', { name: /Dismiss ticket/ }).click();
      const confirm = office.getByRole('dialog', { name: 'Dismiss service ticket?' });
      const dismiss = confirm.getByRole('button', { name: 'Dismiss ticket' });
      await expect(dismiss).toBeDisabled();
      await confirm.getByPlaceholder(/Client confirmed by phone/).fill('Client phoned: the house sale fell through.');
      await dismiss.click();
      await expect(office.getByText(`${code} dismissed because the client withdrew.`)).toBeVisible({ timeout: 30000 });
      expect((await call('get', `/api/services/service-tickets/${ticket.id}/`, superAuth)).status).toBe('Cancelled');

      // ── Lead: Mark Arrived now says the office cancelled the job ──
      await markArrived.click();
      await expect(leadPage.getByText(/The office cancelled (ticket #\d+|TKT-\d+), so it is no longer on your job list\./)).toBeVisible();
      // After a reload the page says so too, with no travel buttons, and My Jobs no longer lists it.
      await leadPage.reload();
      const cancelledNote = leadPage.getByRole('status').filter({ hasText: 'The office cancelled this job, so it is no longer on your job list.' });
      await expect(cancelledNote).toBeVisible({ timeout: 30000 });
      await expect(leadPage.getByText('This job is finished.')).toHaveCount(0);
      await expect(leadPage.getByRole('button', { name: /Mark Arrived|Start trip/ })).toHaveCount(0);
      await cancelledNote.getByRole('link', { name: 'Open My Jobs' }).click();
      await expect(leadPage).toHaveURL(/\/technician\/my-jobs$/);
      await expect(leadPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30000 });
      await expect(leadPage.getByText(code)).toHaveCount(0);
      expect(await leadPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      // ── Crew member: told, and the notice does not point to a job that is gone ──
      const crewPage = await crewContext.newPage();
      await seedAuthState(crewPage, crew.auth);
      await crewPage.goto('/technician/notifications');
      const crewCard = crewPage.locator('div.rounded-lg:not([role])').filter({ has: crewPage.getByRole('heading', { name: `${code} Cancelled` }) }).first();
      await expect(crewCard).toBeVisible({ timeout: 30000 });
      await expect(crewCard).toContainText('It is no longer on your job list.');
      await expect(crewCard.getByRole('button', { name: 'Open job' })).toHaveCount(0);

      // ── Client: a plain "Cancelled" notice that opens the request; nothing left to do there ──
      const clientPage = await clientContext.newPage();
      await seedAuthState(clientPage, clientAuth);
      await clientPage.goto('/client/notifications');
      const clientCard = clientPage.locator('div.rounded-lg:not([role])').filter({ has: clientPage.getByRole('heading', { name: `${code} Cancelled` }) }).first();
      await expect(clientCard).toBeVisible({ timeout: 30000 });
      await expect(clientPage.getByRole('heading', { name: /Status Updated/ })).toHaveCount(0);
      await clientCard.getByRole('button', { name: 'Open request' }).click();
      await expect(clientPage).toHaveURL(new RegExp(`/client/requests/${created.id}\\?entity=request$`));
      await expect(clientPage.getByText(/Cancelled/).first()).toBeVisible({ timeout: 30000 });
      await expect(clientPage.getByRole('button', { name: 'Dismiss request' })).toHaveCount(0);
      await expect(clientPage.getByRole('button', { name: 'Request Reschedule' })).toHaveCount(0);
      expect(await clientPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    } finally {
      await Promise.all([leadContext.close(), crewContext.close(), clientContext.close(), laptop.close()]);
    }
  });
});
