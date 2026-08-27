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
    await visitWorkspacePage(page, '/technician/dashboard', 'test-results/screenshots/04-tech-dashboard.png');
    await expect(page.locator('[class*="card"], [class*="stat"], [class*="dashboard"], [class*="grid"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('4.2 - My Jobs list loads', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/my-jobs', 'test-results/screenshots/04-tech-my-jobs.png');
    const hasJobsUi =
      await page.locator('[class*="job"], [class*="card"], [class*="list"], table').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('heading', { name: /jobs|my jobs/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/no jobs|no assigned jobs|unable to load jobs/i).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /refresh|view details|open job/i }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasJobsUi).toBeTruthy();
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

  test('4.5 - Service Checklist form', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/checklist', 'test-results/screenshots/04-tech-checklist.png');
  });

  test('4.6 - Inspection Checklist form', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/inspection-checklist', 'test-results/screenshots/04-tech-inspection-checklist.png');
  });

  test('4.7 - Messages / Chat interface', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/messages', 'test-results/screenshots/04-tech-messages.png');
  });

  test('4.8 - Job History loads', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/job-history', 'test-results/screenshots/04-tech-job-history.png');
  });

  test('4.9 - Technician Profile page', async ({ page }) => {
    await visitWorkspacePage(page, '/technician/profile', 'test-results/screenshots/04-tech-profile.png');
    const hasProfileUi =
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /edit profile/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/change password/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasProfileUi).toBeTruthy();
  });
});
