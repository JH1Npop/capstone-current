// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on the staff Messages page (/admin/messages, also /technician/messages), for admin,
// superadmin and technician: rooms and search, send with Enter (focus stays in the box), image
// attach with type/size checks before upload, the image preview (Escape), edit and unsend with
// errors shown inside their dialogs, and the 5000-character limit.

// A message bubble (the room list also previews the latest text).
const bubbleFor = (page, text) => page.getByText(text, { exact: true }).and(page.locator('p'));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const accounts = [
  ['admin_test', '/admin/messages'],
  ['superadmin_test', '/admin/messages'],
  ['tech_test', '/technician/messages'],
];

for (const [username, path] of accounts) {
  test.describe(`Messages controls as ${username}`, () => {
    test.describe.configure({ timeout: 180000 });

    test(`28 - ${username}: every Messages control works`, async ({ page }) => {
      const stamp = Date.now();
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, loadAuthStateFromBackend(username));
      await page.goto(path);
      const rooms = page.getByRole('button', { name: /Staff Group Chat/ }).first();
      await expect(rooms).toBeVisible({ timeout: 30000 });
      await expect(rooms).toHaveAttribute('aria-current', 'true');

      // ── Search the room list ──
      const search = page.getByRole('textbox', { name: 'Search message rooms' });
      await search.fill('zz-no-such-room');
      await expect(page.getByText('No message rooms match your search.')).toBeVisible();
      await search.fill('Staff');
      await expect(rooms).toBeVisible();
      await search.fill('');

      // ── Send with Enter; the box keeps focus for the next message ──
      const composer = page.getByRole('textbox', { name: 'Message Staff Group Chat' });
      const text = `E2E message from ${username} ${stamp}`;
      await composer.fill(text);
      await composer.press('Enter');
      await expect(page.getByRole('status')).toContainText('Message sent to Staff Group Chat.');
      const bubble = bubbleFor(page, text);
      await expect(bubble).toBeVisible();
      await expect(composer).toHaveValue('');
      await expect(composer).toBeFocused();
      await expect(composer).toHaveAttribute('maxlength', '5000');

      // ── Attachments are checked before upload ──
      const fileInput = page.getByLabel('Image to attach');
      await fileInput.setInputFiles({ name: 'photo.heic', mimeType: 'image/heic', buffer: PNG });
      await expect(page.getByRole('alert')).toContainText('photo.heic cannot be sent. Use a JPEG, PNG, WebP or GIF image.');
      await fileInput.setInputFiles({ name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024) });
      await expect(page.getByRole('alert')).toContainText('Images must be 5 MB or smaller.');
      await fileInput.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: PNG });
      await expect(page.getByText('Image ready to send')).toBeVisible();
      await page.getByRole('button', { name: 'Remove image' }).click();
      await expect(page.getByText('Image ready to send')).toHaveCount(0);
      await fileInput.setInputFiles({ name: 'tiny.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: 'Send message', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Message sent to Staff Group Chat.');

      // ── Image preview opens and closes with Escape ──
      await page.getByRole('img', { name: 'Message attachment' }).last().click();
      const preview = page.getByRole('dialog', { name: 'Message attachment' });
      await expect(preview.getByRole('link', { name: 'Download' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(preview).toBeHidden();

      // ── Edit: an error stays inside the dialog, then a real edit ──
      const ownMessage = page.locator('div.flex').filter({ has: bubble }).last();
      await ownMessage.getByRole('button', { name: /^Edit message sent / }).click();
      const editDialog = page.getByRole('dialog', { name: 'Edit message' });
      await editDialog.getByLabel('Message text').fill(`${text} (edited)`);
      await page.route('**/api/messages/**', (route) => (
        ['PATCH', 'PUT'].includes(route.request().method())
          ? route.fulfill({ status: 400, json: { detail: 'Server could not edit this message.' } })
          : route.continue()
      ));
      await editDialog.getByRole('button', { name: 'Save' }).click();
      await expect(editDialog.getByRole('alert')).toContainText('Server could not edit this message.');
      await page.unroute('**/api/messages/**');
      await editDialog.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toContainText('Message updated.');
      await expect(bubbleFor(page, `${text} (edited)`)).toBeVisible();
      // Escape closes the edit dialog without saving.
      const edited = page.locator('div.flex').filter({ has: bubbleFor(page, `${text} (edited)`) }).last();
      await edited.getByRole('button', { name: /^Edit message sent / }).click();
      await page.keyboard.press('Escape');
      await expect(editDialog).toBeHidden();

      // ── Unsend: an error stays inside the confirmation, then a real unsend ──
      await edited.getByRole('button', { name: /^Unsend message sent / }).click();
      const unsend = page.getByRole('dialog', { name: 'Unsend message?' });
      await page.route('**/api/messages/**', (route) => (
        ['DELETE', 'POST'].includes(route.request().method()) && /unsend|\/\d+\/?$/.test(route.request().url())
          ? route.fulfill({ status: 400, json: { detail: 'Server could not unsend this message.' } })
          : route.continue()
      ));
      await unsend.getByRole('button', { name: 'Unsend' }).click();
      await expect(unsend.getByRole('alert')).toContainText('Server could not unsend this message.');
      await page.unroute('**/api/messages/**');
      await unsend.getByRole('button', { name: 'Unsend' }).click();
      await expect(page.getByRole('status')).toContainText('Message unsent.');
      await expect(bubbleFor(page, `${text} (edited)`)).toHaveCount(0);
    });
  });
}
