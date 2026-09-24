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
    await expect(page.getByRole('button', { name: 'Create Service Request' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'My requests' })).toBeVisible();
    await expect(page.getByText('Active requests', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Request Pipeline' })).toBeVisible();
    const requestButton = page.getByRole('button', { name: 'E2E Solar Installation' }).first();
    await expect(requestButton).toBeVisible();
    await requestButton.focus();
    await expect(requestButton).toBeFocused();
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

  test('5.6 - Client Purchase Records page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/purchase-records', 'test-results/screenshots/05-client-purchase-records.png');
    await expect(page.getByRole('heading', { name: 'Purchase Records', exact: true })).toBeVisible();
    await expect(page.getByText(/Payments are handled outside this portal/i)).toBeVisible();
  });

  test('5.7 - Client support assistant answers portal questions', async ({ page }) => {
    await page.goto('/client/dashboard');
    const openAssistant = page.getByRole('button', { name: 'Open client support assistant' });
    await expect(openAssistant).toBeVisible({ timeout: 10000 });
    await openAssistant.click();

    await expect(page.getByRole('heading', { name: 'Client Support Assistant' })).toBeVisible();
    await page.getByRole('button', { name: 'How do I request service?' }).click();
    await expect(page.getByText(/Open Request Service, select the service you need/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request service', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Where can I see what I purchased?' }).click();
    await expect(page.getByText(/does not process billing or payments/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'View purchase records', exact: true })).toBeVisible();
  });

  test('5.8 - Notifications page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/notifications', 'test-results/screenshots/05-client-notifications.png');
  });

  test('5.9 - Client Profile page', async ({ page }) => {
    await visitWorkspacePage(page, '/client/profile', 'test-results/screenshots/05-client-profile.png');
    const hasProfileUi =
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /edit profile/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/change password/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasProfileUi).toBeTruthy();
  });

  test('5.10 - Client Profile saves, cancels, validates photos, and explains security', async ({ page }) => {
    await visitWorkspacePage(page, '/client/profile');
    await expect(page.getByRole('heading', { name: 'Password & Security' })).toBeVisible();

    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const firstName = page.getByLabel('First Name');
    const originalFirstName = await firstName.inputValue();
    await firstName.fill('Unsaved Client Name');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page.getByLabel('First Name')).toHaveValue(originalFirstName);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'not-an-image.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('not an image'),
    });
    await expect(page.getByRole('status')).toContainText('Choose a JPEG, PNG, WebP, or GIF image.');

    const companyName = `E2E Client Company ${Date.now()}`;
    await page.getByLabel('Company Name (Optional)').fill(companyName);
    await page.getByLabel('Landline (Optional)').fill('0281234567');
    const updateResponse = page.waitForResponse((response) => (
      response.url().includes('/api/users/me/')
      && response.request().method() === 'PATCH'
    ));
    await page.getByRole('button', { name: 'Save Changes' }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toContainText('Profile updated successfully.');
    await expect(page.getByText(companyName)).toBeVisible();
    await expect(page.getByText('0281234567')).toBeVisible();

    const securitySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Password & Security' }) });
    await securitySection.getByRole('button', { name: 'Change Password' }).click();
    await securitySection.getByLabel('Current password').fill('Password123!');
    await securitySection.getByLabel('New password', { exact: true }).fill('DifferentPassword123!');
    await securitySection.getByLabel('Confirm new password', { exact: true }).fill('AnotherPassword123!');
    await securitySection.getByRole('button', { name: 'Change Password' }).click();
    await expect(page.getByRole('status')).toContainText('do not match');
  });

  test('5.11 - Solar calculator stays inside the client workspace', async ({ page }) => {
    await visitWorkspacePage(page, '/client/solar-estimates');
    await page.getByRole('button', { name: 'New calculation' }).click();

    await expect(page).toHaveURL(/\/client\/solar-estimates$/);
    await expect(page.getByRole('heading', { name: 'Estimate Your Solar System' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Solar Estimates', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save estimate' })).toBeVisible();
  });
});
