// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /technician/profile, on a phone, with its own technician (one skill, one finished
// job rated 4/5): identity and status, Performance (same count as Job History, rating with its
// count, no "Avg Time"), skills (no internal "Service #" tag), Edit Profile (refused phone shown in
// view, save, reload), the photo (refused type, preview, clear, keyboard-reachable, upload, a missing
// file falls back to initials), an email change asking for the password, Change Password (mismatch,
// show/hide, wrong password, then a real change that signs out), and the phone layout.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.describe('Technician profile controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('46 - every Technician Profile control works', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const clientAuth = loadAuthStateFromBackend('client_test');
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
      name: `E2E Profile ${stamp}`, description: 'Profile check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const username = `prof${stamp}`.toLowerCase();
    const password = 'TestPass123!';
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username, email: `${username}@afntest.com`, password, password_confirm: password,
      first_name: 'Prof', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
    const techAuth = loadAuthStateFromBackend(username);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });

    // One finished job, rated 4 by the client.
    let created;
    let visitDate;
    for (let day = 60; day < 80 && !created; day += 1) {
      visitDate = localKey(new Date(Date.now() + day * 86400000));
      const response = await request.post('/api/services/service-requests/', {
        headers: as(clientAuth),
        data: {
          service_type: service.id, description: `E2E profile ${stamp}`, priority: 'Normal',
          location_address: 'Profile Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
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
    await call('post', `/api/services/service-tickets/${ticket.id}/submit_feedback/`, clientAuth, { rating: 4, feedback: 'Good work.' });

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, techAuth);
    await page.goto('/technician/profile');

    // ── Identity, Performance, skills ──
    await expect(page.getByRole('heading', { name: `Prof Tech${stamp}` })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(`@${username}`)).toBeVisible();
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
    const performance = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Performance' }) });
    await expect(performance).toContainText('Jobs completed1');
    await expect(performance).toContainText('Last 30 days');
    await expect(performance).toContainText('4.0 / 5from 1 rated job');
    await expect(performance).not.toContainText('Avg Time');
    const skills = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Service Skills' }) });
    await expect(skills).toContainText(service.name);
    await expect(skills).toContainText('Expert');
    await expect(skills).not.toContainText('Service #');

    // ── Edit Profile: a refused phone is shown where the technician can see it ──
    const edit = page.getByRole('button', { name: 'Edit Profile' });
    expect((await edit.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await edit.click();
    const phone = page.getByLabel('Phone Number');
    expect((await phone.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await phone.fill('12345');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toBeInViewport();
    await phone.fill('09181234567');
    await page.getByLabel('Address', { exact: true }).fill(`Blk 1 Lot ${stamp % 100}, Cabuyao`);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Profile updated successfully.' })).toBeInViewport();
    await expect(page.getByText('09181234567')).toBeVisible();
    await page.reload();
    await expect(page.getByText('09181234567')).toBeVisible({ timeout: 30000 });

    // ── Photo: refused type, preview, clear; the picker is keyboard-reachable; upload; missing file ──
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const picker = page.locator('input[type="file"]');
    expect(await picker.evaluate((input) => getComputedStyle(input).display)).not.toBe('none');
    await picker.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.getByRole('alert')).toContainText('Choose a JPEG, PNG, WebP, or GIF image.');
    await picker.setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('face.png')).toBeVisible();
    await page.getByRole('button', { name: 'Clear selected photo' }).click();
    await expect(page.getByText('Choose a new profile photo')).toBeVisible();
    await picker.setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Profile updated successfully.' })).toBeVisible();
    const photo = page.getByRole('img', { name: `Prof Tech${stamp}` });
    await expect(photo).toBeVisible();
    const photoUrl = new URL(await photo.getAttribute('src'), page.url()).href;
    const isPhoto = (url) => url.href === photoUrl;
    await page.route(isPhoto, (route) => route.fulfill({ status: 404, body: '' }));
    await page.reload();
    await expect(page.getByRole('heading', { name: `Prof Tech${stamp}` })).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('img', { name: `Prof Tech${stamp}` })).toHaveCount(0);
    await expect(page.getByText('PT', { exact: true })).toBeVisible();
    await page.unroute(isPhoto);

    // ── Changing the email asks for the current password; a wrong one is refused ──
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await page.getByLabel('Email Address').fill(`${username}.new@afntest.com`);
    const emailPassword = page.getByLabel('Current Password');
    await expect(emailPassword).toBeVisible();
    await emailPassword.fill('WrongPass999!');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert')).toContainText('current password');
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByLabel('Email Address')).toHaveCount(0);

    // ── Change Password: mismatch, show/hide, wrong current password, Dismiss ──
    const security = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Password & Security' }) });
    const openPasswordForm = async () => {
      const open = security.getByRole('button', { name: 'Change Password' });
      expect((await open.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await open.click();
    };
    await openPasswordForm();
    await security.getByLabel('Current password').fill(password);
    await security.getByLabel('New password', { exact: true }).fill('NewPass456!x');
    await security.getByLabel('Confirm new password').fill('Different456!x');
    await security.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('alert')).toContainText('New password and confirmation do not match.');
    await expect(page.getByRole('alert')).toBeInViewport();
    const showHide = security.getByRole('button', { name: 'Show passwords' });
    await showHide.click();
    await expect(security.getByLabel('Current password')).toHaveAttribute('type', 'text');
    await expect(security.getByRole('button', { name: 'Hide passwords' })).toHaveAttribute('aria-pressed', 'true');
    await security.getByRole('button', { name: 'Hide passwords' }).click();
    await expect(security.getByLabel('Current password')).toHaveAttribute('type', 'password');
    await security.getByLabel('Current password').fill('WrongPass999!');
    await security.getByLabel('Confirm new password').fill('NewPass456!x');
    await security.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await security.getByRole('button', { name: 'Dismiss' }).click();
    await expect(security.getByLabel('Current password')).toHaveCount(0);

    // ── View job history ──
    await page.getByRole('link', { name: 'View job history' }).click();
    await expect(page).toHaveURL(/\/technician\/job-history$/);
    await expect(page.locator('dl[aria-label="Your work summary"]')).toContainText('Jobs completed1', { timeout: 30000 });
    await page.goBack();

    // ── Phone layout ──
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible({ timeout: 30000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // ── A real password change signs the technician out ──
    await openPasswordForm();
    await security.getByLabel('Current password').fill(password);
    await security.getByLabel('New password', { exact: true }).fill('NewPass456!x');
    await security.getByLabel('Confirm new password').fill('NewPass456!x');
    await security.getByRole('button', { name: 'Change Password' }).click();
    await expect(page).toHaveURL(/\/login\?reason=password_changed/, { timeout: 30000 });

    await context.close();
  });
});
