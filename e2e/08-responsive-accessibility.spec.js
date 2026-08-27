// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectKeyboardFocus(page) {
  let focused = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => {
      const active = document.activeElement;
      return Boolean(active && active !== document.body && active !== document.documentElement);
    });
    if (focused) break;
  }
  expect(focused).toBeTruthy();
}

test.describe('Responsive and keyboard smoke coverage', () => {
  test.describe.configure({ timeout: 120000 });

  test.use({ viewport: MOBILE_VIEWPORT });

  test('public login is usable without horizontal overflow', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectKeyboardFocus(page);
  });

  for (const workspace of [
    { role: 'admin', username: 'superadmin_test', path: '/admin/dashboard' },
    { role: 'technician', username: 'tech_test', path: '/technician/dashboard' },
    { role: 'client', username: 'client_test', path: '/client/dashboard' },
  ]) {
    test(`${workspace.role} dashboard fits a mobile viewport`, async ({ page }) => {
      const authState = loadAuthStateFromBackend(workspace.username);
      await seedAuthState(page, authState);
      await page.goto(workspace.path);
      await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
      await expectNoHorizontalOverflow(page);
      await expectKeyboardFocus(page);
    });
  }
});
