// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The buttons each person sees match what the server allows in each job state (the server rules
// themselves are tested in backend/services/tests/test_ticket_and_request_state_rules.py):
// - client: "Dismiss request" while the job has not started; gone once the technician set off and
//   while the job is paused (the server answers 409 "contact our office");
// - office: "Dismiss ticket" for open jobs, including a paused one; not for a finished job;
// - crew member on a job in progress: no "Put on Hold" and no "Finish Job" (lead only), while the lead has them.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;

test.describe('Request and ticket state buttons', () => {
  test.describe.configure({ timeout: 420000 });

  test('58 - buttons follow the job state for client, office and crew', async ({ browser, request }) => {
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
      name: `E2E States ${stamp}`, description: 'State check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const makeTech = async (prefix, phone) => {
      const username = `${prefix}${stamp}`.toLowerCase();
      const tech = await call('post', '/api/admin/technicians/', superAuth, {
        username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: prefix, last_name: `Tech${stamp}`, phone, role: 'technician', status: 'active', is_available: true,
      });
      await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const auth = loadAuthStateFromBackend(username);
      await call('post', '/api/services/technician/location/', auth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
      return { tech, auth };
    };
    const lead = await makeTech('stlead', '09171234570');
    const crew = await makeTech('stcrew', '09171234571');
    const clientName = `stbclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'State', last_name: `Client${stamp}`, phone: '09171234572', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);
    let nextDay = 240;
    const book = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: 'State check', priority: 'Normal',
            location_address: 'State Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) return { ...(await response.json()), visitDate };
      }
      throw new Error('Could not book a request');
    };
    const approve = async (created) => {
      await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
      return list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    };

    // A: approved, not started. B: started with a crew member, then paused. C: finished.
    const waiting = await book();
    const waitingTicket = await approve(waiting);
    const paused = await book();
    const pausedTicket = await approve(paused);
    await call('post', `/api/services/service-tickets/${pausedTicket.id}/assign/`, superAuth, {
      technician_id: lead.tech.id, crew_ids: [crew.tech.id], dispatch_stage: 'service', scheduled_date: paused.visitDate,
    });
    await call('post', `/api/technician/jobs/${pausedTicket.id}/start-navigation/`, lead.auth);
    await call('post', `/api/technician/jobs/${pausedTicket.id}/arrive/`, lead.auth, SITE);
    await call('post', `/api/technician/jobs/${pausedTicket.id}/status/`, lead.auth, { status: 'in_progress' });

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    try {
      // ── Crew member on a job in progress: no lead-only controls; the lead has them ──
      const crewPage = await phone.newPage();
      await seedAuthState(crewPage, crew.auth);
      await crewPage.goto(`/technician/my-jobs?ticketId=${pausedTicket.id}`);
      const crewJob = crewPage.getByLabel(service.name, { exact: true });
      await expect(crewJob).toBeVisible({ timeout: 30000 });
      await expect(crewJob.getByRole('button', { name: 'Put on Hold' })).toHaveCount(0);
      await expect(crewJob.getByRole('button', { name: 'Finish Job' })).toHaveCount(0);
      await crewPage.close();
      const leadPage = await phone.newPage();
      await seedAuthState(leadPage, lead.auth);
      await leadPage.goto(`/technician/my-jobs?ticketId=${pausedTicket.id}`);
      const leadJob = leadPage.getByLabel(service.name, { exact: true });
      await expect(leadJob.getByRole('button', { name: 'Put on Hold' })).toBeVisible({ timeout: 30000 });
      await leadPage.close();

      // The lead pauses the job.
      await call('post', `/api/technician/jobs/${pausedTicket.id}/status/`, lead.auth, { status: 'on_hold', reason: 'Waiting for the rain to stop.' });

      // ── Client: Dismiss request only while the job has not started ──
      const clientPage = await phone.newPage();
      await seedAuthState(clientPage, clientAuth);
      await clientPage.goto(`/client/requests/${waiting.id}?entity=request`);
      await expect(clientPage.getByRole('button', { name: 'Dismiss request' })).toBeVisible({ timeout: 30000 });
      await clientPage.goto(`/client/requests/${paused.id}?entity=request`);
      await expect(clientPage.getByText(/paused|on hold/i).first()).toBeVisible({ timeout: 30000 });
      await expect(clientPage.getByRole('button', { name: 'Dismiss request' })).toHaveCount(0);
      const refused = await request.post(`/api/services/service-requests/${paused.id}/cancel/`, { headers: as(clientAuth), data: { reason: 'Changed my mind.' } });
      expect(refused.status()).toBe(409);
      expect((await refused.json()).code).toBe('cancellation_requires_office');
      await clientPage.close();

      // ── Office: Dismiss ticket for open jobs (also the paused one), not for a finished job ──
      const officePage = await laptop.newPage();
      await seedAuthState(officePage, superAuth);
      for (const ticket of [waitingTicket, pausedTicket]) {
        await officePage.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
        const actions = officePage.getByRole('dialog', { name: ticketCode(ticket.id) });
        await expect(actions.getByRole('button', { name: /Dismiss ticket/ })).toBeVisible({ timeout: 30000 });
      }
      // The office finishes the paused job: resume, checklist, complete; then it has no Dismiss.
      await call('post', `/api/technician/jobs/${pausedTicket.id}/status/`, lead.auth, { status: 'in_progress' });
      await call('post', '/api/checklist/', lead.auth, {
        jobId: pausedTicket.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Work', completed: true }],
        notes: 'Done.', maintenance_required: false,
      });
      await call('post', `/api/services/service-tickets/${pausedTicket.id}/update_status/`, superAuth, { status: 'Completed', reason: 'Finished on site, confirmed by the lead.' });
      await officePage.goto(`/admin/service-tickets?ticketId=${pausedTicket.id}`);
      const finishedActions = officePage.getByRole('dialog', { name: ticketCode(pausedTicket.id) });
      await expect(finishedActions).toBeVisible({ timeout: 30000 });
      await expect(finishedActions.getByRole('button', { name: /Dismiss ticket/ })).toHaveCount(0);
      await officePage.screenshot({ path: 'test-results/screenshots/58-office-finished-ticket-laptop.png' });
    } finally {
      await phone.close();
      await laptop.close();
    }
  });
});
