// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/user-management. Checked for admin_test: the page shows only what the
// server lets an admin do (no New User; a technician can be edited, nothing can be deactivated;
// clients and administrators are view only). Checked for superadmin_test: create with errors kept
// inside the dialog, a verification notice, the discard prompt and Escape, edit with validation,
// Deactivate with a server failure shown inside its dialog, Reactivate, the access editor's
// discard prompt and failure, filters and search. Accounts created here are deactivated at the end.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const rowFor = (page, text) => page.getByRole('row').filter({ hasText: text });

test.describe('User management as admin_test', () => {
  test.describe.configure({ timeout: 180000 });

  test('33.A - admin_test: sees only the actions the server allows', async ({ page, request }) => {
    const auth = loadAuthStateFromBackend('admin_test');
    const headers = { Authorization: `Token ${auth.token}` };
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, auth);
    await page.goto('/admin/user-management');
    // Other specs add accounts, so the seeded users may not all be on the first page: show them by search.
    await page.getByLabel('Search users').fill('_test');
    await expect(rowFor(page, 'tech_test')).toBeVisible({ timeout: 30000 });

    await expect(page.getByRole('button', { name: 'New User' })).toHaveCount(0);
    // Own account, the owner and clients are view only.
    await expect(rowFor(page, 'admin_test').getByText('You', { exact: true })).toBeVisible();
    await expect(rowFor(page, 'superadmin_test').getByText('Owner account')).toBeVisible();
    await expect(rowFor(page, 'client_test').getByText('View only')).toBeVisible();
    await expect(rowFor(page, 'client_test').getByRole('button', { name: /^Edit / })).toHaveCount(0);
    await expect(rowFor(page, 'inventory_viewer_test').getByText('View only')).toBeVisible();
    // A technician can be edited but not deactivated.
    await expect(rowFor(page, 'tech_test').getByRole('button', { name: 'Edit Test Technician' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Deactivate / })).toHaveCount(0);

    // The server agrees with what the page shows.
    const create = await request.post('/api/admin/clients/', { headers, data: { username: 'nope', password: 'TestPass123!', password_confirm: 'TestPass123!' } });
    expect(create.status()).toBe(403);
    const clientId = list(await (await request.get('/api/users/', { headers })).json()).find((u) => u.username === 'client_test').id;
    expect((await request.put(`/api/admin/clients/${clientId}/`, { headers, data: { first_name: 'X' } })).status()).toBe(403);

    // Filters and search.
    await page.getByRole('button', { name: /^Technicians/ }).click();
    await expect(page.getByRole('button', { name: /^Technicians/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(rowFor(page, 'client_test')).toHaveCount(0);
    await page.getByRole('button', { name: /^All/ }).click();
    await page.getByLabel('Search users').fill('zzz-nobody');
    await expect(page.getByText('No users match the current search or selected category.')).toBeVisible();
    await page.getByLabel('Search users').fill('tech_test');
    await expect(rowFor(page, 'tech_test')).toBeVisible();
    await expect(rowFor(page, 'client_test')).toHaveCount(0);
  });
});

test.describe('User management as superadmin_test', () => {
  test.describe.configure({ timeout: 240000 });

  test('33.S - superadmin_test: every User Management control works', async ({ page, request }) => {
    const auth = loadAuthStateFromBackend('superadmin_test');
    const headers = { Authorization: `Token ${auth.token}` };
    const stamp = String(Date.now()).slice(-6);
    const username = `e2e_tech_${stamp}`;
    const email = `e2e.tech.${stamp}@afntest.com`;
    const users = async () => list(await (await request.get('/api/users/', { headers })).json());
    const created = async () => (await users()).find((u) => u.username === username);

    try {
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/user-management');
      await page.getByLabel('Search users').fill('_test');
      await expect(rowFor(page, 'tech_test')).toBeVisible({ timeout: 30000 });
      await expect(rowFor(page, 'superadmin_test').getByText('You', { exact: true })).toBeVisible();
      await page.getByLabel('Search users').fill('');

      // ── Create: errors stay inside the dialog ──
      await page.getByRole('button', { name: 'New User' }).click();
      const createDialog = page.getByRole('dialog', { name: 'Create user' });
      await createDialog.getByRole('button', { name: 'Create User' }).click();
      await expect(createDialog.getByRole('alert')).toHaveText('Username is required.');
      await createDialog.getByLabel('Username').fill(username);
      await createDialog.getByLabel('Full name').fill(`E2E Tech ${stamp}`);
      await createDialog.getByLabel('Phone').fill('12345');
      await createDialog.getByRole('button', { name: 'Create User' }).click();
      await expect(createDialog.getByRole('alert')).toContainText('Philippine mobile number');
      await createDialog.getByLabel('Phone').fill('09171234567');
      await createDialog.getByLabel('Password', { exact: true }).fill('short');
      await createDialog.getByLabel('Confirm password').fill('short');
      await createDialog.getByRole('button', { name: 'Create User' }).click();
      await expect(createDialog.getByRole('alert')).toHaveText('Password must be at least 8 characters.');
      await createDialog.getByLabel('Password', { exact: true }).fill('TestPass123!');
      await createDialog.getByLabel('Confirm password').fill('Different123!');
      await createDialog.getByRole('button', { name: 'Create User' }).click();
      await expect(createDialog.getByRole('alert')).toHaveText('Passwords do not match.');

      // ── Escape asks before throwing the typed form away ──
      await page.keyboard.press('Escape');
      const discard = page.getByRole('dialog', { name: 'Discard your changes?' });
      await expect(discard).toBeVisible();
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await expect(createDialog.getByLabel('Username')).toHaveValue(username);

      // ── Create succeeds and says a verification email went out ──
      await createDialog.getByLabel('Role').selectOption('technician');
      await createDialog.getByLabel('Email').fill(email);
      await createDialog.getByLabel('Confirm password').fill('TestPass123!');
      await createDialog.getByRole('button', { name: 'Create User' }).click();
      await expect(page.getByRole('status')).toContainText(`verification email was sent to ${email}`);
      await expect(createDialog).toHaveCount(0);
      const newRow = rowFor(page, username);
      await expect(newRow).toBeVisible();
      await expect(newRow.getByText('Pending verification').first()).toBeVisible();
      expect((await created()).role).toBe('technician');

      // Closing an untouched form needs no prompt; a touched one does.
      await page.getByRole('button', { name: 'New User' }).click();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Create user' })).toHaveCount(0);
      await page.getByRole('button', { name: 'New User' }).click();
      await page.getByRole('dialog', { name: 'Create user' }).getByLabel('Username').fill('abandoned');
      await page.getByRole('dialog', { name: 'Create user' }).getByRole('button', { name: 'Close' }).click();
      await discard.getByRole('button', { name: 'Discard' }).click();
      await expect(page.getByRole('dialog', { name: 'Create user' })).toHaveCount(0);

      // ── Edit: validation inside the dialog, Save disabled until something changes ──
      await rowFor(page, username).getByRole('button', { name: `Edit E2E Tech ${stamp}` }).click();
      const editDialog = page.getByRole('dialog', { name: 'Edit Technician' });
      await expect(editDialog.getByRole('button', { name: 'Save changes' })).toBeDisabled();
      await editDialog.getByLabel('Phone number').fill('555');
      await expect(editDialog.getByText('Unsaved changes')).toBeVisible();
      await editDialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(editDialog.getByRole('alert')).toContainText('Philippine mobile number');
      await editDialog.getByLabel('Phone number').fill('09179990000');
      await editDialog.getByLabel('Latitude').fill('95');
      await editDialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(editDialog.getByRole('alert')).toHaveText('Latitude must be a number between -90 and 90.');
      await editDialog.getByLabel('Latitude').fill('14.2786');
      await editDialog.getByLabel('Full name').fill(`E2E Tech ${stamp} Renamed`);
      await editDialog.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByRole('status')).toContainText(`E2E Tech ${stamp} Renamed updated.`);
      await expect.poll(async () => (await created()).phone).toBe('09179990000');
      await expect.poll(async () => (await created()).last_name).toContain('Renamed');

      // The offline option says what it does.
      await rowFor(page, username).getByRole('button', { name: /^Edit / }).click();
      await expect(page.getByText('Offline deactivates the account.')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Edit Technician' })).toHaveCount(0);

      // ── Access editor: discard prompt and a failed save shown inside the dialog ──
      await rowFor(page, 'inventory_viewer_test').getByRole('button', { name: /^Manage access for / }).click();
      const accessDialog = page.getByRole('dialog', { name: /^Capabilities for inventory_viewer_test/ });
      await expect(accessDialog).toBeVisible();
      await expect(accessDialog.getByRole('button', { name: 'Save access' })).toBeDisabled();
      const firstBox = accessDialog.getByRole('checkbox').first();
      const wasChecked = await firstBox.isChecked();
      await firstBox.setChecked(!wasChecked);
      await expect(accessDialog.getByText('Unsaved changes')).toBeVisible();
      await page.route('**/api/users/*/capabilities/', (route) => (route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, json: { detail: 'Could not save access.' } })
        : route.continue()));
      await accessDialog.getByRole('button', { name: 'Save access' }).click();
      await expect(accessDialog.getByRole('alert')).toBeVisible();
      await page.unroute('**/api/users/*/capabilities/');
      await page.keyboard.press('Escape');
      await discard.getByRole('button', { name: 'Discard' }).click();
      await expect(accessDialog).toHaveCount(0);

      // ── Deactivate: confirm, a server failure stays inside the dialog, then it works ──
      await rowFor(page, username).getByRole('button', { name: /^Deactivate / }).click();
      const deactivate = page.getByRole('dialog', { name: new RegExp(`^Deactivate E2E Tech ${stamp}`) });
      await deactivate.getByRole('button', { name: 'Keep active' }).click();
      await expect(deactivate).toHaveCount(0);
      await rowFor(page, username).getByRole('button', { name: /^Deactivate / }).click();
      await page.route(`**/api/admin/technicians/${(await created()).id}/`, (route) => (route.request().method() === 'DELETE'
        ? route.fulfill({ status: 409, json: { error: 'Reassign TKT-0001 before deactivating this technician.' } })
        : route.continue()));
      await deactivate.getByRole('button', { name: 'Deactivate', exact: true }).click();
      await expect(deactivate.getByRole('alert')).toContainText('Reassign TKT-0001');
      await page.unroute(`**/api/admin/technicians/${(await created()).id}/`);
      await deactivate.getByRole('button', { name: 'Deactivate', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('deactivated.');
      await expect.poll(async () => (await created()).is_active).toBe(false);
      await expect(rowFor(page, username)).toHaveCount(0);

      // ── Reactivate from the inactive view ──
      await page.getByLabel(/Show inactive accounts/).check();
      await expect(rowFor(page, username).getByText('Inactive').first()).toBeVisible();
      await rowFor(page, username).getByRole('button', { name: /^Reactivate / }).click();
      await expect(page.getByRole('status')).toContainText('reactivated.');
      await expect.poll(async () => (await created()).is_active).toBe(true);
      // With nothing inactive left the page returns to the active list instead of showing an empty one.
      await expect(rowFor(page, username)).toBeVisible();
      await expect(page.getByLabel(/Show inactive accounts/)).toHaveCount(0);

      // ── Filters and search ──
      await page.getByRole('button', { name: /^Clients/ }).click();
      await expect(page.getByRole('button', { name: /^Clients/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(rowFor(page, 'client_test')).toBeVisible();
      await expect(rowFor(page, username)).toHaveCount(0);
      await page.getByRole('button', { name: /^All/ }).click();
      await page.getByLabel('Search users').fill(username);
      await expect(rowFor(page, username)).toBeVisible();
      await expect(rowFor(page, 'client_test')).toHaveCount(0);
    } finally {
      const record = await created();
      if (record?.is_active) await request.delete(`/api/admin/technicians/${record.id}/`, { headers });
    }
  });
});
