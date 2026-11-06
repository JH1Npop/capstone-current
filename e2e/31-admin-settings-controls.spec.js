// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/settings, for admin and superadmin. Settings are global, so every value
// the test changes is put back through the API at the end. Checked: holiday dates typed with
// commas, clear validation shown in the save bar (no working day, closing before opening, an
// impossible holiday), Refresh asking before discarding edits, SLA durations above 24 hours, the
// organization section (view-only for admin, editable for superadmin), and saves checked
// against the API.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Settings controls as ${username}`, () => {
    test.describe.configure({ timeout: 180000 });

    test(`31 - ${username}: every Settings control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const superHeaders = { Authorization: `Token ${loadAuthStateFromBackend('superadmin_test').token}` };
      const headers = { Authorization: `Token ${auth.token}` };
      const getSettings = async () => (await request.get('/api/admin/settings/', { headers })).json();
      const getRules = async () => list(await (await request.get('/api/services/sla-rules/', { headers })).json());
      const originalSettings = await getSettings();
      const originalRules = await getRules();

      try {
        await page.addInitScript(() => {
          window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
        });
        await seedAuthState(page, auth);
        await page.goto('/admin/settings');
        const saveState = page.getByTestId('settings-save-state');
        const save = page.getByRole('button', { name: 'Save changes' });
        await expect(saveState).toHaveText('All changes are saved.', { timeout: 30000 });
        // Development mode loads the settings twice; type only after both loads settle.
        await page.waitForLoadState('networkidle');
        await expect(page.getByLabel('Holiday Dates')).toBeEnabled();

        // ── Holiday dates can be typed with commas, and save ──
        const holidays = page.getByLabel('Holiday Dates');
        await holidays.fill('');
        await holidays.pressSequentially('2027-12-25, 2028-01-01');
        await expect(holidays).toHaveValue('2027-12-25, 2028-01-01');
        await expect(saveState).toHaveText('You have unsaved changes.');
        await save.click();
        await expect(saveState).toHaveText('System settings updated.');
        await expect.poll(async () => (await getSettings()).holidayDates).toEqual(['2027-12-25', '2028-01-01']);

        // ── Clear validation, shown next to the Save button ──
        await holidays.fill('2027-02-30');
        await save.click();
        await expect(saveState).toHaveText('Holiday dates must be real dates written as YYYY-MM-DD. Check: 2027-02-30.');
        await holidays.fill('2027-12-25, 2028-01-01');

        const workingDays = page.locator('button[aria-pressed="true"]').filter({ hasText: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/ });
        const selectedDays = await workingDays.allInnerTexts();
        for (const day of selectedDays) await page.getByRole('button', { name: day, exact: true }).click();
        await save.click();
        await expect(saveState).toHaveText('Choose at least one working day.');
        for (const day of selectedDays) await page.getByRole('button', { name: day, exact: true }).click();

        const opening = page.getByLabel('Opening Time');
        const closing = page.getByLabel('Closing Time');
        const originalClose = await closing.inputValue();
        await closing.fill('07:00');
        await save.click();
        await expect(saveState).toHaveText('Closing time must be later than opening time.');
        await closing.fill(originalClose);
        await expect(opening).not.toHaveValue('');

        // ── Refresh asks before discarding edits ──
        await page.getByLabel('Maintenance Reminder').fill('12');
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        const refreshDialog = page.getByRole('dialog', { name: 'Discard unsaved settings?' });
        await refreshDialog.getByRole('button', { name: 'Keep editing' }).click();
        await expect(page.getByLabel('Maintenance Reminder')).toHaveValue('12');
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await refreshDialog.getByRole('button', { name: 'Discard and refresh' }).click();
        await expect(page.getByLabel('Maintenance Reminder')).toHaveValue(String(originalSettings.maintenanceReminderDays));
        await expect(saveState).toHaveText('All changes are saved.');

        // ── SLA durations in days, hours and minutes (up to a year) ──
        const rule = originalRules.find((entry) => entry.key === 'reschedule_delay') || originalRules[0];
        const ruleName = rule.label || rule.key;
        await expect(page.getByRole('combobox', { name: `${ruleName} overdue days` }).locator('option')).toHaveCount(366);
        await page.getByRole('combobox', { name: `${ruleName} overdue days` }).selectOption('45');
        await page.getByRole('combobox', { name: `${ruleName} overdue hours` }).selectOption('4');
        await page.getByRole('combobox', { name: `${ruleName} overdue minutes` }).selectOption('0');
        await expect(page.getByText('45 days 4 hr', { exact: true })).toBeVisible();
        await save.click();
        await expect(saveState).toHaveText('SLA rules updated.');
        await expect.poll(async () => (await getRules()).find((entry) => entry.id === rule.id).overdue_minutes)
          .toBe(45 * 1440 + 4 * 60);

        // ── Organization defaults: view-only for admin, editable for superadmin ──
        const validity = page.getByLabel('Quotation Validity (days)');
        if (username === 'admin_test') {
          await expect(validity).toBeDisabled();
          await expect(page.getByText('View only. A superadmin must update these values.')).toBeVisible();
        } else {
          await validity.fill('45');
          await save.click();
          await expect(saveState).toHaveText('System settings updated.');
          await expect.poll(async () => (await getSettings()).quotationValidityDays).toBe(45);
        }
      } finally {
        // Put every global value back as it was.
        const restore = { ...originalSettings };
        delete restore.canManageOrganizationSettings;
        await request.put('/api/admin/settings/', { headers: superHeaders, data: restore });
        for (const original of originalRules) {
          await request.patch(`/api/services/sla-rules/${original.id}/`, {
            headers: superHeaders,
            data: { warning_minutes: original.warning_minutes, overdue_minutes: original.overdue_minutes, is_active: original.is_active, notes: original.notes || '' },
          });
        }
      }
      expect((await getSettings()).holidayDates).toEqual(originalSettings.holidayDates);
    });
  });
}
