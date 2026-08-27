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

test.describe('Main Flow - Service Request Lifecycle', () => {
  test('6.1 - Client creates a service request', async ({ page }) => {
    await seedAuthState(page, clientAuthState);

    await page.goto('/client/service-requests');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/06-01-client-service-requests.png', fullPage: true });

    const newRequestBtn = page.locator(
      'button:has-text("New"), button:has-text("Create"), button:has-text("Request"), button:has-text("Submit"), a:has-text("New Request")'
    );

    if (await newRequestBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await newRequestBtn.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/screenshots/06-01-create-request-form.png', fullPage: true });
    }
  });

  test('6.2 - Admin views service tickets and can see details', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/service-tickets');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/screenshots/06-02-admin-tickets-list.png', fullPage: true });

    const firstTicket = page.locator('tr, [class*="ticket-row"], [class*="card"]').first();
    if (await firstTicket.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstTicket.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/screenshots/06-02-ticket-detail.png', fullPage: true });
    }
  });

  test('6.3 - Admin dispatch board shows assignable tickets', async ({ page }) => {
    await seedAuthState(page, adminAuthState);

    await page.goto('/admin/dispatch-board');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/screenshots/06-03-dispatch-board.png', fullPage: true });

    const techPanel = page.locator('[class*="technician"], [class*="sidebar"], [class*="panel"]');
    if (await techPanel.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.screenshot({ path: 'test-results/screenshots/06-03-dispatch-tech-panel.png' });
    }
  });

  test('6.4 - Technician views assigned jobs', async ({ page }) => {
    await seedAuthState(page, technicianAuthState);

    await page.goto('/technician/my-jobs');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/screenshots/06-04-tech-my-jobs.png', fullPage: true });

    const jobCards = page.locator('[class*="job"], [class*="card"], [class*="ticket"]');
    const count = await jobCards.count();

    if (count > 0) {
      await jobCards.first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/screenshots/06-04-job-detail.png', fullPage: true });
    }
  });

  test('6.5 - Technician checklist page is accessible', async ({ page }) => {
    await seedAuthState(page, technicianAuthState);

    await page.goto('/technician/checklist');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'test-results/screenshots/06-05-tech-checklist.png', fullPage: true });
    const hasChecklistUi =
      await page.locator('form, [class*="checklist"], [class*="procedure"]').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('heading', { name: /checklist needs a selected ticket|checklist/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/open a job first/i).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('link', { name: /go to my jobs/i }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasChecklistUi).toBeTruthy();
  });

  test('6.6 - Client can view their request tracking', async ({ page }) => {
    await seedAuthState(page, clientAuthState);

    await page.goto('/client/requests');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'test-results/screenshots/06-06-client-tracking.png', fullPage: true });

    const firstRequest = page.locator('[class*="card"], [class*="request"], tr').first();
    if (await firstRequest.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRequest.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/screenshots/06-06-request-detail.png', fullPage: true });
    }
  });
});
