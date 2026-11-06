// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on the shared Notifications page (/admin/notifications, /client/notifications),
// for admin, superadmin and client. Real notifications come from new service requests, which
// notify every admin and the client. Checked: a new notification appears without reloading,
// filter tabs, Mark as read, delete one, Mark all as read, Delete all with an error kept inside its
// dialog, and confirmation messages.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
let nextDay = 36;

const accounts = [
  ['admin_test', '/admin/notifications'],
  ['superadmin_test', '/admin/notifications'],
  ['client_test', '/client/notifications'],
];

for (const [username, path] of accounts) {
  test.describe(`Notifications controls as ${username}`, () => {
    test.describe.configure({ timeout: 180000 });

    test(`30 - ${username}: every Notifications control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const clientAuth = loadAuthStateFromBackend('client_test');
      const headers = { Authorization: `Token ${auth.token}` };
      const services = list(await (await request.get('/api/services/service-types/')).json());
      const serviceId = services.find((service) => service.is_active !== false)?.id;
      const newRequest = async () => {
        // Earlier specs can close or fill a day; move on to the next day until one is accepted.
        for (let attempt = 0; attempt < 15; attempt += 1) {
          const response = await request.post('/api/services/service-requests/', {
            headers: { Authorization: `Token ${clientAuth.token}` },
            data: {
              service_type: serviceId, description: `E2E notification ${Date.now()}`, priority: 'Normal',
              location_address: 'Notice Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
              preferred_date: localKey(new Date(Date.now() + (nextDay++) * 86400000)), latitude: '14.2786', longitude: '121.125',
            },
          });
          if (response.ok()) return (await response.json()).id;
          expect(await response.text()).toContain('no appointment availability');
        }
        throw new Error('No bookable day found for the notification test.');
      };
      const mine = async () => list(await (await request.get('/api/notifications/?page_size=200', { headers })).json());

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto(path);
      await expect(page.getByRole('button', { name: /^All/ })).toBeVisible({ timeout: 30000 });

      // ── A new notification appears while the page is open ──
      const firstId = await newRequest();
      const card = (id) => page.locator('div.rounded-lg').filter({ hasText: new RegExp(`#${id}\\b`) }).first();
      await expect(card(firstId)).toBeVisible({ timeout: 30000 });
      const firstNotice = (await mine()).find((n) => String(n.message).includes(`#${firstId}`));

      // ── Tabs ──
      await page.getByRole('button', { name: /^Unread/ }).click();
      await expect(page.getByRole('button', { name: /^Unread/ })).toHaveAttribute('aria-pressed', 'true');
      await expect(card(firstId)).toBeVisible();
      await page.getByRole('button', { name: 'Info', exact: true }).click();
      await expect(card(firstId)).toBeVisible();
      await page.getByRole('button', { name: 'Success', exact: true }).click();
      await expect(card(firstId)).toHaveCount(0);
      await page.getByRole('button', { name: /^All/ }).click();

      // ── Mark as read ──
      await card(firstId).getByRole('button', { name: /^Mark as read: / }).click();
      await expect.poll(async () => (await mine()).find((n) => n.id === firstNotice.id)?.status).toBe('read');
      await expect(card(firstId).getByRole('button', { name: /^Mark as read: / })).toHaveCount(0);

      // ── Delete one ──
      await card(firstId).getByRole('button', { name: /^Delete notification: / }).click();
      await expect(page.getByRole('status')).toContainText('Deleted "');
      await expect(card(firstId)).toHaveCount(0);
      await expect.poll(async () => (await mine()).some((n) => n.id === firstNotice.id)).toBe(false);

      // ── Mark all as read ──
      const secondId = await newRequest();
      await expect(card(secondId)).toBeVisible({ timeout: 30000 });
      await page.getByRole('button', { name: 'Mark all as read' }).click();
      await expect(page.getByRole('status')).toContainText('All notifications marked as read.');
      await expect.poll(async () => (await mine()).filter((n) => n.status === 'unread').length).toBe(0);

      // ── Delete all: a failure stays inside the dialog, then it works ──
      await page.getByRole('button', { name: 'Delete all' }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete all notifications?' });
      await page.route('**/api/notifications/delete_all/', (route) => route.fulfill({ status: 500, json: { detail: 'Could not delete right now.' } }));
      await dialog.getByRole('button', { name: 'Delete all' }).click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await page.unroute('**/api/notifications/delete_all/');
      await dialog.getByRole('button', { name: 'Delete all' }).click();
      await expect(page.getByRole('status')).toContainText('All notifications deleted.');
      await expect.poll(async () => (await mine()).length).toBe(0);
      await expect(page.getByText('No notifications', { exact: true })).toBeVisible();
    });
  });
}
