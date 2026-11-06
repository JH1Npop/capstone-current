// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/activity-logs, for admin and superadmin. Checked: the Action and System
// area filters list every kind the log really contains and each action filter returns exactly the
// events shown with that action (it used to filter the stored value, not the shown one), the
// Needs attention card filters, date limits, search, details and Copy event ID, paging, CSV export,
// and a failed load with Try again.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

let nextDay = 3;

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Activity logs controls as ${username}`, () => {
    test.describe.configure({ timeout: 240000 });

    test(`34 - ${username}: every Activity Logs control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const headers = { Authorization: `Token ${auth.token}` };

      // Enough events to need a second page: every new service request is recorded.
      const clientHeaders = { Authorization: `Token ${loadAuthStateFromBackend('client_test').token}` };
      const serviceId = list(await (await request.get('/api/services/service-types/')).json()).find((service) => service.is_active !== false)?.id;
      for (let index = 0; index < 11; index += 1) {
        // A day can be closed or full from earlier specs; move on until the server accepts one.
        let accepted = false;
        for (let attempt = 0; attempt < 15 && !accepted; attempt += 1) {
          const created = await request.post('/api/services/service-requests/', {
            headers: clientHeaders,
            data: {
              service_type: serviceId, description: `E2E activity ${username} ${index}`, priority: 'Normal',
              location_address: 'Log Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
              preferred_date: localKey(new Date(Date.now() + (nextDay++) * 86400000)), latitude: '14.2786', longitude: '121.125',
            },
          });
          accepted = created.ok();
          if (!accepted) expect(await created.text()).toContain('no appointment availability');
        }
        expect(accepted).toBeTruthy();
      }
      const facets = await (await request.get('/api/admin/activity-logs/facets/', { headers })).json();
      const total = (await (await request.get('/api/admin/activity-logs/summary/', { headers })).json()).total;
      expect(total).toBeGreaterThan(10);

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);

      // ── A failed load shows an alert with Try again ──
      await page.route('**/api/admin/activity-logs/?*', (route) => route.fulfill({ status: 500, json: { detail: 'Logs are unavailable.' } }), { times: 1 });
      await page.goto('/admin/activity-logs');
      await expect(page.getByRole('alert')).toContainText('Unable to load activity logs', { timeout: 30000 });
      await page.getByRole('button', { name: 'Try again' }).click();
      await expect(page.locator('article').first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('alert')).toHaveCount(0);

      // ── Summary cards: one colour, and Needs attention is a filter ──
      const attention = page.getByRole('button', { name: /Needs attention/ });
      await expect(attention).toHaveAttribute('aria-pressed', 'false');
      await page.getByRole('button', { name: /^Filters/ }).click();
      const actionSelect = page.getByRole('combobox', { name: 'Action type' });
      const categorySelect = page.getByRole('combobox', { name: 'System area' });
      await attention.click();
      await expect(attention).toHaveAttribute('aria-pressed', 'true');
      await expect(actionSelect).toHaveValue('error');
      await attention.click();
      await expect(actionSelect).toHaveValue('');

      // ── Both filters list every recorded kind ──
      const optionValues = async (select) => (await select.locator('option').evaluateAll((options) => options.map((option) => option.value))).filter(Boolean);
      expect((await optionValues(actionSelect)).sort()).toEqual([...facets.actions].sort());
      expect(await optionValues(categorySelect)).toEqual(expect.arrayContaining(facets.categories));

      // ── Each action filter returns exactly the events shown with that action ──
      const apiList = async (query) => (await (await request.get(`/api/admin/activity-logs/?page_size=100&${query}`, { headers })).json());
      for (const action of facets.actions) {
        const expected = await apiList(`action=${action}`);
        expect(list(expected).every((row) => row.action === action), `rows for ${action}`).toBeTruthy();
        const responded = page.waitForResponse((response) => response.url().includes('/api/admin/activity-logs/summary/') && response.url().includes(`action=${action}`));
        await actionSelect.selectOption(action);
        const summary = await (await responded).json();
        expect(summary.total, `total for ${action}`).toBe(expected.count);
        if (expected.count === 0) await expect(page.getByText('No activity logs match the current filters.')).toBeVisible();
      }
      await actionSelect.selectOption('');

      // Requests recorded above are filterable by system area as well.
      await categorySelect.selectOption('requests');
      await expect(page.locator('article').first()).toBeVisible();
      await expect(page.locator('article').first().getByText('Requests', { exact: true })).toBeVisible();
      await categorySelect.selectOption('');

      // ── Date limits: no future dates, and From cannot pass To ──
      const today = localKey(new Date());
      await expect(page.getByLabel('From date', { exact: true })).toHaveAttribute('max', today);
      await expect(page.getByLabel('To date', { exact: true })).toHaveAttribute('max', today);
      await page.getByLabel('To date', { exact: true }).fill(today);
      await expect(page.getByLabel('From date', { exact: true })).toHaveAttribute('max', today);
      await expect(page.getByLabel('To date', { exact: true })).toHaveValue(today);
      await page.getByLabel('From date', { exact: true }).fill('2000-01-01');
      await expect(page.getByLabel('To date', { exact: true })).toHaveAttribute('min', '2000-01-01');
      await page.getByLabel('From date', { exact: true }).fill('');
      await page.getByLabel('To date', { exact: true }).fill('');

      // ── Search ──
      const search = page.getByRole('searchbox', { name: 'Find an activity' });
      await search.fill('zzz-no-such-event');
      await expect(page.getByText('No activity logs match the current filters.')).toBeVisible();
      await search.fill('');
      await expect(page.locator('article').first()).toBeVisible();

      // ── Details are named per event and Copy event ID confirms, then clears ──
      const first = page.locator('article').first();
      const eventId = (await first.getByRole('button', { name: /^View details for ACT-/ }).getAttribute('aria-label')).match(/ACT-\d+/)[0];
      await first.getByRole('button', { name: `View details for ${eventId}` }).click();
      await expect(first.getByRole('button', { name: `Hide details for ${eventId}` })).toHaveAttribute('aria-expanded', 'true');
      await expect(first.getByText('Technical Context')).toBeVisible();
      await first.getByRole('button', { name: 'Copy event ID' }).click();
      await expect(page.getByRole('status').filter({ hasText: eventId })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: eventId })).toHaveCount(0, { timeout: 12000 });
      await first.getByRole('button', { name: `Hide details for ${eventId}` }).click();

      // ── Paging ──
      const pageLabel = page.getByText(/^Page \d+ of \d+$/);
      await expect(pageLabel).toContainText('Page 1 of');
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(pageLabel).toContainText('Page 2 of');
      await expect(page.getByText(/^Showing 11-/)).toBeVisible();
      await page.getByRole('button', { name: 'Previous', exact: true }).click();
      await expect(pageLabel).toContainText('Page 1 of');

      // ── CSV export ──
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      expect((await download).suggestedFilename()).toMatch(/^activity-logs-\d{4}-\d{2}-\d{2}\.csv$/);
      await expect(page.getByRole('status')).toContainText('Exported activity-logs-');
    });
  });
}
