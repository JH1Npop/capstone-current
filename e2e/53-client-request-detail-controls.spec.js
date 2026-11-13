// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Moves a sent quotation's "sent" moment into the past, as if the office sent it `days` ago.
const backdateQuotation = (quotationId, days) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  const script = [
    'from datetime import timedelta',
    'from django.utils import timezone',
    'from services.models import QuotationRecord',
    `QuotationRecord.objects.filter(pk=${Number(quotationId)}).update(updated_at=timezone.now() - timedelta(days=${Number(days)}))`,
  ].join('; ');
  execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

// /client/requests/:id with its own client and technician, in four states:
// - waiting for review: the review message, no "Normal" chip, and Dismiss with a required reason;
// - scheduled: the visit date has no made-up time, a quotation accepted on the page keeps its
//   message (no reload flash), an expired quotation cannot be accepted until the office resends it,
//   and a reschedule request shows what was asked for;
// - finished: proof preview is a named dialog (Escape and backdrop close), the rating saves,
//   "Edit Rating" really opens the form and saves the new rating, and Cancel keeps the saved one;
//   the confirmed purchase record is linked;
// - 44 px controls and no sideways scroll on a phone, plus a laptop screenshot.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const reqCode = (id) => `REQ-${String(id).padStart(4, '0')}`;

test.describe('Client request detail controls', () => {
  test.describe.configure({ timeout: 420000 });

  test('53 - every Request Detail control works', async ({ browser, request }) => {
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
      name: `E2E Detail ${stamp}`, description: 'Detail check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const techName = `rdtech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Detail', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const clientName = `rdclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Detail', last_name: `Client${stamp}`, phone: '09171234591', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);

    let nextDay = 160;
    const book = async (label) => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: `Detail ${label}`, priority: 'Normal',
            location_address: 'Detail Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) return { ...(await response.json()), visitDate };
      }
      throw new Error('Could not book a request');
    };
    const approveAndAssign = async (created) => {
      await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
      const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: created.visitDate });
      return ticket;
    };

    const waiting = await book('waiting');
    const scheduled = await book('scheduled');
    const scheduledTicket = await approveAndAssign(scheduled);
    const finished = await book('finished');
    const finishedTicket = await approveAndAssign(finished);
    await call('post', `/api/technician/jobs/${finishedTicket.id}/start-navigation/`, techAuth);
    await call('post', `/api/technician/jobs/${finishedTicket.id}/arrive/`, techAuth, SITE);
    await call('post', `/api/technician/jobs/${finishedTicket.id}/status/`, techAuth, { status: 'in_progress' });
    await call('post', '/api/checklist/', techAuth, {
      jobId: finishedTicket.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
      notes: 'Done.', maintenance_required: false,
    });
    await call('post', `/api/services/service-tickets/${finishedTicket.id}/complete_work/`, techAuth, {
      completion_notes: 'Finished and tested.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
    }, true);
    const draft = await call('post', '/api/services/sales-records/prepare/', superAuth, { ticket_id: finishedTicket.id });
    await call('patch', `/api/services/sales-records/${draft.id}/`, superAuth, { agreed_total: '9000', notes: 'Fixed price.' });
    const sale = await call('post', `/api/services/sales-records/${draft.id}/confirm/`, superAuth);
    // A quotation the office sends for the scheduled job.
    const sendQuotation = () => call('post', '/api/services/quotations/', superAuth, {
      ticket: scheduledTicket.id, client: scheduled.client || undefined, quotation_number: `QUO-E2E-${stamp}`,
      total_amount: 'PHP 12,500.00', status: 'Sent', validity_days: 30,
      bill_of_materials: [{ description: 'Panel cleaning kit', qty: '1', unit: 'set', amount: '12,500.00' }],
    });
    const quotation = await sendQuotation();

    // ── Laptop screenshot (finished job) ──
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const laptopPage = await laptop.newPage();
    await seedAuthState(laptopPage, clientAuth);
    await laptopPage.goto(`/client/requests/${finished.id}?entity=request`);
    await expect(laptopPage.getByRole('heading', { name: 'Rate This Service' })).toBeVisible({ timeout: 30000 });
    await laptopPage.screenshot({ path: 'test-results/screenshots/53-client-request-detail-laptop.png', fullPage: true });
    await laptop.close();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);
    const noSidewaysScroll = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    };

    // ── Waiting for review: message, no "Normal" chip, Dismiss needs a reason ──
    await page.goto(`/client/requests/${waiting.id}?entity=request`);
    await expect(page.getByRole('heading', { name: `Service Request ${reqCode(waiting.id)}` })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Our office is reviewing this request.')).toBeVisible();
    await expect(page.getByText('NORMAL PRIORITY')).toHaveCount(0);
    const back = page.getByRole('button', { name: 'Back to My Requests' });
    expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await noSidewaysScroll();
    await page.getByRole('button', { name: 'Dismiss request' }).click();
    const dismissDialog = page.getByRole('dialog', { name: 'Dismiss service request?' });
    await dismissDialog.getByRole('button', { name: 'Dismiss request' }).click();
    await expect(dismissDialog.getByRole('alert')).toContainText('Please give a short reason');
    await dismissDialog.getByRole('textbox').fill('Booked twice by mistake.');
    await dismissDialog.getByRole('button', { name: 'Dismiss request' }).click();
    await expect(page.getByRole('status')).toContainText(`${reqCode(waiting.id)} was dismissed`);
    await expect(page.getByRole('button', { name: 'Dismiss request' })).toHaveCount(0);
    expect((await call('get', `/api/services/service-requests/${waiting.id}/`, clientAuth)).status).toBe('Cancelled');

    // ── Scheduled: date without a time; accepting the quotation keeps its message ──
    await page.goto(`/client/requests/${scheduled.id}?entity=request`);
    const [y, m, d] = scheduled.visitDate.split('-').map(Number);
    const visitLabel = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
    await expect(page.getByText(visitLabel).first()).toBeVisible({ timeout: 30000 });
    // Sent 40 days ago with 30 days' validity: expired, so it cannot be accepted (only declined).
    backdateQuotation(quotation.id, 40);
    await page.reload();
    const quotationPanel = page.getByRole('region', { name: /^Quotation / });
    await expect(quotationPanel).toContainText('Expired', { timeout: 30000 });
    await expect(quotationPanel).toContainText('Ask our office for an updated quotation');
    await expect(quotationPanel.getByRole('button', { name: 'Accept quotation' })).toHaveCount(0);
    await expect(quotationPanel.getByRole('button', { name: 'Decline' })).toBeVisible();
    const refused = await request.post(`/api/services/quotations/${quotation.id}/respond/`, { headers: as(clientAuth), data: { decision: 'accept' } });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toContain('expired on');

    // The office sends an updated quotation: a fresh period, and the client can accept it.
    await sendQuotation();
    await page.reload();
    await expect(quotationPanel).toContainText('Valid until', { timeout: 30000 });
    await page.getByRole('button', { name: 'Accept quotation' }).click();
    await expect(page.getByText('Thank you. We can now schedule your service.')).toBeVisible();
    await expect(page.getByRole('heading', { name: `Service Request ${reqCode(scheduled.id)}` })).toBeVisible();
    // Still there after the background reload finished.
    await page.waitForTimeout(1500);
    await expect(page.getByText('Thank you. We can now schedule your service.')).toBeVisible();

    // Reschedule: the request shows the date and window that were asked for.
    const later = localKey(new Date(Date.now() + 200 * 86400000));
    await page.getByRole('button', { name: 'Request Reschedule' }).click();
    await page.getByLabel('New Date').fill(later);
    await page.getByLabel('Time Window').selectOption('morning');
    await expect(page.getByLabel('Reason')).toHaveValue('');
    // A missing reason is reported inside the form, where the client is looking.
    await page.getByRole('button', { name: 'Send Request' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Please choose a date, time window, and reason' })).toBeInViewport();
    await page.getByLabel('Reason').fill('Away for a family event.');
    await page.getByRole('button', { name: 'Send Request' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Schedule change request sent.' })).toBeVisible();
    await expect(page.getByText('Your schedule change request is waiting for the office.')).toBeVisible();
    await expect(page.getByText(/^Requested: .*Morning/)).toBeVisible();
    await noSidewaysScroll();

    // ── Finished: proof preview, rating, Edit Rating, purchase record link ──
    await page.goto(`/client/requests/${finished.id}?entity=request`);
    await expect(page.getByRole('heading', { name: 'Rate This Service' })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Preview proof file 1' }).click();
    const preview = page.getByRole('dialog', { name: 'Proof preview' });
    await expect(preview).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview proof file 1' }).click();
    await page.mouse.click(5, 5);
    await expect(preview).toHaveCount(0);

    await page.getByRole('button', { name: 'Leave Feedback' }).click();
    const star = (n) => page.getByRole('button', { name: `Rate ${n} out of 5` });
    expect((await star(4).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await star(4).click();
    await page.getByLabel('Additional Feedback (Optional)').fill('Good work.');
    await page.getByRole('button', { name: 'Submit Rating' }).click();
    await expect(page.getByText('Thank you. Your rating was submitted.')).toBeVisible();
    await expect(page.getByText('Rating submitted')).toBeVisible();

    // Edit Rating opens the form with the saved rating; Cancel keeps it; saving changes it.
    await page.getByRole('button', { name: 'Edit Rating' }).click();
    await expect(star(4)).toHaveAttribute('aria-pressed', 'true');
    await star(2).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Rating submitted')).toBeVisible();
    await page.getByRole('button', { name: 'Edit Rating' }).click();
    await expect(star(4)).toHaveAttribute('aria-pressed', 'true');
    await star(5).click();
    await page.getByRole('button', { name: 'Save Rating' }).click();
    await expect(page.getByText('Your rating was updated.')).toBeVisible();
    await expect.poll(async () => (await call('get', `/api/services/service-tickets/${finishedTicket.id}/`, clientAuth)).client_rating).toBe(5);

    const purchase = page.getByRole('link', { name: `View purchase record ${sale.record_number}` });
    await expect(purchase).toBeVisible();
    expect((await purchase.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole('button', { name: 'Dismiss request' })).toHaveCount(0);
    await noSidewaysScroll();
    await purchase.click();
    await expect(page).toHaveURL(new RegExp(`/client/purchase-records\\?ticketId=${finishedTicket.id}$`));
    await expect(page.getByRole('region', { name: 'Purchase record details' }).getByRole('heading', { name: sale.record_number })).toBeVisible({ timeout: 30000 });
    await context.close();
  });
});
