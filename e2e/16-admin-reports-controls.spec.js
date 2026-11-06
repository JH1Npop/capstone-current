// @ts-check
import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/reports, for admin and superadmin.
// A ticket with a unique service is created through the API first, so search, every filter,
// the SLA column, CSV export and print can be checked against a known row.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
const SLA_LABELS = { overdue: 'Overdue', breached: 'Overdue', warning: 'Warning', healthy: 'On track', paused: 'Paused', inactive: 'Not tracked' };
let nextDay = 47;

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
  test.describe(`Report controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    let auth;
    let superAuth;
    let clientAuth;
    let ticket;
    let serviceName;
    let report;

    test.beforeAll(async ({ request }) => {
      auth = loadAuthStateFromBackend(username);
      superAuth = loadAuthStateFromBackend('superadmin_test');
      clientAuth = loadAuthStateFromBackend('client_test');
      const admin = apiAs(request, superAuth);
      const client = apiAs(request, clientAuth);
      const stamp = Date.now();
      serviceName = `E2E Report ${username} ${stamp}`;
      const service = await admin.post('/api/admin/services/', {
        name: serviceName,
        description: 'Created by the reports controls check.',
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
      const created = await client.post('/api/services/service-requests/', {
        service_type: service.id,
        description: `E2E report row ${stamp}`,
        priority: 'High',
        location_address: 'Report Street, Brgy. Pulo',
        location_city: 'Cabuyao',
        location_province: 'Laguna',
        preferred_date: dayKey(nextDay++),
        latitude: '14.2786',
        longitude: '121.125',
      });
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      report = await admin.get('/api/services/service-tickets/report/');
      ticket = report.find((row) => row.service === serviceName);
      expect(ticket, 'The approved request should appear in the ticket report').toBeTruthy();
    });

    test(`16.1 - ${username}: Reports page controls`, async ({ page }) => {
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/reports');
      const table = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Service Ticket Report' }) });
      const showing = table.getByText(/^Showing \d+-\d+ of \d+ tickets\.$/);
      // The header reads "Showing 0-0 of 0" while loading, so wait for the API's count.
      await expect(showing).toHaveText(new RegExp(` of ${report.length} tickets\\.$`), { timeout: 30000 });
      const totalText = await showing.innerText();
      const total = report.length;
      const inView = page.locator('.stat-card').filter({ hasText: 'Tickets in view' });
      await expect(inView).toContainText(String(total));

      // SLA attention matches the API, and the SLA column is filled in (not "-").
      const slaRisk = report.filter((row) => ['warning', 'overdue', 'breached'].includes(String(row.sla?.state || '').toLowerCase())).length;
      await expect(page.locator('.stat-card').filter({ hasText: 'SLA attention' })).toContainText(String(slaRisk));

      // Every card and both charts, recomputed from the API rows.
      const statusOf = (row) => String(row.status || '').toLowerCase();
      const isDone = (row) => ['completed', 'turned over / accepted'].includes(statusOf(row));
      const isDismissed = (row) => ['cancelled', 'canceled', 'rejected'].includes(statusOf(row));
      const completed = report.filter(isDone).length;
      const dismissed = report.filter(isDismissed).length;
      const active = total - completed - dismissed;
      const unassignedActive = report.filter((row) => !row.technician_id && !isDone(row) && !isDismissed(row)).length;
      const rate = total ? ((completed / total) * 100).toFixed(1) : '0.0';
      const card = (title) => page.locator('.stat-card').filter({ hasText: title });
      await expect(card('Completion rate')).toContainText(`${rate}%`);
      await expect(card('Completion rate')).toContainText(`${completed} completed or turned over`);
      await expect(card('Active workload')).toContainText(String(active));
      await expect(card('Active workload')).toContainText(`${unassignedActive} currently unassigned`);
      await expect(page.getByLabel(`${completed} completed, ${active} active, ${dismissed} dismissed`)).toBeVisible();
      const percent = (count) => (total ? ((count / total) * 100).toFixed(0) : 0);
      for (const [label, count] of [['Completed', completed], ['Active', active], ['Dismissed', dismissed]]) {
        const segment = page.locator('article').filter({ hasText: 'Workflow composition' }).locator('div.rounded-lg').filter({ hasText: label });
        await expect(segment).toContainText(`${count} (${percent(count)}%)`);
      }
      // Service workload legend: the top five services by ticket count.
      const serviceCounts = new Map();
      for (const row of report) {
        const names = Array.isArray(row.services) && row.services.length ? row.services.map((s) => s?.name || 'Unspecified service') : [row.service || 'Unspecified service'];
        for (const name of names) serviceCounts.set(name, (serviceCounts.get(name) || 0) + 1);
      }
      const topServices = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name]) => name);
      const legend = page.locator('article').filter({ hasText: 'Service workload' }).locator('.recharts-legend-item-text');
      // Recharts lists legend items alphabetically, so compare the set of names.
      await expect(legend).toHaveCount(topServices.length);
      expect((await legend.allTextContents()).sort()).toEqual([...topServices].sort());

      // Pagination
      const next = table.getByRole('button', { name: 'Next' });
      const previous = table.getByRole('button', { name: 'Previous' });
      await expect(previous).toBeDisabled();
      if (total > 10) {
        await next.click();
        await expect(table.getByText(/Page 2 of \d+/)).toBeVisible();
        await expect(showing).toHaveText(new RegExp(`^Showing 11-\\d+ of ${total} tickets\\.$`));
        await previous.click();
        await expect(table.getByText(/Page 1 of \d+/)).toBeVisible();
      } else {
        await expect(next).toBeDisabled();
      }

      // Chart layout toggle
      const stacked = page.getByRole('button', { name: 'Stacked' });
      const grouped = page.getByRole('button', { name: 'Grouped' });
      await expect(stacked).toHaveAttribute('aria-pressed', 'true');
      await grouped.click();
      await expect(grouped).toHaveAttribute('aria-pressed', 'true');
      await expect(stacked).toHaveAttribute('aria-pressed', 'false');
      await stacked.click();
      await expect(stacked).toHaveAttribute('aria-pressed', 'true');

      // Search by service name, then by ticket ID, then the clear button.
      const search = page.getByRole('searchbox');
      await search.fill(serviceName);
      await expect(showing).toHaveText('Showing 1-1 of 1 tickets.');
      const row = table.locator('tbody tr').first();
      await expect(row).toContainText(ticketCode(ticket.id));
      await expect(row).toContainText(SLA_LABELS[String(ticket.sla.state).toLowerCase()]);
      await search.fill(ticketCode(ticket.id));
      await expect(table.locator('tbody tr').filter({ hasText: serviceName })).toHaveCount(1);
      await page.getByRole('button', { name: 'Clear search' }).click();
      await expect(search).toHaveValue('');
      await expect(showing).toHaveText(totalText);

      // Every filter: open the panel, pick a value, check the count against the API data.
      const filtersButton = page.getByRole('button', { name: /^Filters/ });
      await filtersButton.click();
      await expect(filtersButton).toHaveAttribute('aria-expanded', 'true');
      const expectCount = async (count) => {
        if (count === 0) {
          await expect(table.getByText('No service tickets to display.')).toBeVisible();
        } else {
          await expect(showing).toHaveText(new RegExp(` of ${count} tickets\\.$`));
        }
      };
      const selectChecks = [
        ['Service', ticket.service, (r) => r.service === ticket.service],
        ['Status', ticket.status, (r) => String(r.status).toLowerCase() === String(ticket.status).toLowerCase()],
        ['Priority', ticket.priority, (r) => String(r.priority).toLowerCase() === String(ticket.priority).toLowerCase()],
        ['Client', ticket.client_fullname || ticket.client, (r) => (r.client_fullname || r.client) === (ticket.client_fullname || ticket.client)],
      ];
      const technicianRow = report.find((r) => r.technician_fullname);
      if (technicianRow) {
        selectChecks.push(['Technician', technicianRow.technician_fullname, (r) => r.technician_fullname === technicianRow.technician_fullname]);
      }
      for (const [label, value, matches] of selectChecks) {
        await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
        await expectCount(report.filter(matches).length);
        await page.getByRole('button', { name: `Remove ${label} filter` }).click();
        await expect(showing).toHaveText(totalText);
      }

      // Dates: today includes the new ticket; a window ending yesterday excludes it.
      await page.getByRole('textbox', { name: 'From date' }).fill(dayKey(0));
      await search.fill(serviceName);
      await expect(showing).toHaveText('Showing 1-1 of 1 tickets.');
      await page.getByRole('textbox', { name: 'From date' }).fill('');
      await page.getByRole('textbox', { name: 'To date' }).fill(dayKey(-1));
      await expect(table.getByText('No service tickets to display.')).toBeVisible();

      // Clear all resets search and filters.
      await page.getByRole('button', { name: 'Clear all' }).click();
      await expect(search).toHaveValue('');
      await expect(showing).toHaveText(totalText);

      // Export CSV: header, our row, a readable SLA label.
      await search.fill(serviceName);
      await expect(showing).toHaveText('Showing 1-1 of 1 tickets.');
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export CSV' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^service-tickets-\d+\.csv$/);
      const csv = fs.readFileSync(await download.path(), 'utf8');
      const [header, line, extra] = csv.split('\n');
      expect(header).toBe('Ticket,Date,Client,Service,Priority,Status,SLA,Technician,Next Step');
      expect(extra).toBeUndefined();
      expect(line).toContain(`"${ticketCode(ticket.id)}"`);
      expect(line).toContain(`"${serviceName}"`);
      expect(line).toContain(`"${SLA_LABELS[String(ticket.sla.state).toLowerCase()]}"`);

      // Print opens a printable window with the filtered rows.
      // Keep the print window open for inspection: stub its print() so onafterprint never closes it.
      await page.evaluate(() => {
        const open = window.open.bind(window);
        window.open = (...args) => {
          const opened = open(...args);
          if (opened) opened.print = () => {};
          return opened;
        };
      });
      const popupPromise = page.waitForEvent('popup');
      await page.getByRole('button', { name: 'Print' }).click();
      const popup = await popupPromise;
      await expect(popup.locator('h1')).toHaveText('Service Ticket Report');
      await expect(popup.locator('.meta')).toContainText('Showing 1 ticket');
      await expect(popup.locator('tbody')).toContainText(ticketCode(ticket.id));
      await expect(popup.locator('tbody')).toContainText(SLA_LABELS[String(ticket.sla.state).toLowerCase()]);
      await popup.close().catch(() => {});

      // Load failure shows the error, not an empty report.
      await page.route('**/api/services/service-tickets/report/**', (route) => route.fulfill({ status: 500, json: { message: 'Report service unavailable' } }));
      await page.reload();
      await expect(page.getByText('Report service unavailable')).toBeVisible({ timeout: 30000 });
    });
  });
}
