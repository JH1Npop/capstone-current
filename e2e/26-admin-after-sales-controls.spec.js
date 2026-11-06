// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/after-sales-cases, for admin and superadmin: create (errors inside the
// form, unsaved-follow-up guard), summary cards that filter, search, Start work, Mark as Done,
// Reopen (errors inside the dialog), Details with case owner, Escape, and the Overdue filter.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`After-sales case controls as ${username}`, () => {
    test.describe.configure({ timeout: 240000 });

    test(`26 - ${username}: every After-Sales Cases control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const headers = { Authorization: `Token ${auth.token}` };
      const stamp = Date.now();
      const summary = `E2E after-sales ${username} ${stamp}`;
      const findCase = async () => list(await (await request.get(`/api/services/follow-up-cases/?search=${encodeURIComponent(summary)}`, { headers })).json())
        .find((entry) => entry.summary === summary);

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/after-sales-cases');
      await expect(page.getByRole('heading', { name: /^Cases \(\d+\)$/ })).toBeVisible({ timeout: 30000 });

      // ── Create: discard guard, an error shown inside the form, then a real case ──
      await page.getByRole('button', { name: '+ New Follow-Up' }).click();
      const form = page.getByRole('dialog', { name: 'New Follow-Up' });
      await expect(form.getByLabel('Completed service ticket')).not.toHaveValue('');
      await form.getByLabel('What needs attention').fill(summary);
      await page.keyboard.press('Escape');
      const discard = page.getByRole('dialog', { name: 'Discard this follow-up?' });
      await discard.getByRole('button', { name: 'Keep editing' }).click();
      await expect(form.getByLabel('What needs attention')).toHaveValue(summary);
      await form.getByLabel('Reason').selectOption('complaint');
      await form.getByLabel('Urgency').selectOption('high');
      // Three days back is in the past in every timezone (the server's today can differ from the browser's by a day).
      const yesterday = localKey(new Date(Date.now() - 3 * 86400000));
      await form.getByLabel('Follow up by').fill(yesterday);
      await form.getByLabel('Notes').fill('Client says the inverter beeps at night.');
      await page.route('**/api/services/follow-up-cases/', (route) => (
        route.request().method() === 'POST'
          ? route.fulfill({ status: 400, json: { summary: ['Server refused this summary.'] } })
          : route.continue()
      ));
      await form.getByRole('button', { name: 'Create Follow-Up' }).click();
      await expect(form.getByRole('alert')).toContainText('Server refused this summary.');
      await page.unroute('**/api/services/follow-up-cases/');
      // The real server refuses a past follow-up date, and says so inside the form.
      await form.getByRole('button', { name: 'Create Follow-Up' }).click();
      await expect(form.getByRole('alert')).toContainText('cannot be in the past');
      await expect(form.getByLabel('Follow up by')).toHaveAttribute('min', localKey(new Date()));
      const tomorrow = localKey(new Date(Date.now() + 86400000));
      await form.getByLabel('Follow up by').fill(tomorrow);
      await form.getByRole('button', { name: 'Create Follow-Up' }).click();
      await expect(form).toBeHidden();
      const created = await findCase();
      const caseCode = `ASC-${String(created.id).padStart(4, '0')}`;
      await expect(page.getByRole('status')).toContainText(`After-sales case created: ${caseCode}.`);
      expect(created).toMatchObject({ case_type: 'complaint', priority: 'high', status: 'open', due_date: tomorrow });

      // ── Search finds it; summary cards filter (due tomorrow, so not overdue) ──
      await page.getByRole('searchbox', { name: /Find a follow-up case/i }).fill(summary);
      const row = page.locator('tbody tr').filter({ hasText: summary });
      await expect(row).toBeVisible();
      const cards = page.getByRole('region', { name: 'After-sales summary' });
      await cards.getByRole('button', { name: /^Overdue/ }).click();
      await expect(cards.getByRole('button', { name: /^Overdue/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(row).toHaveCount(0);
      await cards.getByRole('button', { name: /^New Handoffs/ }).click();
      await expect(row).toBeVisible();

      // ── Start work ──
      await row.getByRole('button', { name: `Start work on ${caseCode}` }).click();
      await expect(page.getByRole('status')).toContainText(`${caseCode} is being handled.`);
      await expect.poll(async () => (await findCase()).status).toBe('in_progress');
      await page.getByRole('button', { name: 'Clear all' }).click();
      await page.getByRole('searchbox', { name: /Find a follow-up case/i }).fill(summary);

      // ── Mark as Done: an error stays inside the dialog, then it resolves ──
      await row.getByRole('button', { name: `Mark as Done: ${caseCode}` }).click();
      const decision = page.getByRole('dialog', { name: 'Resolve case' });
      await decision.getByLabel('Resolution notes').fill('Replaced the inverter fan; noise gone.');
      await page.route(`**/api/services/follow-up-cases/${created.id}/`, (route) => (
        route.request().method() === 'PATCH'
          ? route.fulfill({ status: 400, json: { detail: 'Server could not resolve this case.' } })
          : route.continue()
      ));
      await decision.getByRole('button', { name: 'Resolve Case' }).click();
      await expect(decision.getByRole('alert')).toContainText('Server could not resolve this case.');
      await page.unroute(`**/api/services/follow-up-cases/${created.id}/`);
      await decision.getByRole('button', { name: 'Resolve Case' }).click();
      await expect(page.getByRole('status')).toContainText(`${caseCode} is marked as done.`);
      await expect.poll(async () => (await findCase()).status).toBe('resolved');

      // ── Reopen, then Escape closes the dialog without changes ──
      await row.getByRole('button', { name: `Reopen ${caseCode}` }).click();
      const reopen = page.getByRole('dialog', { name: 'Reopen case' });
      await page.keyboard.press('Escape');
      await expect(reopen).toBeHidden();
      await row.getByRole('button', { name: `Reopen ${caseCode}` }).click();
      await reopen.getByLabel('Reason for reopening').fill('Client reports the noise is back.');
      await reopen.getByRole('button', { name: 'Reopen Case' }).click();
      await expect(page.getByRole('status')).toContainText(`${caseCode} was reopened.`);
      await expect.poll(async () => (await findCase()).status).toBe('open');

      // ── Details: owner change, activity, Escape ──
      await row.getByRole('button', { name: `Details for ${caseCode}` }).click();
      const details = page.getByRole('dialog', { name: summary });
      await expect(details).toContainText('Client says the inverter beeps at night.');
      const owner = details.getByLabel('Case owner');
      const ownerOption = owner.locator('option').nth(1);
      const ownerName = (await ownerOption.innerText()).split(' (')[0];
      await owner.selectOption({ index: 1 });
      await expect(page.getByRole('status')).toContainText(`Case owner updated for ${caseCode}: ${ownerName}.`);
      await expect(details.getByRole('list')).toContainText('Replaced the inverter fan; noise gone.');
      await page.keyboard.press('Escape');
      await expect(details).toBeHidden();
      expect((await findCase()).assigned_to_full_name).toBe(ownerName);
    });
  });
}
