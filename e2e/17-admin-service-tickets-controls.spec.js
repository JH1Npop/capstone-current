// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/service-tickets, for admin and superadmin. Two tickets are created
// through the API; actions (timeline, Field Service Report, dispatch link, dismiss) run for real.
// Review Inspection and Reschedule are exercised end to end by journeys 10.x and 11.x.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
let nextDay = 50;

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

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Service ticket controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`17 - ${username}: every Service Tickets control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Tickets ${username} ${stamp}`,
        description: 'Created by the service tickets controls check.',
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
      const makeTicket = async (tag) => {
        const created = await client.post('/api/services/service-requests/', {
          service_type: service.id,
          description: `E2E tickets ${tag} ${stamp}`,
          priority: 'Normal',
          location_address: 'Ticket Street, Brgy. Pulo',
          location_city: 'Cabuyao',
          location_province: 'Laguna',
          preferred_date: dayKey(nextDay++),
          latitude: '14.2786',
          longitude: '121.125',
        });
        await admin.post(`/api/services/service-requests/${created.id}/approve/`);
        return list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
          .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      };
      const keepTicket = await makeTicket('keep');
      const dismissTicket = await makeTicket('dismiss');
      expect(keepTicket?.id && dismissTicket?.id).toBeTruthy();

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/service-tickets');
      const queueHeading = page.getByRole('heading', { name: /^Ticket Queue · / });
      await expect(queueHeading).toHaveText('Ticket Queue · All active', { timeout: 30000 });
      await expect(page.getByText(/^Showing \d+-\d+ of \d+ matching active tickets\.$/)).not.toHaveText(/of 0 matching/);

      // ── Stat cards agree with the summary API ──
      const summary = await admin.get('/api/services/service-tickets/summary/');
      const card = (title) => page.locator('.stat-card').filter({ hasText: title });
      const activeCount = summary.activeQueue ?? summary.active_queue;
      if (activeCount !== undefined) await expect(card('All Active Tickets')).toContainText(String(activeCount));

      // ── Job History links follow the capability ──
      const canSeeJobHistory = username === 'superadmin_test';
      const jobHistoryButton = page.getByRole('button', { name: 'Job History', exact: true });
      const viewHistory = card('Completed').getByRole('button', { name: 'View history' });
      if (canSeeJobHistory) {
        await viewHistory.click();
        await expect(page).toHaveURL(/\/admin\/job-history$/);
        await page.goto('/admin/service-tickets');
        await jobHistoryButton.click();
        await expect(page).toHaveURL(/\/admin\/job-history$/);
        await expect(page.getByRole('heading', { name: /Job History/ }).first()).toBeVisible();
        await page.goto('/admin/service-tickets');
        await expect(queueHeading).toHaveText('Ticket Queue · All active', { timeout: 30000 });
        // The heading renders before the tickets arrive; wait for the queue itself.
        await expect(page.getByText(/^Showing \d+-\d+ of \d+ matching active tickets\.$/)).not.toHaveText(/of 0 matching/);
      } else {
        await expect(jobHistoryButton).toHaveCount(0);
        await expect(viewHistory).toHaveCount(0);
      }

      // ── Queue view buttons: pressed state, URL, heading, row count ──
      const views = [
        ['Unassigned', 'unassigned'],
        ['Needs reschedule', 'missed-dispatch'],
        ['SLA warning', 'sla-warning'],
        ['SLA overdue', 'sla-overdue'],
        ['All active', null],
      ];
      for (const [label, focus] of views) {
        const button = page.getByRole('button', { name: new RegExp(`^${label} \\((\\d+)\\)$`) });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        const count = Number((await button.getAttribute('aria-label')).match(/\((\d+)\)$/)[1]);
        await expect(queueHeading).toHaveText(`Ticket Queue · ${label}`);
        if (focus) await expect(page).toHaveURL(new RegExp(`focus=${focus}$`));
        else await expect(page).not.toHaveURL(/focus=/);
        if (count === 0) {
          await expect(page.getByText('No active tickets found').locator('visible=true')).toBeVisible();
        } else {
          await expect(page.getByText(new RegExp(`^Showing 1-\\d+ of ${count} matching active tickets\\.$`))).toBeVisible();
        }
      }

      // ── Pagination ──
      const total = Number((await page.getByRole('button', { name: /^All active \(\d+\)$/ }).getAttribute('aria-label')).match(/\((\d+)\)$/)[1]);
      if (total > 10) {
        const pager = page.getByText(/^Page \d+ of \d+$/);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(pager).toHaveText(/^Page 2 of/);
        await page.getByRole('button', { name: 'Previous', exact: true }).click();
        await expect(pager).toHaveText(/^Page 1 of/);
      }

      // ── Refresh reloads the queue ──
      const refreshed = page.waitForResponse((r) => r.url().includes('/api/services/service-tickets/') && r.request().method() === 'GET');
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await refreshed;

      // ── Ticket actions dialog: open by link, close by button, Escape and backdrop ──
      const actions = page.getByRole('dialog', { name: ticketCode(keepTicket.id) });
      await page.goto(`/admin/service-tickets?ticketId=${keepTicket.id}`);
      await expect(actions).toBeVisible({ timeout: 30000 });
      await expect(actions).toContainText(service.name);
      await page.keyboard.press('Escape');
      await expect(actions).toBeHidden();
      await expect(page).not.toHaveURL(/ticketId=/);
      await page.goto(`/admin/service-tickets?ticketId=${keepTicket.id}`);
      await actions.getByRole('button', { name: 'Close ticket actions dialog' }).click();
      await expect(actions).toBeHidden();
      await page.goto(`/admin/service-tickets?ticketId=${keepTicket.id}`);
      await page.mouse.click(5, 5);
      await expect(actions).toBeHidden();

      // ── View Timeline ──
      await page.goto(`/admin/service-tickets?ticketId=${keepTicket.id}`);
      await actions.getByRole('button', { name: /View Timeline/ }).click();
      const timeline = page.getByRole('dialog', { name: ticketCode(keepTicket.id) });
      await expect(timeline).toContainText(service.name);
      await expect(timeline).toContainText('Request approved; service ticket created.');
      await page.keyboard.press('Escape');
      await expect(timeline).toBeHidden();

      // ── Field Service Report DOCX downloads a real Word file ──
      await page.goto(`/admin/service-tickets?ticketId=${keepTicket.id}`);
      const downloadPromise = page.waitForEvent('download');
      await actions.getByRole('button', { name: /Field Service Report DOCX/ }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.docx$/i);
      const docx = await (await import('node:fs')).promises.readFile(await download.path());
      expect(docx.subarray(0, 2).toString()).toBe('PK');

      // ── Assign in Dispatch (unassigned ticket) ──
      await actions.getByRole('button', { name: /Assign in Dispatch/ }).click();
      await expect(page).toHaveURL(/\/admin\/dispatch-board$/);

      // ── Dismiss ticket: reason rule, Keep, then real dismissal ──
      await page.goto(`/admin/service-tickets?ticketId=${dismissTicket.id}`);
      const dismissActions = page.getByRole('dialog', { name: ticketCode(dismissTicket.id) });
      await dismissActions.getByRole('button', { name: /Dismiss ticket/ }).click();
      const confirm = page.getByRole('dialog', { name: 'Dismiss service ticket?' });
      await expect(confirm).toBeVisible();
      await confirm.getByRole('textbox').fill('No');
      await expect(confirm.getByRole('button', { name: 'Dismiss ticket' })).toBeDisabled();
      await confirm.getByRole('button', { name: 'Keep ticket active' }).click();
      await expect(confirm).toBeHidden();
      expect((await admin.get(`/api/services/service-tickets/${dismissTicket.id}/`)).status).not.toBe('Cancelled');
      await page.goto(`/admin/service-tickets?ticketId=${dismissTicket.id}`);
      await dismissActions.getByRole('button', { name: /Dismiss ticket/ }).click();
      await confirm.getByRole('textbox').fill('Client confirmed by phone that they no longer want to proceed.');
      await confirm.getByRole('button', { name: 'Dismiss ticket' }).click();
      await expect(page.getByText(`${ticketCode(dismissTicket.id)} dismissed because the client withdrew.`)).toBeVisible();
      await expect.poll(async () => (await admin.get(`/api/services/service-tickets/${dismissTicket.id}/`)).status).toBe('Cancelled');

      // ── View Inspection Details, on any ticket that has an inspection ──
      const withInspection = list(await admin.get('/api/services/service-tickets/?queue=active')).find((t) => t.inspection?.id || t.inspection_id);
      if (withInspection) {
        await page.goto(`/admin/service-tickets?ticketId=${withInspection.id}`);
        await page.getByRole('dialog', { name: ticketCode(withInspection.id) }).getByRole('button', { name: /View Inspection Details/ }).click();
        const details = page.getByRole('dialog', { name: ticketCode(withInspection.id) });
        await expect(details.getByRole('button', { name: 'Close inspection details dialog' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(details).toBeHidden();
      }

      // ── A broken ticket link explains itself ──
      await page.goto('/admin/service-tickets?ticketId=abc');
      await expect(page.getByRole('alert').filter({ hasText: 'The ticket link "abc" is invalid.' })).toBeVisible();

      // ── Load failure shows Try again, which recovers ──
      let fail = true;
      await page.route('**/api/services/service-tickets/?*', (route) => (fail ? route.fulfill({ status: 500, json: { detail: 'Temporary failure' } }) : route.continue()));
      await page.goto('/admin/service-tickets');
      const retry = page.getByRole('button', { name: /try again/i });
      await expect(retry).toBeVisible({ timeout: 30000 });
      fail = false;
      await retry.click();
      await expect(retry).toBeHidden();
      await expect(page.getByText(/^Showing \d+-\d+ of \d+ matching active tickets\.$/)).toBeVisible();
    });
  });
}
