// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Admin Settings change what the system does. Each setting is changed on the real
// /admin/settings page, its effect is checked where it lands (client notifications, technician
// arrival, printed documents), and it is changed back. Settings are global, so every value is
// restored in `finally` even when a step fails.
// - Location Range Validation off (reason required) lets a far-away arrival through; on refuses it;
// - In-app Alerts off: the client gets no notice for a submitted and approved request; on again: they do;
//   saving it does not change who last set arrival validation;
// - Company Name and Address appear on the Documents header and the contract form;
// - an admin who may view but not publish the public site can save system settings;
// - a stored overtime limit outside the usual list shows as it is; controls are 44 px.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const FAR = { latitude: 14.4, longitude: 121.3 };

test.describe('Settings effects', () => {
  test.describe.configure({ mode: 'serial', timeout: 480000 });

  test('57 - each setting changes what the system does', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });
    const call = async (method, path, auth, data) => {
      const options = { headers: as(auth) };
      if (data !== undefined) options.data = data;
      const response = await request[method](path, options);
      const body = await response.json().catch(() => ({}));
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      return body;
    };
    const getSettings = () => call('get', '/api/admin/settings/', superAuth);
    const original = await getSettings();
    const stamp = Date.now();

    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    try {
      // ── Shared setup: a service, a technician and a client ──
      const service = await call('post', '/api/admin/services/', superAuth, {
        name: `E2E Settings ${stamp}`, description: 'Settings check.', estimated_duration: 60, estimated_cost: 1000,
        max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
        procedures: [{ step: 1, title: 'Work', description: 'Work.', requires_photo: false }],
        inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
      });
      const techName = `sttech${stamp}`.toLowerCase();
      const tech = await call('post', '/api/admin/technicians/', superAuth, {
        username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Settings', last_name: `Tech${stamp}`, phone: '09171234569', role: 'technician', status: 'active', is_available: true,
      });
      await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const techAuth = loadAuthStateFromBackend(techName);
      await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
      const clientName = `stclient${stamp}`.toLowerCase();
      await call('post', '/api/admin/users/', superAuth, {
        username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Settings', last_name: `Client${stamp}`, phone: '09171234598', role: 'client',
      });
      const clientAuth = loadAuthStateFromBackend(clientName);
      let nextDay = 210;
      const book = async () => {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
          const response = await request.post('/api/services/service-requests/', {
            headers: as(clientAuth),
            data: {
              service_type: service.id, description: 'Settings check', priority: 'Normal',
              location_address: 'Settings Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
              preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
            },
          });
          if (response.ok()) return { ...(await response.json()), visitDate };
        }
        throw new Error('Could not book a request');
      };
      const approve = async (created) => {
        await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
        return list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
          .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      };
      const dispatchAndTravel = async (created) => {
        const ticket = await approve(created);
        await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: created.visitDate });
        await call('post', `/api/technician/jobs/${ticket.id}/start-navigation/`, techAuth);
        return ticket;
      };

      // ── The settings page, as the superadmin ──
      const page = await laptop.newPage();
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, superAuth);
      const saveState = page.getByTestId('settings-save-state');
      const save = page.getByRole('button', { name: 'Save changes' });
      const openSettings = async () => {
        await page.goto('/admin/settings');
        await expect(saveState).toHaveText('All changes are saved.', { timeout: 30000 });
        await page.waitForLoadState('networkidle');
        await expect(page.getByLabel('Holiday Dates')).toBeEnabled();
      };
      const saveAndWait = async () => {
        await save.click();
        await expect(saveState).toHaveText('System settings updated.', { timeout: 30000 });
      };
      await openSettings();
      for (const control of [page.getByRole('button', { name: 'Refresh' }), save, page.getByRole('button', { name: 'Mon', exact: true })]) {
        expect((await control.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }

      // ── Location Range Validation: off lets a far arrival through, on refuses it ──
      const validation = page.getByRole('checkbox', { name: /^Location Range Validation/ });
      if (!(await validation.isChecked())) {
        await validation.check();
        await saveAndWait();
      }
      await validation.uncheck();
      await save.click();
      await expect(saveState).toHaveText('A reason is required when location validation is turned off.');
      await page.getByLabel('Reason for Disabling').fill('GPS outage at the depot this week.');
      await saveAndWait();
      await expect(page.getByText('Bypassed')).toBeVisible();
      expect((await getSettings()).locationValidationEnabled).toBe(false);
      const bypassJob = await dispatchAndTravel(await book());
      await call('post', `/api/technician/jobs/${bypassJob.id}/arrive/`, techAuth, FAR);
      // One open field job at a time: hold this one before travelling to the next.
      await call('post', `/api/technician/jobs/${bypassJob.id}/status/`, techAuth, { status: 'on_hold', reason: 'Paused by the settings test' });

      await validation.check();
      await saveAndWait();
      const blockedJob = await dispatchAndTravel(await book());
      const refused = await request.post(`/api/technician/jobs/${blockedJob.id}/arrive/`, { headers: as(techAuth), data: FAR });
      expect(refused.status()).toBe(400);
      expect((await refused.json()).error).toBe('You are outside the allowed arrival range.');
      await call('post', `/api/technician/jobs/${blockedJob.id}/arrive/`, techAuth, SITE);
      const validationStamp = (await getSettings()).locationValidationUpdatedAt;

      // ── In-app Alerts off: no client notice; on again: notices return ──
      const inApp = page.getByRole('checkbox', { name: /^In-app Alerts/ });
      await expect(page.getByRole('checkbox', { name: /^Notifications/ })).toBeChecked();
      await inApp.uncheck();
      await saveAndWait();
      expect((await getSettings()).enableInAppNotifications).toBe(false);
      const quiet = await book();
      await approve(quiet);
      const clientNotices = async () => list(await call('get', '/api/notifications/', clientAuth));
      expect((await clientNotices()).filter((notice) => Number(notice.related_request) === quiet.id)).toHaveLength(0);
      const clientPage = await laptop.newPage();
      await seedAuthState(clientPage, clientAuth);
      await clientPage.goto('/client/notifications');
      await expect(clientPage.getByRole('heading', { name: `Service Request #${quiet.id} Approved`, exact: true })).toHaveCount(0);

      await inApp.check();
      await saveAndWait();
      const loud = await book();
      await approve(loud);
      await clientPage.reload();
      await expect(clientPage.getByRole('heading', { name: `Service Request #${loud.id} Approved`, exact: true })).toBeVisible({ timeout: 30000 });
      await clientPage.close();
      // Saving the alert switches did not record anyone as changing arrival validation.
      expect((await getSettings()).locationValidationUpdatedAt).toBe(validationStamp);

      // ── Company details reach the printed documents ──
      const companyName = `Sunrise Solar ${stamp}`;
      await page.getByLabel('Company Name').fill(companyName);
      await page.getByLabel('Company Address').fill('12 Rizal Street, Lucena City');
      await saveAndWait();
      const docsPage = await laptop.newPage();
      await seedAuthState(docsPage, superAuth);
      await docsPage.goto(`/admin/documents?ticket=${blockedJob.id}&template=field_service_report`);
      await expect(docsPage.locator('.afn-company-name').first()).toHaveText(companyName, { timeout: 30000 });
      await expect(docsPage.locator('.afn-company-meta').first()).toContainText('12 Rizal Street, Lucena City');
      await docsPage.goto(`/admin/documents?ticket=${blockedJob.id}&template=installation_contract`);
      await expect(docsPage.getByPlaceholder('[Company Name]').first()).toHaveValue(companyName, { timeout: 30000 });
      await docsPage.close();

      // ── A stored overtime limit outside the usual list shows as it is ──
      await call('put', '/api/admin/settings/', superAuth, { allowOvertimeDispatch: true, overtimeDailyCapacityMinutes: 480 });
      await openSettings();
      await expect(page.getByLabel('Overtime Daily Limit')).toHaveValue('480');
      await expect(page.getByLabel('Overtime Daily Limit').locator('option:checked')).toHaveText('8 hours');

      // ── An admin who may view (not publish) the public site can save system settings ──
      const scopedName = `stadmin${stamp}`.toLowerCase();
      const scoped = await call('post', '/api/admin/users/', superAuth, {
        username: scopedName, email: `${scopedName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Scoped', last_name: `Admin${stamp}`, phone: '09171234599', role: 'admin',
      });
      const scopedId = scoped.id ?? scoped.user?.id;
      await call('put', `/api/users/${scopedId}/capabilities/`, superAuth, {
        capabilities: ['system.settings.view', 'system.settings.manage', 'public_site.view'],
      });
      const scopedPage = await laptop.newPage();
      await seedAuthState(scopedPage, loadAuthStateFromBackend(scopedName));
      await scopedPage.goto('/admin/settings');
      const scopedState = scopedPage.getByTestId('settings-save-state');
      await expect(scopedState).toHaveText('All changes are saved.', { timeout: 30000 });
      await scopedPage.waitForLoadState('networkidle');
      // This admin may not view SLA rules: the settings still load with their real values.
      await expect(scopedPage.getByRole('checkbox', { name: /^Notifications/ })).toBeChecked();
      await expect(scopedPage.getByText(/SLA rules are not available/)).toBeVisible();
      await scopedPage.getByRole('spinbutton', { name: /^Maintenance Reminder/ }).fill('9');
      await scopedPage.getByRole('button', { name: 'Save changes' }).click();
      await expect(scopedState).toHaveText('System settings updated.', { timeout: 30000 });
      expect((await getSettings()).maintenanceReminderDays).toBe(9);
      await scopedPage.screenshot({ path: 'test-results/screenshots/57-settings-laptop.png' });
      await scopedPage.close();
    } finally {
      const restore = { ...original };
      Object.keys(restore).filter((key) => key.startsWith('can') || key.startsWith('locationValidationUpdated') || key === 'overtimeDailyCapacityHours')
        .forEach((key) => delete restore[key]);
      const restored = await request.put('/api/admin/settings/', { headers: as(superAuth), data: restore });
      await laptop.close();
      expect(restored.ok(), `restoring settings: ${restored.status()} ${await restored.text()}`).toBeTruthy();
    }
    // Every value this test changed is back, so later specs see the settings they expect.
    const after = await getSettings();
    for (const key of [
      'enableNotifications', 'enableInAppNotifications', 'locationValidationEnabled', 'locationValidationDisabledReason',
      'arrivalRadiusMeters', 'companyName', 'companyAddress', 'allowOvertimeDispatch', 'overtimeDailyCapacityMinutes',
      'maintenanceReminderDays',
    ]) {
      expect(after[key], key).toEqual(original[key]);
    }
  });
});
