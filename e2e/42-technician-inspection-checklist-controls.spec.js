// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /technician/inspection-checklist, on a phone, with its own technician and jobs:
// closed until the technician has arrived and started; an on-hold inspection says to resume it; a
// service job points to the work checklist; submitting with gaps names them and scrolls to the first;
// a "No" needs a linked explanation; a refused photo is named and an accepted one shows a thumbnail;
// answers survive a reload (photos do not); leaving with photos asks first; the review dialog sums up
// the report before it is sent; after submitting the ticket is Inspection Completed and the page says so.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let nextDay = 16;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data) => {
    const options = { headers };
    if (data !== undefined) options.data = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return { get: (path) => call('get', path), post: (path, data) => call('post', path, data ?? {}), put: (path, data) => call('put', path, data) };
};

test.describe('Technician inspection checklist controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('42 - every Technician Inspection Checklist control works', async ({ browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();
    const makeService = (name, inspection) => admin.post('/api/admin/services/', {
      name, description: 'Inspection check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: inspection,
      procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
      inspection_procedures: inspection ? [{ title: 'Panel area has no shade', description: 'Check trees and walls.' }] : [],
      deposit_policy: 'none', deposit_value: 0,
    });
    const siteService = await makeService(`E2E Inspect ${stamp}`, true);
    const plainService = await makeService(`E2E Plain ${stamp}`, false);
    const username = `insp${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Insp', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await admin.put(`/api/admin/technicians/${tech.id}/`, {
      skills: [{ service_type: siteService.id, skill_level: 'expert' }, { service_type: plainService.id, skill_level: 'expert' }],
    });
    const makeJob = async (service, stage) => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: { Authorization: `Token ${clientAuth.token}` },
          data: {
            service_type: service.id, description: `E2E inspection ${stamp}`, priority: 'Normal',
            location_address: 'Inspect Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
      }
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: stage, scheduled_date: visitDate });
      return ticket.id;
    };
    const inspectionJob = await makeJob(siteService, 'inspection');
    const heldJob = await makeJob(siteService, 'inspection');
    const serviceJob = await makeJob(plainService, 'service');
    const techAuth = loadAuthStateFromBackend(username);
    const techApi = apiAs(request, techAuth);
    const status = async (id) => (await techApi.get(`/api/technician/jobs/${id}/`)).status;

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, techAuth);
    const url = (id) => `/technician/inspection-checklist?ticketId=${id}`;

    // ── Closed before arrival; a service job points to the work checklist ──
    await page.goto(url(inspectionJob));
    await expect(page.getByRole('heading', { name: 'Arrive on site first' })).toBeVisible({ timeout: 30000 });
    await page.goto(url(serviceJob));
    await expect(page.getByRole('heading', { name: 'This is a service job' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('link', { name: 'Open Work Checklist' })).toHaveAttribute('href', `/technician/checklist?ticketId=${serviceJob}`);

    // ── An on-hold inspection says to resume it first ──
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await techApi.post(`/api/technician/jobs/${heldJob}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${heldJob}/status/`, { status: 'on_hold', reason: 'Client not home yet.' });
    await page.goto(url(heldJob));
    await expect(page.getByRole('heading', { name: 'This inspection is on hold' })).toBeVisible({ timeout: 30000 });

    // ── Travel, arrive and start, then open the report ──
    await techApi.post(`/api/technician/jobs/${inspectionJob}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${inspectionJob}/arrive/`, SITE);
    await techApi.post(`/api/technician/jobs/${inspectionJob}/status/`, { status: 'in_progress' });
    await page.goto(url(inspectionJob));
    await expect(page.getByRole('heading', { name: 'Answer every check' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Site Inspection' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'TDS / Assessment' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Panel area has no shade')).toBeVisible();

    // Submitting with gaps names them and brings the first one into view.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const review = page.getByRole('button', { name: 'Review and complete inspection' });
    const reviewBox = await review.boundingBox();
    expect(reviewBox.height).toBeGreaterThanOrEqual(44);
    await review.click();
    await expect(page.getByRole('alert').filter({ hasText: 'Review the highlighted items before completing the inspection.' })).toBeVisible();
    await expect(page.getByText('Choose Yes or No.')).toHaveCount(4);
    await expect(page.getByRole('group', { name: 'Is the site accessible?' })).toBeInViewport();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // A "No" needs an explanation, and the box is labelled.
    await page.getByRole('group', { name: 'Is the site accessible?' }).getByRole('button', { name: 'No', exact: true }).click();
    for (const question of ['Is the electrical supply adequate?', 'Is required safety equipment present?', 'Panel area has no shade']) {
      await page.getByRole('group', { name: question }).getByRole('button', { name: 'Yes', exact: true }).click();
    }
    await page.getByRole('button', { name: /Proceed after setup/ }).click();
    await review.click();
    await expect(page.getByText('Explain the access problem.')).toBeVisible();
    await page.getByLabel('Required explanation').fill('Gate is locked; needs the owner key.');
    await page.getByLabel('Inspection notes').fill('Roof is 6 m high; ladder needed.');

    // A refused photo is named; an accepted one shows a thumbnail.
    const photoInput = page.locator('input[type="file"][accept*="image/jpeg"]');
    await photoInput.setInputFiles({ name: 'clip.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(page.getByText('clip.gif is not supported. Use a JPG, PNG, or WebP photo. HEIC photos must be converted first.')).toBeVisible();
    await photoInput.setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Site photo 1' })).toBeVisible();

    // Answers survive a reload; photos do not.
    await page.reload();
    await expect(page.getByRole('group', { name: 'Is the site accessible?' }).getByRole('button', { name: 'No', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30000 });
    await expect(page.getByLabel('Required explanation')).toHaveValue('Gate is locked; needs the owner key.');
    await expect(page.getByRole('img', { name: 'Site photo 1' })).toHaveCount(0);
    await photoInput.setInputFiles({ name: 'site.png', mimeType: 'image/png', buffer: PNG });

    // Leaving with photos selected asks first.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    const leave = page.getByRole('dialog', { name: 'Leave the inspection?' });
    await expect(leave).toBeVisible();
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(page).toHaveURL(new RegExp(`inspection-checklist\\?ticketId=${inspectionJob}`));
    await expect(page.getByRole('img', { name: 'Site photo 1' })).toBeVisible();

    // The review dialog sums up the report; Keep editing sends nothing.
    await review.click();
    const confirm = page.getByRole('dialog', { name: 'Complete the inspection?' });
    await expect(confirm).toContainText('Recommendation: Proceed after setup');
    await expect(confirm).toContainText('Checks answered “No”: 1 of 4');
    await expect(confirm).toContainText('Site photos: 1');
    await confirm.getByRole('button', { name: 'Keep editing' }).click();
    await expect(confirm).toHaveCount(0);
    expect(await status(inspectionJob)).toBe('In Progress');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // If the last step (mark complete) fails, the retry does not upload the photos a second time.
    let photoUploads = 0;
    page.on('request', (call) => { if (call.method() === 'POST' && call.url().includes('/upload_photos/')) photoUploads += 1; });
    let failComplete = true;
    await page.route('**/api/services/inspections/*/complete/', async (call) => {
      if (failComplete) {
        failComplete = false;
        await call.fulfill({ status: 503, json: { detail: 'Service briefly unavailable.' } });
      } else {
        await call.continue();
      }
    });
    await review.click();
    await confirm.getByRole('button', { name: 'Complete inspection' }).click();
    await expect(page.getByRole('alert')).toContainText('Unable to submit inspection checklist.');
    expect(photoUploads).toBe(1);
    expect(await status(inspectionJob)).toBe('In Progress');

    await review.click();
    await confirm.getByRole('button', { name: 'Complete inspection' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Inspection submitted. The office will review it and plan the work.' })).toBeVisible({ timeout: 30000 });
    await expect(page).toHaveURL(/\/technician\/dashboard/, { timeout: 15000 });
    await expect.poll(() => status(inspectionJob)).toBe('Inspection Completed');
    expect(photoUploads).toBe(1);
    const report = list(await techApi.get(`/api/services/inspections/?ticket=${inspectionJob}`))[0];
    expect(report.is_completed).toBeTruthy();
    expect(report.site_accessible).toBe(false);
    expect(report.recommendation).toBe('Conditional');

    // ── Opening it again says it was already submitted ──
    await page.goto(url(inspectionJob));
    await expect(page.getByRole('heading', { name: 'Inspection Already Completed' })).toBeVisible({ timeout: 30000 });
    await context.close();
  });
});
