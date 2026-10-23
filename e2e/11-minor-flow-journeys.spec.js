// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Minor and exception flows driven through the real screens of each role. The main path to each
// starting point is already proven on screen by journeys 10.1 and 10.2, so setup here goes through
// the same APIs those screens call; every branch under test is then performed in the browser.

const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
let nextFreeDay = 10;

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

// Thin API client bound to one role's token.
const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data, { multipart = false, expected } = {}) => {
    const options = { headers };
    if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    if (expected !== undefined) {
      expect(response.status(), `${method.toUpperCase()} ${path}: ${JSON.stringify(body)}`).toBe(expected);
    } else {
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    }
    return body;
  };
  return {
    get: (path) => call('get', path),
    post: (path, data, options) => call('post', path, data ?? {}, options),
    put: (path, data) => call('put', path, data),
  };
};

test.describe('Minor flows through the real UI', () => {
  test.describe.configure({ timeout: 420000 });

  let clientAuth;
  let adminAuth;
  let techAuth;

  test.beforeAll(() => {
    clientAuth = loadAuthStateFromBackend('client_test');
    adminAuth = loadAuthStateFromBackend('superadmin_test');
    techAuth = loadAuthStateFromBackend('tech_test');
  });

  // Shared setup helpers (API, mirroring the screens already proven by 10.1/10.2).
  const setupHelpers = (request) => {
    const admin = apiAs(request, adminAuth);
    const client = apiAs(request, clientAuth);
    const tech = apiAs(request, techAuth);

    const createService = async (name, extra = {}) => admin.post('/api/admin/services/', {
      name,
      description: 'Created by the minor-flow journeys.',
      estimated_duration: 120,
      estimated_cost: 5000,
      max_daily_assignments: 5,
      is_active: true,
      requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
      inspection_procedures: [],
      deposit_policy: 'none',
      deposit_value: 0,
      ...extra,
    }, { expected: 201 });

    const grantSkills = async (serviceIds) => {
      const services = list(await admin.get('/api/admin/services/'));
      const base = services.find((entry) => entry.name === 'E2E Solar Installation');
      const ids = [...new Set([...serviceIds, base?.id].filter(Boolean))];
      await admin.put(`/api/admin/technicians/${techAuth.user.id}/`, { skills: ids.map((id) => ({ service_type: id, skill_level: 'expert' })) });
    };

    // Dispatch skips technicians with active field work; hold anything left by earlier specs.
    const pauseLeftoverFieldWork = async () => {
      for (const job of list(await tech.get('/api/technician/jobs/')).filter((entry) => ['Navigating', 'Arrived on Site', 'In Progress'].includes(entry.status))) {
        await tech.post(`/api/technician/jobs/${job.id}/status/`, { status: 'on_hold', reason: 'Paused by the minor-flow journeys' });
      }
    };

    const createRequest = async (serviceId, description) => client.post('/api/services/service-requests/', {
      service_type: serviceId,
      description,
      priority: 'Normal',
      location_address: 'Minor Flow Street, Brgy. Pulo',
      location_city: 'Cabuyao',
      location_province: 'Laguna',
      preferred_date: day(2),
      latitude: String(SITE.latitude),
      longitude: String(SITE.longitude),
    }, { expected: 201 });

    const approve = async (requestId) => {
      await admin.post(`/api/services/service-requests/${requestId}/approve/`);
      return list(await admin.get(`/api/services/service-tickets/?request=${requestId}`))
        .find((entry) => Number(entry.request) === Number(requestId) || Number(entry.request_id) === Number(requestId));
    };

    // Each setup assignment gets its own future day: the seeded technician is already fully
    // booked today, and the 8-hour daily capacity rule (correctly) refuses more work.
    const assign = async (ticketId, stage, scheduledDate = day(nextFreeDay++)) => {
      await pauseLeftoverFieldWork();
      await admin.post(`/api/services/service-tickets/${ticketId}/assign/`, {
        technician_id: techAuth.user.id, dispatch_stage: stage, scheduled_date: scheduledDate,
      });
    };

    const startWork = async (ticketId) => {
      await tech.post(`/api/technician/jobs/${ticketId}/start-navigation/`);
      await tech.post(`/api/technician/jobs/${ticketId}/arrive/`, SITE);
      await tech.post(`/api/technician/jobs/${ticketId}/status/`, { status: 'in_progress' });
    };

    const finishWork = async (ticketId) => {
      await tech.post('/api/checklist/', {
        jobId: ticketId,
        completed: { 0: true },
        checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
        notes: 'Done.',
        maintenance_required: false,
      });
      await tech.post(`/api/services/service-tickets/${ticketId}/complete_work/`, {
        completion_notes: 'Work finished and tested.',
        completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
      }, { multipart: true });
    };

    const status = async (ticketId) => (await admin.get(`/api/services/service-tickets/${ticketId}/`)).status;

    return { admin, client, tech, createService, grantSkills, pauseLeftoverFieldWork, createRequest, approve, assign, startWork, finishWork, status };
  };

  const openPage = async (browser, auth, { geolocation = false } = {}) => {
    const context = await browser.newContext(geolocation ? { permissions: ['geolocation'] } : {});
    const page = await context.newPage();
    if (geolocation) await mockGeolocation(page);
    // Keep the movable assistant bubble away from page controls.
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, auth);
    return { context, page };
  };

  test('11.1 - Mid-job equipment request with pause, approval, resume, finish, and verified return', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Field Exceptions ${stamp}`);
    await setup.grantSkills([service.id]);
    const items = list(await setup.admin.get('/api/inventory/items/'));
    const category = items.find((entry) => entry.name === 'E2E Safety Kit')?.category;
    const item = await setup.admin.post('/api/inventory/items/', {
      name: `E2E Spare Breaker ${stamp}`, sku: `E2E-BRK-${stamp}`, category, item_type: 'equipment',
      quantity: 5, minimum_stock: 0, low_stock_threshold: 0, unit_price: '0.00', status: 'available',
    }, { expected: 201 });
    const requestObj = await setup.createRequest(service.id, `E2E equipment journey ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    const ticketCode = `TKT-${String(ticket.id).padStart(4, '0')}`;
    await setup.assign(ticket.id, 'service');
    await setup.startWork(ticket.id);

    // Technician asks for a spare breaker from the job screen and pauses while waiting.
    const { context: techContext, page: techPage } = await openPage(browser, techAuth, { geolocation: true });
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    const job = techPage.getByLabel(service.name, { exact: true });
    await job.getByRole('button', { name: 'Choose equipment' }).click();
    await job.getByRole('checkbox', { name: new RegExp(item.name) }).check();
    // The list closes on Escape (or an outside click) so it never covers the controls below it.
    await techPage.keyboard.press('Escape');
    await expect(job.locator('button[aria-expanded]')).toHaveAttribute('aria-expanded', 'false');
    await job.getByPlaceholder('Reason or details for admin').fill('Existing breaker is faulty; need a spare to continue.');
    await job.getByRole('checkbox', { name: /Pause job while waiting/ }).check();
    await job.getByRole('button', { name: 'Request Equipment' }).click();
    await expect.poll(() => setup.status(ticket.id)).toBe('On Hold');

    // Office approves it in Inventory; the stock is issued against the ticket.
    const { context: adminContext, page: adminPage } = await openPage(browser, adminAuth);
    await adminPage.goto(`/admin/inventory?ticketId=${ticket.id}#pending-equipment-requests`);
    const queue = adminPage.getByRole('region', { name: 'Pending equipment requests' });
    await queue.locator('article').filter({ hasText: ticketCode }).getByRole('button', { name: 'Review' }).click();
    const review = adminPage.getByRole('dialog', { name: `Equipment request for ${ticketCode}` });
    await expect(review.getByLabel(`Decision for ${item.name}`)).toHaveValue('approve');
    await review.getByRole('button', { name: 'Apply Decisions' }).click();
    await expect(adminPage.getByRole('status')).toContainText('1 item line(s) issued');
    const issued = list(await setup.admin.get('/api/inventory/items/')).find((entry) => entry.id === item.id);
    expect(issued.quantity).toBe(4);

    // Technician resumes without a new arrival, then finishes the job on screen.
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    await techPage.getByLabel(service.name, { exact: true }).getByRole('button', { name: 'Resume Job' }).click();
    await expect.poll(() => setup.status(ticket.id)).toBe('In Progress');
    await techPage.getByLabel(service.name, { exact: true }).getByRole('link', { name: 'Complete Checklist' }).click();
    await techPage.getByRole('button', { name: 'Mark complete: Do the agreed work' }).click();
    // Same wizard answers as journey 10.1: standard maintenance cadence and no after-sales handoff.
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
    await expect.poll(async () => (await setup.tech.get(`/api/technician/jobs/${ticket.id}/`)).checklist_completed).toBe(true);
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    await techPage.getByLabel(service.name, { exact: true }).getByRole('button', { name: 'Finish Job' }).click();
    await techPage.locator(`#completion-photos-${ticket.id}`).setInputFiles({ name: 'finished.png', mimeType: 'image/png', buffer: PNG });
    await techPage.getByRole('button', { name: 'Finish Job' }).last().click();
    await expect.poll(() => setup.status(ticket.id)).toBe('Completed');

    // Technician declares the unused breaker for return from Job History.
    await techPage.goto('/technician/job-history');
    await techPage.getByRole('button', { name: `Open actions for ${ticketCode}` }).locator('visible=true').first().click();
    await techPage.getByRole('button', { name: 'View details' }).click();
    await techPage.getByRole('button', { name: 'Submit return' }).click();
    const submitReturn = techPage.getByRole('dialog', { name: 'Submit equipment return' });
    await submitReturn.getByLabel('Quantity returned').fill('1');
    await submitReturn.getByLabel('Condition you observed').selectOption('sealed');
    await submitReturn.getByLabel('Technician return note').fill('Spare breaker was not needed; returned sealed.');
    await submitReturn.getByRole('button', { name: 'Submit for verification' }).click();
    await expect(submitReturn.getByRole('status')).toBeVisible();
    // A declaration alone does not change stock.
    expect(list(await setup.admin.get('/api/inventory/items/')).find((entry) => entry.id === item.id).quantity).toBe(4);

    // Warehouse verifies it from admin Job History; only then does stock come back.
    await adminPage.goto('/admin/job-history');
    await adminPage.locator('tr, article').filter({ hasText: ticketCode }).locator('visible=true').first()
      .getByRole('button', { name: 'View job details' }).click();
    await adminPage.getByRole('button', { name: 'Review equipment returns' }).click();
    const verify = adminPage.getByRole('dialog', { name: 'Verify equipment returns' });
    await verify.getByLabel('Condition observed by receiver').selectOption('sealed');
    await verify.getByLabel('Receiving note').fill('Counted 1 sealed breaker.');
    await verify.getByRole('button', { name: 'Verify and add to stock' }).click();
    await expect(verify.getByText('No returns await verification')).toBeVisible();
    expect(list(await setup.admin.get('/api/inventory/items/')).find((entry) => entry.id === item.id).quantity).toBe(5);

    await Promise.all([techContext.close(), adminContext.close()]);
  });

  test('11.2 - Quotation declined then resent, partial deposit blocks dispatch, deposit void, and Awaiting Materials', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Commercial Branch ${stamp}`, {
      requires_site_inspection: true, deposit_policy: 'percentage', deposit_value: 50,
    });
    await setup.grantSkills([service.id]);
    const requestObj = await setup.createRequest(service.id, `E2E commercial journey ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    const ticketCode = `TKT-${String(ticket.id).padStart(4, '0')}`;
    await setup.assign(ticket.id, 'inspection');
    await setup.tech.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
    await setup.tech.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
    await setup.tech.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
    const report = await setup.tech.post('/api/services/inspections/', {
      ticket: ticket.id, site_accessible: true, electrical_adequate: true, safety_equipment_present: true,
      recommendation: 'Approved', checklist_items: [], additional_notes: 'Site is fine.',
    }, { expected: 201 });
    await setup.tech.post(`/api/services/inspections/${report.id}/complete/`);
    await expect.poll(() => setup.status(ticket.id)).toBe('Inspection Completed');

    const { context: adminContext, page: adminPage } = await openPage(browser, adminAuth);
    const { context: clientContext, page: clientPage } = await openPage(browser, clientAuth);
    const quotations = async () => list(await setup.admin.get(`/api/services/quotations/?ticket_id=${ticket.id}`));
    const sendQuotation = async (amount) => {
      await adminPage.goto('/admin/documents');
      await adminPage.getByRole('button', { name: 'Quotation Proposal' }).click();
      await adminPage.getByPlaceholder(/search ticket by id/i).fill(ticketCode);
      await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
      const save = adminPage.getByRole('button', { name: 'Save Quotation Data' });
      await expect(save).toBeEnabled({ timeout: 15000 });
      const total = adminPage.locator('table:has(> thead th:text-is("Total Amount"))').first()
        .locator(':scope > tbody > tr').first().locator('textarea').nth(2);
      await total.fill(amount);
      await expect(total).toHaveValue(amount);
      await save.click();
      await expect(adminPage.getByText(/Quotation saved and sent to the client/)).toBeVisible();
    };

    // First quotation is declined by the client with a reason.
    await sendQuotation('80,000.00');
    await clientPage.goto(`/client/requests/${requestObj.id}`);
    await clientPage.getByRole('button', { name: 'Decline' }).click();
    await clientPage.getByLabel('Why are you declining?').fill('Too high for our budget; please revise.');
    await clientPage.getByRole('button', { name: 'Send decline' }).click();
    await expect.poll(async () => (await quotations())[0]?.status).toBe('Rejected');

    // Office sees the decline, revises the price, and sends again; the client accepts.
    await adminPage.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
    await adminPage.getByRole('button', { name: /Review Inspection/ }).click();
    await expect(adminPage.getByText(/declined: "Too high for our budget/)).toBeVisible();
    await adminPage.getByRole('button', { name: 'Close inspection review dialog' }).click();
    await sendQuotation('60,000.00');
    await expect.poll(async () => (await quotations()).find((entry) => entry.status === 'Sent')?.total_amount).toContain('60,000');
    await clientPage.goto(`/client/requests/${requestObj.id}`);
    await clientPage.getByRole('button', { name: 'Accept quotation' }).click();
    await expect.poll(async () => (await quotations()).some((entry) => entry.status === 'Accepted')).toBe(true);
    const accepted = (await quotations()).find((entry) => entry.status === 'Accepted');
    expect(Number(accepted.required_deposit_amount)).toBe(30000);

    // A partial deposit is recorded, then voided (with a reason), then recorded again.
    await adminPage.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
    await adminPage.getByRole('button', { name: /Review Inspection/ }).click();
    const depositPanel = adminPage.getByRole('region', { name: 'Pre-service deposit' });
    await depositPanel.getByLabel('Amount').fill('10000');
    await depositPanel.getByRole('button', { name: 'Record deposit' }).click();
    await expect(depositPanel.getByText('Deposit payment recorded.')).toBeVisible();
    await expect(depositPanel.getByText('Partially paid')).toBeVisible();
    adminPage.once('dialog', (dialog) => dialog.accept('Wrong reference number entered.'));
    await depositPanel.getByRole('button', { name: 'Void' }).click();
    await expect(depositPanel.getByText(/Deposit payment voided/)).toBeVisible();
    await expect(depositPanel.getByText('Unpaid')).toBeVisible();
    await depositPanel.getByLabel('Amount').fill('10000');
    await depositPanel.getByRole('button', { name: 'Record deposit' }).click();
    await expect(depositPanel.getByText('Partially paid')).toBeVisible();

    // Materials are not ready yet: Awaiting Materials needs a reason.
    await adminPage.getByRole('radio', { name: /Awaiting Materials/ }).check();
    await adminPage.getByRole('button', { name: 'Submit Decision' }).click();
    await expect(adminPage.getByText('Add a reason for this exception decision.')).toBeVisible();
    await adminPage.getByPlaceholder('Add internal notes about this decision...').fill('Inverter arrives next week.');
    await adminPage.getByRole('button', { name: 'Submit Decision' }).click();
    await expect.poll(() => setup.status(ticket.id)).toBe('Awaiting Materials');

    // When materials arrive the office dispatches straight from the board. With only part of
    // the deposit recorded, dispatch is refused; the remainder unlocks it.
    await setup.pauseLeftoverFieldWork();
    await adminPage.goto('/admin/dispatch-board');
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await adminPage.getByRole('button', { name: 'Set lead Test Technician' }).click();
    // The board now treats the inspected ticket as service work, not a second inspection.
    await expect(adminPage.getByText('No installation equipment will be reserved during this inspection assignment.')).toHaveCount(0);
    const refused = adminPage.waitForResponse((response) => response.url().includes(`/service-tickets/${ticket.id}/assign/`));
    await adminPage.getByRole('button', { name: 'Confirm Assignment' }).click();
    const refusal = await refused;
    const refusalBody = JSON.stringify(await refusal.json());
    expect(refusal.ok(), refusalBody).toBe(false);
    expect(refusalBody).toMatch(/deposit/i);
    await expect(adminPage.getByRole('alert').filter({ hasText: /deposit/i })).toBeVisible();
    expect(await setup.status(ticket.id)).toBe('Awaiting Materials');

    await adminPage.goto(`/admin/documents`);
    await adminPage.getByRole('button', { name: 'Quotation Proposal' }).click();
    await adminPage.getByPlaceholder(/search ticket by id/i).fill(ticketCode);
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    const docDeposit = adminPage.getByRole('region', { name: 'Pre-service deposit' });
    await docDeposit.getByLabel('Amount').fill('20000');
    await docDeposit.getByRole('button', { name: 'Record deposit' }).click();
    await expect(docDeposit.getByText('Paid', { exact: true })).toBeVisible();

    await adminPage.goto('/admin/dispatch-board');
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await adminPage.getByRole('button', { name: 'Set lead Test Technician' }).click();
    await adminPage.getByRole('button', { name: 'Confirm Assignment' }).click();
    await expect.poll(async () => {
      const dispatched = await setup.admin.get(`/api/services/service-tickets/${ticket.id}/`);
      return [dispatched.status, Boolean(dispatched.technician)];
    }).toEqual(['Ready for Service', true]);
    await Promise.all([adminContext.close(), clientContext.close()]);
  });

  test('11.3 - Inspection result Cancel Service closes the request for the client', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Cancelled Site ${stamp}`, { requires_site_inspection: true });
    await setup.grantSkills([service.id]);
    const requestObj = await setup.createRequest(service.id, `E2E cancel-after-inspection ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    await setup.assign(ticket.id, 'inspection');
    await setup.tech.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
    await setup.tech.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
    await setup.tech.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
    const report = await setup.tech.post('/api/services/inspections/', {
      ticket: ticket.id, site_accessible: false, site_accessible_notes: 'Roof is condemned.', electrical_adequate: true,
      safety_equipment_present: true, recommendation: 'Rejected', checklist_items: [], additional_notes: 'Unsafe roof.',
    }, { expected: 201 });
    await setup.tech.post(`/api/services/inspections/${report.id}/complete/`);
    await expect.poll(() => setup.status(ticket.id)).toBe('Inspection Completed');

    const { context: adminContext, page: adminPage } = await openPage(browser, adminAuth);
    await adminPage.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
    await adminPage.getByRole('button', { name: /Review Inspection/ }).click();
    await adminPage.getByRole('radio', { name: /Cancel Service/ }).check();
    await adminPage.getByPlaceholder('Add internal notes about this decision...').fill('Roof cannot carry an array; advised client to repair first.');
    await adminPage.getByRole('button', { name: 'Submit Decision' }).click();
    await expect.poll(() => setup.status(ticket.id)).toBe('Cancelled');

    const { context: clientContext, page: clientPage } = await openPage(browser, clientAuth);
    await clientPage.goto(`/client/requests/${requestObj.id}`);
    await expect(clientPage.getByText(/Cancelled/i).first()).toBeVisible();
    await Promise.all([adminContext.close(), clientContext.close()]);
  });

  test('11.4 - Sales record with manual value, payment then void, and void-and-replace', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Cash Sale ${stamp}`);
    await setup.grantSkills([service.id]);
    const requestObj = await setup.createRequest(service.id, `E2E sales corrections ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    await setup.assign(ticket.id, 'service');
    await setup.startWork(ticket.id);
    await setup.finishWork(ticket.id);
    await expect.poll(() => setup.status(ticket.id)).toBe('Completed');

    const { context: adminContext, page: adminPage } = await openPage(browser, adminAuth);
    await adminPage.goto('/admin/sales-records');
    await adminPage.locator('select').filter({ has: adminPage.locator('option', { hasText: 'Select a completed ticket' }) })
      .selectOption({ value: String(ticket.id) });
    await adminPage.getByRole('button', { name: 'Prepare record' }).click();
    // No quotation: the value is entered manually and needs a reason.
    await adminPage.getByLabel('Recorded contract value (manual)').fill('5000');
    await adminPage.getByLabel('Reason for manual value').fill('Walk-in service priced on site.');
    await adminPage.getByRole('button', { name: 'Save draft' }).click();
    await adminPage.getByRole('button', { name: 'Confirm record' }).click();
    await expect(adminPage.getByText('Sales record confirmed and made available to the client.')).toBeVisible();

    const payments = adminPage.getByRole('region', { name: 'Payments received' });
    await payments.getByRole('button', { name: 'Record payment' }).click();
    await payments.getByLabel('Amount').fill('2000');
    await payments.getByRole('button', { name: 'Save payment' }).click();
    await expect(payments.getByRole('button', { name: /^Void payment of/ })).toBeVisible();
    await payments.getByRole('button', { name: /^Void payment of/ }).click();
    await payments.getByLabel('Reason for voiding this payment').fill('Recorded against the wrong client.');
    await payments.getByRole('button', { name: 'Void payment', exact: true }).click();
    const sale = () => setup.admin.get('/api/services/sales-records/').then((body) => list(body).find((entry) => Number(entry.ticket) === Number(ticket.id) && entry.status !== 'voided'));
    await expect.poll(async () => (await sale())?.payment_status).toBe('unpaid');

    // Void the confirmed record and prepare a replacement from the same ticket.
    const original = await sale();
    await adminPage.getByRole('button', { name: 'Void and replace' }).click();
    await adminPage.getByLabel('Reason for voiding').fill('Contract value corrected after review.');
    await adminPage.getByRole('button', { name: 'Confirm void' }).click();
    await expect(adminPage.getByText(/Sales record voided/)).toBeVisible();
    await adminPage.locator('select').filter({ has: adminPage.locator('option', { hasText: 'Select a completed ticket' }) })
      .selectOption({ value: String(ticket.id) });
    await adminPage.getByRole('button', { name: 'Prepare record' }).click();
    await expect.poll(async () => (await sale())?.id).not.toBe(original.id);
    expect((await sale()).status).toBe('draft');
    await adminContext.close();
  });

  test('11.6 - Technician puts a job on hold with a reason, the client sees it, and the job resumes', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Hold ${stamp}`);
    await setup.grantSkills([service.id]);
    const requestObj = await setup.createRequest(service.id, `E2E hold journey ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    await setup.assign(ticket.id, 'service');
    await setup.startWork(ticket.id);

    const { context: techContext, page: techPage } = await openPage(browser, techAuth, { geolocation: true });
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    const job = techPage.getByLabel(service.name, { exact: true });
    await job.getByRole('button', { name: 'Put on Hold' }).click();
    // A hold needs a reason.
    await job.getByRole('button', { name: 'Confirm Hold' }).click();
    expect(await setup.status(ticket.id)).toBe('In Progress');
    await job.getByLabel('Why are you putting this job on hold?').fill('Client asked us to stop until the owner arrives.');
    await job.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect.poll(() => setup.status(ticket.id)).toBe('On Hold');

    const { context: clientContext, page: clientPage } = await openPage(browser, clientAuth);
    await clientPage.goto(`/client/requests/${requestObj.id}`);
    await expect(clientPage.getByText('On Hold').first()).toBeVisible();

    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    await techPage.getByLabel(service.name, { exact: true }).getByRole('button', { name: 'Resume Job' }).click();
    await expect.poll(() => setup.status(ticket.id)).toBe('In Progress');
    await Promise.all([techContext.close(), clientContext.close()]);
  });

  test('11.7 - Client rates the finished job from the request page', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Rating ${stamp}`);
    await setup.grantSkills([service.id]);
    const requestObj = await setup.createRequest(service.id, `E2E rating journey ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    await setup.assign(ticket.id, 'service');
    await setup.startWork(ticket.id);
    await setup.finishWork(ticket.id);
    await expect.poll(() => setup.status(ticket.id)).toBe('Completed');

    const { context: clientContext, page: clientPage } = await openPage(browser, clientAuth);
    await clientPage.goto(`/client/requests/${requestObj.id}`);
    await clientPage.getByRole('button', { name: 'Leave Feedback' }).click();
    await expect(clientPage.getByRole('button', { name: 'Submit Rating' })).toBeDisabled();
    await clientPage.getByRole('button', { name: 'Rate 4 out of 5' }).click();
    await expect(clientPage.getByRole('button', { name: 'Rate 4 out of 5' })).toHaveAttribute('aria-pressed', 'true');
    await clientPage.getByPlaceholder('Share your experience...').fill('Neat work and on time.');
    await clientPage.getByRole('button', { name: 'Submit Rating' }).click();
    await expect(clientPage.getByText('Thank you. Your rating was submitted.')).toBeVisible();
    await expect.poll(async () => (await setup.admin.get(`/api/services/service-tickets/${ticket.id}/`)).client_rating).toBe(4);
    await expect(clientPage.getByRole('button', { name: 'Edit Rating' })).toBeVisible();
    await clientContext.close();
  });

  test('11.8 - Office adds a crew member on the Dispatch Board; the crew member sees the job but not lead-only controls', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Crew ${stamp}`);
    const crewUsername = `crew_${stamp}`;
    const crew = await setup.admin.post('/api/admin/technicians/', {
      username: crewUsername,
      email: `${crewUsername}@afntest.com`,
      password: 'TestPass123!',
      password_confirm: 'TestPass123!',
      first_name: 'Crew',
      last_name: `Mate${stamp}`,
      phone: '09171234567',
      role: 'technician',
      status: 'active',
      is_available: true,
    }, { expected: 201 });
    await setup.grantSkills([service.id]);
    await setup.admin.put(`/api/admin/technicians/${crew.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const requestObj = await setup.createRequest(service.id, `E2E crew journey ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    const ticketCode = `TKT-${String(ticket.id).padStart(4, '0')}`;
    await setup.pauseLeftoverFieldWork();

    const { context: adminContext, page: adminPage } = await openPage(browser, adminAuth);
    await adminPage.goto('/admin/dispatch-board');
    await adminPage.getByRole('button', { name: new RegExp(ticketCode) }).first().click();
    await adminPage.getByRole('button', { name: 'Set lead Test Technician' }).click();
    await adminPage.getByRole('button', { name: `Add crew Crew Mate${stamp}` }).click();
    await expect(adminPage.getByRole('button', { name: `Selected crew Crew Mate${stamp}` })).toBeVisible();
    await adminPage.getByRole('button', { name: 'Confirm Assignment' }).click();
    await expect.poll(async () => (await setup.admin.get(`/api/services/service-tickets/${ticket.id}/`)).technician).toBeTruthy();

    // The lead starts the work; the crew member sees the job without the lead-only hold control.
    await setup.startWork(ticket.id);
    const crewAuth = loadAuthStateFromBackend(crewUsername);
    const { context: crewContext, page: crewPage } = await openPage(browser, crewAuth, { geolocation: true });
    await crewPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    const crewJob = crewPage.getByLabel(service.name, { exact: true });
    await expect(crewJob).toBeVisible();
    await expect(crewJob.getByRole('button', { name: 'Put on Hold' })).toHaveCount(0);
    const crewView = await apiAs(request, crewAuth).get(`/api/technician/jobs/${ticket.id}/`);
    expect(JSON.stringify(crewView)).toContain('crew');
    await Promise.all([adminContext.close(), crewContext.close()]);
  });

  test('11.5 - Client reschedule request handled by the office, client cancel, and office rejection', async ({ browser, request }) => {
    const setup = setupHelpers(request);
    const stamp = Date.now();
    const service = await setup.createService(`E2E Scheduling ${stamp}`);
    await setup.grantSkills([service.id]);

    // Reschedule: the client asks on their request page; the office applies a new date.
    const requestObj = await setup.createRequest(service.id, `E2E reschedule ${stamp}`);
    const ticket = await setup.approve(requestObj.id);
    await setup.assign(ticket.id, 'service', day(3));
    const { context: clientContext, page: clientPage } = await openPage(browser, clientAuth);
    await clientPage.goto(`/client/requests/${requestObj.id}`);
    await clientPage.getByRole('button', { name: 'Request Reschedule' }).click();
    const scheduleSection = clientPage.locator('div').filter({ has: clientPage.getByRole('heading', { name: 'Schedule Changes' }) }).last();
    await scheduleSection.locator('input[type="date"]').fill(day(6));
    await scheduleSection.locator('select').selectOption({ index: 1 });
    await clientPage.getByPlaceholder('Tell the team why you need another appointment window.').fill('Family event on the original date.');
    await scheduleSection.getByRole('button', { name: /Submit|Request|Send/ }).first().click();
    await expect.poll(async () => (await setup.admin.get(`/api/services/service-tickets/${ticket.id}/`)).reschedule_requested).toBe(true);

    const { context: adminContext, page: adminPage } = await openPage(browser, adminAuth);
    await adminPage.goto(`/admin/service-tickets?ticketId=${ticket.id}`);
    await adminPage.getByRole('button', { name: /Reschedule Ticket/ }).click();
    await adminPage.locator('input[type="date"]').last().fill(day(6));
    await adminPage.getByPlaceholder('Explain why the schedule is changing for the audit record.').fill('Moved to the client\'s requested date.');
    await adminPage.getByRole('button', { name: 'Save Schedule' }).click();
    await expect.poll(async () => {
      const updated = await setup.admin.get(`/api/services/service-tickets/${ticket.id}/`);
      return [updated.scheduled_date, updated.reschedule_requested];
    }).toEqual([day(6), false]);

    // Client cancels a pending request from Request Tracking with a reason.
    const toCancel = await setup.createRequest(service.id, `E2E client cancel ${stamp}`);
    await clientPage.goto('/client/requests');
    await clientPage.getByRole('button', { name: `Cancel request ${toCancel.id}` }).locator('visible=true').first().click();
    await clientPage.getByRole('dialog').getByRole('textbox').fill('Found another schedule; will request again later.');
    await clientPage.getByRole('button', { name: 'Cancel request', exact: true }).click();
    await expect.poll(async () => (await setup.client.get(`/api/services/service-requests/${toCancel.id}/`)).status).toBe('Cancelled');

    // Office rejects a pending request from the dashboard; the client sees it as rejected.
    const toReject = await setup.createRequest(service.id, `E2E office reject ${stamp}`);
    await adminPage.goto('/admin/dashboard');
    const detailsButtons = adminPage.getByRole('button', { name: 'View Details' });
    await expect(detailsButtons.first()).toBeVisible();
    let opened = false;
    for (let index = 0; index < await detailsButtons.count(); index += 1) {
      await detailsButtons.nth(index).click();
      if (await adminPage.getByText(`E2E office reject ${stamp}`).waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) {
        opened = true;
        break;
      }
      await adminPage.keyboard.press('Escape');
    }
    expect(opened).toBe(true);
    const details = adminPage.getByRole('dialog', { name: 'Service Request Details' });
    await details.getByRole('button', { name: 'Reject Request' }).click();
    await adminPage.getByLabel('Reason for rejection').fill('We do not service this area yet; please contact us for referrals.');
    await adminPage.getByRole('button', { name: 'Reject request', exact: true }).click();
    // A rejection closes the request (status Cancelled) with a "rejected" closure the client can see.
    await expect.poll(async () => (await setup.client.get(`/api/services/service-requests/${toReject.id}/`)).status).toBe('Cancelled');
    expect(JSON.stringify((await setup.client.get(`/api/services/service-requests/${toReject.id}/`)).closure || {})).toMatch(/rejected/i);
    await clientPage.goto(`/client/requests/${toReject.id}`);
    await expect(clientPage.getByText(/Not accepted by our office: We do not service this area yet/)).toBeVisible();

    await Promise.all([clientContext.close(), adminContext.close()]);
  });
});
