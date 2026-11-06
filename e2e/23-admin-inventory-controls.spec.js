// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/inventory, for admin and superadmin: summary cards, search, filters,
// categories, the item form (errors inside, unsaved-changes guard), details, every stock movement
// with its errors shown inside the movement form, history, edit, delete, retire and reactivate.
// Equipment-request decisions are covered end to end by 3.8d, 3.8e and 11.1.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const get = async (path) => (await request.get(path, { headers })).json();
  const all = async (path) => {
    const rows = [];
    let next = path;
    while (next) {
      const body = await get(next);
      rows.push(...list(body));
      next = body?.next ? new URL(body.next).pathname + new URL(body.next).search : null;
    }
    return rows;
  };
  return { get, all };
};

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Inventory controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`23 - ${username}: every Inventory control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const api = apiAs(request, auth);
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';
      const categoryName = `E2E Cat ${tag} ${stamp}`;
      const itemName = `E2E Panel ${tag} ${stamp}`;
      const sku = `E2E-${tag}-${stamp}`;
      const spareName = `E2E Spare ${tag} ${stamp}`;
      const items = async () => api.all('/api/inventory/items/');
      const findItem = async (name) => (await items()).find((entry) => entry.name === name);

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/inventory');
      const overview = page.getByRole('heading', { name: /^Stock Overview \(/ });
      await expect(overview).toBeVisible({ timeout: 30000 });

      // ── Summary cards agree with the API ──
      const everything = await items();
      const active = everything.filter((entry) => entry.status !== 'retired');
      const sum = (key) => active.reduce((total, entry) => total + Number(entry[key] || 0), 0);
      const summary = page.getByRole('region', { name: 'Inventory summary' });
      await expect(summary.getByRole('button', { name: /^Physical units/ })).toContainText(sum('quantity').toLocaleString());
      await expect(summary.getByRole('button', { name: /^Reserved units/ })).toContainText(sum('reserved_quantity').toLocaleString());
      await expect(summary.getByRole('button', { name: /^Available units/ })).toContainText(sum('available_quantity').toLocaleString());

      // ── Categories: error inside, add, edit, delete ──
      await page.getByRole('button', { name: 'Manage Categories' }).click();
      const categories = page.getByRole('dialog', { name: 'Manage inventory categories' });
      await categories.getByRole('button', { name: 'Add Category' }).click();
      await expect(categories.getByRole('alert')).toHaveText('Category name is required.');
      await categories.getByLabel('Category name').fill(`${categoryName} temp`);
      await categories.getByRole('button', { name: 'Add Category' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Category ${categoryName} temp was added.` })).toBeVisible();
      await categories.getByRole('button', { name: `Edit category ${categoryName} temp` }).click();
      await categories.getByLabel('Category name').fill(categoryName);
      await categories.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: `Category ${categoryName} was updated.` })).toBeVisible();
      // Typing then closing asks first.
      await categories.getByLabel('Category name').fill('Unsaved category');
      await page.keyboard.press('Escape');
      const discard = page.getByRole('dialog', { name: 'Discard unsaved changes?' });
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await expect(categories.getByLabel('Category name')).toHaveValue('Unsaved category');
      await categories.getByLabel('Category name').fill(`${categoryName} empty`);
      await categories.getByRole('button', { name: 'Add Category' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Category ${categoryName} empty was added.` })).toBeVisible();
      await categories.getByRole('button', { name: `Delete category ${categoryName} empty` }).click();
      await page.getByRole('dialog', { name: `Delete category "${categoryName} empty"?` }).getByRole('button', { name: 'Delete category' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Category ${categoryName} empty was deleted.` })).toBeVisible();
      await categories.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(categories).toBeHidden();

      // ── Add item: discard guard, then create ──
      const categoryId = String((await api.all('/api/inventory/categories/')).find((entry) => entry.name === categoryName).id);
      await page.getByRole('button', { name: 'Add Item' }).click();
      const itemForm = page.getByRole('dialog', { name: 'Add inventory item' });
      await itemForm.getByLabel('Item name').fill(itemName);
      await page.mouse.click(5, 5);
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await expect(itemForm.getByLabel('Item name')).toHaveValue(itemName);
      await itemForm.getByLabel('SKU').fill(sku.toLowerCase());
      await expect(itemForm.getByLabel('SKU')).toHaveValue(sku);
      await itemForm.getByLabel('Inventory category').selectOption(categoryId);
      await itemForm.getByLabel('Item type').selectOption('part');
      await itemForm.getByLabel('Brand').fill('E2E Brand');
      await itemForm.getByLabel('Opening quantity').fill('3');
      await itemForm.getByLabel('Minimum stock').fill('2');
      await itemForm.getByLabel('Unit price').fill('150');
      await itemForm.getByRole('button', { name: 'Add Item' }).click();
      await expect(page.getByRole('status').filter({ hasText: `${itemName} was added to inventory.` })).toBeVisible();
      const created = await findItem(itemName);
      expect(created).toMatchObject({ sku, item_type: 'part', brand: 'E2E Brand', quantity: 3, minimum_stock: 2 });

      // A duplicate SKU is refused inside the form.
      await page.getByRole('button', { name: 'Add Item' }).click();
      await itemForm.getByLabel('Item name').fill(`${itemName} copy`);
      await itemForm.getByLabel('SKU').fill(sku);
      await itemForm.getByRole('button', { name: 'Add Item' }).click();
      await expect(itemForm.getByRole('alert')).toBeVisible();
      await itemForm.getByRole('button', { name: 'Dismiss' }).click();
      await discard.getByRole('button', { name: 'Discard changes' }).click();
      await expect(itemForm).toBeHidden();

      // ── Search, category filter, details, Escape ──
      const search = page.getByRole('searchbox', { name: /Find an inventory item/i });
      await search.fill(sku);
      await expect(overview).toHaveText(/^Stock Overview \(1 of \d+ items\)$/);
      await page.getByRole('button', { name: `Details for ${itemName}` }).locator('visible=true').click();
      const details = page.getByRole('dialog', { name: `Details for ${itemName}` });
      await expect(details).toContainText('E2E Brand');
      await page.keyboard.press('Escape');
      await expect(details).toBeHidden();

      // ── Stock movements: errors inside the form, then each type for real ──
      const manage = page.getByRole('dialog', { name: `Manage ${itemName}` });
      const openManage = async () => page.getByRole('button', { name: `Manage ${itemName}` }).locator('visible=true').click();
      const movement = async (button, dialogName, quantity, note) => {
        await openManage();
        if (button === 'Record Non-ticket Return' || button === 'Manual Deduction') await manage.getByText('Other stock actions').click();
        await manage.getByRole('button', { name: button }).click();
        const form = page.getByRole('dialog', { name: `${dialogName} for ${itemName}` });
        await form.getByLabel(/quantity|Quantity|count/).first().fill(String(quantity));
        if (note) await form.getByRole('textbox', { name: /notes|reason|Reason/ }).fill(note);
        return form;
      };
      let form = await movement('Receive Stock', 'Receive Stock', 0, '');
      await form.getByRole('button', { name: 'Receive Stock' }).click();
      await expect(form.getByRole('alert')).toHaveText('Movement quantity must be greater than zero.');
      await form.getByLabel('Quantity received').fill('5');
      await form.getByRole('button', { name: 'Receive Stock' }).click();
      await expect(form.getByRole('alert')).toHaveText('A reason is required for every manual stock movement.');
      await form.getByLabel('Receipt notes').fill('Supplier delivery.');
      await form.getByRole('button', { name: 'Receive Stock' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Receive Stock saved for ${itemName}: 3 → 8.` })).toBeVisible();
      expect((await findItem(itemName)).quantity).toBe(8);

      form = await movement('Adjust Stock', 'Adjust Stock', 6, 'Cycle count.');
      await form.getByRole('button', { name: 'Save Correction' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Adjust Stock saved for ${itemName}: 8 → 6.` })).toBeVisible();

      form = await movement('Manual Deduction', 'Manual Deduction', 99, 'Damaged in storage.');
      await form.getByRole('button', { name: 'Deduct Stock' }).click();
      await expect(form.getByRole('alert')).toHaveText('Only 6 unit(s) are available to deduct.');
      await form.getByLabel('Quantity deducted').fill('1');
      await form.getByRole('button', { name: 'Deduct Stock' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Manual Deduction saved for ${itemName}: 6 → 5.` })).toBeVisible();

      form = await movement('Record Non-ticket Return', 'Record Non-ticket Return', 2, 'Returned from a demo unit.');
      await form.getByRole('button', { name: 'Record Return' }).click();
      await expect(page.getByRole('status').filter({ hasText: `Record Non-ticket Return saved for ${itemName}: 5 → 7.` })).toBeVisible();
      expect((await findItem(itemName)).quantity).toBe(7);

      // A changed movement form asks before closing.
      form = await movement('Receive Stock', 'Receive Stock', 4, 'Not saved.');
      await form.getByRole('button', { name: 'Dismiss' }).click();
      await discard.getByRole('button', { name: 'Discard changes' }).click();
      await expect(form).toBeHidden();
      expect((await findItem(itemName)).quantity).toBe(7);

      // ── History lists every movement ──
      await openManage();
      await manage.getByRole('button', { name: /Stock Movement History/ }).click();
      await expect(manage.locator('#item-stock-history-list')).toContainText('Supplier delivery.');
      await expect(manage.locator('#item-stock-history-list')).toContainText('Returned from a demo unit.');
      await manage.getByRole('button', { name: /Ticket Reservations/ }).click();
      await expect(manage.locator('#item-ticket-reservations-list')).toContainText('No ticket reservations for this item.');

      // ── Edit ──
      await manage.getByRole('button', { name: 'Edit Item' }).click();
      const editForm = page.getByRole('dialog', { name: `Edit ${itemName}` });
      await editForm.getByLabel('Model').fill('E2E-M1');
      await editForm.getByRole('button', { name: 'Save Details' }).click();
      await expect(page.getByRole('status').filter({ hasText: `${itemName} was updated.` })).toBeVisible();
      expect((await findItem(itemName)).model).toBe('E2E-M1');

      // ── Retire (has history) and reactivate ──
      await openManage();
      await expect(manage.getByRole('button', { name: 'Delete Item' })).toHaveCount(0);
      await manage.getByRole('button', { name: 'Retire Item' }).click();
      await page.getByRole('dialog', { name: `Retire "${itemName}"?` }).getByRole('button', { name: 'Retire item' }).click();
      await expect(page.getByRole('status').filter({ hasText: `${itemName} was retired.` })).toBeVisible();
      expect((await findItem(itemName)).status).toBe('retired');
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('combobox', { name: 'Item usage state' }).selectOption('all');
      await openManage();
      await manage.getByRole('button', { name: 'Reactivate Item' }).click();
      await page.getByRole('dialog', { name: `Reactivate "${itemName}"?` }).getByRole('button', { name: 'Reactivate item' }).click();
      await expect.poll(async () => (await findItem(itemName)).status).not.toBe('retired');

      // ── An item with no history can be deleted ──
      await page.getByRole('button', { name: 'Add Item' }).click();
      await itemForm.getByLabel('Item name').fill(spareName);
      await itemForm.getByLabel('SKU').fill(`${sku}-X`);
      await itemForm.getByLabel('Inventory category').selectOption(categoryId);
      await itemForm.getByLabel('Opening quantity').fill('0');
      await itemForm.getByRole('button', { name: 'Add Item' }).click();
      await expect(page.getByRole('status').filter({ hasText: `${spareName} was added to inventory.` })).toBeVisible();
      await search.fill(`${sku}-X`);
      await page.getByRole('button', { name: `Manage ${spareName}` }).locator('visible=true').click();
      await page.getByRole('dialog', { name: `Manage ${spareName}` }).getByRole('button', { name: 'Delete Item' }).click();
      await page.getByRole('dialog', { name: 'Delete inventory item?' }).getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: `${spareName} was deleted.` })).toBeVisible();
      await expect.poll(() => findItem(spareName)).toBeUndefined();

      // ── Stock level filter from the summary card; Clear all ──
      await page.getByRole('button', { name: 'Clear all' }).click();
      await summary.getByRole('button', { name: /^Needs attention/ }).click();
      await expect(page.getByRole('button', { name: /^Remove Stock level filter/ })).toBeVisible();
      await page.getByRole('button', { name: 'Clear all' }).click();
      await expect(page.getByRole('button', { name: /^Remove Stock level filter/ })).toHaveCount(0);

      // ── Pending equipment requests panel ──
      const pendingToggle = page.getByRole('button', { name: /Pending Equipment Requests/ });
      await pendingToggle.click();
      await expect(pendingToggle).toHaveAttribute('aria-expanded', 'true');
      const refreshed = page.waitForResponse((r) => r.url().includes('/api/inventory/reservations/pending/'));
      await page.getByRole('region', { name: 'Pending equipment requests' }).getByRole('button', { name: 'Refresh' }).click();
      await refreshed;

      // ── Load failure ──
      await page.route('**/api/inventory/items/**', (route) => route.fulfill({ status: 500, json: { detail: 'Inventory unavailable' } }));
      await page.reload();
      await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 30000 });
    });
  });
}
