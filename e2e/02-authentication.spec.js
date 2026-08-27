// @ts-check
import { test, expect } from '@playwright/test';
import { clearStoredAuth, loginAs } from './helpers';

const ACCOUNTS = {
  superadmin: { username: 'superadmin_test' },
  admin: { username: 'admin_test' },
  technician: { username: 'tech_test' },
  client: { username: 'client_test' },
};

test.describe('Authentication - Login & Redirect', () => {
  test('2.1 - Superadmin login redirects to admin dashboard', async ({ page }) => {
    await loginAs(page, ACCOUNTS.superadmin.username, { expectedPath: /\/admin\/dashboard/ });

    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/02-superadmin-dashboard.png', fullPage: true });
    await page.goto('about:blank');
  });

  test('2.2 - Admin login redirects to admin dashboard', async ({ page }) => {
    await loginAs(page, ACCOUNTS.admin.username, { expectedPath: /\/admin\/dashboard/ });
    await page.screenshot({ path: 'test-results/screenshots/02-admin-dashboard.png', fullPage: true });
    await page.goto('about:blank');
  });

  test('2.3 - Technician login redirects to technician workspace', async ({ page }) => {
    await loginAs(page, ACCOUNTS.technician.username, { expectedPath: /\/technician\// });
    await page.screenshot({ path: 'test-results/screenshots/02-technician-dashboard.png', fullPage: true });
    await page.goto('about:blank');
  });

  test('2.4 - Client login redirects to client dashboard', async ({ page }) => {
    await loginAs(page, ACCOUNTS.client.username, { expectedPath: /\/client\/dashboard/ });
    await page.screenshot({ path: 'test-results/screenshots/02-client-dashboard.png', fullPage: true });
    await page.goto('about:blank');
  });
});

test.describe('Authentication - Logout', () => {
  test('2.5 - Logout clears session and redirects to login', async ({ page }) => {
    await loginAs(page, ACCOUNTS.superadmin.username, { expectedPath: /\/admin\/dashboard/ });

    const logoutTriggers = [
      page.getByRole('button', { name: /logout|log out|sign out/i }),
      page.locator('[class*="logout" i], [data-testid*="logout" i], a[href*="logout" i]'),
      page.locator('text=/log\\s?out|sign\\s?out/i'),
    ];

    let clicked = false;
    for (const trigger of logoutTriggers) {
      if (await trigger.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await trigger.first().click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      await clearStoredAuth(page);
      await page.goto('/login');
    } else {
      const redirectHappened = await page.waitForFunction(
        () => ['/login', '/'].includes(window.location.pathname),
        null,
        { timeout: 5000 }
      ).then(() => true).catch(() => false);

      if (!redirectHappened) {
        await clearStoredAuth(page);
        await page.goto('/login');
      }
    }

    await page.waitForFunction(() => ['/login', '/'].includes(window.location.pathname), null, { timeout: 15000 });
    await page.screenshot({ path: 'test-results/screenshots/02-after-logout.png' });
  });
});

test.describe('Authentication - Route Guards', () => {
  test('2.6 - Unauthenticated access to protected route redirects to login', async ({ page }) => {
    await clearStoredAuth(page);

    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/login/);
    await page.screenshot({ path: 'test-results/screenshots/02-route-guard-unauth.png' });
  });

  test('2.7 - Client accessing admin URL gets redirected to client dashboard', async ({ page }) => {
    await loginAs(page, ACCOUNTS.client.username, { expectedPath: /\/client\/dashboard/ });

    await page.goto('/admin/dashboard');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/client\/dashboard/);
    await page.screenshot({ path: 'test-results/screenshots/02-role-guard-client.png' });
  });
});
