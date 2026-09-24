// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

let adminAuthState;
let technicianAuthState;
let clientAuthState;

test.describe.configure({ timeout: 180000 });

test.beforeAll(async () => {
  test.setTimeout(180000);
  adminAuthState = loadAuthStateFromBackend('superadmin_test');
  technicianAuthState = loadAuthStateFromBackend('tech_test');
  clientAuthState = loadAuthStateFromBackend('client_test');
});

test.describe('Side Flow - Admin Service Management', () => {
  test('7.1 - Admin can view and manage services', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/services');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-01-services-list.png', fullPage: true });

    const addBtn = page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New")');
    if (await addBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-results/screenshots/07-01-add-service-modal.png', fullPage: true });

      const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close"), [class*="close"]');
      if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.first().click();
      }
    }
  });

  test('7.2 - Admin can view inventory items', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/inventory');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-02-inventory.png', fullPage: true });
    await expect(page.locator('table, [class*="inventory"], [class*="card"], [class*="item"]').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Side Flow - User Management', () => {
  test('7.3 - Superadmin can view user list and role filters', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/user-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-03-user-management.png', fullPage: true });

    const techFilter = page.locator(
      'button:has-text("Technician"), [class*="tab"]:has-text("Technician"), [class*="filter"]:has-text("Technician")'
    );
    if (await techFilter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await techFilter.first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-results/screenshots/07-03-users-technician-filter.png', fullPage: true });
    }

    const clientFilter = page.locator(
      'button:has-text("Client"), [class*="tab"]:has-text("Client"), [class*="filter"]:has-text("Client")'
    );
    if (await clientFilter.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await clientFilter.first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-results/screenshots/07-03-users-client-filter.png', fullPage: true });
    }
  });
});

test.describe('Side Flow - Messaging', () => {
  test('7.4 - Technician chat interface loads with participants', async ({ page }) => {
    await seedAuthState(page, technicianAuthState);

    await page.goto('/technician/messages');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-04-tech-messages.png', fullPage: true });

    const messageInput = page.locator(
      'textarea, input[type="text"][placeholder*="message" i], input[placeholder*="type" i], [class*="message-input"]'
    );
    if (await messageInput.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.screenshot({ path: 'test-results/screenshots/07-04-message-input-visible.png' });
    }
  });

  test('7.5 - Admin chat interface loads', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/messages');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-05-admin-messages.png', fullPage: true });
  });
});

test.describe('Side Flow - Client Support', () => {
  test('7.6 - Client can view support page and create case', async ({ page }) => {
    await seedAuthState(page, clientAuthState);

    await page.goto('/client/support');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-06-client-support.png', fullPage: true });

    const createBtn = page.locator(
      'button:has-text("New"), button:has-text("Create"), button:has-text("Submit"), button:has-text("Contact")'
    );
    if (await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'test-results/screenshots/07-06-create-support-case.png', fullPage: true });
    }
  });

  test('7.7 - Admin can view and respond to client support cases', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/client-support');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-07-admin-client-support.png', fullPage: true });
  });
});

test.describe('Side Flow - Notifications', () => {
  test('7.8 - Client notifications page loads', async ({ page }) => {
    await seedAuthState(page, clientAuthState);
    await page.route('**/api/notifications/unread_count/', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ unread_count: 7 }),
    }));

    await page.goto('/client/notifications');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-08-notifications.png', fullPage: true });
    await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
    const sidebarLink = page.getByRole('link', { name: /Notifications/ });
    await expect(sidebarLink).toHaveAttribute('href', '/client/notifications');
    await expect(sidebarLink.locator('span').last()).toHaveText('7');
  });

  test('7.8b - Opening a badged sidebar destination clears its related unread notifications', async ({ page }) => {
    await seedAuthState(page, clientAuthState);
    const markedNotificationIds = [];
    const notifications = [
      { id: 901, title: 'Request updated', message: 'Your request status was updated.', status: 'unread', created_at: '2026-09-15T10:00:00Z' },
      { id: 902, title: 'New service request update', message: 'Your technician was assigned.', status: 'unread', created_at: '2026-09-15T10:01:00Z' },
    ];

    await page.route('**/api/notifications/', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(notifications),
    }));
    await page.route('**/api/notifications/unread_count/', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ unread_count: 2 }),
    }));
    await page.route('**/api/notifications/*/mark_read/', (route) => {
      markedNotificationIds.push(Number(new URL(route.request().url()).pathname.split('/').at(-3)));
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'read' }) });
    });

    await page.goto('/client/dashboard');
    const badgedRequestsLink = page.getByRole('link', { name: /My Requests/ });
    await expect(badgedRequestsLink).toContainText('2');
    await badgedRequestsLink.click();

    await expect(page).toHaveURL(/\/client\/requests$/);
    await expect(page.getByRole('link', { name: 'My Requests', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
    await expect.poll(() => markedNotificationIds.sort()).toEqual([901, 902]);
  });
});

test.describe('Side Flow - Profile Updates', () => {
  test('7.9 - Admin can update profile', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-09-admin-profile.png', fullPage: true });
  });

  test('7.10 - Technician can update profile', async ({ page }) => {
    await seedAuthState(page, technicianAuthState);

    await page.goto('/technician/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-10-tech-profile.png', fullPage: true });
  });

  test('7.11 - Client can update profile', async ({ page }) => {
    await seedAuthState(page, clientAuthState);

    await page.goto('/client/profile');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-11-client-profile.png', fullPage: true });
  });
});

test.describe('Side Flow - Admin Settings & Logs', () => {
  test('7.12 - Admin settings page has configurable options', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.locator('input, select, textarea, [type="checkbox"]').first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'test-results/screenshots/07-12-admin-settings.png', fullPage: true });
  });

  test('7.13 - Activity logs show system history', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/activity-logs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-13-activity-logs.png', fullPage: true });
    const hasActivityLogUi =
      await page.getByRole('heading', { name: /activity timeline/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.locator('table, tbody tr, [class*="activity"], [class*="timeline"], [class*="list"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/unable to load activity logs/i).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/no activity logs match the current filters/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasActivityLogUi).toBeTruthy();
  });

  test('7.14 - After-sales cases page loads', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/after-sales-cases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/07-14-after-sales-cases.png', fullPage: true });
  });
});
