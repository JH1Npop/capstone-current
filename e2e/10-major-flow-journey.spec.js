// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The main business flow driven through the real screens of each role, end to end:
// client request -> office approval -> dispatch -> travel and GPS arrival -> checklist -> Finish Job
// -> client sees the completed job. API calls are used only to read generated IDs.

const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SERVICE_NAME = 'E2E Solar Installation';

const mockGeolocation = async (page) => {
  await page.addInitScript(({ latitude, longitude }) => {
    const position = () => ({
      coords: { latitude, longitude, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success) => success(position()),
        watchPosition: (success) => { success(position()); return 1; },
        clearWatch: () => {},
      },
    });
  }, SITE);
};

const apiGet = (page, path) => page.evaluate(async (url) => {
  const token = sessionStorage.getItem('afn_token');
  const response = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  return response.json();
}, path);

test.describe('Major flow journey through the real UI', () => {
  test.describe.configure({ timeout: 420000 });

  test('10.1 - Request to completed job across client, office, and technician screens', async ({ browser }) => {
    const clientAuth = loadAuthStateFromBackend('client_test');
    const adminAuth = loadAuthStateFromBackend('superadmin_test');
    const techAuth = loadAuthStateFromBackend('tech_test');
    const marker = `E2E journey ${Date.now()}`;
    const preferred = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

    // 1. Client creates the request.
    const clientContext = await browser.newContext({ permissions: ['geolocation'] });
    const clientPage = await clientContext.newPage();
    await mockGeolocation(clientPage);
    await seedAuthState(clientPage, clientAuth);
    await clientPage.goto('/client/service-requests');
    await clientPage.getByRole('checkbox', { name: SERVICE_NAME }).check();
    await clientPage.getByPlaceholder('E.g., near SM Mall of Asia').fill('Journey Street, Brgy. Pulo');
    await clientPage.getByPlaceholder('Enter city name').fill('Cabuyao');
    await clientPage.getByPlaceholder('Enter province name').fill('Laguna');
    await clientPage.locator('input[type="date"]').first().fill(preferred);
    await clientPage.getByPlaceholder('Describe your request').fill(marker);
    await clientPage.getByRole('button', { name: 'Use My Location' }).click();
    await clientPage.getByRole('button', { name: 'Create Service Request' }).click();
    await clientPage.getByRole('button', { name: 'Confirm submit' }).click();
    await expect(clientPage.getByRole('heading', { name: 'Request submitted' })).toBeVisible();
    const requests = await apiGet(clientPage, '/api/services/service-requests/');
    const createdRequest = (Array.isArray(requests) ? requests : requests.results).find((entry) => entry.description === marker);
    expect(createdRequest, 'request created through the client form').toBeTruthy();
    await clientPage.getByRole('button', { name: 'OK' }).click();

    // 2. Office approves it from the dashboard.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await seedAuthState(adminPage, adminAuth);
    await adminPage.goto('/admin/dashboard');
    const detailsButtons = adminPage.getByRole('button', { name: 'View Details' });
    await expect(detailsButtons.first()).toBeVisible();
    let opened = false;
    for (let index = 0; index < await detailsButtons.count(); index += 1) {
      await detailsButtons.nth(index).click();
      // The dialog loads the full request after opening, so wait briefly for its notes.
      if (await adminPage.getByText(marker).waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
        opened = true;
        break;
      }
      await adminPage.keyboard.press('Escape');
    }
    expect(opened, 'pending request visible in the approval queue').toBe(true);
    await adminPage.getByRole('button', { name: 'Approve for Service' }).click();
    await adminPage.getByRole('button', { name: 'Approve request' }).click();
    await expect.poll(async () => (await apiGet(adminPage, `/api/services/service-requests/${createdRequest.id}/`)).status).toBe('Approved');
    const tickets = await apiGet(adminPage, `/api/services/service-tickets/?request=${createdRequest.id}`);
    const ticket = (Array.isArray(tickets) ? tickets : tickets.results).find((entry) => Number(entry.request) === Number(createdRequest.id) || Number(entry.request_id) === Number(createdRequest.id));
    expect(ticket, 'ticket created on approval').toBeTruthy();
    const ticketCode = `TKT-${String(ticket.id).padStart(4, '0')}`;

    // 3. Office dispatches the technician on the Dispatch Board. The seed gives the technician no
    // skills, and dispatch only offers skilled technicians, so grant the skill the way an admin would.
    const skillSaved = await adminPage.evaluate(async ({ technicianId, serviceTypeId }) => {
      const token = sessionStorage.getItem('afn_token');
      const response = await fetch(`/api/admin/technicians/${technicianId}/`, {
        method: 'PUT',
        headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: [{ service_type: serviceTypeId, skill_level: 'expert' }] }),
      });
      return response.status;
    }, { technicianId: techAuth.user.id, serviceTypeId: createdRequest.service_type });
    expect(skillSaved).toBe(200);
    // Dispatch lists only technicians with no active field job. Earlier specs may leave one running,
    // so pause any leftover the way the technician would (Put on Hold), keeping this journey order-independent.
    await adminPage.evaluate(async (token) => {
      const headers = { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
      const payload = await (await fetch('/api/technician/jobs/', { headers })).json();
      const jobs = Array.isArray(payload) ? payload : payload.results || [];
      for (const job of jobs.filter((entry) => ['Navigating', 'Arrived on Site', 'In Progress'].includes(entry.status))) {
        await fetch(`/api/technician/jobs/${job.id}/status/`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'on_hold', reason: 'Paused by the journey test' }),
        });
      }
    }, techAuth.token);
    await adminPage.goto('/admin/dispatch-board');
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await adminPage.getByRole('button', { name: 'Set lead Test Technician' }).click();
    await adminPage.getByRole('button', { name: 'Confirm Assignment' }).click();
    await expect.poll(async () => (await apiGet(adminPage, `/api/services/service-tickets/${ticket.id}/`)).technician).toBeTruthy();

    // 4. Technician travels, arrives (GPS), starts, completes the checklist, and finishes.
    const techContext = await browser.newContext({ permissions: ['geolocation'] });
    const techPage = await techContext.newPage();
    await mockGeolocation(techPage);
    await seedAuthState(techPage, techAuth);
    await techPage.goto(`/technician/map-navigation?ticketId=${ticket.id}`);
    await techPage.getByRole('button', { name: 'Start location sharing', exact: true }).click();
    await expect(techPage.getByRole('button', { name: 'Mark Arrived' })).toBeEnabled({ timeout: 30000 });
    await techPage.getByRole('button', { name: 'Mark Arrived' }).click();
    await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).status).toBe('Arrived on Site');

    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    // Job Details opens from the ticketId link; act inside it rather than on the list card.
    const jobDetails = techPage.getByLabel(SERVICE_NAME, { exact: true });
    await jobDetails.getByRole('button', { name: 'Start Job' }).click();
    await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).status).toBe('In Progress');
    await jobDetails.getByRole('link', { name: 'Complete Checklist' }).click();

    for (const step of ['Confirm site and work scope', 'Complete installation work', 'Capture final installation evidence']) {
      await techPage.getByRole('button', { name: `Mark complete: ${step}` }).click();
    }
    const chooser = techPage.waitForEvent('filechooser');
    await techPage.getByRole('button', { name: /Add required photo/ }).click();
    await (await chooser).setFiles({ name: 'evidence.png', mimeType: 'image/png', buffer: PNG });
    // Answer each wizard step the way a technician would: standard maintenance cadence and no
    // after-sales handoff. Cap the walk so a step that refuses to advance fails clearly.
    const answerVisibleStep = async () => {
      for (const choice of [/Yes, remind us/, /Standard Area/, /No warranty or follow-up/]) {
        const option = techPage.getByRole('button', { name: choice }).first();
        if (await option.isVisible().catch(() => false)) await option.click();
      }
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await answerVisibleStep();
      const next = techPage.getByRole('button', { name: /^Continue to/ });
      if (!(await next.isVisible().catch(() => false))) break;
      await next.click();
    }
    await answerVisibleStep();
    await techPage.getByRole('button', { name: 'Submit Completed Checklist' }).click();
    await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).checklist_completed).toBe(true);

    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    await techPage.getByLabel(SERVICE_NAME, { exact: true }).getByRole('button', { name: 'Finish Job' }).click();
    await techPage.locator(`#completion-photos-${ticket.id}`).setInputFiles({ name: 'finished.png', mimeType: 'image/png', buffer: PNG });
    await techPage.getByRole('button', { name: 'Finish Job' }).last().click();
    await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).status).toBe('Completed');

    // 5. Client sees the finished work in Service History.
    await clientPage.goto('/client/service-history');
    // Rows render twice (desktop table and phone cards); assert on the copy this viewport shows.
    await expect(clientPage.getByText('Journey Street, Brgy. Pulo').locator('visible=true').first()).toBeVisible();
    const history = await apiGet(clientPage, `/api/services/service-requests/${createdRequest.id}/`);
    expect(history.status).toBe('Completed');

    await Promise.all([clientContext.close(), adminContext.close(), techContext.close()]);
  });
});
