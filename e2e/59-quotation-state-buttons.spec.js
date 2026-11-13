// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Quotation buttons follow the quotation and job state (server rules:
// backend/services/tests/test_quotation_and_deposit_rules.py):
// - office, after an inspection: "Client accepted offline" on a sent quotation records the acceptance
//   (not as the client's own answer) and opens the deposit panel;
// - client, after the job was cancelled: the sent quotation shows that no answer is needed and offers
//   no Accept or Decline; the server refuses an answer (409).

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };

test.describe('Quotation state buttons', () => {
  test.describe.configure({ timeout: 420000 });

  test('59 - quotation buttons follow the quotation and job state', async ({ browser, request }) => {
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
      name: `E2E Quote States ${stamp}`, description: 'Quote check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: true,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'percentage', deposit_value: 50,
    });
    const techName = `qstech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Quote', last_name: `Tech${stamp}`, phone: '09171234573', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const clientName = `qsclient${stamp}`.toLowerCase();
    const clientUser = await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Quote', last_name: `Client${stamp}`, phone: '09171234574', role: 'client',
    });
    const clientId = clientUser.id ?? clientUser.user?.id;
    const clientAuth = loadAuthStateFromBackend(clientName);
    let nextDay = 260;
    const book = async () => {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: 'Quote check', priority: 'Normal',
            location_address: 'Quote Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
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
    const sendQuotation = (ticketId, number) => call('post', '/api/services/quotations/', superAuth, {
      ticket: ticketId, client: clientId, quotation_number: number, total_amount: 'PHP 20,000.00', status: 'Sent', validity_days: 30,
      bill_of_materials: [{ description: 'Inverter', qty: '1', unit: 'unit', amount: '20,000.00' }],
    });

    // Job A: inspected, quotation sent; the office records an offline acceptance.
    const inspected = await book();
    const inspectedTicket = await approve(inspected);
    await call('post', `/api/services/service-tickets/${inspectedTicket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'inspection', scheduled_date: inspected.visitDate });
    await call('post', `/api/technician/jobs/${inspectedTicket.id}/start-navigation/`, techAuth);
    await call('post', `/api/technician/jobs/${inspectedTicket.id}/arrive/`, techAuth, SITE);
    await call('post', `/api/technician/jobs/${inspectedTicket.id}/status/`, techAuth, { status: 'in_progress' });
    const report = await call('post', '/api/services/inspections/', techAuth, {
      ticket: inspectedTicket.id, site_accessible: true, electrical_adequate: true, safety_equipment_present: true,
      recommendation: 'Approved', checklist_items: [], additional_notes: 'Site is fine.',
    });
    await call('post', `/api/services/inspections/${report.id}/complete/`, techAuth);
    const quoteA = await sendQuotation(inspectedTicket.id, `QUO-QA${stamp}`);

    // Job B: quotation sent, then the office cancels the request.
    const cancelled = await book();
    const cancelledTicket = await approve(cancelled);
    const quoteB = await sendQuotation(cancelledTicket.id, `QUO-QB${stamp}`);
    await call('post', `/api/services/service-requests/${cancelled.id}/cancel/`, superAuth, { reason: 'Client called to cancel.' });

    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      // ── Office: "Client accepted offline" ──
      const office = await laptop.newPage();
      await seedAuthState(office, superAuth);
      await office.goto(`/admin/service-tickets?ticketId=${inspectedTicket.id}`);
      await office.getByRole('button', { name: /Review Inspection/ }).click();
      await expect(office.getByText(`${quoteA.quotation_number} is waiting for the client's decision.`)).toBeVisible({ timeout: 30000 });
      await office.getByRole('button', { name: 'Client accepted offline' }).click();
      await expect(office.getByText(new RegExp(`${quoteA.quotation_number} accepted\\. The required deposit must still be recorded`))).toBeVisible({ timeout: 30000 });
      await expect(office.getByRole('button', { name: 'Client accepted offline' })).toHaveCount(0);
      await expect(office.getByRole('region', { name: 'Pre-service deposit' })).toBeVisible();
      const recorded = await call('get', `/api/services/quotations/${quoteA.id}/`, superAuth);
      expect([recorded.status, recorded.client_responded_at]).toEqual(['Accepted', null]);
      await office.screenshot({ path: 'test-results/screenshots/59-offline-acceptance-laptop.png' });

      // ── Client: the cancelled job's quotation needs no answer ──
      const clientPage = await phone.newPage();
      await seedAuthState(clientPage, clientAuth);
      await clientPage.goto(`/client/requests/${cancelled.id}?entity=request`);
      await expect(clientPage.getByRole('heading', { name: `Quotation ${quoteB.quotation_number}` })).toBeVisible({ timeout: 30000 });
      await expect(clientPage.getByText('This job was cancelled, so this quotation no longer needs an answer.')).toBeVisible();
      await expect(clientPage.getByRole('button', { name: 'Accept quotation' })).toHaveCount(0);
      await expect(clientPage.getByRole('button', { name: 'Decline' })).toHaveCount(0);
      const refused = await request.post(`/api/services/quotations/${quoteB.id}/respond/`, { headers: as(clientAuth), data: { decision: 'accept' } });
      expect(refused.status()).toBe(409);
      expect(await clientPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    } finally {
      await laptop.close();
      await phone.close();
    }
  });
});
