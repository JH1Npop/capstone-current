// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /technician/checklist, on a phone, with its own technician and job: before the
// job starts the checklist is read-only with a note; each wizard step refuses to continue until it
// is answered (work steps, required photo, maintenance, after-sales, follow-up summary and a due date
// not in the past); a refused photo is named and an accepted one shows a thumbnail; answers survive a
// reload as a draft; submitting opens the job for Finish Job; an already submitted checklist says so.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

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

test.describe('Technician checklist controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('41 - every Technician Checklist control works', async ({ browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();
    const service = await admin.post('/api/admin/services/', {
      name: `E2E Checklist ${stamp}`, description: 'Checklist check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [
        { step: 1, title: 'Isolate the supply', description: 'Switch off and lock out.', requires_photo: false },
        { step: 2, title: 'Photograph the finished board', description: 'Labels visible.', requires_photo: true },
      ],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `check${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Check', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    let created;
    let visitDate;
    for (let offset = 14; offset < 58 && !created; offset += 1) {
      visitDate = localKey(new Date(Date.now() + offset * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: { Authorization: `Token ${clientAuth.token}` },
        data: {
          service_type: service.id, description: `E2E checklist ${stamp}`, priority: 'Normal',
          location_address: 'Check Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
          preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
        },
      });
      if (response.ok()) created = await response.json();
    }
    await admin.post(`/api/services/service-requests/${created.id}/approve/`);
    const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
      .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
    await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
    const techAuth = loadAuthStateFromBackend(username);
    const techApi = apiAs(request, techAuth);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, techAuth);
    const url = `/technician/checklist?ticketId=${ticket.id}`;

    // ── Before the job starts: read-only with a note ──
    await page.goto(url);
    await expect(page.getByText('This job has not started yet.')).toBeVisible({ timeout: 30000 });

    // ── Start the job, then fill the checklist ──
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
    await techApi.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Complete the work steps' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('This job has not started yet.')).toHaveCount(0);
    const message = page.getByRole('alert');
    const next = page.getByRole('button', { name: /^Continue to / });

    await next.click();
    await expect(message).toHaveText('Complete work step 1 before continuing.');
    await page.getByRole('button', { name: 'Mark complete: Isolate the supply' }).click();
    await page.getByRole('button', { name: 'Mark complete: Photograph the finished board' }).click();
    await next.click();
    await expect(message).toHaveText('Add the required photo for work step 2 before continuing.');

    // Answers survive a reload (photos do not, and the page says so).
    await page.reload();
    await expect(page.getByRole('button', { name: 'Mark incomplete: Isolate the supply' })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Selected photos and videos are not saved after a refresh/)).toBeVisible();

    // A refused photo is named; an accepted one shows a thumbnail.
    const photoInput = page.locator('input[type="file"][accept^="image"]');
    await page.getByRole('button', { name: 'Add required photo' }).click();
    await photoInput.setInputFiles({ name: 'clip.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(message).toHaveText('clip.gif was not added: photos must be JPEG, PNG, or WebP.');
    await page.getByRole('button', { name: 'Add required photo' }).click();
    await photoInput.setInputFiles({ name: 'board.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByRole('img', { name: 'Photo for step 2' })).toBeVisible();
    await next.click();

    // Maintenance.
    await expect(page.getByRole('heading', { name: 'Should this site be checked again later?' })).toBeVisible();
    await next.click();
    await expect(message).toHaveText('Choose whether this site needs a future maintenance reminder.');
    await page.getByRole('button', { name: 'Yes, remind us' }).click();
    await next.click();
    await expect(message).toHaveText('Select a maintenance profile before continuing.');
    await page.getByRole('button', { name: /^Standard Area/ }).click();
    await page.getByLabel('Maintenance Notes').fill('Dusty roadside site.');
    await next.click();

    // Warranty and after-sales result.
    await next.click();
    await expect(message).toHaveText('Choose the after-sales result before continuing.');
    await page.getByRole('button', { name: /^Create follow-up task/ }).click();
    await expect(page.getByLabel('Coverage Days')).toHaveValue('30');
    await next.click();

    // Follow-up task: a summary and a due date that is not in the past.
    await next.click();
    await expect(message).toHaveText('Add a short follow-up summary before continuing.');
    await page.getByLabel('Handoff Summary').fill('Client wants a call next week about output.');
    const dueDate = page.getByLabel('Due Date');
    await expect(dueDate).toHaveAttribute('min', localKey(new Date()));
    await dueDate.fill(localKey(new Date(Date.now() - 2 * 86400000)));
    await next.click();
    await expect(message).toHaveText('The follow-up due date cannot be in the past.');
    await dueDate.fill(localKey(new Date(Date.now() + 7 * 86400000)));
    await next.click();

    // Proof & notes, then review and submit.
    await page.getByLabel('Technician Notes').fill('Board relabelled; all breakers tested.');
    await expect(page.getByRole('img', { name: 'Proof photo 1' })).toBeVisible();
    await next.click();
    await expect(page.getByRole('heading', { name: 'Review before submit.' })).toBeVisible();
    const submit = page.getByRole('button', { name: 'Submit Completed Checklist' });
    const submitBox = await submit.boundingBox();
    expect(submitBox.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await submit.click();
    await expect(page.getByRole('status').filter({ hasText: 'Checklist submitted.' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/technician/my-jobs\\?ticketId=${ticket.id}`), { timeout: 15000 });
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Finish Job' })).toBeVisible();
    expect((await techApi.get(`/api/technician/jobs/${ticket.id}/`)).checklist_completed).toBeTruthy();

    // ── Opening it again says it was already submitted ──
    await page.goto(url);
    await expect(page.getByText('This checklist was already submitted.')).toBeVisible({ timeout: 30000 });
    await context.close();
  });
});
