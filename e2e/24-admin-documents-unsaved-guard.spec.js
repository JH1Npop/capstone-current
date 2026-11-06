// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// /admin/documents for admin and superadmin. The editor's buttons are covered by 12.x and 3.9
// (as superadmin); this spec checks the parts those do not: unsaved edits survive an accidental
// ticket change, saving or Reset clears the warning, leaving the page warns, and the admin
// account can use the main document actions too.

const pickTicket = async (page, index) => {
  await page.getByPlaceholder(/search ticket by id/i).click();
  const option = page.getByRole('button', { name: /^TKT-\d+/ }).nth(index);
  await expect(option).toBeVisible();
  const code = (await option.innerText()).match(/TKT-\d+/)[0];
  await option.click();
  return code;
};
const ticketInput = (page) => page.getByPlaceholder(/search ticket by id/i);
const clientField = (page) => page.locator('label:has(> span:text-is("Client")) textarea').first();

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Documents unsaved-edit guard as ${username}`, () => {
    test.describe.configure({ timeout: 240000 });

    test.beforeEach(async ({ page }) => {
      await seedAuthState(page, loadAuthStateFromBackend(username));
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await page.goto('/admin/documents');
      await page.getByRole('button', { name: 'Field Service Report', exact: true }).click();
    });

    test(`24.1 - ${username}: changing ticket with unsaved edits asks first; Keep editing keeps them`, async ({ page }) => {
      const first = await pickTicket(page, 0);
      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
      await expect(clientField(page)).toBeVisible();
      await clientField(page).fill('E2E unsaved client');

      // Opening another ticket asks first, naming the edited document.
      await pickTicket(page, 1);
      const ask = page.getByRole('dialog', { name: 'Discard unsaved document changes?' });
      await expect(ask).toContainText('Field Service Report');
      await expect(ask).toContainText('Opening another ticket');
      await ask.getByRole('button', { name: 'Keep editing' }).click();
      await expect(ask).toBeHidden();
      await expect(clientField(page)).toHaveValue('E2E unsaved client');
      await expect(ticketInput(page)).toHaveValue(new RegExp(`^${first} \\|`));

      // Clearing the ticket asks too; Discard changes really switches.
      await page.getByRole('button', { name: 'Clear selected ticket' }).click();
      await expect(ask).toContainText('Clearing the ticket');
      await ask.getByRole('button', { name: 'Discard changes' }).click();
      await expect(ticketInput(page)).toHaveValue('');
      await expect(page.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    });

    test(`24.2 - ${username}: saving a draft or Reset clears the warning`, async ({ page }) => {
      await pickTicket(page, 0);
      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
      await clientField(page).fill('E2E saved client');
      const saved = page.waitForResponse((r) => r.url().includes('/document-draft/') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Save draft' }).click();
      expect((await saved).ok()).toBeTruthy();
      await expect(page.getByRole('status')).toContainText(/draft saved/i);
      const second = await pickTicket(page, 1);
      await expect(page.getByRole('dialog', { name: 'Discard unsaved document changes?' })).toHaveCount(0);
      await expect(ticketInput(page)).toHaveValue(new RegExp(`^${second} \\|`));

      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
      await clientField(page).fill('E2E reset client');
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await pickTicket(page, 0);
      await expect(page.getByRole('dialog', { name: 'Discard unsaved document changes?' })).toHaveCount(0);
    });

    test(`24.3 - ${username}: an edit in another document type is also protected, and leaving the page warns`, async ({ page }) => {
      await pickTicket(page, 0);
      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
      // With a ticket chosen, stage buttons also announce their status ("...: Not started").
      await page.getByRole('button', { name: /^TDS - Technical Data Sheet/ }).click();
      const lastName = page.locator('label:has(> span:text-is("Last Name")) textarea, label:has(> span:text-is("Last Name")) input').first();
      await expect(lastName).toBeVisible();
      await lastName.fill('E2E Surname');
      await page.getByRole('button', { name: /^Field Service Report/ }).click();
      await pickTicket(page, 1);
      const ask = page.getByRole('dialog', { name: 'Discard unsaved document changes?' });
      await expect(ask).toContainText('TDS - Technical Data Sheet');
      await ask.getByRole('button', { name: 'Keep editing' }).click();

      let unloadDialog = '';
      page.on('dialog', async (dialog) => {
        unloadDialog = dialog.type();
        await dialog.dismiss();
      });
      await page.close({ runBeforeUnload: true });
      await expect.poll(() => unloadDialog).toBe('beforeunload');
    });

    test(`24.4 - ${username}: Save draft, Save specs and Generate work`, async ({ page }) => {
      await pickTicket(page, 0);
      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
      const draft = page.waitForResponse((r) => r.url().includes('/document-draft/') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Save draft' }).click();
      expect((await draft).ok()).toBeTruthy();
      await page.getByRole('button', { name: 'Save specs to ticket' }).click();
      await expect(page.getByRole('status')).toContainText(/Project specifications permanently saved|No project specifications are filled in/);
      const generated = page.waitForResponse((r) => r.url().includes('/generate-document/') && r.request().method() === 'POST');
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Generate active design' }).click();
      expect((await generated).ok()).toBeTruthy();
      expect((await download).suggestedFilename()).toMatch(/\.docx$/i);
    });
  });
}
