// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every button on /admin/dashboard, for both the admin and the superadmin account.
// Approve, Require Inspection and Reject run against the real API. The stats payload is
// topped up (never replaced) so every attention chip, SLA row and schedule row exists,
// which lets each one be clicked and its destination checked.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
let nextDay = 40;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data) => {
    const response = await request[method](path, data === undefined ? { headers } : { headers, data });
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return { get: (path) => call('get', path), post: (path, data) => call('post', path, data ?? {}) };
};

const PAGE_PROBLEMS = /Something went wrong|You do not have the necessary permissions/;

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Dashboard controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    let auth;
    let superAuth;
    let clientAuth;

    test.beforeAll(() => {
      auth = loadAuthStateFromBackend(username);
      superAuth = loadAuthStateFromBackend('superadmin_test');
      clientAuth = loadAuthStateFromBackend('client_test');
    });

    test(`15 - ${username}: every dashboard button works`, async ({ page, request }) => {
      const stamp = Date.now();
      const admin = apiAs(request, superAuth);
      const client = apiAs(request, clientAuth);

      const service = await admin.post('/api/admin/services/', {
        name: `E2E Dashboard ${username} ${stamp}`,
        description: 'Created by the dashboard controls check.',
        estimated_duration: 120,
        estimated_cost: 5000,
        max_daily_assignments: 5,
        is_active: true,
        requires_site_inspection: false,
        procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
        inspection_procedures: [],
        deposit_policy: 'none',
        deposit_value: 0,
      });
      const makeRequest = (tag) => client.post('/api/services/service-requests/', {
        service_type: service.id,
        description: `E2E dashboard ${tag} ${stamp}`,
        priority: 'Normal',
        location_address: 'Dashboard Street, Brgy. Pulo',
        location_city: 'Cabuyao',
        location_province: 'Laguna',
        preferred_date: dayKey(nextDay++),
        latitude: '14.2786',
        longitude: '121.125',
      });
      const toApprove = await makeRequest('approve');
      const toInspect = await makeRequest('inspect');
      const toReject = await makeRequest('reject');
      const labels = new Map([
        [toApprove.id, `Approve me ${stamp}`],
        [toInspect.id, `Inspect me ${stamp}`],
        [toReject.id, `Reject me ${stamp}`],
      ]);
      const handled = new Set();
      let realTicketId = null;

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);

      await page.route('**/api/dashboard/stats/**', async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        const mine = [...labels.entries()]
          .filter(([id]) => !handled.has(id))
          .map(([id, label]) => ({ id, client: 'Dashboard Client', service_type: label, status: 'Pending', request_date: new Date().toISOString() }));
        payload.pending_requests = [...mine, ...list(payload.pending_requests).filter((entry) => !labels.has(entry.id))];
        payload.overview = {
          ...payload.overview,
          pending_approvals: Math.max(1, payload.pending_requests.length),
          pending_equipment_requests: 2,
          low_stock_items: 3,
          out_of_stock: 1,
          unassigned_scheduled_jobs: 1,
          due_maintenance: 1,
          overdue_cases: 1,
        };
        payload.sla_overview = { ...payload.sla_overview, warning_count: 1, overdue_count: 1 };
        payload.sla_queue = [
          { entity_type: 'request', id: toInspect.id, client: 'SLA Warning Client', service_type: labels.get(toInspect.id), status: 'Pending', sla: { state: 'warning', label: 'Due soon' } },
          { entity_type: 'ticket', id: 999999, client: 'SLA Overdue Client', service_type: 'Overdue job', status: 'Scheduled', sla: { state: 'overdue', label: 'Late' }, scheduled_date: dayKey(1) },
        ];
        payload.client_schedule = [
          { id: 888888, client: 'Schedule Client', service_type: 'Scheduled visit', status: 'Scheduled', scheduled_date: dayKey(3), scheduled_time: '09:00' },
          ...list(payload.client_schedule),
        ];
        if (realTicketId) {
          payload.operations = {
            ...payload.operations,
            active_technician_jobs: [{
              id: realTicketId, technician: 'Dashboard Tech', client: 'Dashboard Client', service_type: 'Dashboard job',
              status: 'Navigating', priority: 'Normal', progress: 35, progress_label: 'On the way',
              progress_basis: 'workflow_status', progress_paused: false, progress_track: 'service', progress_track_label: 'Service visit',
            }],
          };
        }
        await route.fulfill({ response, json: payload });
      });

      const openDashboard = async () => {
        await page.goto('/admin/dashboard');
        await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeEnabled({ timeout: 30000 });
      };
      const expectPageOk = async (url) => {
        await expect(page).toHaveURL(url);
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await expect(page.locator('body')).not.toContainText(PAGE_PROBLEMS);
      };
      const pendingRow = (label) => page.locator('#pending-approvals div.rounded-xl').filter({ hasText: label });
      const details = page.getByRole('dialog', { name: 'Service Request Details' });
      const openDetails = async (id) => {
        await pendingRow(labels.get(id)).getByRole('button', { name: 'View Details' }).click();
        await expect(details).toBeVisible();
        await expect(details).toContainText(`E2E dashboard`);
      };

      await openDashboard();

      // ── Refresh and live-snapshot header ──
      const refreshed = page.waitForResponse((r) => r.url().includes('/api/dashboard/stats/') && r.status() === 200);
      await page.getByRole('button', { name: 'Refresh dashboard' }).click();
      await refreshed;

      // ── Request details: close button, Escape, backdrop ──
      await openDetails(toApprove.id);
      await details.getByRole('button', { name: 'Close request details' }).click();
      await expect(details).toBeHidden();
      await openDetails(toApprove.id);
      await page.keyboard.press('Escape');
      await expect(details).toBeHidden();

      // ── Approve for Service (real) ──
      await openDetails(toApprove.id);
      await details.getByRole('button', { name: 'Approve for Service' }).click();
      const approveDialog = page.getByRole('dialog', { name: 'Approve request for service?' });
      await approveDialog.getByRole('button', { name: 'Dismiss' }).click();
      await expect(approveDialog).toBeHidden();
      await details.getByRole('button', { name: 'Approve for Service' }).click();
      handled.add(toApprove.id);
      await approveDialog.getByRole('button', { name: 'Approve request' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Request approved and prepared for dispatch.' })).toBeVisible();
      await expect.poll(async () => (await admin.get(`/api/services/service-requests/${toApprove.id}/`)).status).not.toBe('Pending');
      const tickets = list(await admin.get(`/api/services/service-tickets/?request=${toApprove.id}`));
      realTicketId = tickets.find((entry) => Number(entry.request) === Number(toApprove.id) || Number(entry.request_id) === Number(toApprove.id))?.id;
      expect(realTicketId, 'Approving should create a service ticket').toBeTruthy();
      await page.getByRole('button', { name: 'Dismiss update' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Request approved' })).toBeHidden();

      // ── Require Inspection (real) ──
      await openDetails(toInspect.id);
      await details.getByRole('button', { name: 'Require Inspection' }).click();
      handled.add(toInspect.id);
      await page.getByRole('dialog', { name: 'Require site inspection?' }).getByRole('button', { name: 'Require inspection' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Request approved for site inspection.' })).toBeVisible();
      await expect.poll(async () => list(await admin.get(`/api/services/service-tickets/?request=${toInspect.id}`))
        .filter((entry) => Number(entry.request) === Number(toInspect.id) || Number(entry.request_id) === Number(toInspect.id)).length).toBeGreaterThan(0);

      // ── Reject (real), with the 8-character reason rule ──
      await openDetails(toReject.id);
      await details.getByText('More actions', { exact: true }).click();
      await details.getByRole('button', { name: 'Reject request' }).click();
      const rejectDialog = page.getByRole('dialog', { name: 'Reject request?' });
      await rejectDialog.getByLabel('Reason for rejection').fill('short');
      await expect(rejectDialog.getByRole('button', { name: 'Reject request' })).toBeDisabled();
      await rejectDialog.getByLabel('Reason for rejection').fill('Outside our current service area.');
      handled.add(toReject.id);
      await rejectDialog.getByRole('button', { name: 'Reject request' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Request rejected with the recorded reason.' })).toBeVisible();
      await expect.poll(async () => (await client.get(`/api/services/service-requests/${toReject.id}/`)).status).toBe('Cancelled');

      // ── Stat cards ──
      await openDashboard();
      await page.getByRole('button', { name: /^Pending Approvals: \d+\. Review on this dashboard/ }).click();
      await expect(page).toHaveURL(/\/admin\/dashboard#pending-approvals$/);
      await expect(page.locator('#pending-approvals')).toBeFocused();

      // Job history is a superadmin capability by default (users/rbac.py ROLE_CAPABILITY_MAP), so for
      // admin the Completed Today card is information only, not a link.
      const canSeeJobHistory = username === 'superadmin_test';
      const cards = [
        [/^Active Tickets: \d+\. Open service tickets/, /\/admin\/service-tickets\?focus=active$/],
        ...(canSeeJobHistory ? [[/^Completed Today: \d+\. Open completed jobs/, /\/admin\/job-history$/]] : []),
        [/^Active Technician Accounts: \d+\. Open technician tracking/, /\/admin\/technician-tracking$/],
      ];
      if (!canSeeJobHistory) {
        await openDashboard();
        await expect(page.getByText('Completed Today', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /^Completed Today:/ })).toHaveCount(0);
        // Typing the address directly must not open it either (redirect or permission notice).
        await page.goto('/admin/job-history');
        await expect.poll(async () => !page.url().includes('/admin/job-history')
          || /You do not have the necessary permissions/.test(await page.locator('body').innerText())).toBe(true);
      }
      for (const [name, url] of cards) {
        await openDashboard();
        await page.getByRole('button', { name }).click();
        await expectPageOk(url);
      }

      // ── Attention chips ──
      const chips = [
        ['Equipment requests: 2. Review equipment requests', /\/admin\/inventory#pending-equipment-requests$/],
        ['Low stock: 3. Open inventory', /\/admin\/inventory$/],
        ['Out of stock: 1. Open inventory', /\/admin\/inventory$/],
        ['Unassigned visits: 1. Open dispatch', /\/admin\/dispatch-board$/],
        ['Maintenance due: 1. Review required', /\/admin\/maintenance\?status=due$/],
        ['Overdue after-sales: 1. Open cases', /\/admin\/after-sales-cases\?status=open$/],
      ];
      for (const [name, url] of chips) {
        await openDashboard();
        await page.getByRole('button', { name, exact: true }).click();
        await expectPageOk(url);
      }

      await openDashboard();
      await expect(page.getByRole('heading', { name: /areas? needs? your attention/ })).toBeVisible();
      await page.getByRole('button', { name: /^Pending approvals: \d+\. Review requests$/ }).click();
      await expect(page).toHaveURL(/#pending-approvals$/);

      // SLA chips switch the watchlist filter.
      const sla = page.locator('#sla-watchlist');
      await page.getByRole('button', { name: 'SLA warnings: 1. Show warning items' }).click();
      await expect(page).toHaveURL(/#sla-watchlist$/);
      await expect(sla.getByRole('button', { name: 'Warning 1' })).toHaveAttribute('aria-pressed', 'true');
      await expect(sla).toContainText('SLA Warning Client');
      await expect(sla).not.toContainText('SLA Overdue Client');
      await page.getByRole('button', { name: 'Overdue SLA: 1. Show overdue items' }).click();
      await expect(sla.getByRole('button', { name: 'Overdue 1' })).toHaveAttribute('aria-pressed', 'true');
      await expect(sla).toContainText('SLA Overdue Client');
      await expect(sla).not.toContainText('SLA Warning Client');

      // ── SLA watchlist filter buttons and Open actions ──
      await sla.getByRole('button', { name: 'All 2' }).click();
      await expect(sla.getByRole('button', { name: 'All 2' })).toHaveAttribute('aria-pressed', 'true');
      await expect(sla.locator('tbody tr')).toHaveCount(2);
      await sla.locator('tr', { hasText: 'SLA Warning Client' }).getByRole('button', { name: 'Open' }).click();
      await expect(details).toBeVisible();
      await page.keyboard.press('Escape');
      await sla.locator('tr', { hasText: 'SLA Overdue Client' }).getByRole('button', { name: 'Open' }).click();
      await expectPageOk(/\/admin\/service-tickets\?focus=sla-overdue$/);

      // ── Upcoming Schedule: header link and a row ──
      await openDashboard();
      await page.getByRole('button', { name: 'Dispatch board →' }).click();
      await expectPageOk(/\/admin\/dispatch-board$/);
      await openDashboard();
      await page.getByRole('button', { name: /Schedule Client/ }).click();
      await expectPageOk(/\/admin\/dispatch-board$/);

      // ── Technician Job Progress: Open dispatch, job dialog and its two buttons ──
      await openDashboard();
      await page.getByRole('button', { name: 'Open dispatch', exact: true }).click();
      await expectPageOk(/\/admin\/dispatch-board$/);
      for (const [name, url] of [['Open ticket queue', /\/admin\/service-tickets\?focus=active$/], ['Open dispatch board', /\/admin\/dispatch-board$/]]) {
        await openDashboard();
        await page.getByRole('button', { name: /View job details for Dashboard Tech/ }).click();
        const jobDialog = page.getByRole('dialog', { name: /TKT-\d+/ });
        await expect(jobDialog).toBeVisible();
        await jobDialog.getByRole('button', { name }).click();
        await expectPageOk(url);
      }

      // ── Load failure: error banner and Try again ──
      await page.unroute('**/api/dashboard/stats/**');
      let failNext = true;
      await page.route('**/api/dashboard/stats/**', async (route) => {
        if (failNext) {
          await route.fulfill({ status: 500, json: { detail: 'Temporary failure' } });
        } else {
          await route.continue();
        }
      });
      await page.goto('/admin/dashboard');
      const alert = page.getByRole('alert').filter({ hasText: 'Try again' });
      await expect(alert).toBeVisible({ timeout: 30000 });
      failNext = false;
      await alert.getByRole('button', { name: 'Try again' }).click();
      await expect(alert).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Pending Approvals' })).toBeVisible();
    });
  });
}
