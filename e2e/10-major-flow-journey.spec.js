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

  // The inspection-first branch, through the real screens of each role:
  // request -> inspection approval -> inspection dispatch -> GPS arrival -> inspection report ->
  // quotation sent from Documents -> client accepts -> deposit recorded -> service approved ->
  // service dispatch -> field work -> Finish Job -> turnover finalized -> client confirms handover ->
  // sales record confirmed -> client sees it under Purchase Records.
  // API calls only set up the service catalog, grant the technician skill, and read generated IDs.
  test('10.2 - Inspection, quotation, deposit, service, turnover, and sale across all roles', async ({ browser }) => {
    test.setTimeout(600000);
    const clientAuth = loadAuthStateFromBackend('client_test');
    const adminAuth = loadAuthStateFromBackend('superadmin_test');
    const techAuth = loadAuthStateFromBackend('tech_test');
    const stamp = Date.now();
    const serviceName = `E2E Inspected Install ${stamp}`;
    const marker = `E2E inspection journey ${stamp}`;
    const preferred = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const installDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const pick = (payload) => (Array.isArray(payload) ? payload : payload.results || []);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await seedAuthState(adminPage, adminAuth);
    await adminPage.goto('/admin/dashboard');

    // Catalog setup: an inspection-first service with a 30% deposit rule and its own site check.
    const setup = await adminPage.evaluate(async ({ name, technicianId }) => {
      const token = sessionStorage.getItem('afn_token');
      const headers = { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
      const created = await fetch('/api/admin/services/', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name,
          description: 'Inspection-first installation used by the journey test.',
          estimated_duration: 240,
          estimated_cost: 100000,
          max_daily_assignments: 3,
          is_active: true,
          requires_site_inspection: true,
          procedures: [{ step: 1, title: 'Mount and wire the array', description: 'Install and test.', requires_photo: false }],
          inspection_procedures: [{ title: 'Roof structure is sound', description: 'Check rafters and sheets.' }],
          deposit_policy: 'percentage',
          deposit_value: 30,
        }),
      });
      const service = await created.json();
      const services = await (await fetch('/api/admin/services/', { headers })).json();
      const list = Array.isArray(services) ? services : services.results || [];
      const existing = list.find((entry) => entry.name === 'E2E Solar Installation');
      const skills = [service.id, existing?.id].filter(Boolean).map((id) => ({ service_type: id, skill_level: 'expert' }));
      const skill = await fetch(`/api/admin/technicians/${technicianId}/`, { method: 'PUT', headers, body: JSON.stringify({ skills }) });
      // Dispatch lists only technicians without an active field job; pause any leftover from earlier specs.
      return { serviceStatus: created.status, serviceId: service.id, skillStatus: skill.status };
    }, { name: serviceName, technicianId: techAuth.user.id });
    expect(setup.serviceStatus).toBe(201);
    expect(setup.skillStatus).toBe(200);
    const pauseLeftoverFieldWork = () => adminPage.evaluate(async (token) => {
      const headers = { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
      const payload = await (await fetch('/api/technician/jobs/', { headers })).json();
      const jobs = Array.isArray(payload) ? payload : payload.results || [];
      for (const job of jobs.filter((entry) => ['Navigating', 'Arrived on Site', 'In Progress'].includes(entry.status))) {
        await fetch(`/api/technician/jobs/${job.id}/status/`, {
          method: 'POST', headers, body: JSON.stringify({ status: 'on_hold', reason: 'Paused by the journey test' }),
        });
      }
    }, techAuth.token);
    await pauseLeftoverFieldWork();

    // 1. Client requests the inspection-first service.
    const clientContext = await browser.newContext({ permissions: ['geolocation'] });
    const clientPage = await clientContext.newPage();
    await mockGeolocation(clientPage);
    await seedAuthState(clientPage, clientAuth);
    await clientPage.goto('/client/service-requests');
    await clientPage.getByRole('checkbox', { name: serviceName }).check();
    await clientPage.getByPlaceholder('E.g., near SM Mall of Asia').fill('Inspection Lane, Brgy. Pulo');
    await clientPage.getByPlaceholder('Enter city name').fill('Cabuyao');
    await clientPage.getByPlaceholder('Enter province name').fill('Laguna');
    await clientPage.locator('input[type="date"]').first().fill(preferred);
    await clientPage.getByPlaceholder('Describe your request').fill(marker);
    await clientPage.getByRole('button', { name: 'Use My Location' }).click();
    await clientPage.getByRole('button', { name: 'Create Service Request' }).click();
    await clientPage.getByRole('button', { name: 'Confirm submit' }).click();
    await expect(clientPage.getByRole('heading', { name: 'Request submitted' })).toBeVisible();
    const createdRequest = pick(await apiGet(clientPage, '/api/services/service-requests/')).find((entry) => entry.description === marker);
    expect(createdRequest, 'request created through the client form').toBeTruthy();
    await clientPage.getByRole('button', { name: 'OK' }).click();

    // 2. Office approves it for inspection from the dashboard.
    await adminPage.goto('/admin/dashboard');
    const detailsButtons = adminPage.getByRole('button', { name: 'View Details' });
    await expect(detailsButtons.first()).toBeVisible();
    let opened = false;
    for (let index = 0; index < await detailsButtons.count(); index += 1) {
      await detailsButtons.nth(index).click();
      if (await adminPage.getByText(marker).waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
        opened = true;
        break;
      }
      await adminPage.keyboard.press('Escape');
    }
    expect(opened, 'pending request visible in the approval queue').toBe(true);
    await expect(adminPage.getByRole('button', { name: 'Approve for Service' })).toHaveCount(0);
    await adminPage.getByRole('button', { name: 'Approve for Inspection' }).click();
    await adminPage.getByRole('button', { name: 'Require inspection' }).click();
    await expect.poll(async () => (await apiGet(adminPage, `/api/services/service-requests/${createdRequest.id}/`)).status).toBe('Approved');
    const ticket = pick(await apiGet(adminPage, `/api/services/service-tickets/?request=${createdRequest.id}`))
      .find((entry) => Number(entry.request) === Number(createdRequest.id) || Number(entry.request_id) === Number(createdRequest.id));
    expect(ticket, 'inspection ticket created on approval').toBeTruthy();
    expect(ticket.ticket_type).toBe('inspection');
    const ticketCode = `TKT-${String(ticket.id).padStart(4, '0')}`;
    const ticketStatus = async () => (await apiGet(adminPage, `/api/services/service-tickets/${ticket.id}/`)).status;

    // 3. Office dispatches the inspection.
    await adminPage.goto('/admin/dispatch-board');
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await adminPage.getByRole('button', { name: 'Set lead Test Technician' }).click();
    await adminPage.getByRole('button', { name: 'Confirm Assignment' }).click();
    await expect.poll(ticketStatus).toBe('For Inspection');

    // 4. Technician travels, arrives by GPS, and files the inspection report.
    const techContext = await browser.newContext({ permissions: ['geolocation'] });
    const techPage = await techContext.newPage();
    await mockGeolocation(techPage);
    await seedAuthState(techPage, techAuth);
    const travelAndArrive = async () => {
      await techPage.goto(`/technician/map-navigation?ticketId=${ticket.id}`);
      await techPage.getByRole('button', { name: 'Start location sharing', exact: true }).click();
      await expect(techPage.getByRole('button', { name: 'Mark Arrived' })).toBeEnabled({ timeout: 30000 });
      await techPage.getByRole('button', { name: 'Mark Arrived' }).click();
      await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).status).toBe('Arrived on Site');
    };
    await travelAndArrive();
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    const inspectionJob = techPage.getByLabel(serviceName, { exact: true });
    await inspectionJob.getByRole('button', { name: /^Start (Job|Inspection)$/ }).click();
    await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).status).toBe('In Progress');
    await techPage.goto(`/technician/inspection-checklist?ticketId=${ticket.id}`);
    await expect(techPage.getByText('Roof structure is sound')).toBeVisible();
    for (const yesButton of await techPage.getByRole('button', { name: 'Yes', exact: true }).all()) {
      await yesButton.click();
    }
    await techPage.getByRole('button', { name: /Ready for service/ }).click();
    await techPage.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });
    await techPage.getByRole('button', { name: 'Review and complete inspection' }).click();
    await expect(techPage.getByText('Inspection submitted successfully.')).toBeVisible();
    await expect.poll(ticketStatus).toBe('Inspection Completed');

    // 5. Office prices the job in Documents and sends the quotation to the client.
    await adminPage.goto('/admin/documents');
    await adminPage.getByRole('button', { name: 'Quotation Proposal' }).click();
    await adminPage.getByPlaceholder(/search ticket by id/i).fill(ticketCode);
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await expect(adminPage.getByText(/document data sources/i)).toBeVisible({ timeout: 15000 });
    // Wait for the ticket prefill to finish (it disables saving and would overwrite typed values),
    // then price the first row of the price table: the first table whose header has Total Amount.
    const saveQuotation = adminPage.getByRole('button', { name: 'Save Quotation Data' });
    await expect(saveQuotation).toBeEnabled({ timeout: 15000 });
    const priceTable = adminPage.locator('table:has(> thead th:text-is("Total Amount"))').first();
    const totalPrice = priceTable.locator(':scope > tbody > tr').first().locator('textarea').nth(2);
    await totalPrice.fill('100,000.00');
    await expect(totalPrice).toHaveValue('100,000.00');
    await saveQuotation.click();
    await expect(adminPage.getByText(/Quotation saved and sent to the client/)).toBeVisible();
    const quotation = pick(await apiGet(adminPage, `/api/services/quotations/?ticket_id=${ticket.id}`))[0];
    expect(quotation.status).toBe('Sent');
    expect(Number(quotation.required_deposit_amount)).toBe(30000);

    // 6. Client accepts the quotation in their request page.
    await clientPage.goto(`/client/requests/${createdRequest.id}`);
    await clientPage.getByRole('button', { name: 'Accept quotation' }).click();
    await expect.poll(async () => pick(await apiGet(clientPage, `/api/services/quotations/?ticket_id=${ticket.id}`))[0]?.status).toBe('Accepted');

    // 7. Office records the deposit and approves the inspected ticket for service.
    await adminPage.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
    await adminPage.getByRole('button', { name: /Review Inspection/ }).click();
    await adminPage.getByLabel('Amount').fill('30000');
    await adminPage.getByRole('button', { name: 'Record deposit' }).click();
    await expect(adminPage.getByText('Deposit payment recorded.')).toBeVisible();
    await adminPage.getByRole('radio', { name: /Ready for Service/ }).check();
    await adminPage.getByLabel('Installation date').fill(installDate);
    await adminPage.getByRole('button', { name: 'Submit Decision' }).click();
    await expect.poll(ticketStatus).toBe('Ready for Service');

    // 8. Office dispatches the installation on the same ticket.
    await pauseLeftoverFieldWork();
    await adminPage.goto('/admin/dispatch-board');
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await adminPage.getByRole('button', { name: 'Set lead Test Technician' }).click();
    await adminPage.getByRole('button', { name: 'Confirm Assignment' }).click();
    await expect.poll(async () => (await apiGet(adminPage, `/api/services/service-tickets/${ticket.id}/`)).ticket_type).toBe('installation');

    // 9. Technician returns, does the work, and finishes the job.
    await travelAndArrive();
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    const serviceJob = techPage.getByLabel(serviceName, { exact: true });
    await serviceJob.getByRole('button', { name: 'Start Job' }).click();
    await expect.poll(async () => (await apiGet(techPage, `/api/technician/jobs/${ticket.id}/`)).status).toBe('In Progress');
    await serviceJob.getByRole('link', { name: 'Complete Checklist' }).click();
    await techPage.getByRole('button', { name: 'Mark complete: Mount and wire the array' }).click();
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
    await techPage.getByLabel(serviceName, { exact: true }).getByRole('button', { name: 'Finish Job' }).click();
    await techPage.locator(`#completion-photos-${ticket.id}`).setInputFiles({ name: 'finished.png', mimeType: 'image/png', buffer: PNG });
    await techPage.getByRole('button', { name: 'Finish Job' }).last().click();
    await expect.poll(ticketStatus).toBe('Completed');

    // 10. Office finalizes the handover in Documents.
    await adminPage.goto('/admin/documents');
    await adminPage.getByRole('button', { name: 'Turnover / Acceptance Form' }).click();
    await adminPage.getByPlaceholder(/search ticket by id/i).fill(ticketCode);
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await expect(adminPage.getByText(/document data sources/i)).toBeVisible({ timeout: 15000 });
    await adminPage.getByRole('button', { name: 'Finalize Project Handover' }).click();
    await expect(adminPage.getByText('Turnover Finalized and Ticket updated!')).toBeVisible();
    await expect.poll(ticketStatus).toBe('Turned Over / Accepted');

    // 11. Client confirms the handover.
    await clientPage.goto(`/client/requests/${createdRequest.id}`);
    await clientPage.getByRole('button', { name: 'Confirm handover' }).click();
    await expect(clientPage.getByText(/^Confirmed /)).toBeVisible();

    // 12. Office confirms the sales record, valued from the accepted quotation.
    await adminPage.goto('/admin/sales-records');
    await adminPage.locator('select').filter({ has: adminPage.locator('option', { hasText: 'Select a completed ticket' }) })
      .selectOption({ value: String(ticket.id) });
    await adminPage.getByRole('button', { name: 'Prepare record' }).click();
    await expect(adminPage.getByText(quotation.quotation_number).first()).toBeVisible();
    await adminPage.getByRole('button', { name: 'Confirm record' }).click();
    await expect(adminPage.getByText('Sales record confirmed and made available to the client.')).toBeVisible();
    const sale = pick(await apiGet(adminPage, '/api/services/sales-records/')).find((entry) => Number(entry.ticket) === Number(ticket.id) && entry.status === 'confirmed');
    expect(sale, 'confirmed sales record for the ticket').toBeTruthy();

    // 13. Client sees it under Purchase Records.
    await clientPage.goto('/client/purchase-records');
    await expect(clientPage.getByText(sale.record_number).first()).toBeVisible();

    await Promise.all([clientContext.close(), adminContext.close(), techContext.close()]);
  });
});
