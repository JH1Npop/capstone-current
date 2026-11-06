// @ts-check
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/sales-records, for admin and superadmin, on real completed jobs:
// prepare, manual value confirmed without a separate save (the typed value is what gets
// confirmed), the confirmation step, summary cards and filters, payments with notes, voiding a
// payment and the record, Prepare replacement, the unsaved-draft guard, CSV export, and the
// client's purchase view.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const SITE = { latitude: 14.2786, longitude: 121.125 };
const peso = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
let nextDay = 20;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data, { multipart = false } = {}) => {
    const options = { headers };
    if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return {
    get: (path) => call('get', path),
    post: (path, data, options) => call('post', path, data ?? {}, options),
    put: (path, data) => call('put', path, data),
  };
};

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Sales records controls as ${username}`, () => {
    test.describe.configure({ timeout: 420000 });

    test(`25 - ${username}: every Sales Records control works`, async ({ page, browser, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';

      // ── Two real completed jobs (no quotation, so the value is entered manually) ──
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Sale ${tag} ${stamp}`,
        description: 'Created by the sales records controls check.',
        estimated_duration: 60,
        estimated_cost: 5000,
        max_daily_assignments: 5,
        is_active: true,
        requires_site_inspection: false,
        procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
        inspection_procedures: [],
        deposit_policy: 'none',
        deposit_value: 0,
      });
      const techUsername = `sale${tag}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username: techUsername, email: `${techUsername}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Sale', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
      });
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
      await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
      const completeJob = async (label) => {
        const visitDate = dayKey(nextDay++);
        const created = await client.post('/api/services/service-requests/', {
          service_type: service.id, description: `E2E sale ${label} ${stamp}`, priority: 'Normal',
          location_address: 'Sale Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        });
        await admin.post(`/api/services/service-requests/${created.id}/approve/`);
        const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
          .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
        await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
        await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
        await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
        await techApi.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
        await techApi.post('/api/checklist/', {
          jobId: ticket.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
          notes: 'Done.', maintenance_required: false,
        });
        await techApi.post(`/api/services/service-tickets/${ticket.id}/complete_work/`, {
          completion_notes: 'Work finished.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
        }, { multipart: true });
        return `TKT-${String(ticket.id).padStart(4, '0')}`;
      };
      const firstTicket = await completeJob('one');
      const secondTicket = await completeJob('two');
      // The page loads every page of records, so the expected totals must too.
      const records = async () => {
        const found = [];
        for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
          const body = await admin.get(`/api/services/sales-records/?page_size=100&page=${pageNumber}`);
          found.push(...list(body));
          if (!body?.next) break;
        }
        return found;
      };
      const recordFor = async (ticketCode, status) => (await records()).find((r) => r.ticket_code === ticketCode && (!status || r.status === status));

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/sales-records');
      const ticketPicker = page.getByRole('combobox', { name: 'Completed ticket to prepare' });
      await expect(ticketPicker.locator('option', { hasText: firstTicket })).toHaveCount(1, { timeout: 30000 });
      const details = page.getByRole('region', { name: 'Sales record details' });
      const listPanel = page.getByRole('region', { name: 'Sales record list' });
      const status = page.getByRole('status');

      // ── Prepare a draft ──
      await ticketPicker.selectOption({ label: (await ticketPicker.locator('option', { hasText: firstTicket }).innerText()).trim() });
      await page.getByRole('button', { name: 'Prepare record' }).click();
      await expect(status).toContainText('draft prepared from connected data.');
      await expect(details).toContainText(firstTicket);
      const draft = await recordFor(firstTicket, 'draft');

      // ── Confirm without a separate save: the typed value is what gets confirmed ──
      await details.getByLabel('Recorded contract value (manual)').fill('25000');
      await details.getByLabel('Reason for manual value').fill('Agreed by phone; no quotation issued.');
      await expect(details.getByText('Unsaved changes')).toBeVisible();
      await details.getByRole('button', { name: 'Confirm record' }).click();
      const confirmDialog = page.getByRole('dialog', { name: `Confirm ${draft.record_number}?` });
      await expect(confirmDialog).toContainText(peso(25000));
      await expect(confirmDialog).toContainText('Your unsaved changes will be saved first.');
      await confirmDialog.getByRole('button', { name: 'Keep as draft' }).click();
      expect((await recordFor(firstTicket, 'draft'))?.status).toBe('draft');
      await details.getByRole('button', { name: 'Confirm record' }).click();
      await confirmDialog.getByRole('button', { name: 'Confirm record' }).click();
      await expect(status).toContainText(`${draft.record_number} confirmed and made available to the client.`);
      const confirmed = await recordFor(firstTicket, 'confirmed');
      expect(Number(confirmed.agreed_total)).toBe(25000);
      expect(confirmed.notes).toBe('Agreed by phone; no quotation issued.');

      // ── Summary cards include it ──
      const all = await records();
      const sumConfirmed = (key) => all.filter((r) => r.status === 'confirmed').reduce((t, r) => t + Number(r[key] || 0), 0);
      const summary = page.getByRole('region', { name: 'Sales summary' });
      await expect(summary.getByRole('button', { name: /^Confirmed sales value/ })).toContainText(peso(sumConfirmed('agreed_total')));

      // ── Record a payment with notes; balance and payment filters follow ──
      await details.getByRole('button', { name: 'Record payment' }).click();
      await details.getByLabel('Amount').fill('10000');
      await details.getByLabel('Notes (optional)').fill('First installment at the office.');
      await details.getByRole('button', { name: 'Save payment' }).click();
      await expect(status).toContainText(`Payment of ${peso(10000)} recorded for ${draft.record_number}.`);
      await expect(details.getByText('First installment at the office.')).toBeVisible();
      await expect(listPanel.getByRole('button', { name: new RegExp(draft.record_number) })).toContainText(`${peso(15000)} due`);
      const paymentFilter = page.getByRole('combobox', { name: 'Payment status' });
      await paymentFilter.selectOption('partial');
      await expect(listPanel.getByRole('button', { name: new RegExp(draft.record_number) })).toBeVisible();
      await paymentFilter.selectOption('paid');
      await expect(listPanel.getByRole('button', { name: new RegExp(draft.record_number) })).toHaveCount(0);
      await summary.getByRole('button', { name: /^Outstanding balance/ }).click();
      await expect(paymentFilter).toHaveValue('unpaid_or_partial');
      await expect(listPanel.getByRole('button', { name: new RegExp(draft.record_number) })).toBeVisible();

      // ── Void the payment, then the record; Prepare replacement ──
      await details.getByRole('button', { name: /^Void payment of/ }).click();
      await details.getByLabel('Reason for voiding this payment').fill('Recorded against the wrong sale.');
      await details.getByRole('button', { name: 'Void payment', exact: true }).click();
      await expect(status).toContainText(`Payment voided on ${draft.record_number}.`);
      expect(Number((await recordFor(firstTicket, 'confirmed')).amount_paid)).toBe(0);
      await details.getByRole('button', { name: 'Void and replace' }).click();
      await details.getByLabel('Reason for voiding').fill('Wrong contract value; replacing.');
      await details.getByRole('button', { name: 'Confirm void' }).click();
      await expect(status).toContainText(`${draft.record_number} voided.`);
      await page.getByRole('combobox', { name: 'Record status' }).selectOption('voided');
      await paymentFilter.selectOption('all');
      // The details panel follows the filtered list.
      await expect(details).toContainText(draft.record_number);
      await details.getByRole('button', { name: 'Prepare replacement' }).click();
      await expect(status).toContainText('draft prepared from connected data.');
      const replacement = await recordFor(firstTicket, 'draft');
      expect(replacement.record_number).not.toBe(draft.record_number);
      await expect(details).toContainText(replacement.record_number);

      // ── Unsaved draft edits ask before switching record ──
      await details.getByLabel('Reason for manual value').fill('Typed but not saved.');
      await listPanel.getByRole('button', { name: new RegExp(draft.record_number) }).click();
      const discard = page.getByRole('dialog', { name: 'Discard unsaved draft changes?' });
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await expect(details.getByLabel('Reason for manual value')).toHaveValue('Typed but not saved.');
      await details.getByRole('button', { name: 'Save draft' }).click();
      await expect(status).toContainText('Draft saved.');
      expect((await recordFor(firstTicket, 'draft')).notes).toBe('Typed but not saved.');

      // ── Search and CSV export of the shown records ──
      const search = page.getByRole('textbox', { name: 'Search sales records' });
      await search.fill(firstTicket);
      await expect(page.getByText(/^Showing 2 of \d+ records?$/)).toBeVisible();
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      const lines = fs.readFileSync(await (await downloadPromise).path(), 'utf8').trim().split('\n');
      expect(lines[0]).toContain('"Record","Status","Ticket","Client"');
      expect(lines).toHaveLength(3);
      expect(lines.slice(1).join('\n')).toContain(`"${draft.record_number}","voided"`);

      // ── The client sees confirmed purchases without payment details ──
      await search.fill('');
      await ticketPicker.selectOption({ label: (await ticketPicker.locator('option', { hasText: secondTicket }).innerText()).trim() });
      await page.getByRole('button', { name: 'Prepare record' }).click();
      await expect(status).toContainText('draft prepared');
      await details.getByLabel('Recorded contract value (manual)').fill('12000');
      await details.getByLabel('Reason for manual value').fill('Fixed price agreed on site.');
      await details.getByRole('button', { name: 'Confirm record' }).click();
      await page.getByRole('dialog', { name: /^Confirm SAL/ }).getByRole('button', { name: 'Confirm record' }).click();
      await expect(status).toContainText('confirmed and made available to the client.');
      const clientContext = await browser.newContext();
      const clientPage = await clientContext.newPage();
      await seedAuthState(clientPage, loadAuthStateFromBackend('client_test'));
      await clientPage.goto('/client/purchase-records');
      const second = await recordFor(secondTicket, 'confirmed');
      await clientPage.getByRole('textbox', { name: 'Search sales records' }).fill(second.record_number);
      await expect(clientPage.getByRole('region', { name: 'Sales record details' })).toContainText(peso(12000));
      await expect(clientPage.getByText('Payments received')).toHaveCount(0);
      await expect(clientPage.getByRole('region', { name: 'Sales summary' })).toHaveCount(0);
      await clientContext.close();
    });
  });
}
