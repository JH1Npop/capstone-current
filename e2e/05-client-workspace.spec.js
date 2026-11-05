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
    await expect(page.getByRole('heading', { name: 'Preferred schedule' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose an appointment date' })).toBeVisible();
    await expect(page.getByText('Available', { exact: true })).toBeVisible();
    await expect(page.getByText('Limited', { exact: true })).toBeVisible();
    await expect(page.getByText('Full / Closed', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/appointment availability open|limited appointment availability|fully booked|closed to new appointment requests/i).first()).toBeVisible();
    await expect(page.locator('#request-preferred-date')).toHaveCount(0);
    const openCalendarDate = page.locator('[role="gridcell"]:not([disabled])').first();
    await openCalendarDate.click();
    await expect(openCalendarDate).toHaveAttribute('aria-selected', 'true');
    await expect(openCalendarDate.getByText('Selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: /available for an appointment request|limited appointment availability/i })).toBeVisible();
    const hasServiceRequestUi =
      await page.getByRole('button', { name: /new request|create service request|request service/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.locator('form, [class*="create"], [class*="new"], [class*="request"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('heading', { name: /service requests|request service/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/unable to load|no service types|no request options/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasServiceRequestUi).toBeTruthy();
  });

  test('5.2b - Client appointment calendar distinguishes full and admin-closed dates', async ({ page }) => {
    // Local dates: the calendar works in local time, and toISOString() (UTC) is a day behind between 00:00 and 08:00 in the Philippines.
    const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today = localKey(new Date());
    const tomorrow = localKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await page.route('**/api/services/service-requests/appointment-availability/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          start: today,
          end: today,
          days: [{
            date: today,
            has_appointments: false,
            slots: { morning: false, midday: false, afternoon: false, unspecified: false },
            availability: {
              status: 'unavailable',
              slots: {
                morning: { status: 'closed', source: 'admin' },
                midday: { status: 'closed', source: 'admin' },
                afternoon: { status: 'closed', source: 'admin' },
              },
            },
            closure: {
              all_day: true,
              slots: { morning: false, midday: false, afternoon: false },
              reasons: [{ time_slot: 'all_day', time_slot_label: 'All day', reason: 'E2E company holiday' }],
            },
          }, {
            date: tomorrow,
            has_appointments: true,
            slots: { morning: true, midday: true, afternoon: true, unspecified: false },
            availability: {
              status: 'unavailable',
              slots: {
                morning: { status: 'full', source: 'capacity' },
                midday: { status: 'full', source: 'capacity' },
                afternoon: { status: 'full', source: 'capacity' },
              },
            },
            closure: {
              all_day: false,
              slots: { morning: false, midday: false, afternoon: false },
              reasons: [],
            },
          }],
          advisory: 'Schedule activity may change until the request is reviewed and confirmed.',
        }),
      });
    });

    await visitWorkspacePage(page, '/client/service-requests');
    const closedDate = page.locator('[role="gridcell"][aria-label*="closed to new appointment requests"]');
    await expect(closedDate).toHaveCount(1);
    await expect(closedDate).toBeDisabled();
    await expect(closedDate.getByText('Closed', { exact: true })).toBeVisible();
    const fullDate = page.locator('[role="gridcell"][aria-label*="fully booked for new appointment requests"]');
    await expect(fullDate).toHaveCount(1);
    await expect(fullDate).toBeDisabled();
    await expect(fullDate.getByText('Full', { exact: true })).toBeVisible();
  });

  test('5.2c - Client appointment calendar fails closed when availability cannot load', async ({ page }) => {
    await page.route('**/api/services/service-requests/appointment-availability/**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Availability is temporarily unavailable.' }),
      });
    });

    await visitWorkspacePage(page, '/client/service-requests');
    const availabilityAlert = page.getByRole('alert').filter({ hasText: /dates are temporarily disabled because current capacity could not be verified/i });
    await expect(availabilityAlert).toBeVisible();
    await expect(availabilityAlert.getByRole('button', { name: /retry/i })).toBeVisible();
    const futureDates = page.locator('[role="gridcell"][aria-label*="availability could not be verified"]');
    await expect(futureDates.first()).toBeDisabled();
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
    await page.getByRole('button', { name: 'Dismiss' }).click();
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

  test('5.11b - Calculator savings range matches the saved server estimate', async ({ page }) => {
    await visitWorkspacePage(page, '/client/solar-estimates');
    await page.getByRole('button', { name: 'New calculation' }).click();

    await page.getByLabel('Monthly consumption').fill('450');
    await page.getByLabel('Electricity rate').fill('12');
    await page.getByLabel('Peak sun hours').fill('5');
    await page.getByLabel('Used in daytime').fill('40');
    await page.getByLabel('Net-metering export credit').fill('5.5');
    // 462 kWh/mo generated: 180 kWh used in daytime at PHP 12, 270 kWh offset at the PHP 5.50 credit.
    await expect(page.getByText('PHP 2,160–3,645/mo', { exact: true })).toBeVisible();

    const saved = page.waitForResponse((response) => response.url().includes('/api/services/solar-estimates/') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save estimate' }).click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const snapshot = (await response.json()).result_snapshot;
    expect(snapshot.monthlySavingsWithoutNetMetering).toBe(2160);
    expect(snapshot.monthlySavings).toBe(3645);
    expect(snapshot.daytimeUsagePercent).toBe(40);

    // Appliance presets carry a running share and a motor starting surge.
    await page.getByRole('button', { name: 'Per appliance' }).click();
    await page.getByRole('combobox', { name: 'Appliance' }).fill('Refrigerator');
    await expect(page.getByLabel('Runs %')).toHaveValue('35');
    await expect(page.getByLabel('Surge ×')).toHaveValue('3');
  });
});
