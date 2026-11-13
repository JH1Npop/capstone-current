// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Progress updates on a long job, end to end, on a phone: the technician posts "40% done" with a
// note and a photo from the job details (bad input is refused inside the panel, and leaving with a
// typed note asks first); the job's progress bar follows the report; the client is notified and
// sees the update, with its photo, in the ticket timeline.

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

test.describe('Long job progress updates', () => {
  test.describe.configure({ timeout: 300000 });

  test('39 - a technician posts progress with a photo; the bar moves and the client sees it', async ({ browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const clientApi = apiAs(request, clientAuth);
    const stamp = Date.now();
    const service = await admin.post('/api/admin/services/', {
      name: `E2E Progress ${stamp}`, description: 'A twenty-day installation.', estimated_duration: 20 * 480, estimated_cost: 1000,
      max_daily_assignments: 5, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Install', description: 'Install.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `progress${stamp}`.toLowerCase();
    const tech = await admin.post('/api/admin/technicians/', {
      username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Progress', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    let created;
    let visitDate;
    for (let offset = 9; offset < 58 && !created; offset += 1) {
      visitDate = localKey(new Date(Date.now() + offset * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: { Authorization: `Token ${clientAuth.token}` },
        data: {
          service_type: service.id, description: `E2E progress ${stamp}`, priority: 'Normal',
          location_address: 'Progress Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
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
    await techApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
    await techApi.post(`/api/technician/jobs/${ticket.id}/arrive/`, SITE);
    await techApi.post(`/api/technician/jobs/${ticket.id}/status/`, { status: 'in_progress' });
    expect((await admin.get(`/api/services/service-tickets/${ticket.id}/`)).workflow_progress).toBe(70);

    // ── The technician posts from the job details, on a phone ──
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const techPage = await phone.newPage();
    await techPage.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(techPage, techAuth);
    await techPage.goto(`/technician/my-jobs?ticketId=${ticket.id}`);
    const panel = techPage.getByRole('region', { name: 'Progress updates' });
    await expect(panel.getByText('No progress updates yet.')).toBeVisible({ timeout: 30000 });
    const percent = panel.getByLabel('How far along is the job? (%)');
    const note = panel.getByLabel('What was done');
    const post = panel.getByRole('button', { name: 'Post update' });

    await post.click();
    await expect(panel.getByRole('alert')).toHaveText('Write what was done, or give the percent complete.');
    await percent.fill('140');
    await post.click();
    await expect(panel.getByRole('alert')).toHaveText('Percent complete must be a whole number from 0 to 100.');
    await panel.locator('input[type="file"]').setInputFiles({ name: 'clip.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
    await expect(panel.getByRole('alert')).toHaveText('Not added: clip.gif is not a JPG, PNG or WebP photo.');

    // Leaving with a typed note asks first.
    await note.fill('Mounted the rails on the east roof; panels arrive tomorrow.');
    await techPage.keyboard.press('Escape');
    const discard = techPage.getByRole('dialog', { name: 'Discard what you entered?' });
    await discard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(note).toHaveValue('Mounted the rails on the east roof; panels arrive tomorrow.');

    await percent.fill('40');
    await panel.locator('input[type="file"]').setInputFiles({ name: 'rails.png', mimeType: 'image/png', buffer: PNG });
    await expect(panel.getByText('1 selected')).toBeVisible();
    const postBox = await post.boundingBox();
    expect(postBox.height).toBeGreaterThanOrEqual(44);
    await post.click();
    await expect(panel.getByRole('status')).toHaveText('Update posted: 40% done. The client can see it.');
    const report = panel.locator('article').first();
    await expect(report).toContainText('40% done');
    await expect(report).toContainText('Mounted the rails on the east roof');
    await expect(report.getByRole('img', { name: 'Progress photo 1' })).toBeVisible();
    await expect(note).toHaveValue('');
    expect(await techPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await phone.close();

    // ── The bar follows the report; 100% is only for a completed job ──
    const after = await admin.get(`/api/services/service-tickets/${ticket.id}/`);
    expect(after.workflow_progress).toBe(82);
    expect(after.workflow_progress_label).toBe('Work underway — 40% done');
    const reports = list(await techApi.get(`/api/progress/ticket-progress/?ticket=${ticket.id}`));
    expect(reports).toHaveLength(1);
    expect(reports[0].photo_urls).toHaveLength(1);

    // ── The client is notified and sees the update in the timeline ──
    const notices = list(await clientApi.get('/api/notifications/?page_size=200'));
    expect(notices.some((entry) => entry.title === 'Job progress update' && entry.message.includes('40% done'))).toBeTruthy();
    const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const clientPage = await clientContext.newPage();
    await seedAuthState(clientPage, clientAuth);
    await clientPage.goto(`/client/requests/${created.id}`);
    await clientPage.getByRole('button', { name: 'View Timeline' }).first().click();
    const timeline = clientPage.getByRole('dialog');
    await expect(timeline.getByText('Progress update · 40% done')).toBeVisible({ timeout: 30000 });
    await expect(timeline.getByText('Mounted the rails on the east roof; panels arrive tomorrow.')).toBeVisible();
    await expect(timeline.getByRole('img', { name: 'Progress photo 1' })).toBeVisible();
    await clientContext.close();
  });
});
