// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/services, for admin and superadmin: the create/edit form (with its
// errors shown inside the form and the unsaved-changes guard), checklist steps, tools,
// inspection checks, deposit rule, inventory templates, deactivate/reactivate and deleting an
// unused service. Results are checked against /api/admin/services/.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const get = async (path) => {
    const response = await request.get(path, { headers });
    return { status: response.status(), body: await response.json().catch(() => ({})) };
  };
  return { get };
};

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Services controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`22 - ${username}: every Services control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const api = apiAs(request, auth);
      const stamp = Date.now();
      const name = `E2E Catalog ${username === 'admin_test' ? 'A' : 'S'} ${stamp}`;
      const findService = async () => list((await api.get('/api/admin/services/')).body).find((s) => s.name === name);

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/services');
      const controls = page.getByRole('region', { name: 'Service catalog controls' });
      await expect(controls.getByText(/^\d+ active · \d+ deactivated$/)).toBeVisible({ timeout: 30000 });

      // ── Counts and the visibility selector agree with the API ──
      const catalog = list((await api.get('/api/admin/services/')).body);
      const active = catalog.filter((s) => s.is_active !== false).length;
      await expect(controls.getByText(`${active} active · ${catalog.length - active} deactivated`)).toBeVisible();
      const visibility = controls.getByLabel('Service visibility');
      const cards = page.getByRole('button', { name: /^Actions for / });
      await visibility.selectOption('all');
      await expect(cards).toHaveCount(catalog.length);
      await visibility.selectOption('active');
      await expect(cards).toHaveCount(active);

      // ── Create form: errors appear inside the form ──
      await controls.getByRole('button', { name: 'Add Service' }).click();
      const form = page.getByRole('dialog', { name: 'Create Service' });
      await expect(form).toBeVisible();
      await form.getByRole('button', { name: 'Create Service' }).click();
      await expect(form.getByRole('alert')).toHaveText('Service name is required.');
      await form.getByLabel('Service Name').fill(catalog[0].name.toUpperCase());
      await form.getByRole('button', { name: 'Create Service' }).click();
      await expect(form.getByRole('alert')).toHaveText('A service with this name already exists.');

      // ── Unsaved changes are protected from Escape, the backdrop and Dismiss ──
      await form.getByLabel('Service Name').fill(name);
      await page.keyboard.press('Escape');
      await expect(form.getByText('Discard your unsaved changes?')).toBeVisible();
      await form.getByRole('button', { name: 'Keep editing' }).click();
      await page.mouse.click(5, 5);
      await expect(form.getByText('Discard your unsaved changes?')).toBeVisible();
      await form.getByRole('button', { name: 'Keep editing' }).click();
      await form.getByRole('button', { name: 'Dismiss' }).click();
      await expect(form.getByText('Discard your unsaved changes?')).toBeVisible();
      await form.getByRole('button', { name: 'Keep editing' }).click();
      await expect(form.getByLabel('Service Name')).toHaveValue(name);

      // ── Fill every field ──
      await form.getByLabel('Category').fill('E2E Category');
      await form.getByLabel('Service color hex code').fill('#0f766e');
      await form.getByLabel('Service duration days').fill('0');
      await form.getByLabel('Service duration hours').fill('1');
      await form.getByLabel('Service duration minutes').fill('30');
      await expect(form.getByText('1h 30m total.', { exact: false })).toBeVisible();
      await form.getByLabel('Estimated Cost (Philippine Peso)').fill('2500');
      await form.getByLabel('Max daily assignments per technician').fill('3');
      await form.getByLabel('Description').fill('Created by the services controls check.');
      await form.getByRole('button', { name: 'Add Step' }).click();
      await form.getByRole('button', { name: 'Add Step' }).click();
      await form.getByRole('button', { name: 'Add Step' }).click();
      await form.getByLabel('Checklist step 1 title').fill('Inspect the array');
      await form.getByLabel('Checklist step 3 title').fill('Test the output');
      await form.getByRole('checkbox', { name: 'Photo required before next step' }).first().check();
      await form.getByRole('button', { name: 'Remove checklist step 2' }).click();
      await expect(form.getByLabel('Checklist step 2 title')).toHaveValue('Test the output');
      await form.getByRole('button', { name: 'Add Step' }).click(); // a blank step the server drops
      await form.getByRole('button', { name: 'Add Tool' }).click();
      await form.getByLabel('Equipment name 1').fill('Multimeter');
      await form.getByLabel('Equipment quantity 1').fill('2');
      await form.getByRole('button', { name: 'Add Tool' }).click(); // blank tool row, dropped
      await form.getByRole('checkbox', { name: /Requires site inspection first/ }).check();
      await form.getByRole('button', { name: 'Add Check' }).click();
      await form.getByLabel('Inspection check 1', { exact: true }).fill('Roof can carry the array');
      await form.getByLabel('Pre-service deposit').selectOption('percentage');
      await form.getByLabel('Deposit percentage').fill('150');
      await form.getByRole('button', { name: 'Create Service' }).click();
      await expect(form.getByRole('alert')).toHaveText('Deposit percentage must be greater than 0 and no more than 100.');
      await form.getByLabel('Deposit percentage').fill('50');
      await form.getByRole('button', { name: 'Create Service' }).click();
      await expect(form).toBeHidden();
      await expect(page.getByRole('status').filter({ hasText: `${name} created.` })).toBeVisible();

      const created = await findService();
      expect(created).toMatchObject({
        category: 'E2E Category', color: '#0f766e', estimated_duration: 90, max_daily_assignments: 3,
        requires_site_inspection: true, deposit_policy: 'percentage', can_delete: true,
      });
      expect(Number(created.estimated_cost)).toBe(2500);
      expect(Number(created.deposit_value)).toBe(50);
      expect(created.procedures.map((step) => [step.step, step.title, step.requires_photo])).toEqual([[1, 'Inspect the array', true], [2, 'Test the output', false]]);
      expect(created.required_equipment).toEqual([{ name: 'Multimeter', quantity: 2 }]);
      expect(created.inspection_procedures.map((check) => check.title)).toEqual(['Roof can carry the array']);

      // ── The card shows the saved service; Details expands ──
      const card = page.locator('div.rounded-xl.border').filter({ has: page.getByRole('heading', { name, exact: true }) });
      await expect(card).toContainText('Site inspection first');
      await expect(card).toContainText('50% deposit');
      await expect(card).toContainText('1h 30m');
      await expect(card).toContainText('2 steps');
      await expect(card).toContainText('1 tool');
      await card.getByRole('button', { name: 'Details' }).click();
      await expect(card.getByText('Inspect the array')).toBeVisible();
      await expect(card.getByText('Multimeter')).toBeVisible();

      // ── Edit: unchanged form closes at once; a change saves ──
      const openMenu = async () => card.getByRole('button', { name: `Actions for ${name}` }).click();
      await openMenu();
      await page.getByRole('menuitem', { name: 'Edit Service' }).click();
      const editForm = page.getByRole('dialog', { name: 'Manage Service' });
      await expect(editForm.getByLabel('Service Name')).toHaveValue(name);
      await editForm.getByRole('button', { name: 'Dismiss' }).click();
      await expect(editForm).toBeHidden();
      await openMenu();
      await page.getByRole('menuitem', { name: 'Edit Service' }).click();
      await editForm.getByLabel('Estimated Cost (Philippine Peso)').fill('3100');
      await editForm.getByRole('button', { name: 'Save Changes' }).click();
      await expect(page.getByRole('status').filter({ hasText: `${name} updated.` })).toBeVisible();
      expect(Number((await findService()).estimated_cost)).toBe(3100);

      // ── Inventory template: add, the picker hides it next time, remove ──
      // The card opened before the edit is still open after the save reloaded the catalog.
      await expect(card.getByRole('heading', { name: 'Inventory Templates' })).toBeVisible();
      await card.getByRole('button', { name: 'Add', exact: true }).click();
      const itemPicker = card.getByLabel('Inventory template item');
      const itemValue = await itemPicker.inputValue();
      const itemLabel = (await itemPicker.locator(`option[value="${itemValue}"]`).innerText()).split(' (')[0];
      await card.getByLabel('Inventory requirement quantity').fill('2');
      await card.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Inventory template added.' })).toBeVisible();
      await expect(card).toContainText('1 inventory template');
      // Saving reloads the catalog without collapsing the open card.
      await expect(card.getByRole('heading', { name: 'Inventory Templates' })).toBeVisible();
      const addAgain = card.getByRole('button', { name: 'Add', exact: true });
      if (await addAgain.count()) {
        await addAgain.click();
        await expect(card.getByLabel('Inventory template item').locator(`option[value="${itemValue}"]`)).toHaveCount(0);
        await card.getByRole('button', { name: 'Dismiss', exact: true }).click();
      }
      await card.getByRole('button', { name: `Remove inventory template ${itemLabel}` }).click();
      const removeDialog = page.getByRole('dialog', { name: 'Remove inventory template?' });
      await removeDialog.getByRole('button', { name: 'Remove' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Template removed.' })).toBeVisible();
      await expect(card).toContainText('0 inventory templates');

      // ── Deactivate, find it under Deactivated, reactivate ──
      await openMenu();
      await page.getByRole('menuitem', { name: 'Deactivate' }).click();
      await page.getByRole('dialog', { name: 'Deactivate service?' }).getByRole('button', { name: 'Deactivate service' }).click();
      await expect.poll(async () => (await findService()).is_active).toBe(false);
      await expect(card).toHaveCount(0);
      await visibility.selectOption('deactivated');
      await expect(card).toContainText('Deactivated');
      await openMenu();
      await page.getByRole('menuitem', { name: 'Reactivate' }).click();
      await page.getByRole('dialog', { name: 'Activate service?' }).getByRole('button', { name: 'Activate service' }).click();
      await expect.poll(async () => (await findService()).is_active).toBe(true);
      await visibility.selectOption('active');

      // ── A used service cannot be deleted; this unused one can ──
      const used = catalog.find((s) => Number(s.usage_count || 0) > 0 && s.is_active !== false);
      if (used) {
        await page.getByRole('button', { name: `Actions for ${used.name}` }).click();
        await expect(page.getByRole('menuitem', { name: 'Delete unused service' })).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
      await openMenu();
      await page.getByRole('menuitem', { name: 'Delete unused service' }).click();
      const deleteDialog = page.getByRole('dialog', { name: 'Delete unused service?' });
      await expect(deleteDialog).toContainText(name);
      await deleteDialog.getByRole('button', { name: 'Delete permanently' }).click();
      await expect(page.getByRole('status').filter({ hasText: `${name} was deleted.` })).toBeVisible();
      await expect.poll(findService).toBeUndefined();

      // ── Load failure is reported as an error ──
      await page.route('**/api/admin/services/', (route) => route.fulfill({ status: 500, json: { error: 'Catalog unavailable' } }));
      await page.reload();
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30000 });
    });
  });
}
