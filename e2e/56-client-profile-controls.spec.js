// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /client/profile, on a phone, with its own client:
// - identity: name, CL code, verified email;
// - Edit Profile: a name or phone already on the account cannot be saved blank, a bad phone is
//   refused, and each message is shown where the client is looking; a real save survives a reload;
// - photo: keyboard-reachable picker, refused type, upload;
// - email change: asks for the password (a wrong one is refused), then "Keep <old email>" cancels
//   the pending change;
// - Change Password: errors inside the form, same-password refused, a real change signs out and the
//   sign-in page says why; the new password works;
// - 44 px controls, no sideways scroll, and a laptop screenshot.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.describe('Client profile controls', () => {
  test.describe.configure({ timeout: 300000 });

  test('56 - every Client Profile control works', async ({ browser, request }) => {
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
    const username = `pfclient${stamp}`.toLowerCase();
    const email = `${username}@afntest.com`;
    const password = 'TestPass123!';
    const created = await call('post', '/api/admin/users/', superAuth, {
      username, email, password, password_confirm: password,
      first_name: 'Profile', last_name: `Client${stamp}`, phone: '09171234597', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(username);
    const me = () => call('get', '/api/users/me/', clientAuth);
    const fullName = `Profile Client${stamp}`;

    // ── Laptop screenshot ──
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const laptopPage = await laptop.newPage();
    await seedAuthState(laptopPage, clientAuth);
    await laptopPage.goto('/client/profile');
    await expect(laptopPage.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 30000 });
    await laptopPage.screenshot({ path: 'test-results/screenshots/56-client-profile-laptop.png', fullPage: true });
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

    // ── Identity ──
    await page.goto('/client/profile');
    await expect(page.getByRole('heading', { name: fullName })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(`CL-${String(created.id ?? created.user?.id).padStart(4, '0')}`)).toBeVisible();
    await expect(page.getByText('Verified', { exact: true })).toBeVisible();
    await noSidewaysScroll();

    // ── Edit: blank name and phone refused, bad phone refused, each message in view ──
    const edit = page.getByRole('button', { name: 'Edit Profile' });
    expect((await edit.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await edit.click();
    const save = page.getByRole('button', { name: 'Save Changes' });
    for (const control of [page.getByLabel('First Name'), page.getByLabel('Phone Number'), page.getByLabel('Address', { exact: true }), save, page.getByRole('button', { name: 'Dismiss' })]) {
      expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await page.getByLabel('First Name').fill('');
    await page.getByLabel('Phone Number').fill('');
    await save.click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Enter your first name.');
    await expect(alert).toContainText('Enter your mobile number.');
    await expect(alert).toBeInViewport();
    await page.getByLabel('First Name').fill('Profile');
    await page.getByLabel('Phone Number').fill('12345');
    await save.click();
    await expect(page.getByRole('alert')).toBeInViewport();
    await expect(page.getByRole('alert')).not.toContainText('Enter your first name.');
    await page.getByLabel('Phone Number').fill('09181234597');
    await page.getByLabel('Company Name (Optional)').fill('Sunrise Farms');
    await page.getByLabel('Address', { exact: true }).fill('Blk 2 Lot 9, Cabuyao, Laguna');
    await save.click();
    await expect(page.getByRole('status').filter({ hasText: 'Profile updated successfully.' })).toBeInViewport();
    await page.reload();
    await expect(page.getByText('09181234597')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Sunrise Farms')).toBeVisible();
    expect((await me()).address).toBe('Blk 2 Lot 9, Cabuyao, Laguna');

    // ── Photo: keyboard-reachable, refused type, upload ──
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const picker = page.getByLabel('Choose a new profile photo');
    await picker.focus();
    expect(await picker.evaluate((input) => document.activeElement === input)).toBe(true);
    await picker.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await expect(page.getByRole('alert')).toContainText('Choose a JPEG, PNG, WebP, or GIF image.');
    await picker.setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText('face.png')).toBeVisible();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Profile updated successfully.' })).toBeVisible();
    await expect(page.getByRole('img', { name: fullName })).toBeVisible();

    // ── Email change: password needed, wrong one refused; then cancel the pending change ──
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const newEmail = `${username}.new@afntest.com`;
    await page.getByLabel('Email Address').fill(newEmail);
    await page.getByLabel('Current Password').fill('WrongPass999!');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('alert')).toContainText('current password');
    await page.getByLabel('Current Password').fill(password);
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Verify ${newEmail}` })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('Email verification pending')).toBeVisible();
    expect((await me()).pending_email).toBe(newEmail);
    const keep = page.getByRole('button', { name: `Keep ${email}` });
    expect((await keep.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await keep.click();
    await expect(page.getByRole('status').filter({ hasText: `Email change cancelled. You still sign in with ${email}.` })).toBeVisible();
    await expect(page.getByText('Email verification pending')).toHaveCount(0);
    expect((await me()).pending_email).toBeNull();

    // ── Change Password: errors in the form, same password refused, Dismiss ──
    const security = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Password & Security' }) });
    await expect(security).toContainText('signs you out on every device');
    await security.getByRole('button', { name: 'Change Password' }).click();
    await security.getByLabel('Current password').fill(password);
    await security.getByLabel('New password', { exact: true }).fill('NewPass456!x');
    await security.getByLabel('Confirm new password').fill('Different456!x');
    await security.getByRole('button', { name: 'Change Password' }).click();
    await expect(security.getByRole('alert')).toHaveText('New password and confirmation do not match.');
    await expect(security.getByRole('alert')).toBeInViewport();
    await security.getByLabel('New password', { exact: true }).fill(password);
    await security.getByLabel('Confirm new password').fill(password);
    await security.getByRole('button', { name: 'Change Password' }).click();
    await expect(security.getByRole('alert')).toHaveText('Choose a new password that is different from your current one.');
    await security.getByRole('button', { name: 'Dismiss' }).click();
    await expect(security.getByLabel('Current password')).toHaveCount(0);
    await noSidewaysScroll();

    // ── A real change signs out; the sign-in page says why; the new password works ──
    await security.getByRole('button', { name: 'Change Password' }).click();
    await security.getByLabel('Current password').fill(password);
    await security.getByLabel('New password', { exact: true }).fill('NewPass456!x');
    await security.getByLabel('Confirm new password').fill('NewPass456!x');
    await security.getByRole('button', { name: 'Change Password' }).click();
    await expect(page).toHaveURL(/\/login\?reason=password_changed/, { timeout: 30000 });
    await expect(page.getByRole('status').filter({ hasText: 'Your password was changed. Sign in with your new password.' })).toBeVisible();
    const signIn = await request.post('/api/users/login/', { data: { username, password: 'NewPass456!x' } });
    expect(signIn.ok(), `login: ${signIn.status()}`).toBeTruthy();
    await context.close();
  });
});
