// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState, visitWorkspacePage } from './helpers';

let technicianAuthState;

test.describe('Technician Workspace - All Pages', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(async () => {
    test.setTimeout(180000);
    technicianAuthState = loadAuthStateFromBackend('tech_test');
  });

  test.beforeEach(async ({ page }) => {
    await seedAuthState(page, technicianAuthState);
  });

  test('4.1 - Technician Dashboard loads', async ({ page }) => {
    let notificationListRequests = 0;
    let unreadCountRequests = 0;
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() !== 'GET') return;
      if (url.pathname === '/api/notifications/') notificationListRequests += 1;
      if (url.pathname === '/api/notifications/unread_count/') unreadCountRequests += 1;
    });
    await page.addInitScript(() => {
      window.__dashboardGeolocationCalls = { current: 0, watch: 0 };
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          clearWatch: () => {},
          getCurrentPosition: (success) => {
            window.__dashboardGeolocationCalls.current += 1;
            success({
              coords: { latitude: 14.5995, longitude: 120.9842, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
              timestamp: Date.now(),
            });
          },
          watchPosition: (success) => {
            window.__dashboardGeolocationCalls.watch += 1;
            success({
              coords: { latitude: 14.5995, longitude: 120.9842, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
              timestamp: Date.now(),
            });
            return 1;
          },
        },
      });
    });
    await visitWorkspacePage(page, '/technician/dashboard', 'test-results/screenshots/04-tech-dashboard.png');
    await expect(page.getByText('Current Focus')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Live Tracking' })).toBeVisible();
    const startSharing = page.getByRole('button', { name: 'Start location sharing' });
    await expect(startSharing).toBeVisible();
    expect(await page.evaluate(() => window.__dashboardGeolocationCalls)).toEqual({ current: 0, watch: 0 });
    await startSharing.click();
    await expect(page.getByText('Location sharing is on for this dashboard session.')).toBeVisible();
    await expect(page.getByText('GPS Active')).toBeVisible();
    expect(await page.evaluate(() => window.__dashboardGeolocationCalls)).toEqual({ current: 1, watch: 1 });
    expect(notificationListRequests).toBeGreaterThan(0);
    expect(notificationListRequests).toBeLessThanOrEqual(2);
    expect(unreadCountRequests).toBeGreaterThan(0);
    expect(unreadCountRequests).toBeLessThanOrEqual(2);
  });

  test('4.2 - My Jobs list loads', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/my-jobs', 'test-results/screenshots/04-tech-my-jobs.png');
    await expect(page.getByRole('heading', { name: /Active Jobs \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Details', exact: true }).first()).toBeVisible();
    const detailsCount = await page.getByRole('button', { name: 'Details', exact: true }).count();
    await expect(page.getByRole('link', { name: 'Navigate', exact: true })).toHaveCount(detailsCount);
    await page.getByRole('button', { name: 'Details', exact: true }).first().click();
    await expect(page.getByText('Scheduled Time', { exact: true })).toBeVisible();
    await expect(page.getByText('Estimated Duration', { exact: true })).toBeVisible();
    await expect(page.getByText('Job Scope', { exact: true })).toBeVisible();
    await expect(page.getByRole('main').getByText('Checklist', { exact: true })).toBeVisible();
  });

  test('4.3 - Schedule view renders', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/schedule', 'test-results/screenshots/04-tech-schedule.png');
  });

  test('4.4 - Map Navigation loads', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/map-navigation', 'test-results/screenshots/04-tech-map-navigation.png');
    const hasNavigationUi =
      await page.locator('[class*="leaflet"], [class*="map"], .leaflet-container').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('heading', { name: /navigation needs a selected ticket|navigation/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/open a job first/i).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('link', { name: /go to my jobs/i }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasNavigationUi).toBeTruthy();
  });

  test('4.4b - Navigation explains policy and waits for explicit location sharing', async ({ page }) => {
    await page.addInitScript(() => {
      window.__technicianWatchCalls = 0;
      if (navigator.geolocation?.watchPosition) {
        const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
        navigator.geolocation.watchPosition = (...args) => {
          window.__technicianWatchCalls += 1;
          return originalWatchPosition(...args);
        };
      }
    });
    await page.goto('/technician/my-jobs');
    const ticketId = await page.evaluate(async () => {
      const token = sessionStorage.getItem('afn_token');
      const response = await fetch('/api/technician/jobs/', { headers: { Authorization: `Token ${token}` } });
      const payload = await response.json();
      const jobs = Array.isArray(payload) ? payload : payload.results || [];
      return jobs.find((job) => job.status !== 'Completed')?.id;
    });
    expect(ticketId).toBeTruthy();

    let routeRequests = 0;
    let navigationStartRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/services/ors/route/')) routeRequests += 1;
      if (request.url().includes('/start-navigation/')) navigationStartRequests += 1;
    });

    await visitWorkspacePage(page, `/technician/map-navigation?ticketId=${ticketId}`);
    await expect(page.getByText('Location sharing policy')).toBeVisible();
    await expect(page.getByText(/History is retained for up to 30 days/)).toBeVisible();
    await expect(page.getByText(/Location sharing off.*CALABARZON/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start location sharing' })).toBeVisible();
    expect(await page.evaluate(() => window.__technicianWatchCalls)).toBe(0);
    expect(routeRequests).toBe(0);
    expect(navigationStartRequests).toBe(0);
    await expect(page.getByText('Start location sharing to calculate directions.')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/04-tech-navigation-location-policy.png', fullPage: true });
  });

  test('4.5 - Service Checklist form', async ({ page }) => {
    await page.goto('/technician/my-jobs');
    const ticketId = await page.evaluate(async () => {
      const token = sessionStorage.getItem('afn_token');
      const response = await fetch('/api/technician/jobs/', { headers: { Authorization: `Token ${token}` } });
      const payload = await response.json();
      const jobs = Array.isArray(payload) ? payload : payload.results || [];
      return jobs.find((job) => (job.ticket_type || 'installation') !== 'inspection' && job.status !== 'Completed')?.id;
    });
    expect(ticketId).toBeTruthy();
    await visitWorkspacePage(page, `/technician/checklist?ticketId=${ticketId}`, 'test-results/screenshots/04-tech-checklist.png');
    await expect(page.getByRole('heading', { name: 'Complete the work steps' })).toBeVisible();
    await expect(page.getByText('E2E Solar Installation procedures', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E Electrical Safety Check procedures', { exact: true })).toBeVisible();
    await expect(page.getByText('Photo required', { exact: true })).toHaveCount(2);
  });

  test('4.6 - Inspection Checklist form', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/technician/my-jobs');
    const ticketId = await page.evaluate(async () => {
      const token = sessionStorage.getItem('afn_token');
      const response = await fetch('/api/technician/jobs/', { headers: { Authorization: `Token ${token}` } });
      const payload = await response.json();
      const jobs = Array.isArray(payload) ? payload : payload.results || [];
      return jobs.find((job) => job.ticket_type === 'inspection')?.id;
    });
    expect(ticketId).toBeTruthy();
    await visitWorkspacePage(page, `/technician/inspection-checklist?ticketId=${ticketId}`, 'test-results/screenshots/04-tech-inspection-checklist.png');
    await expect(page.getByRole('heading', { name: 'Answer every check' })).toBeVisible();
    await page.getByRole('button', { name: 'Review and complete inspection' }).click();
    await expect(page.getByText('Review the highlighted items before completing the inspection.')).toBeVisible();
    await expect(page.getByText('Choose Yes or No.')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Review and complete inspection' })).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/04-tech-inspection-checklist-mobile.png', fullPage: true });
    for (const yesButton of await page.getByRole('button', { name: 'Yes', exact: true }).all()) {
      await yesButton.click();
    }
    await page.getByRole('button', { name: /Ready for service/ }).click();
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'inspection-site.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
    await page.getByRole('button', { name: 'Review and complete inspection' }).click();
    await expect(page.getByText('Inspection submitted successfully.')).toBeVisible();
  });

  test('4.7 - Messages / Chat interface', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/messages', 'test-results/screenshots/04-tech-messages.png');
  });

  test('4.8 - Job History loads', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/job-history', 'test-results/screenshots/04-tech-job-history.png');
    await expect(page.getByText(/Showing 1 of 1 completed job/)).toBeVisible();
    await page.getByRole('button', { name: 'TKT-0001', exact: true }).click();
    const details = page.getByRole('dialog', { name: /E2E Solar Installation/i });
    await expect(details).toBeVisible();
    await expect(details.getByText('Actual Duration')).toBeVisible();
    await expect(details.getByRole('button', { name: 'Download Work Summary' })).toBeVisible();
    await expect(details.getByText('Close details', { exact: true })).toBeVisible();

    await details.getByRole('button', { name: 'Submit return' }).click();
    const returnDialog = page.getByRole('dialog', { name: /Submit equipment return/i });
    await expect(returnDialog).toBeVisible();
    await returnDialog.getByLabel('Quantity returned').fill('1');
    await returnDialog.getByLabel('Condition you observed').selectOption('usable');
    await returnDialog.getByLabel('Technician return note').fill('One opened but unused safety kit returned after the job.');
    const submitResponsePromise = page.waitForResponse((response) => (
      response.url().includes('/equipment-reconciliation/')
      && response.request().method() === 'POST'
    ));
    await returnDialog.getByRole('button', { name: 'Submit for verification' }).click();
    expect((await submitResponsePromise).status()).toBe(201);
    await expect(returnDialog.getByRole('status')).toContainText('Stock will change only after warehouse verification');
    await page.keyboard.press('Escape');
    await expect(returnDialog).toBeHidden();
    await expect(details).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/04-tech-job-history-details.png', fullPage: false });
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();

    await page.getByPlaceholder('Search ticket, client, service, address').fill('does-not-exist');
    await expect(page.getByText('No completed jobs match the current filters.')).toBeVisible();
  });

  test('4.9 - Technician Profile page', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/profile', 'test-results/screenshots/04-tech-profile.png');
    const hasProfileUi =
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /edit profile/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/change password/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasProfileUi).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Password & Security' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const firstName = page.getByLabel('First Name');
    const originalFirstName = await firstName.inputValue();
    await firstName.fill('Unsaved Technician Name');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page.getByLabel('First Name')).toHaveValue(originalFirstName);
  });
});
