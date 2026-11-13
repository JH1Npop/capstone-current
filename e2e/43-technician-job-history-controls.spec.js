// @ts-check
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /technician/job-history, on a phone, with its own technician and two completed
// jobs (one rated 4/5): the all-time summary (unchanged by filters), search, Clear filters, a refused
// date range, the actions sheet (44 px), details with checklist and proof, Escape closing only the top
// layer, the timeline, and the downloaded work summary (named by ticket code, with the rating).

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let nextDay = 20;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data, multipart = false) => {
    const options = { headers };
    if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return {
    get: (path) => call('get', path),
    post: (path, data, multipart) => call('post', path, data ?? {}, multipart),
    put: (path, data) => call('put', path, data),
  };
};

test.describe('Technician job history controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('43 - every Technician Job History control works', async ({ browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const clientApi = apiAs(request, clientAuth);
    const stamp = Date.now();
    const service = await admin.post('/api/admin/services/', {
      name: `E2E History ${stamp}`, description: 'History check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `hist${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Hist', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(username);
    const techApi = apiAs(request, techAuth);
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });

    const completeJob = async () => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: { Authorization: `Token ${clientAuth.token}` },
          data: {
            service_type: service.id, description: `E2E history ${stamp}`, priority: 'Normal',
            location_address: 'History Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
      }
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
      await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
      await techApi.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
      await techApi.post('/api/checklist/', {
        jobId: ticket.id, completed: { 0: true },
        checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
        notes: 'Done.', maintenance_required: false,
      });
      await techApi.post(`/api/services/service-tickets/${ticket.id}/complete_work/`, {
        completion_notes: 'Breakers replaced and tested.',
        completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
      }, true);
      return ticket.id;
    };
    const ratedJob = await completeJob();
    const otherJob = await completeJob();
    await clientApi.post(`/api/services/service-tickets/${ratedJob}/submit_feedback/`, { rating: 4, feedback: 'Neat and on time.' });
    const code = (id) => `TKT-${String(id).padStart(4, '0')}`;

    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, techAuth);
    await page.goto('/technician/job-history');

    // ── All-time summary ──
    const summary = page.locator('dl[aria-label="Your work summary"]');
    await expect(summary).toContainText('Jobs completed2', { timeout: 30000 });
    await expect(summary).toContainText('This month2');
    await expect(summary).toContainText('Client rating4(1)');
    await expect(page.getByText('Showing 2 of 2 completed jobs.')).toBeVisible();

    // ── Search narrows the list; the summary stays all-time; Clear filters restores it ──
    const search = page.getByPlaceholder('Search ticket, client, service, address');
    await search.fill(code(ratedJob));
    await expect(page.getByText('Showing 1 of 1 completed job.')).toBeVisible();
    await expect(summary).toContainText('Jobs completed2');
    await search.fill('no-such-history-entry');
    await expect(page.getByText('No completed jobs match the current filters.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).last().click();
    await expect(search).toHaveValue('');
    await expect(page.getByText('Showing 2 of 2 completed jobs.')).toBeVisible();

    // ── A From date later than the To date is refused, with no pointless retry ──
    await page.getByLabel('From completed date').fill(localKey(new Date(Date.now() + 2 * 86400000)));
    await page.getByLabel('To completed date').fill(localKey(new Date()));
    await expect(page.getByRole('alert')).toContainText('The From date cannot be later than the To date.');
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('Showing 2 of 2 completed jobs.')).toBeVisible();

    // ── Actions sheet: 44 px button, then details ──
    const actions = page.getByRole('button', { name: `Open actions for ${code(ratedJob)}` }).locator('visible=true').first();
    expect((await actions.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await actions.click();
    await page.getByRole('dialog', { name: 'Job Actions' }).getByRole('button', { name: 'View details' }).click();
    const details = page.getByRole('dialog', { name: service.name });
    await expect(details).toBeVisible();
    await expect(details.getByText('Do the agreed work')).toBeVisible();
    await expect(details.getByText('Done', { exact: true })).toBeVisible();
    await expect(details.getByText('Neat and on time.')).toBeVisible();

    // Escape closes only the top layer: the proof preview first, then the details.
    await details.getByRole('button', { name: 'Preview Completion proof 1' }).click();
    const preview = page.getByRole('dialog', { name: 'Completion proof 1' });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('link', { name: 'Download' })).toHaveAttribute('target', '_blank');
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(details).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(details).toHaveCount(0);

    // ── Timeline ──
    await actions.click();
    await page.getByRole('dialog', { name: 'Job Actions' }).getByRole('button', { name: 'View timeline' }).click();
    const timeline = page.getByRole('dialog', { name: code(ratedJob) });
    await expect(timeline).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(timeline).toHaveCount(0);

    // ── Download summary: named by ticket code, with the rating, no stray indent ──
    await actions.click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('dialog', { name: 'Job Actions' }).getByRole('button', { name: 'Download summary' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${code(ratedJob)}-work-summary.txt`);
    const text = fs.readFileSync(await download.path(), 'utf-8');
    expect(text).toContain(`Ticket: ${code(ratedJob)}`);
    expect(text).toContain('Client Rating: 4/5');
    expect(text).toContain('\nNext Maintenance: ');

    // ── Phone layout ──
    const rows = page.getByLabel('Rows');
    expect((await rows.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(otherJob).not.toBe(ratedJob);
    await context.close();
  });
});
