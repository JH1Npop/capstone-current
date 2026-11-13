// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// A job cancelled after a deposit was received: the office records whether the money was
// refunded or kept (server rules: DepositAfterCancellationTests in
// backend/services/tests/test_quotation_and_deposit_rules.py).
// - Office dismisses job A: the Dismiss dialog shows the deposit and needs Refunded or Kept with a
//   note; Refunded voids the payment; the client's request page says it was refunded.
// - The client cancels job B: the office gets "Deposit decision needed", opens the ticket from the
//   notice, chooses Kept in the deposit panel; the panel then shows the decision.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;

test.describe('Deposit after cancellation', () => {
  test.describe.configure({ timeout: 420000 });

  test('60 - the office records whether a deposit was refunded or kept', async ({ browser, request }) => {
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
      name: `E2E Deposit Cancel ${stamp}`, description: 'Deposit check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'percentage', deposit_value: 50,
    });
    const clientName = `dcclient${stamp}`.toLowerCase();
    const clientUser = await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Deposit', last_name: `Client${stamp}`, phone: '09171234575', role: 'client',
    });
    const clientId = clientUser.id ?? clientUser.user?.id;
    const clientAuth = loadAuthStateFromBackend(clientName);
    let nextDay = 280;
    const paidJob = async (label, amount) => {
      let created;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: `Deposit ${label}`, priority: 'Normal',
            location_address: 'Deposit Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
      }
      await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
      const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      const quotation = await call('post', '/api/services/quotations/', superAuth, {
        ticket: ticket.id, client: clientId, quotation_number: `QUO-D${label}${stamp}`, total_amount: 'PHP 10,000.00', status: 'Sent', validity_days: 30,
        bill_of_materials: [{ description: 'Panels', qty: '1', unit: 'lot', amount: '10,000.00' }],
      });
      await call('post', `/api/services/quotations/${quotation.id}/respond/`, clientAuth, { decision: 'accept' });
      await call('post', `/api/services/quotations/${quotation.id}/deposit-payments/`, superAuth, {
        amount: amount, paid_on: localKey(new Date()), method: 'gcash', reference: `GC-${label}`,
      });
      return { request: created, ticket, quotation };
    };
    const jobA = await paidJob('A', '2000');
    const jobB = await paidJob('B', '3000');

    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      // ── Job A: the office dismisses it and says the deposit was refunded ──
      const office = await laptop.newPage();
      await seedAuthState(office, superAuth);
      await office.goto(`/admin/service-tickets?ticketId=${jobA.ticket.id}`);
      await office.getByRole('dialog', { name: ticketCode(jobA.ticket.id) }).getByRole('button', { name: /Dismiss ticket/ }).click();
      const confirm = office.getByRole('dialog', { name: 'Dismiss service ticket?' });
      await expect(confirm.getByText(/Deposit received: ₱2,000\.00/)).toBeVisible({ timeout: 30000 });
      await confirm.getByPlaceholder(/Client confirmed by phone/).fill('Client confirmed by phone they no longer want it.');
      const dismiss = confirm.getByRole('button', { name: 'Dismiss ticket' });
      await expect(dismiss).toBeDisabled();
      await confirm.getByLabel('Refunded to the client').check();
      await confirm.getByLabel('Deposit note').fill('Refunded by GCash, reference 5521.');
      await dismiss.click();
      await expect(office.getByText(`${ticketCode(jobA.ticket.id)} dismissed because the client withdrew. Deposit recorded as refunded.`)).toBeVisible({ timeout: 30000 });
      const refunded = await call('get', `/api/services/quotations/${jobA.quotation.id}/`, superAuth);
      expect([refunded.deposit_paid_amount, refunded.deposit_outcome.outcome, refunded.deposit_payments[0].is_voided]).toEqual(['0.00', 'refunded', true]);

      const clientPage = await phone.newPage();
      await seedAuthState(clientPage, clientAuth);
      await clientPage.goto(`/client/requests/${jobA.request.id}?entity=request`);
      await expect(clientPage.getByText('Your deposit of ₱2,000.00 was refunded: Refunded by GCash, reference 5521.')).toBeVisible({ timeout: 30000 });

      // ── Job B: the client cancels; the office follows the notice and records Kept ──
      await call('post', `/api/services/service-requests/${jobB.request.id}/cancel/`, clientAuth, { reason: 'Moving house.' });
      await office.goto('/admin/notifications');
      const notice = office.locator('div.rounded-lg:not([role])', { hasText: `Deposit decision needed for ${ticketCode(jobB.ticket.id)}` }).first();
      await expect(notice).toBeVisible({ timeout: 30000 });
      await notice.getByRole('button', { name: 'Open ticket' }).click();
      await expect(office).toHaveURL(new RegExp(`/admin/service-tickets\\?ticketId=${jobB.ticket.id}`));
      const actions = office.getByRole('dialog', { name: ticketCode(jobB.ticket.id) });
      await expect(actions.getByText('This job was cancelled after ₱3,000.00 was received. What happened to the money?')).toBeVisible({ timeout: 30000 });
      await actions.getByLabel('Kept (for example a cancellation fee)').check();
      await actions.getByLabel('Note').fill('Kept as the cancellation fee in the signed quotation.');
      await actions.getByRole('button', { name: 'Save decision' }).click();
      await expect(actions.getByText('Kept deposit recorded. The client was notified.')).toBeVisible();
      await expect(actions.getByText(/Job cancelled\. Deposit of ₱3,000\.00 kept/)).toBeVisible();
      await expect(actions.getByRole('button', { name: 'Save decision' })).toHaveCount(0);
      await office.screenshot({ path: 'test-results/screenshots/60-deposit-kept-laptop.png' });
      const kept = await call('get', `/api/services/quotations/${jobB.quotation.id}/`, superAuth);
      expect([kept.deposit_paid_amount, kept.deposit_outcome.outcome]).toEqual(['3000.00', 'kept']);

      // ── Sales analytics shows the kept deposit as its own figure (the refund is not counted) ──
      await office.goto('/admin/analytics');
      await office.getByRole('tab', { name: 'Sales', exact: true }).click();
      const keptCard = office.locator('article').filter({ has: office.getByText('Kept deposits', { exact: true }) });
      await expect(keptCard).toContainText('₱3,000.00', { timeout: 30000 });
      await expect(keptCard).toContainText('1 cancelled job, kept in this period (not counted as sales)');
      await keptCard.scrollIntoViewIfNeeded();
      await office.screenshot({ path: 'test-results/screenshots/60-kept-deposits-analytics-laptop.png' });
    } finally {
      await laptop.close();
      await phone.close();
    }
  });
});
