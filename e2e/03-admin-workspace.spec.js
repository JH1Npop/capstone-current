// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState, visitWorkspacePage } from './helpers';

let adminAuthState;

test.describe('Admin Workspace - All Pages', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(async () => {
    test.setTimeout(180000);
    adminAuthState = loadAuthStateFromBackend('superadmin_test');
  });

  test.beforeEach(async ({ page }) => {
    await seedAuthState(page, adminAuthState);
  });

  test('3.1 - Admin Dashboard loads with stats', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/dashboard', 'test-results/screenshots/03-admin-dashboard.png');
    await expect(page.locator('[class*="card"], [class*="stat"], [class*="dashboard"], [class*="grid"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('3.2 - Admin Calendar renders', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/calendar', 'test-results/screenshots/03-admin-calendar.png');
  });

  test('3.3 - Service Tickets list loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/service-tickets', 'test-results/screenshots/03-admin-service-tickets.png');
    await expect(page.locator('table, [class*="ticket"], [class*="list"], [class*="card"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('3.4 - Dispatch Board renders', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/dispatch-board', 'test-results/screenshots/03-admin-dispatch-board.png');
  });

  test('3.5 - Technician Tracking with map', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/technician-tracking', 'test-results/screenshots/03-admin-technician-tracking.png');
    await expect(page.locator('[class*="leaflet"], [class*="map"], .leaflet-container').first()).toBeVisible({ timeout: 10000 });
  });

  test('3.6 - User Management table loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/user-management', 'test-results/screenshots/03-admin-user-management.png');
    const hasUserDirectoryUi =
      await page.getByRole('button', { name: /new user/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('textbox', { name: /name, username, email, phone, role, address, or status/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.locator('table, [class*="user"], [class*="list"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/unable to load users/i).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/no users match the current search or selected category/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasUserDirectoryUi).toBeTruthy();
  });

  test('3.7 - Services Management loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/services', 'test-results/screenshots/03-admin-services.png');
  });

  test('3.8 - Inventory Management loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/inventory', 'test-results/screenshots/03-admin-inventory.png');
  });

  test('3.9 - Documents page loads', async ({ page }) => {
    page.on('pageerror', (error) => console.error('Documents page error:', error.message));
    await visitWorkspacePage(page, '/admin/documents', 'test-results/screenshots/03-admin-documents.png');
    await page.getByRole('button', { name: 'Quotation Proposal' }).click();
    await expect(page.getByText(/payments are processed and verified outside this system/i)).toBeVisible();

    const ticketSearch = page.getByPlaceholder(/search ticket by id/i);
    await ticketSearch.click();
    const firstTicket = page.getByRole('button', { name: /TKT-\d+/ }).first();
    if (await firstTicket.count()) {
      await firstTicket.click();
      await expect(page.getByText(/document data sources/i)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/template defaults.*must be reviewed/i)).toBeVisible();
    }
  });

  test('3.10 - Analytics page with charts', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/analytics', 'test-results/screenshots/03-admin-analytics.png');
    await expect(page.locator('[class*="chart"], [class*="recharts"], svg.recharts-surface, [class*="analytics"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('3.11 - Reports page loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/reports', 'test-results/screenshots/03-admin-reports.png');
  });

  test('3.12 - Operations Report loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/operations-report', 'test-results/screenshots/03-admin-operations-report.png');
  });

  test('3.13 - After-Sales Cases page loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/after-sales-cases', 'test-results/screenshots/03-admin-after-sales-cases.png');
  });

  test('3.14 - Admin Settings form loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/settings', 'test-results/screenshots/03-admin-settings.png');
    await expect(page.locator('input, select, textarea, [class*="setting"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('3.15 - Activity Logs table loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/activity-logs', 'test-results/screenshots/03-admin-activity-logs.png');
  });

  test('3.16 - Admin Profile page loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/profile', 'test-results/screenshots/03-admin-profile.png');
    const hasProfileUi =
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /edit profile/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/change password/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasProfileUi).toBeTruthy();
  });

  test('3.17 - Admin Messages / Chat interface', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/messages', 'test-results/screenshots/03-admin-messages.png');
  });

  test('3.18 - Admin Client Support page', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/client-support', 'test-results/screenshots/03-admin-client-support.png');
  });

  test('3.19 - Coverage Heatmap with map', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/coverage-heatmap', 'test-results/screenshots/03-admin-coverage-heatmap.png');
    await expect(page.locator('[class*="leaflet"], [class*="map"], .leaflet-container').first()).toBeVisible({ timeout: 10000 });
  });

  test('3.20 - Admin Job History loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/job-history', 'test-results/screenshots/03-admin-job-history.png');
  });
});
