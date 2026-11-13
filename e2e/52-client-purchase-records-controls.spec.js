// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// /client/purchase-records with its own client and two finished jobs, each confirmed by the office
// with a manual value:
// - only confirmed records, payment totals but not the office's payment entries, and the server refuses client changes and the payments list;
// - another client sees none of them;
// - the "Purchase record available" notification opens Purchase Records at that ticket's record;
// - client wording (no own name, REQ code, "View service request", warranty label);
// - search by REQ code, phone list of delivered items, 44 px targets, no sideways scroll;
// - a laptop screenshot.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const reqCode = (id) => `REQ-${String(id).padStart(4, '0')}`;

test.describe('Client purchase records controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('52 - every Purchase Records control works', async ({ browser, request }) => {
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
    const makeService = async (label) => call('post', '/api/admin/services/', superAuth, {
      name: `E2E Purchase ${label} ${stamp}`, description: 'Purchase check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const firstService = await makeService('Panels');
    const secondService = await makeService('Battery');
    const techName = `prtech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Purch', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, {
      skills: [firstService, secondService].map((service) => ({ service_type: service.id, skill_level: 'expert' })),
    });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const makeClient = async (suffix, phone) => {
      const name = `prclient${suffix}${stamp}`.toLowerCase();
      await call('post', '/api/admin/users/', superAuth, {
        username: name, email: `${name}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Purch', last_name: `Client${stamp}`, phone, role: 'client',
      });
      return loadAuthStateFromBackend(name);
    };
    const clientAuth = await makeClient('a', '09171234581');
    const otherAuth = await makeClient('b', '09171234582');

    let nextDay = 140;
    const confirmedSale = async (service, value) => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: `Purchase ${service.name}`, priority: 'Normal',
            location_address: 'Purchase Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
      }
      await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
      const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await call('post', `/api/technician/jobs/${ticket.id}/start-navigation/`, techAuth);
      await call('post', `/api/technician/jobs/${ticket.id}/arrive/`, techAuth, SITE);
      await call('post', `/api/technician/jobs/${ticket.id}/status/`, techAuth, { status: 'in_progress' });
      await call('post', '/api/checklist/', techAuth, {
        jobId: ticket.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
        notes: 'Done.', maintenance_required: false,
      });
      await call('post', `/api/services/service-tickets/${ticket.id}/complete_work/`, techAuth, {
        completion_notes: 'Finished and tested.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
      }, true);
      const draft = await call('post', '/api/services/sales-records/prepare/', superAuth, { ticket_id: ticket.id });
      await call('patch', `/api/services/sales-records/${draft.id}/`, superAuth, { agreed_total: value, notes: 'Fixed price agreed on site.' });
      const record = await call('post', `/api/services/sales-records/${draft.id}/confirm/`, superAuth);
      return { requestId: created.id, ticketId: ticket.id, record };
    };
    const first = await confirmedSale(firstService, '15000');
    const second = await confirmedSale(secondService, '8000');
    // The office records a payment; none of it reaches the client.
    await call('post', `/api/services/sales-records/${first.record.id}/payments/`, superAuth, {
      amount: '5000.00', paid_on: localKey(new Date(Date.now() - 86400000)), method: 'cash', reference: 'OR-SECRET', notes: 'Office-only note',
    });

    // ── Server rules for the client ──
    const clientRows = list(await call('get', '/api/services/sales-records/', clientAuth));
    expect(clientRows.map((row) => row.id).sort()).toEqual([first.record.id, second.record.id].sort());
    for (const row of clientRows) {
      expect(row).not.toHaveProperty('payments');
      expect(['partial', 'unpaid']).toContain(row.payment_status);
      expect(row.request_id).toBeTruthy();
    }
    const refused = [
      ['get', `/api/services/sales-records/${first.record.id}/payments/`],
      ['post', '/api/services/sales-records/prepare/'],
      ['patch', `/api/services/sales-records/${first.record.id}/`],
      ['post', `/api/services/sales-records/${first.record.id}/confirm/`],
      ['post', `/api/services/sales-records/${first.record.id}/void/`],
    ];
    for (const [method, path] of refused) {
      const response = await request[method](path, { headers: as(clientAuth), data: method === 'get' ? undefined : { ticket_id: first.ticketId, reason: 'x' } });
      expect(response.status(), `${method} ${path}`).toBe(403);
      expect(await response.text()).not.toContain('OR-SECRET');
    }
    expect(list(await call('get', '/api/services/sales-records/', otherAuth))).toEqual([]);

    // ── Laptop screenshot ──
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const laptopPage = await laptop.newPage();
    await seedAuthState(laptopPage, clientAuth);
    await laptopPage.goto('/client/purchase-records');
    await expect(laptopPage.getByRole('region', { name: 'Purchase record details' })).toContainText('SAL-', { timeout: 30000 });
    await laptopPage.screenshot({ path: 'test-results/screenshots/52-client-purchase-records-laptop.png' });
    await laptop.close();

    // ── Phone ──
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);

    // The notification for the first record opens Purchase Records at that record, not at the newest one.
    await page.goto('/client/notifications');
    const notification = page.locator('div.rounded-lg:not([role])', { hasText: first.record.record_number }).first();
    await expect(notification).toBeVisible({ timeout: 30000 });
    await notification.getByRole('button', { name: 'Open purchase record' }).click();
    await expect(page).toHaveURL(new RegExp(`/client/purchase-records\\?ticketId=${first.ticketId}$`));
    const details = page.getByRole('region', { name: 'Purchase record details' });
    await expect(details.getByRole('heading', { name: first.record.record_number })).toBeVisible({ timeout: 30000 });

    // Client wording: REQ code, service only, value source, warranty, no payment or office data.
    await expect(details).toContainText(reqCode(first.requestId));
    await expect(details).toContainText(firstService.name);
    await expect(details).not.toContainText('Purch Client');
    await expect(details).toContainText('Agreed with the office');
    await expect(details).toContainText('Warranty: Not recorded');
    await expect(details).not.toContainText('Inventory issues');
    await expect(page.getByText('OR-SECRET')).toHaveCount(0);
    await expect(page.getByText('Office-only note')).toHaveCount(0);

    // Payment: what is paid and still due, without the office's payment entries.
    const payment = details.getByRole('region', { name: 'Payment' });
    await expect(payment).toContainText('Partly paid');
    await expect(payment).toContainText('Paid so far₱5,000.00');
    await expect(payment).toContainText('Still due₱10,000.00');
    await expect(page.getByText('Payments received')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Sales summary' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Prepare record' })).toHaveCount(0);

    // Delivered items are a list on a phone (the wide table is hidden).
    const items = details.getByRole('list', { name: 'Delivered items' });
    await expect(items).toBeVisible();
    await expect(items).toContainText(firstService.name);

    // Search by REQ code; tapping a record shows its details.
    const search = page.getByRole('textbox', { name: 'Search purchase records' });
    expect((await search.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await search.fill(reqCode(second.requestId));
    const listPanel = page.getByRole('region', { name: 'Purchase record list' });
    await expect(listPanel.getByRole('button')).toHaveCount(1);
    await listPanel.getByRole('button', { name: new RegExp(second.record.record_number) }).click();
    await expect(details.getByRole('heading', { name: second.record.record_number })).toBeVisible();
    await expect(details).toBeInViewport();
    await expect(payment).toContainText('Unpaid');
    await expect(payment).toContainText('Still due₱8,000.00');
    await search.fill('');
    // Clearing the search keeps the record that was tapped.
    await expect(details.getByRole('heading', { name: second.record.record_number })).toBeVisible();

    // "View service request" opens the request.
    const viewRequest = details.getByRole('link', { name: 'View service request' });
    expect((await viewRequest.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const refresh = page.getByRole('button', { name: 'Refresh' });
    expect((await refresh.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await viewRequest.click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${second.requestId}\\?entity=request$`));

    // Paid in full: the box says so, and the "Payment complete" notification opens this record.
    // The office records the rest on the admin Sales Records page, as staff would.
    const adminContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const adminPage = await adminContext.newPage();
    await seedAuthState(adminPage, superAuth);
    await adminPage.goto('/admin/sales-records');
    await adminPage.getByRole('textbox', { name: 'Search sales records' }).fill(second.record.record_number);
    const adminDetails = adminPage.getByRole('region', { name: 'Sales record details' });
    await expect(adminDetails.getByRole('heading', { name: second.record.record_number })).toBeVisible({ timeout: 30000 });
    await adminDetails.getByRole('button', { name: 'Record payment' }).click();
    await adminDetails.getByLabel('Amount').fill('8000');
    await adminDetails.getByRole('button', { name: 'Save payment' }).click();
    await expect(adminPage.getByRole('status')).toContainText(`recorded for ${second.record.record_number}`);
    await adminContext.close();
    await page.goto('/client/notifications');
    const paidNotice = page.locator('div.rounded-lg:not([role])', { hasText: `${second.record.record_number} is fully paid` }).first();
    await expect(paidNotice).toBeVisible({ timeout: 30000 });
    await paidNotice.getByRole('button', { name: 'Open purchase record' }).click();
    await expect(page).toHaveURL(new RegExp(`/client/purchase-records\\?ticketId=${second.ticketId}$`));
    await expect(details.getByRole('heading', { name: second.record.record_number })).toBeVisible({ timeout: 30000 });
    await expect(payment).toContainText('Paid');
    await expect(payment).toContainText('Nothing, paid in full');

    // Another client has none.
    await context.close();
    const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const otherPage = await otherContext.newPage();
    await seedAuthState(otherPage, otherAuth);
    await otherPage.goto('/client/purchase-records');
    await expect(otherPage.getByText('No purchase records yet.')).toBeVisible({ timeout: 30000 });
    await otherContext.close();
  });
});
