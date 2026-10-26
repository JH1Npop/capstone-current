// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState, visitWorkspacePage } from './helpers';

let adminAuthState;
let inventoryViewerAuthState;

// The assistant button is movable and remembers where a user drags it. Park it top-left, as an
// operator would, before clicking row actions that sit under its default bottom-right spot.
const parkAssistantButton = (page) => page.addInitScript(() => {
  window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
});

test.describe('Admin Workspace - All Pages', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeAll(async () => {
    test.setTimeout(180000);
    adminAuthState = loadAuthStateFromBackend('superadmin_test');
    inventoryViewerAuthState = loadAuthStateFromBackend('inventory_viewer_test');
  });

  test.beforeEach(async ({ page }) => {
    await seedAuthState(page, adminAuthState);
  });

  test('3.1 - Admin Dashboard loads with stats', async ({ page }) => {
    await page.route('**/api/dashboard/stats/**', async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (!payload.pending_requests?.length) {
        const request = payload.recent_activity?.requests?.[0];
        payload.pending_requests = [{
          id: request?.id || 1,
          client: request?.client || 'Test Client',
          service_type: request?.service_type || 'E2E Solar Installation',
          status: 'Pending',
          request_date: request?.request_date || new Date().toISOString(),
        }];
        payload.overview = { ...payload.overview, pending_approvals: 1 };
        payload.list_counts = { ...payload.list_counts, pending_requests: 1 };
      }
      payload.overview = { ...payload.overview, pending_equipment_requests: 2 };
      const activeJobs = payload.operations?.active_technician_jobs || [];
      payload.operations = {
        ...payload.operations,
        active_technician_jobs: [{
          ...(activeJobs[0] || {}),
          id: activeJobs[0]?.id || 9001,
          technician: activeJobs[0]?.technician || 'E2E Technician',
          client: activeJobs[0]?.client || 'E2E Client',
          service_type: activeJobs[0]?.service_type || 'E2E Solar Installation',
          status: 'Navigating',
          priority: activeJobs[0]?.priority || 'Normal',
          progress: 35,
          progress_label: 'Inspector en route',
          progress_basis: 'workflow_status',
          progress_paused: false,
          progress_track: 'inspection',
          progress_track_label: 'Inspection visit',
        }, ...activeJobs.slice(1)],
      };
      await route.fulfill({ response, json: payload });
    });
    await visitWorkspacePage(page, '/admin/dashboard', 'test-results/screenshots/03-admin-dashboard.png');
    await expect(page.getByText(/checks for updates every 5 seconds/i)).toBeVisible();
    await expect(page.getByText('Pending Approvals', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Active Tickets', { exact: true })).toBeVisible();
    await expect(page.getByText('Completed Today', { exact: true })).toBeVisible();
    await expect(page.getByText('Active Technician Accounts', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Equipment requests: 2. Review equipment requests' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Upcoming Schedule' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dispatch board' })).toBeVisible();
    await expect(page.getByText(/Showing \d+ of \d+/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Technician Job Progress' })).toBeVisible();
    await expect(page.getByText('Inspection visit', { exact: true })).toBeVisible();
    await expect(page.getByText('Inspector en route', { exact: true })).toBeVisible();
    await expect(page.getByText('Status checkpoint · 100% only after completion', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Inspector en route' })).toHaveAttribute('aria-valuenow', '35');

    const activeJobButton = page.getByRole('button', { name: /View job details for/ }).first();
    const ticketDetailsResponse = page.waitForResponse((response) => (
      /\/api\/services\/service-tickets\/\d+\/$/.test(response.url()) && response.status() === 200
    ));
    await activeJobButton.click();
    await ticketDetailsResponse;
    const activeJobDialog = page.getByRole('dialog', { name: /TKT-\d+/ });
    await expect(activeJobDialog).toBeVisible();
    await expect(activeJobDialog.getByText('Live ticket details and recorded workflow evidence')).toBeVisible();
    await expect(activeJobDialog.getByRole('heading', { name: 'Client details' })).toBeVisible();
    await expect(activeJobDialog.getByText(/^CL-\d{4}$/)).toBeVisible();
    await expect(activeJobDialog.locator('a[href^="mailto:"]')).toBeVisible();
    await expect(activeJobDialog.getByRole('heading', { name: 'Assignment' })).toBeVisible();
    await expect(activeJobDialog.getByRole('heading', { name: 'Visit details' })).toBeVisible();
    const serviceDetails = activeJobDialog.locator('summary').filter({ hasText: 'Service details' });
    await expect(serviceDetails).toBeVisible();
    await serviceDetails.click();
    await expect(activeJobDialog.getByText('Client description', { exact: true })).toBeVisible();
    await expect(activeJobDialog.locator('summary').filter({ hasText: 'Equipment plan' })).toBeVisible();
    await expect(activeJobDialog.locator('summary').filter({ hasText: 'Status timeline' })).toBeVisible();
    await expect(activeJobDialog.getByRole('button', { name: 'Open ticket queue' })).toBeVisible();
    await expect(activeJobDialog.getByRole('button', { name: 'Open dispatch board' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(activeJobDialog).toBeHidden();
    await expect(activeJobButton).toBeFocused();

    const refreshResponse = page.waitForResponse((response) => response.url().includes('/api/dashboard/stats/') && response.status() === 200);
    await page.getByRole('button', { name: 'Refresh dashboard' }).click();
    await refreshResponse;

    // Background refresh polls only the cheap change token, and reloads the full
    // dashboard by itself once data changes.
    await page.waitForResponse((response) => response.url().includes('/api/dashboard/changes/') && response.status() === 200);
    let fullReloads = 0;
    page.on('request', (outgoing) => { if (outgoing.url().includes('/api/dashboard/stats/')) fullReloads += 1; });
    await page.waitForTimeout(11_000);
    expect(fullReloads).toBeLessThanOrEqual(1);

    const headers = { Authorization: `Token ${adminAuthState.token}` };
    const items = await (await page.request.get('/api/inventory/items/', { headers })).json();
    const existingItem = (Array.isArray(items) ? items : items.results || [])[0];
    const autoReload = page.waitForResponse((response) => response.url().includes('/api/dashboard/stats/') && response.status() === 200, { timeout: 15_000 });
    const created = await page.request.post('/api/inventory/items/', {
      headers,
      data: {
        name: `E2E Dashboard Change ${Date.now()}`,
        sku: `E2E-DASH-${Date.now()}`,
        category: existingItem.category,
        item_type: 'part',
        quantity: 1,
        minimum_stock: 0,
        unit: 'pcs',
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    await autoReload;

    const requestDetailsButton = page.getByRole('button', { name: 'View Details' }).first();
    if (await requestDetailsButton.isVisible().catch(() => false)) {
      await requestDetailsButton.click();
      const requestDetails = page.getByRole('dialog', { name: 'Service Request Details' });
      await expect(requestDetails).toBeVisible();
      await requestDetails.getByRole('button', { name: 'Reject Request' }).click();
      const rejectionDialog = page.getByRole('dialog', { name: 'Reject request?' });
      const rejectionReason = rejectionDialog.getByLabel('Reason for rejection');
      await expect(rejectionReason).toBeFocused();
      await expect(rejectionDialog.getByRole('button', { name: 'Reject request' })).toBeDisabled();
      await rejectionReason.fill('The requested scope needs clarification before approval.');
      await expect(rejectionDialog.getByRole('button', { name: 'Reject request' })).toBeEnabled();
      await rejectionDialog.getByRole('button', { name: 'Cancel' }).click();
      await requestDetails.getByRole('button', { name: 'Close request details' }).click();
      await expect(requestDetailsButton).toBeFocused();
    }

    await page.getByRole('button', { name: /Pending Approvals: \d+\. Review on this dashboard/ }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard#pending-approvals$/);
    await expect(page.locator('#pending-approvals')).toBeFocused();

    await page.getByRole('button', { name: /Active Tickets: \d+\. Open service tickets/ }).click();
    await expect(page).toHaveURL(/\/admin\/service-tickets\?focus=active$/);
    await expect(page.getByRole('button', { name: /All active \(\d+\)/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('3.1a - Logout uses an accessible confirmation dialog', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/dashboard');
    const logoutButton = page.getByRole('button', { name: 'Logout', exact: true });
    await logoutButton.click();

    const logoutDialog = page.getByRole('dialog', { name: 'Log out?' });
    await expect(logoutDialog).toBeVisible();
    await expect(logoutDialog).toContainText("You'll need to sign in again to access your account.");
    await expect(logoutDialog.getByRole('button', { name: 'Log out' })).toBeVisible();
    await logoutDialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(logoutDialog).toBeHidden();
    await expect(logoutButton).toBeFocused();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test('3.1b - Active job details remain usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visitWorkspacePage(page, '/admin/dashboard');
    const activeJobButton = page.getByRole('button', { name: /View job details for/ }).first();
    await expect(activeJobButton).toBeVisible();
    const ticketDetailsResponse = page.waitForResponse((response) => (
      /\/api\/services\/service-tickets\/\d+\/$/.test(response.url()) && response.status() === 200
    ));
    await activeJobButton.click();
    await ticketDetailsResponse;

    const dialog = page.getByRole('dialog', { name: /TKT-\d+/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Open dispatch board' })).toBeVisible();
    const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(viewportFits).toBeTruthy();
    await page.screenshot({ path: 'test-results/screenshots/03-admin-active-job-details-mobile.png', fullPage: false });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(activeJobButton).toBeFocused();
  });

  test('3.2 - Admin Calendar supports operational filtering and event details', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await page.route('**/api/admin/calendar/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          start: today,
          end: today,
          events: [{
            id: 'ticket-9001',
            entity_type: 'ticket',
            ticket_id: 9001,
            request_id: 8001,
            client: 'E2E Calendar Client',
            client_email: 'calendar@example.com',
            client_phone: '+63 900 000 0000',
            service_type: 'E2E Solar Installation',
            service_type_color: '#2563eb',
            estimated_duration: 120,
            date: today,
            time: '09:00:00',
            time_slot: 'morning',
            status: 'Not Started',
            request_status: 'Approved',
            calendar_status: 'scheduled',
            assignment_status: 'assigned',
            priority: 'High',
            workflow_type: 'installation',
            assigned_technician: 'E2E Technician',
            crew_members: ['E2E Crew'],
            assigned_admin: 'E2E Admin',
            location: '100 E2E Solar Street',
            description: 'Install and commission the solar equipment.',
            scheduling_notes: 'Coordinate access with the client.',
            reschedule_requested: false,
          }],
        }),
      });
    });
    await visitWorkspacePage(page, '/admin/calendar', 'test-results/screenshots/03-admin-calendar.png');
    await expect(page.getByLabel('Calendar operations summary').getByText('Today')).toBeVisible();
    await expect(page.getByLabel('Filter by workflow')).toBeVisible();
    await page.getByLabel('Filter by technician').selectOption('E2E Technician');
    await expect(page.getByText('Showing 1 of 1 event')).toBeVisible();

    await page.getByRole('button', { name: /E2E Solar Installation/ }).last().click();
    const dialog = page.getByRole('dialog', { name: /TKT-9001/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('E2E Calendar Client')).toBeVisible();
    await expect(dialog.getByText('100 E2E Solar Street')).toBeVisible();
    await expect(dialog.getByText('E2E Technician')).toBeVisible();
    await expect(dialog.getByText('E2E Crew')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Reschedule' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('3.3 - Service Tickets list loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/service-tickets', 'test-results/screenshots/03-admin-service-tickets.png');
    await expect(page.locator('table, [class*="ticket"], [class*="list"], [class*="card"]').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('All Active Tickets', { exact: true })).toBeVisible();
    await expect(page.getByText('Assigned and unassigned work', { exact: true })).toBeVisible();
    await page.goto('/admin/service-tickets?focus=unassigned');
    await expect(page.getByRole('heading', { name: 'Ticket Queue · Unassigned' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unassigned \(\d+\)/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('3.3b - Walk-in request dialog protects drafts and saves for review', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/service-tickets');
    await page.getByRole('button', { name: 'Create Walk-in Request' }).click();
    let dialog = page.getByRole('dialog', { name: 'Create Walk-in Request' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Client and service')).toBeVisible();
    await expect(dialog.getByText('Preferred schedule')).toBeVisible();
    await expect(dialog.getByText('Service location')).toBeVisible();

    await dialog.getByLabel('Client').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Close walk-in request' }).click();
    await expect(page.getByRole('heading', { name: 'Discard walk-in request?' })).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close walk-in request' }).click();
    await page.getByRole('button', { name: 'Discard and close' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Create Walk-in Request' }).click();
    dialog = page.getByRole('dialog', { name: 'Create Walk-in Request' });
    await dialog.getByRole('button', { name: /Keep it in the request-review queue/ }).click();
    await dialog.getByLabel('Client').selectOption({ index: 1 });
    await dialog.getByRole('group', { name: 'Services' }).getByRole('button').first().click();
    await dialog.getByLabel('Request details').fill('E2E walk-in request for an on-site electrical assessment.');
    const preferredDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    await dialog.getByLabel('Preferred date').fill(preferredDate);
    await dialog.getByLabel('Service address').fill('123 E2E Street, Barangay Test');
    await dialog.getByLabel('City').fill('Antipolo');
    await dialog.getByLabel('Province').fill('Rizal');
    await dialog.getByText('Coordinates', { exact: true }).click();
    await dialog.getByLabel('Latitude').fill('14.5869');
    await dialog.getByLabel('Longitude').fill('121.1760');
    await page.screenshot({ path: 'test-results/screenshots/03-admin-walk-in-dialog.png' });

    const createResponse = page.waitForResponse((response) => (
      response.url().includes('/api/services/service-requests/')
      && response.request().method() === 'POST'
    ));
    await dialog.getByRole('button', { name: 'Save for Review', exact: true }).click();
    expect((await createResponse).ok()).toBeTruthy();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('status')).toContainText(/saved for review/i);
  });

  test('3.3c - Walk-in request dialog fits a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visitWorkspacePage(page, '/admin/service-tickets');
    await page.getByRole('button', { name: 'Create Walk-in Request' }).click();

    const dialog = page.getByRole('dialog', { name: 'Create Walk-in Request' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close walk-in request' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^Approve and create ticket/ })).toBeVisible();

    const overflow = await dialog.evaluate((element) => ({
      horizontal: element.scrollWidth > element.clientWidth,
      viewportWidth: window.innerWidth,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    }));
    expect(overflow.horizontal).toBeFalsy();
    expect(overflow.left).toBeGreaterThanOrEqual(0);
    expect(overflow.right).toBeLessThanOrEqual(overflow.viewportWidth);

    await page.screenshot({ path: 'test-results/screenshots/03-admin-walk-in-dialog-mobile.png' });
    await dialog.getByRole('button', { name: 'Close walk-in request' }).click();
    await expect(dialog).toBeHidden();
  });

  test('3.4 - Dispatch Board renders', async ({ page }) => {
    let technicianDirectoryRequests = 0;
    await page.route(/\/api\/admin\/technicians\/(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      const technicians = Array.isArray(payload) ? payload : (payload.results || []);
      const template = technicians[0];
      technicianDirectoryRequests += 1;
      const refreshSafeTechnician = template ? {
        ...template,
        id: 9902,
        username: 'refresh_safe_technician',
        first_name: 'Refresh Safe',
        last_name: 'Technician',
        full_name: 'Refresh Safe Technician',
        status: 'active',
        is_active: true,
        is_available: true,
        skills: ['E2E Solar Installation', 'E2E Electrical Safety Check'],
        skill_details: [
          { service_type: 99021, service_type_name: 'E2E Solar Installation', skill_level: 'expert' },
          { service_type: 99022, service_type_name: 'E2E Electrical Safety Check', skill_level: 'expert' },
        ],
      } : null;
      const results = refreshSafeTechnician ? [...technicians, refreshSafeTechnician] : technicians;
      await route.fulfill({
        response,
        json: Array.isArray(payload) ? results : { ...payload, count: results.length, results },
      });
    });
    await page.route(/\/api\/inventory\/items\/(?:\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 9901,
          name: 'E2E Safety Kit',
          sku: 'E2E-SAFE-01',
          quantity: 5,
          available_quantity: 5,
        }]),
      });
    });
    await visitWorkspacePage(page, '/admin/dispatch-board', 'test-results/screenshots/03-admin-dispatch-board.png');
    await expect(page.getByText('Ready to Assign', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/\d+ of \d+ active tickets are eligible and waiting for assignment/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Set Lead' }).first()).toBeDisabled();
    await page.getByRole('button', { name: 'Edit assignment' }).first().click();
    await expect(page.getByRole('heading', { name: /Assignment Review/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update Assignment' })).toBeEnabled();
    await page.getByRole('button', { name: 'Add crew Refresh Safe Technician' }).click();
    await expect(page.getByRole('button', { name: 'Selected crew Refresh Safe Technician' })).toBeVisible();
    const crewRefreshResponse = page.waitForResponse((response) => (
      response.url().includes('/api/admin/technicians/')
      && technicianDirectoryRequests >= 2
      && response.status() === 200
    ));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await crewRefreshResponse;
    await expect(page.getByRole('button', { name: 'Selected crew Refresh Safe Technician' })).toBeVisible();
    await page.getByRole('button', { name: 'Set lead Refresh Safe Technician' }).click();
    await expect(page.getByRole('button', { name: 'Selected lead Refresh Safe Technician' })).toBeVisible();
    const leadRefreshResponse = page.waitForResponse((response) => (
      response.url().includes('/api/admin/technicians/')
      && technicianDirectoryRequests >= 3
      && response.status() === 200
    ));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await leadRefreshResponse;
    await expect(page.getByRole('button', { name: 'Selected lead Refresh Safe Technician' })).toBeVisible();
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByLabel('Inventory item')).toHaveValue('9901');
    const equipmentQuantity = page.getByLabel('Quantity');
    await equipmentQuantity.fill('7');
    await expect(page.getByText('Short by 2; only available stock will be reserved.')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/03-admin-dispatch-equipment-plan.png', fullPage: true });
    await equipmentQuantity.fill('');
    await expect(page.getByRole('button', { name: 'Update Assignment' })).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('quantity of at least 1');
    await equipmentQuantity.fill('1');
    await expect(page.getByRole('button', { name: 'Update Assignment' })).toBeEnabled();
    await page.getByRole('button', { name: 'Clear selected ticket' }).click();
    await expect(page.getByRole('button', { name: 'Set Lead' }).first()).toBeDisabled();
  });

  test('3.5 - Technician Tracking monitors live field operations', async ({ page, request }) => {
    const technicianAuthState = loadAuthStateFromBackend('tech_test');
    const locationResponse = await request.post('/api/services/technician/location/', {
      headers: { Authorization: `Token ${technicianAuthState.token}` },
      data: { latitude: 14.5995, longitude: 120.9842, accuracy: 12 },
    });
    expect(locationResponse.ok()).toBeTruthy();

    await visitWorkspacePage(page, '/admin/technician-tracking', 'test-results/screenshots/03-admin-technician-tracking.png');
    await expect(page.locator('[class*="leaflet"], [class*="map"], .leaflet-container').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('status')).toContainText('Live');
    await expect(page.getByText('Online technicians')).toBeVisible();
    await expect(page.getByText('GPS attention')).toBeVisible();
    await expect(page.getByText('CALABARZON · history retained up to 30 days')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Active Job Sites' })).toBeVisible();
    await expect(page.getByText(/Direct line · road route unavailable/).first()).toBeVisible();

    await page.getByLabel('GPS Health').selectOption('fresh');
    await page.getByLabel('Find technician or job').fill('Test Technician');
    await page.getByRole('button', { name: 'View details' }).first().click();
    const details = page.getByRole('region', { name: 'Test Technician' });
    await expect(details).toBeVisible();
    await expect(details.getByText(/TECH-\d+/)).toBeVisible();
    await expect(details.getByText('+/-12 m')).toBeVisible();
    await expect(details.getByText(/point.*in 60 min/)).toBeVisible();
    await expect(details.getByText('Current jobs')).toBeVisible();
    await expect(details.getByRole('link', { name: 'Open Service Tickets' })).toHaveAttribute('href', '/admin/service-tickets');

    await page.route('**/api/tracking/', (route) => route.abort('failed'));
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText(/Last known locations remain visible/)).toBeVisible();
    await expect(details).toBeVisible();
    await page.unroute('**/api/tracking/');
    await page.screenshot({ path: 'test-results/screenshots/03-admin-technician-tracking-details.png', fullPage: true });
  });

  test('3.5b - Technician Tracking detail workflow fits mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visitWorkspacePage(page, '/admin/technician-tracking');
    await page.getByRole('button', { name: 'View details' }).first().click();
    await expect(page.getByRole('region', { name: 'Test Technician' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'test-results/screenshots/03-admin-technician-tracking-mobile.png', fullPage: true });
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

  test('3.7b - Admin saves service inspection checks and deposit rule', async ({ page }) => {
    const serviceName = 'E2E Electrical Safety Check';
    await visitWorkspacePage(page, '/admin/services');
    await page.locator('div.rounded-xl.border.bg-white.shadow-sm')
      .filter({ hasText: serviceName })
      .first()
      .getByRole('button', { name: 'Edit', exact: true })
      .click();

    await page.getByLabel('Requires site inspection first').check();
    await expect(page.getByText('Site Inspection Checks')).toBeVisible();
    await page.getByRole('button', { name: 'Add Check' }).click();
    await page.getByLabel('Inspection check 1', { exact: true }).fill('Distribution board has a spare breaker slot');
    await page.getByLabel('Inspection check 1 guidance').fill('Count free slots in the main panel.');
    await page.getByLabel('Pre-service deposit').selectOption('percentage');
    await page.getByLabel('Deposit percentage').fill('30');

    const saveResponse = page.waitForResponse((response) => (
      response.url().includes('/api/admin/services/') && response.request().method() === 'PUT'
    ));
    await page.getByRole('button', { name: 'Save Changes' }).click();
    expect((await saveResponse).ok()).toBeTruthy();

    const saved = await page.evaluate(async (name) => {
      const token = sessionStorage.getItem('afn_token');
      const response = await fetch('/api/admin/services/', { headers: { Authorization: `Token ${token}` } });
      const payload = await response.json();
      const services = Array.isArray(payload) ? payload : payload.results || [];
      const service = services.find((entry) => entry.name === name);
      return {
        requiresInspection: service?.requires_site_inspection,
        checks: service?.inspection_procedures,
        depositPolicy: service?.deposit_policy,
        depositValue: Number(service?.deposit_value),
      };
    }, serviceName);
    expect(saved).toEqual({
      requiresInspection: true,
      checks: [{ title: 'Distribution board has a spare breaker slot', description: 'Count free slots in the main panel.' }],
      depositPolicy: 'percentage',
      depositValue: 30,
    });
  });

  test('3.7c - Used services deactivate without destructive delete requests', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/services');
    const headers = { Authorization: `Token ${adminAuthState.token}` };
    const catalogResponse = await page.request.get('/api/admin/services/', { headers });
    expect(catalogResponse.ok()).toBeTruthy();
    const catalogPayload = await catalogResponse.json();
    const services = Array.isArray(catalogPayload) ? catalogPayload : catalogPayload.results || [];
    const usedService = services.find((service) => service.is_active !== false && service.can_delete === false);
    expect(usedService).toBeTruthy();

    const serviceCard = page.locator('div.rounded-xl.border.bg-white.shadow-sm')
      .filter({ hasText: usedService.name })
      .first();
    await expect(serviceCard.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
    await expect(serviceCard.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await serviceCard.getByRole('button', { name: 'Deactivate', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Deactivate service?' })).toBeVisible();
    await expect(page.getByText(/historical reference/)).toBeVisible();
    const deactivateResponse = page.waitForResponse((response) => (
      response.url().endsWith(`/api/admin/services/${usedService.id}/`)
      && response.request().method() === 'PUT'
    ));
    await page.getByRole('button', { name: 'Deactivate service', exact: true }).click();
    const response = await deactivateResponse;
    expect(response.ok(), await response.text()).toBeTruthy();
    expect((await response.json()).is_active).toBe(false);
    await expect(page.getByText(/hidden from new requests.*Historical records were preserved/i)).toBeVisible();
    await expect(serviceCard.getByText('Inactive', { exact: true })).toBeVisible();
  });

  test('3.8 - Inventory Management loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/inventory', 'test-results/screenshots/03-admin-inventory.png');
    await expect(page.getByText('Physical units')).toBeVisible();
    await expect(page.getByLabel('Inventory summary')).toBeVisible();
    await expect(page.getByLabel('Stock level')).toBeHidden();
    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByLabel('Stock level').selectOption('low');
    await expect(page.getByRole('button', { name: 'Remove Stock level filter' })).toContainText('Low stock');
    await page.getByRole('button', { name: 'Remove Stock level filter' }).click();
    await expect(page.getByLabel('Stock level')).toHaveValue('all');
  });

  test('3.8b - Admin creates a custom inventory product with opening-balance history', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/inventory');
    const uniqueId = Date.now();
    const categoryName = `E2E Products ${uniqueId}`;
    const itemName = `E2E Custom Cable ${uniqueId}`;
    const sku = `E2E-CABLE-${uniqueId}`;

    await page.getByRole('button', { name: 'Manage Categories' }).click();
    await expect(page.getByRole('heading', { name: 'Manage Categories' })).toBeVisible();
    await page.getByLabel('Category name').fill(categoryName);
    const categoryResponse = page.waitForResponse((response) => (
      response.url().includes('/api/inventory/categories/')
      && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Add Category' }).click();
    expect((await categoryResponse).ok()).toBeTruthy();
    await expect(page.getByRole('paragraph').filter({ hasText: categoryName })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Add Item' }).last().click();
    await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible();
    await page.getByLabel('Item name').fill(itemName);
    await page.getByLabel('SKU').fill(sku.toLowerCase());
    await page.getByLabel('Inventory category').selectOption({ label: categoryName });
    await page.getByLabel('Item type').selectOption('consumable');
    await page.getByLabel('Unit of measurement').fill('coil');
    await page.getByLabel('Opening quantity').fill('25');
    const itemResponse = page.waitForResponse((response) => (
      response.url().includes('/api/inventory/items/')
      && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Add Item' }).last().click();
    expect((await itemResponse).ok()).toBeTruthy();

    const itemRow = page.locator('tbody tr').filter({ hasText: sku });
    await expect(itemRow).toContainText(itemName);
    await itemRow.getByTitle('Details').click();
    await expect(page.getByText('Opening inventory balance')).toBeVisible();
    await expect(page.getByText('Qty 25')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ticket Reservations' })).toBeVisible();
    await page.getByRole('button', { name: 'Receive Stock' }).click();
    const movementDialog = page.getByRole('dialog', { name: `Stock movement for ${itemName}` });
    await expect(movementDialog).toBeVisible();
    await expect(movementDialog.getByRole('combobox')).toHaveValue('purchase');
    await movementDialog.getByRole('spinbutton').fill('5');
    await movementDialog.getByLabel(/Reference number/).fill(`DR-${uniqueId}`);
    await movementDialog.getByLabel(/Reason \/ notes/).fill('E2E supplier delivery');
    const movementResponse = page.waitForResponse((response) => (
      response.url().includes('/api/inventory/transactions/')
      && response.request().method() === 'POST'
    ));
    await movementDialog.getByRole('button', { name: 'Save Movement' }).click();
    expect((await movementResponse).ok()).toBeTruthy();
    await expect(movementDialog).toBeHidden();
    await itemRow.getByTitle('Details').click();
    await expect(page.getByText('E2E supplier delivery')).toBeVisible();
    await expect(page.getByText(`Reference: DR-${uniqueId}`)).toBeVisible();
    await expect(page.getByText('Qty 5')).toBeVisible();
  });

  test('3.8c - View-only inventory access does not expose management controls', async ({ page }) => {
    await seedAuthState(page, inventoryViewerAuthState);
    await visitWorkspacePage(page, '/admin/inventory');

    await expect(page.getByRole('button', { name: 'Manage Categories' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Item', exact: true })).toHaveCount(0);
    await page.getByTitle('Details').first().click();
    await expect(page.getByRole('button', { name: 'Receive Stock', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Manage', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  });

  test('3.8d - Admin approves and rejects pending equipment requests', async ({ page }) => {
    await parkAssistantButton(page);
    let pendingReservations = [
      {
        id: 99001,
        reservation_code: 'RSV-099001',
        item: 501,
        item_name: 'E2E Hybrid Inverter',
        item_sku: 'E2E-INV-01',
        item_available_quantity: 6,
        item_physical_quantity: 10,
        technician: 42,
        technician_name: 'E2E Technician',
        service_ticket: 622,
        ticket_code: 'TKT-0622',
        ticket_status: 'Not Started',
        service_name: 'Solar Panel Installation',
        quantity: 1,
        required_date: '2026-10-26',
        status: 'pending',
        notes: 'Needed after site inspection',
        created_at: '2026-10-18T03:35:19Z',
      },
      {
        id: 99002,
        reservation_code: 'RSV-099002',
        item: 502,
        item_name: 'E2E Connector Set',
        item_sku: 'E2E-CONN-01',
        item_available_quantity: 0,
        item_physical_quantity: 1,
        technician: 42,
        technician_name: 'E2E Technician',
        service_ticket: 622,
        ticket_code: 'TKT-0622',
        ticket_status: 'Not Started',
        service_name: 'Solar Panel Installation',
        quantity: 2,
        required_date: '2026-10-26',
        status: 'pending',
        notes: 'Additional connectors requested',
        created_at: '2026-10-18T03:36:19Z',
      },
      {
        id: 99003,
        reservation_code: 'RSV-099003',
        item: 503,
        item_name: 'E2E Smoke Detector',
        item_sku: 'E2E-SMOKE-01',
        item_available_quantity: 8,
        item_physical_quantity: 12,
        technician: 42,
        technician_name: 'E2E Technician',
        service_ticket: 623,
        ticket_code: 'TKT-0623',
        ticket_status: 'Not Started',
        service_name: 'Fire Detection Installation',
        quantity: 3,
        required_date: '2026-10-27',
        status: 'pending',
        notes: 'Additional detector request',
        created_at: '2026-10-18T03:37:19Z',
      },
    ];
    const decisions = [];

    await page.route(/\/api\/inventory\/reservations\/(?:pending\/|decide-ticket\/)(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(pendingReservations) });
        return;
      }

      const body = request.postDataJSON();
      decisions.push(body);
      const decidedIds = new Set(body.decisions.map((decision) => decision.reservation_id));
      pendingReservations = pendingReservations.filter((reservation) => !decidedIds.has(reservation.id));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'Ticket equipment decisions applied' }),
      });
    });

    await visitWorkspacePage(page, '/admin/inventory?ticketId=622');
    const queue = page.getByRole('region', { name: 'Pending equipment requests' });
    await expect(queue).toContainText('Showing pending requests for TKT-0622');
    const directQueueText = await queue.evaluate((element) => Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .filter(Boolean));
    expect(directQueueText).not.toContain('0');
    const queueFollowsStock = await page.getByRole('heading', { name: /Stock Overview/ }).evaluate((stockHeading) => {
      const queueElement = document.getElementById('pending-equipment-requests');
      return Boolean(queueElement && (stockHeading.compareDocumentPosition(queueElement) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(queueFollowsStock).toBeTruthy();

    const groupedRequest = queue.locator('article').filter({ hasText: 'TKT-0622' });
    await expect(groupedRequest).toContainText('2 items');
    await expect(groupedRequest).toContainText('Solar Panel Installation');
    await expect(groupedRequest).toContainText('E2E Technician');
    await expect(groupedRequest).toContainText('1 item needs review');
    await groupedRequest.getByRole('button', { name: 'Review' }).click();
    const groupedReview = page.getByRole('dialog', { name: 'Equipment request for TKT-0622' });
    await expect(groupedReview).toContainText('E2E Hybrid Inverter');
    await expect(groupedReview).toContainText('E2E Connector Set');
    await expect(groupedReview.getByLabel('Decision for E2E Hybrid Inverter')).toHaveValue('approve');
    await expect(groupedReview.getByLabel('Decision for E2E Connector Set')).toHaveValue('reject');
    await groupedReview.getByLabel('Rejection reason (required)').fill('The requested connector quantity is not currently available.');
    await groupedReview.getByRole('button', { name: 'Apply Decisions' }).click();
    await expect(page.getByRole('status')).toContainText('1 item line(s) issued, 1 rejected');

    await queue.getByRole('button', { name: 'Show all requests' }).click();
    const detectorRequest = queue.locator('article').filter({ hasText: 'TKT-0623' });
    await detectorRequest.getByRole('button', { name: 'Review' }).click();
    const detectorReview = page.getByRole('dialog', { name: 'Equipment request for TKT-0623' });
    await detectorReview.getByLabel('Decision for E2E Smoke Detector').selectOption('reject');
    await detectorReview.getByLabel('Rejection reason (required)').fill('short');
    await expect(detectorReview.getByRole('button', { name: 'Apply Decisions' })).toBeDisabled();
    await detectorReview.getByLabel('Rejection reason (required)').fill('Requested detector model does not match the approved plan.');
    await detectorReview.getByRole('button', { name: 'Apply Decisions' }).click();

    await expect(queue.getByText('No pending equipment requests')).toBeVisible();
    expect(decisions).toEqual([
      {
        ticket_id: 622,
        decisions: [
          { reservation_id: 99001, decision: 'approve', reason: '' },
          { reservation_id: 99002, decision: 'reject', reason: 'The requested connector quantity is not currently available.' },
        ],
      },
      {
        ticket_id: 623,
        decisions: [
          { reservation_id: 99003, decision: 'reject', reason: 'Requested detector model does not match the approved plan.' },
        ],
      },
    ]);
  });

  test('3.8e - Real backend applies mixed equipment decisions end to end', async ({ page, request }) => {
    await parkAssistantButton(page);
    const headers = { Authorization: `Token ${adminAuthState.token}` };
    const listFrom = (payload) => (Array.isArray(payload) ? payload : (payload.results || []));
    const technicianAuthState = loadAuthStateFromBackend('tech_test');

    const [itemsResponse, ticketsResponse] = await Promise.all([
      request.get('/api/inventory/items/', { headers }),
      request.get('/api/services/service-tickets/', { headers }),
    ]);
    expect(itemsResponse.ok()).toBeTruthy();
    expect(ticketsResponse.ok()).toBeTruthy();

    const existingItems = listFrom(await itemsResponse.json());
    const tickets = listFrom(await ticketsResponse.json());
    const issuedItem = existingItems.find((item) => item.name === 'E2E Safety Kit');
    const ticket = tickets.find((candidate) => candidate.status === 'Ready for Service');
    expect(issuedItem?.id).toBeTruthy();
    expect(ticket?.id).toBeTruthy();

    const rejectedItemResponse = await request.post('/api/inventory/items/', {
      headers,
      data: {
        name: 'E2E Unsupported Adapter',
        sku: 'E2E-MIXED-DECISION-01',
        category: issuedItem.category,
        item_type: 'part',
        quantity: 4,
        minimum_stock: 0,
        unit_of_measurement: 'piece',
        low_stock_threshold: 40,
        unit_price: '0.00',
        status: 'available',
      },
    });
    expect(rejectedItemResponse.status()).toBe(201);
    const rejectedItem = await rejectedItemResponse.json();

    const reservationPayload = {
      technician: technicianAuthState.user.id,
      quantity: 1,
      required_date: '2026-10-26',
      service_ticket: ticket.id,
    };
    const approvedReservationResponse = await request.post('/api/inventory/reservations/', {
      headers,
      data: { ...reservationPayload, item: issuedItem.id, notes: 'Real E2E line to approve.' },
    });
    const rejectedReservationResponse = await request.post('/api/inventory/reservations/', {
      headers,
      data: { ...reservationPayload, item: rejectedItem.id, notes: 'Real E2E line to reject.' },
    });
    expect(approvedReservationResponse.status()).toBe(201);
    expect(rejectedReservationResponse.status()).toBe(201);
    const approvedReservation = await approvedReservationResponse.json();
    const rejectedReservation = await rejectedReservationResponse.json();

    await visitWorkspacePage(page, `/admin/inventory?ticketId=${ticket.id}#pending-equipment-requests`);
    const queue = page.getByRole('region', { name: 'Pending equipment requests' });
    const requestRow = queue.locator('article').filter({ hasText: ticket.ticket_code });
    await expect(requestRow).toContainText('2 items');
    await requestRow.getByRole('button', { name: 'Review' }).click();

    const review = page.getByRole('dialog', { name: `Equipment request for ${ticket.ticket_code}` });
    await expect(review.getByLabel('Decision for E2E Safety Kit')).toHaveValue('approve');
    await review.getByLabel('Decision for E2E Unsupported Adapter').selectOption('reject');
    await review.getByLabel('Rejection reason (required)').fill('This adapter is not approved for the assigned installation.');
    await review.getByRole('button', { name: 'Apply Decisions' }).click();
    await expect(page.getByRole('status')).toContainText('1 item line(s) issued, 1 rejected');
    await expect(queue.getByText('No pending equipment requests')).toBeVisible();

    const [approvedStateResponse, rejectedStateResponse, updatedItemsResponse] = await Promise.all([
      request.get(`/api/inventory/reservations/${approvedReservation.id}/`, { headers }),
      request.get(`/api/inventory/reservations/${rejectedReservation.id}/`, { headers }),
      request.get('/api/inventory/items/', { headers }),
    ]);
    expect(approvedStateResponse.ok()).toBeTruthy();
    expect(rejectedStateResponse.ok()).toBeTruthy();
    expect(updatedItemsResponse.ok()).toBeTruthy();
    const approvedState = await approvedStateResponse.json();
    const rejectedState = await rejectedStateResponse.json();
    const updatedItems = listFrom(await updatedItemsResponse.json());
    const issuedItemAfter = updatedItems.find((item) => item.id === issuedItem.id);
    const rejectedItemAfter = updatedItems.find((item) => item.id === rejectedItem.id);

    expect(approvedState.status).toBe('fulfilled');
    expect(rejectedState.status).toBe('cancelled');
    expect(issuedItemAfter.quantity).toBe(issuedItem.quantity - 1);
    expect(issuedItemAfter.reserved_quantity).toBe(0);
    expect(rejectedItemAfter.quantity).toBe(rejectedItem.quantity);
    expect(rejectedItemAfter.reserved_quantity).toBe(0);
  });

  test('3.9 - Document draft saves and reloads end to end', async ({ page }) => {
    page.on('pageerror', (error) => console.error('Documents page error:', error.message));
    await visitWorkspacePage(page, '/admin/documents', 'test-results/screenshots/03-admin-documents.png');
    await page.getByRole('button', { name: 'Quotation Proposal' }).click();
    await expect(page.getByText(/payments are collected and verified outside this system/i)).toBeVisible();

    const ticketSearch = page.getByPlaceholder(/search ticket by id/i);
    await ticketSearch.click();
    const firstTicket = page.getByRole('button', { name: /TKT-\d+/ }).first();
    await expect(firstTicket).toBeVisible();
    const selectedTicketCode = (await firstTicket.textContent()).match(/TKT-\d+/)?.[0];
    await firstTicket.click();
    // The ticket bar links to the loaded ticket; the fill rules sit in the folded help.
    await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
    await page.getByText('How this document is filled').click();
    await expect(page.getByText(/Template wording:.*Review it before printing/)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('â‚±');
    await expect(page.locator('body')).toContainText('₱');

    const headers = { Authorization: `Token ${adminAuthState.token}` };
    const inventoryPayload = await (await page.request.get('/api/inventory/items/', { headers })).json();
    const inventoryItems = Array.isArray(inventoryPayload) ? inventoryPayload : inventoryPayload.results || [];
    let pricedItem = inventoryItems.find((item) => Number(item.unit_price) > 0);
    if (!pricedItem) {
      const referenceItem = inventoryItems[0];
      const pricedItemResponse = await page.request.post('/api/inventory/items/', {
        headers,
        data: {
          name: `Quotation Test Item ${Date.now()}`,
          sku: `QUOTE-${Date.now()}`,
          category: referenceItem.category,
          item_type: 'part',
          quantity: 10,
          minimum_stock: 0,
          unit_of_measurement: 'piece',
          unit_price: '125.50',
          status: 'available',
        },
      });
      expect(pricedItemResponse.ok(), await pricedItemResponse.text()).toBeTruthy();
      pricedItem = await pricedItemResponse.json();
      await page.reload();
      await page.getByRole('button', { name: 'Quotation Proposal' }).click();
      await page.getByPlaceholder(/search ticket by id/i).fill(selectedTicketCode);
      await page.getByRole('button', { name: new RegExp(selectedTicketCode) }).first().click();
      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
    }
    expect(pricedItem).toBeTruthy();

    const bomTable = page.locator('table:has(> thead th:text-is("Unit Price (₱)"))').first();
    const firstBomRow = bomTable.locator(':scope > tbody > tr').first();
    await firstBomRow.getByLabel('BOM row 1 description', { exact: true }).fill(pricedItem.name);
    await expect(firstBomRow.getByLabel('BOM row 1 unit price', { exact: true })).toHaveValue(String(pricedItem.unit_price));
    await expect(firstBomRow.getByLabel('BOM row 1 unit', { exact: true })).toHaveValue(pricedItem.unit_of_measurement);
    await firstBomRow.getByLabel('BOM row 1 quantity', { exact: true }).fill('2');
    const expectedAmount = (Number(pricedItem.unit_price) * 2).toFixed(2);
    await expect(firstBomRow.getByLabel('BOM row 1 total amount', { exact: true })).toHaveValue(expectedAmount);
    const priceTable = page.locator('table:has(> thead th:text-is("Total Amount"))').first();
    await expect(priceTable.locator(':scope > tbody > tr').first().locator('textarea').nth(2)).toHaveValue(expectedAmount);

    const saveResponse = page.waitForResponse((response) => (
      response.url().includes('/document-draft/')
      && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Save Draft' }).click();
    const savedDraftResponse = await saveResponse;
    expect(savedDraftResponse.ok()).toBeTruthy();
    const savedDraftPayload = savedDraftResponse.request().postDataJSON();
    expect(savedDraftPayload.data_json.bomRows[0].description).toBe(pricedItem.name);
    expect(savedDraftPayload.data_json.bomRows[0].unitPrice).toBe(String(pricedItem.unit_price));
    expect(savedDraftPayload.data_json.bomRows[0].amount).toBe(expectedAmount);
    await expect(page.getByRole('status')).toContainText(/draft saved successfully/i);

    // Reloading and reselecting the same ticket proves the draft traversed the
    // browser, API, database, and back into the editor.
    await page.reload();
    await page.getByRole('button', { name: 'Quotation Proposal' }).click();
    await page.getByPlaceholder(/search ticket by id/i).click();
    await page.getByRole('button', { name: /TKT-\d+/ }).first().click();
    await expect(page.getByRole('status')).toContainText(/loaded saved draft/i, { timeout: 15000 });
    const reloadedBomRow = page.locator('table:has(> thead th:text-is("Unit Price (₱)"))').first().locator(':scope > tbody > tr').first();
    await expect(reloadedBomRow.getByLabel('BOM row 1 description', { exact: true })).toHaveValue(pricedItem.name);
    await expect(reloadedBomRow.getByLabel('BOM row 1 unit price', { exact: true })).toHaveValue(String(pricedItem.unit_price));
    await expect(reloadedBomRow.getByLabel('BOM row 1 total amount', { exact: true })).toHaveValue(expectedAmount);
  });

  test('3.9b - Every document stage saves its business record or printable draft and reloads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/documents');
    let ticketCode = '';

    const selectTicket = async () => {
      const search = page.getByPlaceholder(/search ticket by id/i);
      if (ticketCode) {
        await search.fill(ticketCode.replace(/\D/g, ''));
      } else {
        await search.click();
      }
      const ticketButton = page.getByRole('button', { name: ticketCode ? new RegExp(ticketCode) : /TKT-\d+/ }).first();
      await expect(ticketButton).toBeVisible();
      ticketCode ||= (await ticketButton.textContent()).match(/TKT-\d+/)?.[0] || '';
      await ticketButton.click();
      await expect(page.getByRole('link', { name: /Open ticket/ })).toBeVisible({ timeout: 15000 });
    };
    const openStage = async (name) => {
      await page.getByRole('button', { name }).click();
      await expect(page.getByText('Loading the ticket and saved document data...')).toBeHidden({ timeout: 15000 });
    };

    await selectTicket();

    await openStage('Technical Data Sheet');
    await page.getByLabel('Primary Electric Supply').fill('E2E utility supply');
    const tdsRecordResponse = page.waitForResponse((response) => (
      response.url().includes('/api/services/technical-data-sheets/')
      && ['POST', 'PATCH'].includes(response.request().method())
    ));
    const tdsDraftResponse = page.waitForResponse((response) => (
      response.url().includes('/document-draft/') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Save data sheet' }).click();
    expect((await tdsRecordResponse).ok()).toBeTruthy();
    expect((await tdsDraftResponse).ok()).toBeTruthy();
    await expect(page.getByText('Technical data sheet and printable draft saved successfully.')).toBeVisible();

    await openStage('Solar Installation Contract');
    await page.getByPlaceholder('[Solar PV System Description]').fill('E2E preserved contract scope');
    const contractRecordResponse = page.waitForResponse((response) => (
      response.url().includes('/api/services/installation-contracts/')
      && ['POST', 'PATCH'].includes(response.request().method())
    ));
    const contractDraftResponse = page.waitForResponse((response) => (
      response.url().includes('/document-draft/') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Save contract' }).click();
    expect((await contractRecordResponse).ok()).toBeTruthy();
    expect((await contractDraftResponse).ok()).toBeTruthy();
    await expect(page.getByText('Installation contract and printable draft saved successfully.')).toBeVisible();

    await openStage('PV Solar Site Commissioning Checklist');
    await page.getByLabel('Site Name').fill('E2E commissioning site');
    const commissioningResponse = page.waitForResponse((response) => (
      response.url().includes('/api/services/solar-commissioning-checklists/')
      && ['POST', 'PATCH'].includes(response.request().method())
    ));
    await page.getByRole('button', { name: 'Save checklist' }).click();
    expect((await commissioningResponse).ok()).toBeTruthy();
    await expect(page.getByText('Solar commissioning checklist saved.')).toBeVisible();

    await openStage('Turnover / Acceptance Form');
    await page.getByText('Document details', { exact: true }).click();
    await page.getByLabel('Project Installation Of').fill('E2E preserved handover scope');
    const turnoverDraftResponse = page.waitForResponse((response) => (
      response.url().includes('/document-draft/') && response.request().method() === 'POST'
    ));
    const turnoverRecordResponse = page.waitForResponse((response) => (
      response.url().includes('/api/services/turnover-acceptances/')
      && ['POST', 'PATCH'].includes(response.request().method())
    ));
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await turnoverDraftResponse).ok()).toBeTruthy();
    expect((await turnoverRecordResponse).ok()).toBeTruthy();
    await expect(page.getByText('Turnover draft saved.')).toBeVisible();
    await expect(page.getByLabel('Project Installation Of')).toHaveValue('E2E preserved handover scope');

    await openStage('Field Service Report');
    await page.getByLabel('Reference').fill('E2E preserved service report reference');
    const reportDraftResponse = page.waitForResponse((response) => (
      response.url().includes('/document-draft/') && response.request().method() === 'POST'
    ));
    await page.getByRole('button', { name: 'Save draft' }).click();
    expect((await reportDraftResponse).ok()).toBeTruthy();
    await expect(page.getByText('Document draft saved successfully.')).toBeVisible();

    await page.reload();
    await selectTicket();

    await openStage('Technical Data Sheet');
    await expect(page.getByLabel('Primary Electric Supply')).toHaveValue('E2E utility supply');
    await openStage('Solar Installation Contract');
    await expect(page.getByPlaceholder('[Solar PV System Description]')).toHaveValue('E2E preserved contract scope');
    await openStage('PV Solar Site Commissioning Checklist');
    await expect(page.getByLabel('Site Name')).toHaveValue('E2E commissioning site');
    await openStage('Turnover / Acceptance Form');
    await page.getByText('Document details', { exact: true }).click();
    await expect(page.getByLabel('Project Installation Of')).toHaveValue('E2E preserved handover scope');
    await openStage('Field Service Report');
    await expect(page.getByLabel('Reference')).toHaveValue('E2E preserved service report reference');
  });

  test('3.10 - Analytics page with charts', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/analytics', 'test-results/screenshots/03-admin-analytics.png');
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText('Total tickets', { exact: true })).toBeVisible();
    await expect(page.getByText('Completion rate', { exact: true })).toBeVisible();
    await expect(page.getByText(/Compared with/)).toBeVisible();
    await expect(page.getByText('Previous', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requests vs completions' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Primary service demand' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ticket statuses' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Technician workload' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demand by location' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask Analytics' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open analytics assistant' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Needs attention today' })).toBeVisible();
    // The colour key and scope note live in the collapsible reading guide.
    await page.getByText('How to read this page', { exact: true }).click();
    await expect(page.getByLabel('Dashboard and Analytics scope guide')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Forecast readiness' })).toBeVisible();
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('main p').filter({ hasText: /^E2E Solar Installation$/ }).first()).toBeVisible();
    await expect(page.locator('main .truncate')).toHaveCount(0);
    const cardGap = async (upperHeading, lowerHeading) => {
      const upper = await page.getByRole('heading', { name: upperHeading }).locator('..').locator('..').locator('..').boundingBox();
      const lower = await page.getByRole('heading', { name: lowerHeading }).locator('..').locator('..').locator('..').boundingBox();
      return lower.y - (upper.y + upper.height);
    };
    expect(await cardGap('Primary service demand', 'Technician workload')).toBeLessThanOrEqual(20);
    expect(await cardGap('Ticket statuses', 'Demand by location')).toBeLessThanOrEqual(20);
    expect(await cardGap('Demand by location', 'Forecast readiness')).toBeLessThanOrEqual(20);

    const assistantForecastResponse = page.waitForResponse((response) => (
      response.url().includes('/api/admin/analytics/')
      && response.url().includes('workspace=forecasting')
      && response.request().method() === 'GET'
    ));
    await page.getByRole('button', { name: 'Open analytics assistant' }).click();
    expect((await assistantForecastResponse).ok()).toBeTruthy();
    await page.getByPlaceholder('Ask about analytics or forecasts...').fill('forecast accuracy');
    const askAssistant = page.getByRole('button', { name: 'Ask analytics assistant' });
    await expect(askAssistant).toBeEnabled({ timeout: 15000 });
    await askAssistant.click();
    await expect(page.getByText(/forecast accuracy[^.]{0,60}(unavailable|not available)|no validated forecast accuracy/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/next 7 days forecast/i)).toHaveCount(0);
    const assistantPanel = page.getByRole('heading', { name: 'Analytics Assistant' }).locator('xpath=ancestor::section');
    await expect(assistantPanel.locator('[class*="overflow-hidden"]')).toHaveCount(0);
    const assistantMessageOverflow = await assistantPanel.locator('.rounded-2xl').evaluateAll((messages) => messages.some((message) => message.scrollWidth > message.clientWidth));
    expect(assistantMessageOverflow).toBeFalsy();
    await page.getByRole('button', { name: 'Close system assistant' }).click();

    const moreFilters = page.getByRole('button', { name: /More filters/ });
    const technicianFilter = page.getByRole('combobox', { name: 'Technician', exact: true });
    await expect(technicianFilter).toBeHidden();
    await moreFilters.click();
    await expect(page.getByLabel('Start date')).toBeVisible();
    await expect(technicianFilter).toBeVisible();
    await page.getByLabel('Start date').fill('2026-09-10');
    await page.getByLabel('End date').fill('2026-09-10');
    await page.getByLabel('Compare with').selectOption('custom');
    await page.getByLabel('Comparison start').fill('2026-08-05');
    await page.getByLabel('Comparison end').fill('2026-08-05');
    await expect(page.getByText(/Compared with Aug 5, 2026/)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Reset filters' }).click();
    await moreFilters.click();
    await expect(technicianFilter).toBeHidden();

    await page.getByRole('tab', { name: 'Technicians' }).click();
    await expect(page.getByRole('heading', { name: 'Top technician categories' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Technician leaderboard' })).toBeVisible();

    await page.getByRole('button', { name: '30 days', exact: true }).click();
    await page.getByRole('tab', { name: 'Demand', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Demand flow' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Service mix over time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demand versus completion output' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Demand share by location' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Service-location concentration' })).toBeVisible();
    await expect(page.getByLabel('Stacked service demand by period')).toBeVisible();
    await expect(page.getByLabel('Service request and completion output scatter plot')).toBeVisible();
    await expect(page.getByLabel('Demand share by location treemap')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Measurement limits' })).toBeVisible();
    const assistantDemandResponse = page.waitForResponse((response) => (
      response.url().includes('/api/admin/analytics/')
      && response.url().includes('workspace=demand')
      && response.request().method() === 'GET'
    ));
    await page.getByRole('button', { name: 'Open analytics assistant' }).click();
    expect((await assistantDemandResponse).ok()).toBeTruthy();
    await page.getByRole('button', { name: 'Close system assistant' }).click();

    await page.getByRole('tab', { name: 'Sales', exact: true }).click();
    await expect(page.getByText('Confirmed sales amount', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Financial data quality' })).toBeVisible();

    await page.getByRole('tab', { name: 'Inventory' }).click();
    await expect(page.getByText(/issue transactions are linked to tickets/i)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Operational shortage risk' })).toBeVisible();
    const inventoryCardOverflow = await page.locator('article').evaluateAll((cards) => cards.slice(0, 6).some((card) => card.scrollWidth > card.clientWidth));
    expect(inventoryCardOverflow).toBeFalsy();

    await page.getByRole('tab', { name: 'After-Sales & Maintenance' }).click();
    await expect(page.getByText('After-sales cases', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('main').getByText('Maintenance', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Forecasting' }).click();
    await expect(page.getByRole('heading', { name: 'Evidence and model status' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Historical monthly demand' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Historical demand by service' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Service-location density' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ticket-linked item consumption' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Projected item demand readiness' })).toBeVisible();
    await expect(page.getByText('Future quantities', { exact: true })).toBeVisible();
    await expect(page.getByText(/Forecasts use genuine records only/i)).toBeVisible();

    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByText('Total tickets', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Analytics', exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'After-Sales & Maintenance' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Forecasting' })).toBeVisible();
    await expect(page.locator('main .truncate')).toHaveCount(0);
    const mobileOverflow = await page.locator('main').evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(mobileOverflow).toBeFalsy();
    await page.screenshot({ path: 'test-results/screenshots/03-admin-analytics-mobile.png', fullPage: true });

    await page.goto('/admin/analytics?analyticsMode=legacy');
    await expect(page.getByRole('button', { name: 'Use decision view' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Ask Analytics' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Demand', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Cross-domain operational attention')).toBeVisible();
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

  test('3.13b - After-sales case resolves with notes and records activity', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/after-sales-cases');
    const uniqueSummary = `E2E after-sales resolution ${Date.now()}`;
    const createdCase = await page.evaluate(async (summary) => {
      const token = sessionStorage.getItem('afn_token');
      const headers = { Authorization: `Token ${token}`, 'Content-Type': 'application/json' };
      const ticketsResponse = await fetch('/api/services/service-tickets/?workspace=after_sales', { headers });
      const ticketsPayload = await ticketsResponse.json();
      const tickets = Array.isArray(ticketsPayload) ? ticketsPayload : ticketsPayload.results || [];
      if (!ticketsResponse.ok || tickets.length === 0) {
        throw new Error('No completed ticket is available for the after-sales E2E case.');
      }
      const createResponse = await fetch('/api/services/follow-up-cases/', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          service_ticket: tickets[0].id,
          case_type: 'follow_up',
          status: 'open',
          priority: 'high',
          summary,
        }),
      });
      const payload = await createResponse.json();
      if (!createResponse.ok) throw new Error(JSON.stringify(payload));
      return payload;
    }, uniqueSummary);

    await page.reload();
    const caseRow = page.locator('tbody tr').filter({ hasText: uniqueSummary });
    await expect(caseRow).toBeVisible();
    await caseRow.getByRole('button', { name: 'Mark as Done' }).click();
    await expect(page.getByRole('heading', { name: 'Resolve case' })).toBeVisible();
    await page.getByLabel('Resolution notes').fill('Confirmed the client concern was addressed and verified the result.');
    const updateResponse = page.waitForResponse((response) => (
      response.url().includes(`/follow-up-cases/${createdCase.id}/`)
      && response.request().method() === 'PATCH'
    ));
    await page.getByRole('button', { name: 'Resolve Case' }).click();
    expect((await updateResponse).ok()).toBeTruthy();
    await expect(page.getByText('After-sales case updated.')).toBeVisible();

    const resolvedRow = page.locator('tbody tr').filter({ hasText: uniqueSummary });
    await resolvedRow.getByRole('button', { name: 'Details' }).click();
    await expect(page.getByText('Case Activity')).toBeVisible();
    await expect(
      page.getByRole('list').getByText('Confirmed the client concern was addressed and verified the result.'),
    ).toBeVisible();
  });

  test('3.13c - Maintenance reminders can be stopped without deleting history', async ({ page }) => {
    let remindersStopped = false;
    let dismissPayload = null;
    const schedule = {
      id: 901,
      ticket_code: 'TKT-0901',
      client_name: 'Maintenance Opt-out Client',
      client_email: 'maintenance-optout@example.test',
      client_phone: '09170000901',
      service_type_name: 'Solar Preventive Maintenance',
      location: 'Malolos, Bulacan',
      maintenance_profile: 'residential_solar',
      interval_days: 180,
      last_service_date: '2026-04-17',
      next_due_date: '2026-10-17',
      notify_on_date: '2026-10-10',
      status: 'due',
      days_until_due: 0,
      risk_score: 70,
      risk_level: 'high',
      maintenance_notes: 'Inspect inverter and clean the panel array.',
      due_soon_notified_at: '2026-10-10T08:00:00Z',
      three_day_notified_at: null,
      due_notified_at: null,
      client_notified_at: '2026-10-10T08:00:00Z',
      client_three_day_notified_at: null,
      client_due_notified_at: null,
    };

    await page.route('**/api/services/maintenance-schedules/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.endsWith('/summary/')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            total: 1,
            active: remindersStopped ? 0 : 1,
            upcoming: 0,
            due_today: remindersStopped ? 0 : 1,
            overdue: 0,
            completed: 0,
            dismissed: remindersStopped ? 1 : 0,
          }),
        });
      }
      if (url.pathname.endsWith('/901/dismiss/') && request.method() === 'POST') {
        dismissPayload = request.postDataJSON();
        remindersStopped = true;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...schedule, status: 'dismissed' }),
        });
      }
      if (request.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            count: remindersStopped ? 0 : 1,
            next: null,
            previous: null,
            results: remindersStopped ? [] : [schedule],
          }),
        });
      }
      return route.continue();
    });

    await visitWorkspacePage(page, '/admin/maintenance');
    await expect(page.getByRole('heading', { name: 'Maintenance schedules' })).toBeVisible();
    await page.getByRole('button', { name: /Maintenance Opt-out Client/ }).click();
    await page.getByRole('button', { name: 'Stop reminders' }).click();

    const dialog = page.getByRole('dialog', { name: 'Stop maintenance reminders?' });
    await expect(dialog).toContainText('without deleting its history');
    await expect(dialog.getByRole('button', { name: 'Stop reminders' })).toBeDisabled();
    await dialog.getByLabel('Reason').fill('Client declined future preventive maintenance reminders.');
    await dialog.getByRole('button', { name: 'Stop reminders' }).click();

    await expect(page.getByRole('status')).toContainText('Maintenance reminders stopped');
    await expect(page.getByText('Maintenance Opt-out Client')).toHaveCount(0);
    expect(dismissPayload).toEqual({ reason: 'Client declined future preventive maintenance reminders.' });
  });

  test('3.14 - Admin Settings form loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/settings', 'test-results/screenshots/03-admin-settings.png');
    await expect(page.locator('input, select, textarea, [class*="setting"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('3.14b - Admin publishes a permitted completed project to the public landing page', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/landing-page', 'test-results/screenshots/03-admin-landing-editor.png');
    // The editor opens on the hero tab with nothing to publish until something changes.
    await expect(page.getByText('Everything here is published.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish changes' })).toBeDisabled();
    await page.getByRole('navigation', { name: 'Landing page sections' }).getByRole('button', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/tab=projects/);
    await expect(page.getByRole('link', { name: /view on the published page/i })).toHaveAttribute('href', '/admin/landing-page/preview#our-work');
    await expect(page.getByRole('heading', { name: 'Our Work' })).toBeVisible();
    await page.getByRole('button', { name: 'Add completed project' }).click();
    await expect(page.getByText(/Unsaved changes/)).toBeVisible();

    const project = page.locator('article').filter({ has: page.getByRole('heading', { name: /^Project \d+/ }) }).last();
    await project.getByLabel('Project title').fill('E2E Residential Solar Installation');
    await project.getByLabel('Service type').selectOption('solar');
    await project.getByLabel('Completion date').fill('2026-08-20');
    await project.getByLabel('General location only').fill('Malolos, Bulacan');
    await project.getByLabel('Project summary').fill('Completed rooftop solar installation and commissioning for a residential property.');
    await project.getByLabel('Project image URL').fill('/hero-bg.png');
    await project.getByLabel(/Client permission confirmed/).check();
    await project.getByLabel(/Publish publicly/).check();

    const publishResponse = page.waitForResponse((response) => response.url().includes('/api/admin/settings/') && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Publish changes' }).click();
    expect((await publishResponse).status()).toBe(200);
    await expect(page.getByText('Landing page published successfully.')).toBeVisible();
    await expect(page.getByText('Everything here is published.')).toBeVisible();

    await page.evaluate(() => {
      sessionStorage.removeItem('afn_token');
      sessionStorage.removeItem('afn_user');
      localStorage.removeItem('afn_token');
      localStorage.removeItem('afn_user');
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Completed projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'E2E Residential Solar Installation' })).toBeVisible();
    await expect(page.getByText('Malolos, Bulacan')).toBeVisible();
    await page.screenshot({ path: 'test-results/screenshots/03-public-our-work.png', fullPage: true });
  });

  test('3.15 - Activity Logs table loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/activity-logs', 'test-results/screenshots/03-admin-activity-logs.png');
    await expect(page.getByText('Filtered results')).toBeVisible();
    await expect(page.getByText('Recorded today')).toBeVisible();
    await expect(page.getByText('Needs attention')).toBeVisible();
    await expect(page.getByText('User actions', { exact: true })).toBeVisible();

    const firstEvent = page.locator('article').first();
    await firstEvent.getByRole('button', { name: 'View details' }).click();
    await expect(firstEvent.getByText('Technical Context')).toBeVisible();
    await expect(firstEvent.getByText(/^ACT-\d+$/)).toBeVisible();
    await expect(firstEvent.getByText('Exact time')).toBeVisible();
    await expect(firstEvent.getByText('IP address')).toBeVisible();
    await expect(firstEvent.getByText('Event metadata')).toBeVisible();
    await firstEvent.getByRole('button', { name: 'Hide details' }).click();

    // Earlier workflows can push service events beyond the first page. Use the
    // page's server-backed search so this assertion is independent of suite order.
    const serviceSearchResponses = Promise.all([
      page.waitForResponse((response) => (
        response.url().includes('/api/admin/activity-logs/?')
        && response.url().includes('search=serviceticket')
        && response.status() === 200
      )),
      page.waitForResponse((response) => (
        response.url().includes('/api/admin/activity-logs/summary/')
        && response.url().includes('search=serviceticket')
        && response.status() === 200
      )),
    ]);
    await page.getByRole('searchbox', { name: 'Find an activity' }).fill('serviceticket');
    await serviceSearchResponses;
    const serviceEvent = page.locator('article').filter({ hasText: /Service request|Service ticket/i }).first();
    await expect(serviceEvent).toBeVisible();
    await serviceEvent.getByRole('button', { name: 'View details' }).click();
    await expect(serviceEvent.getByRole('link', { name: 'Open Service Tickets' })).toHaveAttribute('href', '/admin/service-tickets');

    const refreshResponses = Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/admin/activity-logs/?') && response.status() === 200),
      page.waitForResponse((response) => response.url().includes('/api/admin/activity-logs/summary/') && response.status() === 200),
    ]);
    await page.getByRole('button', { name: 'Refresh' }).click();
    await refreshResponses;
    await expect(page.getByText(/Last refreshed/)).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    await expect((await download).suggestedFilename()).toMatch(/^activity-logs-\d{4}-\d{2}-\d{2}\.csv$/);
    await expect(page.getByRole('status')).toContainText(/Exported activity-logs-/);

    await page.getByRole('button', { name: /^Filters/ }).click();
    const filteredResponses = Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/admin/activity-logs/?') && response.url().includes('action=create') && response.status() === 200),
      page.waitForResponse((response) => response.url().includes('/api/admin/activity-logs/summary/') && response.url().includes('action=create') && response.status() === 200),
    ]);
    await page.getByLabel('Action type').selectOption('create');
    await filteredResponses;
    await expect(page.getByRole('button', { name: 'Remove Action type filter' })).toContainText('Create');
  });

  test('3.15b - Activity Log technical evidence fits mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await visitWorkspacePage(page, '/admin/activity-logs');
    const firstEvent = page.locator('article').first();
    await firstEvent.getByRole('button', { name: 'View details' }).click();
    await expect(firstEvent.getByText('Technical Context')).toBeVisible();
    await expect(firstEvent.getByRole('button', { name: 'Copy event ID' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: 'test-results/screenshots/03-admin-activity-log-details-mobile.png', fullPage: true });
  });

  test('3.16 - Admin Profile page loads', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/profile', 'test-results/screenshots/03-admin-profile.png');
    const hasProfileUi =
      await page.locator('input').first().isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByRole('button', { name: /edit profile/i }).isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/change password/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasProfileUi).toBeTruthy();
    await expect(page.getByRole('heading', { name: 'Password & Security' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    const firstName = page.getByLabel('First Name');
    const originalFirstName = await firstName.inputValue();
    await firstName.fill('Unsaved Admin Name');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Edit Profile' }).click();
    await expect(page.getByLabel('First Name')).toHaveValue(originalFirstName);
  });

  test('3.17 - Admin Messages / Chat interface', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/messages', 'test-results/screenshots/03-admin-messages.png');
  });

  test('3.18 - Admin Client Support page', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/client-support', 'test-results/screenshots/03-admin-client-support.png');
    const relatedTicketLink = page.getByRole('link', { name: /Related to TKT-\d+/ });
    await expect(relatedTicketLink).toBeVisible();
    const linkedTicketCode = (await relatedTicketLink.textContent()).match(/TKT-\d+/)?.[0];
    const linkedTicketHref = await relatedTicketLink.getAttribute('href');
    expect(linkedTicketHref).toMatch(/^\/admin\/service-tickets\?ticketId=\d+$/);

    await relatedTicketLink.click();
    await expect(page).toHaveURL(/\/admin\/service-tickets\?ticketId=\d+$/);
    await expect(page.getByRole('heading', { name: linkedTicketCode })).toBeVisible();
    await page.getByRole('button', { name: 'Close ticket actions dialog' }).click();
    await expect(page).toHaveURL(/\/admin\/service-tickets$/);
  });

  test('3.18b - Client Support keeps reply drafts bound to their case during live refresh', async ({ page }) => {
    let supportCaseRequests = 0;
    let supportCasePhase = 'initial';
    const firstCase = {
      id: 9911,
      case_code: 'SUP-9911',
      group_key: 'customer_support_draft_case_one',
      subject: 'Draft case one',
      client_name: 'Draft Client One',
      category: 'technical',
      priority: 'normal',
      status: 'open',
      updated_at: '2026-10-17T01:00:00Z',
      ticket_id: null,
      ticket_code: null,
    };
    const secondCase = {
      ...firstCase,
      id: 9912,
      case_code: 'SUP-9912',
      group_key: 'customer_support_draft_case_two',
      subject: 'Draft case two',
      client_name: 'Draft Client Two',
      updated_at: '2026-10-17T00:00:00Z',
    };
    await page.route(/\/api\/messages\/support-cases\/(?:\?.*)?$/, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      supportCaseRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          supportCasePhase === 'initial' ? firstCase : { ...firstCase, status: 'resolved' },
          secondCase,
        ]),
      });
    });

    await page.goto('/admin/client-support');
    await expect(page.getByPlaceholder('Reply to Draft Client One...')).toBeVisible();
    const firstDraft = 'This reply belongs only to the first support case.';
    await page.getByPlaceholder('Reply to Draft Client One...').fill(firstDraft);

    supportCasePhase = 'first-resolved';
    const requestsBeforeRefresh = supportCaseRequests;
    const refreshResponse = page.waitForResponse((response) => (
      response.url().includes('/api/messages/support-cases/')
      && supportCaseRequests > requestsBeforeRefresh
      && response.status() === 200
    ));
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('afn:messages-changed')));
    await refreshResponse;

    const secondReply = page.getByPlaceholder('Reply to Draft Client Two...');
    await expect(secondReply).toBeVisible();
    await expect(secondReply).toHaveValue('');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: /Draft case one/ }).click();
    await expect(page.getByPlaceholder('Reply to Draft Client One...')).toHaveValue(firstDraft);
  });

  test('3.19 - Admin Sales Records page', async ({ page }) => {
    await page.route('**/api/services/sales-records/**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          count: 1,
          next: null,
          previous: null,
          results: [{
            id: 901,
            record_number: 'SAL-2026-SOURCE',
            ticket: 1,
            ticket_code: 'TKT-0001',
            client_name: 'E2E Client',
            service_summary: 'E2E Solar Installation',
            status: 'draft',
            sale_date: null,
            created_at: '2026-09-08T00:00:00Z',
            updated_at: '2026-09-08T00:00:00Z',
            agreed_total: '100000.00',
            agreed_total_source: 'accepted_quotation',
            currency_code: 'PHP',
            quotation_number: 'QUO-E2E-001',
            notes: '',
            line_items: [],
            source_snapshot: { ticket: {}, installed_equipment: [], inventory_issues: [] }
          }]
        })
      });
    });
    await visitWorkspacePage(page, '/admin/sales-records', 'test-results/screenshots/03-admin-sales-records.png');
    await expect(page.getByRole('heading', { name: 'Sales Records', exact: true })).toBeVisible();
    await expect(page.getByText(/Payments are collected outside the system/i)).toBeVisible();
    await expect(page.getByText('Recorded contract value', { exact: true })).toBeVisible();
    await expect(page.getByText('Source: Accepted quotation', { exact: true })).toBeVisible();
    await expect(page.getByText(/Value controlled by accepted quotation/i)).toBeVisible();
    await expect(page.getByText(/does not indicate payment received/i)).toBeVisible();
    await expect(page.getByLabel('Recorded contract value (manual)')).toHaveCount(0);
  });

  test('3.20 - Coverage Heatmap with map', async ({ page }) => {
    await visitWorkspacePage(page, '/admin/coverage-heatmap', 'test-results/screenshots/03-admin-coverage-heatmap.png');
    await expect(page.locator('[class*="leaflet"], [class*="map"], .leaflet-container').first()).toBeVisible({ timeout: 10000 });
    const densityLayer = page.getByRole('button', { name: 'Service density' });
    await expect(densityLayer).toHaveAttribute('aria-pressed', 'true');
    await densityLayer.click();
    await expect(densityLayer).toHaveAttribute('aria-pressed', 'false');
    await densityLayer.click();
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByLabel('Client locations')).toBeVisible();
  });

  test('3.21 - Admin Job History loads', async ({ page, request }) => {
    const technicianAuthState = loadAuthStateFromBackend('tech_test');
    const historyResponse = await request.get('/api/technician/history/?techName=tech_test', {
      headers: { Authorization: `Token ${technicianAuthState.token}` },
    });
    expect(historyResponse.ok()).toBeTruthy();
    const historyPayload = await historyResponse.json();
    const completedJob = historyPayload.results.find((job) => job.service === 'E2E Solar Installation');
    expect(completedJob?.ticketId).toBeTruthy();
    const reconciliationResponse = await request.get(`/api/services/service-tickets/${completedJob.ticketId}/equipment-reconciliation/`, {
      headers: { Authorization: `Token ${technicianAuthState.token}` },
    });
    expect(reconciliationResponse.ok()).toBeTruthy();
    const reconciliation = await reconciliationResponse.json();
    const returnableItem = reconciliation.items.find((item) => item.item_name === 'E2E Safety Kit');
    expect(returnableItem?.returnable_quantity).toBeGreaterThan(0);
    const submitResponse = await request.post(`/api/services/service-tickets/${completedJob.ticketId}/equipment-reconciliation/`, {
      headers: { Authorization: `Token ${technicianAuthState.token}` },
      data: {
        action: 'submit',
        returns: [{ item_id: returnableItem.item_id, quantity: 1 }],
        condition: 'sealed',
        notes: 'Technician declared one sealed kit for warehouse verification.',
      },
    });
    expect(submitResponse.status()).toBe(201);

    await visitWorkspacePage(page, '/admin/job-history', 'test-results/screenshots/03-admin-job-history.png');
    await expect(page.getByText('Completed Jobs').first()).toBeVisible();
    const csvDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toMatch(/^completed-jobs-\d{4}-\d{2}-\d{2}\.csv$/);
    await page.getByRole('button', { name: 'View job details' }).first().click();
    const details = page.getByRole('dialog', { name: /E2E Solar Installation/i });
    await expect(details).toBeVisible();
    await expect(details.getByText('Actual Duration')).toBeVisible();
    await expect(details.getByText('Official Documents')).toBeVisible();
    await expect(details.getByText('Assigned Team')).toBeVisible();
    await expect(details.getByText('Close details', { exact: true })).toBeVisible();

    await details.getByRole('button', { name: 'Review equipment returns' }).click();
    const returnDialog = page.getByRole('dialog', { name: /Verify equipment returns/i });
    await expect(returnDialog).toBeVisible();
    await expect(returnDialog.getByText('E2E Safety Kit')).toBeVisible();
    await expect(returnDialog.getByText('Technician declared: Sealed / unused')).toBeVisible();
    await returnDialog.getByLabel('Condition observed by receiver').selectOption('sealed');
    await returnDialog.getByLabel('Receiving note').fill('Warehouse physically counted one sealed safety kit.');
    const returnRequestPromise = page.waitForRequest((request) => (
      request.url().includes('/equipment-reconciliation/')
      && request.method() === 'POST'
    ));
    const returnResponsePromise = page.waitForResponse((response) => (
      response.url().includes('/equipment-reconciliation/')
      && response.request().method() === 'POST'
    ));
    await returnDialog.getByRole('button', { name: 'Verify and add to stock' }).click();
    const returnRequest = await returnRequestPromise;
    const returnResponse = await returnResponsePromise;
    expect(returnResponse.status()).toBe(200);
    await expect(returnDialog.getByRole('status')).toContainText('Inventory is now available');
    expect(returnRequest.postDataJSON()).toEqual({
      action: 'verify',
      return_request_id: expect.any(Number),
      reviewed_condition: 'sealed',
      review_notes: 'Warehouse physically counted one sealed safety kit.',
    });
    await expect(returnDialog.getByText('No returns await verification')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(returnDialog).toBeHidden();
    await expect(details).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/03-admin-job-history-details.png', fullPage: false });
    await page.keyboard.press('Escape');
    await expect(details).toBeHidden();
  });
});
