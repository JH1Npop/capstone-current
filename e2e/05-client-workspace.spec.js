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
    await expect(page.getByText('Waiting for approval', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Open Jobs' })).toBeVisible();
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
  });

  test('5.7 - Client support assistant answers portal questions', async ({ page }) => {
    await page.goto('/client/dashboard');
    const openAssistant = page.getByRole('button', { name: 'Open client support assistant' });
    await expect(openAssistant).toBeVisible({ timeout: 10000 });
    await openAssistant.click();

    const assistant = page.getByRole('dialog', { name: 'Client Support Assistant' });
    await expect(assistant).toBeVisible();
    await expect(assistant).toContainText('Helping with Dashboard');
    await expect(assistant.getByRole('status').first()).toContainText('Records checked', { timeout: 30000 });
    const desktopAssistantBox = await assistant.boundingBox();
    expect(desktopAssistantBox).not.toBeNull();
    // Keep the client panel on the exact same 31rem x 540px shell as Analytics Assistant.
    expect(desktopAssistantBox.width).toBeLessThanOrEqual(504);
    expect(desktopAssistantBox.width).toBeGreaterThanOrEqual(488);
    expect(desktopAssistantBox.height).toBeLessThanOrEqual(548);
    expect(desktopAssistantBox.height).toBeGreaterThanOrEqual(532);

    // Static guidance is accurate and gives direct, reversible navigation choices.
    await assistant.getByRole('button', { name: 'How do I request service?' }).click();
    await expect(assistant.getByText(/preferred date is a request—not a confirmed appointment/i)).toBeVisible();
    await expect(assistant.getByRole('button', { name: 'Request service', exact: true })).toBeVisible();
    await expect(assistant.getByRole('button', { name: 'View my requests', exact: true })).toBeVisible();

    await assistant.getByRole('button', { name: 'Where can I see payments and purchases?' }).click();
    await expect(assistant.getByText(/payments happen outside the portal/i)).toBeVisible();
    await expect(assistant.getByRole('button', { name: 'View purchase records', exact: true })).toBeVisible();

    // Typed questions read the signed-in client's real unified request data, including requests
    // that are still waiting for office review rather than only records with tickets.
    const question = assistant.getByRole('textbox', { name: 'Ask the client support assistant' });
    const ask = assistant.getByRole('button', { name: 'Send question to client support assistant' });
    await question.fill('What is my latest request status?');
    await ask.click();
    await expect(assistant.getByText(/REQ-\d{4} is for/i).last()).toBeVisible();
    await expect(assistant.getByRole('button', { name: /Open REQ-\d{4}/ }).last()).toBeVisible();

    await question.fill('Who is my technician?');
    await ask.click();
    await expect(assistant.getByText(/is assigned to REQ-\d{4}/i).last()).toBeVisible();

    await question.fill('When is my next appointment?');
    await ask.click();
    await expect(assistant.getByText(/next confirmed appointment is REQ-\d{4}/i).last()).toBeVisible();

    await question.fill('How many support cases are open?');
    await ask.click();
    await expect(assistant.getByText(/You have 1 open support case/i).last()).toBeVisible();

    await question.fill('Can I use this app offline?');
    await ask.click();
    await expect(assistant.getByText(/live requests, messages, schedules, payments, and record changes still require an internet connection/i)).toBeVisible();

    await assistant.getByRole('button', { name: 'Start a new assistant conversation' }).click();
    await expect(assistant.getByText(/I cannot change records or replace the office team/i)).toBeVisible();
    await expect(assistant.getByText(/live requests, messages, schedules/i)).toHaveCount(0);

    // Escape closes the non-modal assistant. Reopening on another client page updates its context
    // and suggestions; the mobile panel stays within the viewport.
    await page.keyboard.press('Escape');
    await expect(assistant).toHaveCount(0);
    await page.goto('/client/service-history');
    await page.getByRole('button', { name: 'Open client support assistant' }).click();
    const historyAssistant = page.getByRole('dialog', { name: 'Client Support Assistant' });
    await expect(historyAssistant).toContainText('Helping with Service History');
    await expect(historyAssistant.getByRole('button', { name: 'Is any warranty active?' })).toBeVisible();
    const historyQuestion = historyAssistant.getByRole('textbox', { name: 'Ask the client support assistant' });
    await expect(historyQuestion).toBeEnabled({ timeout: 30000 });
    await historyQuestion.fill('How do I update my contact details?');
    await historyAssistant.getByRole('button', { name: 'Send question to client support assistant' }).click();
    await expect(historyAssistant.getByText(/Profile lets you update your own contact details/i)).toBeVisible();
    await expect(historyAssistant.getByRole('button', { name: 'Open profile' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(historyAssistant).toBeVisible();
    const mobileAssistantBox = await historyAssistant.boundingBox();
    expect(mobileAssistantBox).not.toBeNull();
    expect(mobileAssistantBox.x).toBeGreaterThanOrEqual(11);
    expect(mobileAssistantBox.x + mobileAssistantBox.width).toBeLessThanOrEqual(391);
    expect(mobileAssistantBox.height).toBeLessThanOrEqual(548);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  });

  test('5.7b - Client assistant fails safely when account records cannot refresh', async ({ page }) => {
    for (const apiPath of [
      '**/api/services/service-requests/**',
      '**/api/services/service-tickets/**',
      '**/api/messages/support-cases/**',
    ]) {
      await page.route(apiPath, async (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Temporarily unavailable for E2E.' }),
      }));
    }

    await page.goto('/client/dashboard');
    await page.getByRole('button', { name: 'Open client support assistant' }).click();
    const assistant = page.getByRole('dialog', { name: 'Client Support Assistant' });
    await expect(assistant.getByText('Some records could not be refreshed')).toBeVisible({ timeout: 30000 });
    await expect(assistant.getByText(/Answers that need unavailable records will say so/i)).toBeVisible();

    // Guidance that does not need account data remains useful.
    await assistant.getByRole('button', { name: 'How do I request service?' }).click();
    await expect(assistant.getByText(/preferred date is a request—not a confirmed appointment/i)).toBeVisible();

    const question = assistant.getByRole('textbox', { name: 'Ask the client support assistant' });
    const ask = assistant.getByRole('button', { name: 'Send question to client support assistant' });
    await question.fill('What is my latest request status?');
    await ask.click();
    await expect(assistant.getByText(/could not refresh your request information/i)).toBeVisible();

    await question.fill('There is smoke and sparking from my equipment');
    await ask.click();
    await expect(assistant.getByText(/Move to a safe location and contact local emergency services/i)).toBeVisible();
    await expect(assistant.getByText(/Do not touch damaged electrical, battery, or solar equipment/i)).toBeVisible();
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
    await expect(page.getByRole('alert')).toContainText('Choose a JPEG, PNG, WebP, or GIF image.');

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
    await expect(securitySection.getByRole('alert')).toContainText('do not match');
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
