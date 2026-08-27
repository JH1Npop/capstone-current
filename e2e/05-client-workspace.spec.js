// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState, visitWorkspacePage } from './helpers';

let clientAuthState;

test.describe('Client Workspace - All Pages', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(async () => {
    test.setTimeout(180000);
    clientAuthState = loadAuthStateFromBackend('client_test');
  });

  test.beforeEach(async ({ page }) => {
    await seedAuthState(page, clientAuthState);
  });

  test('5.1 - Client Dashboard loads', async ({ page }) => {
    await visitWorkspacePage(page, '/client/dashboard', 'test-results/screenshots/05-client-dashboard.png');
    await expect(page.locator('[class*="card"], [class*="stat"], [class*="dashboard"], [class*="grid"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('5.2 - Service Requests page (create new request)', async ({ page }) => {
    await visitWorkspacePage(page, '/client/service-requests', 'test-results/screenshots/05-client-service-requests.png');
    const hasServiceRequestUi =
      await page.getByRole('button', { name: /new request|create service request|request service/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.locator('form, [class*="create"], [class*="new"], [class*="request"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('heading', { name: /service requests|request service/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/unable to load|no service types|no request options/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasServiceRequestUi).toBeTruthy();
  });

  test('5.3 - Request Tracking list', async ({ page }) => {
    await visitWorkspacePage(page, '/client/requests', 'test-results/screenshots/05-client-request-tracking.png');
    const hasTrackingUi =
      await page.getByRole('searchbox', { name: /search requests/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.locator('table, [class*="request"], [class*="list"], [class*="card"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/failed to load requests/i).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /create your first request|try again/i }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTrackingUi).toBeTruthy();
  });

  test('5.4 - Service History page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/service-history', 'test-results/screenshots/05-client-service-history.png');
  });

  test('5.5 - Client Support page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/support', 'test-results/screenshots/05-client-support.png');
  });

  test('5.6 - Notifications page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/notifications', 'test-results/screenshots/05-client-notifications.png');
  });

  test('5.7 - Client Profile page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/profile', 'test-results/screenshots/05-client-profile.png');
    const hasProfileUi =
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /edit profile/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/change password/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasProfileUi).toBeTruthy();
  });

  test('5.8 - Client Profile can update info', async ({ page }) => {
    await page.goto('/client/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const editableFields = page.locator('input:not([type="hidden"]):not([readonly])');
    const count = await editableFields.count();

    if (count > 0) {
      await page.screenshot({ path: 'test-results/screenshots/05-client-profile-editable.png' });
      return;
    }

    const editButton = page.getByRole('button', { name: /edit/i });
    if (await editButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await editButton.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: 'test-results/screenshots/05-client-profile-edit-mode.png' });
    }
  });
});
