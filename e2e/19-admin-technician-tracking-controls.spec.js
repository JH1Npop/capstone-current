// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/technician-tracking, for admin and superadmin. A fresh technician with a
// live GPS position is assigned a real ticket and starts driving to it (Navigating), so the map,
// filters, search, details and centring can be checked against /api/tracking/.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
let nextDay = 57;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data) => {
    const response = await request[method](path, data === undefined ? { headers } : { headers, data });
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return { get: (path) => call('get', path), post: (path, data) => call('post', path, data ?? {}), put: (path, data) => call('put', path, data) };
};

for (const username of ['admin_test', 'superadmin_test']) {
  test.describe(`Technician tracking controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`19 - ${username}: every Technician Tracking control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Tracking ${tag} ${stamp}`,
        description: 'Created by the technician tracking controls check.',
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
      const techUsername = `tracker${tag}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username: techUsername,
        email: `${techUsername}@afntest.com`,
        password: 'TestPass123!',
        password_confirm: 'TestPass123!',
        first_name: 'Tracker',
        last_name: `${tag}${stamp}`,
        phone: '09171234567',
        role: 'technician',
        status: 'active',
        is_available: true,
      });
      const techName = `Tracker ${tag}${stamp}`;
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      const techApi = apiAs(request, loadAuthStateFromBackend(techUsername));
      await techApi.post('/api/services/technician/location/', { latitude: 14.2701, longitude: 121.1202, accuracy: 9 });

      const visitDate = dayKey(nextDay++);
      const created = await client.post('/api/services/service-requests/', {
        service_type: service.id,
        description: `E2E tracking ${stamp}`,
        priority: 'Normal',
        location_address: 'Tracking Street, Brgy. Pulo',
        location_city: 'Cabuyao',
        location_province: 'Laguna',
        preferred_date: visitDate,
        latitude: '14.2786',
        longitude: '121.125',
      });
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await techApi.post(`/api/technician/jobs/${ticket.id}/start-navigation/`);
      await techApi.post('/api/services/technician/location/', { latitude: 14.2721, longitude: 121.1215, accuracy: 9 });

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/technician-tracking');
      await expect(page.getByRole('status')).toContainText('Live', { timeout: 30000 });
      const tracking = await admin.get('/api/tracking/');
      const techs = tracking.techMarkers;
      const shown = page.getByRole('status').getByText(/^\d+\/\d+ shown$/);
      await expect(shown).toHaveText(`${techs.length}/${techs.length} shown`);

      // ── Summary tiles agree with /api/tracking/ ──
      const tile = (label) => page.locator('div.rounded-lg.bg-slate-50').filter({ hasText: label });
      await expect(tile('Online technicians')).toContainText(String(techs.filter((t) => t.gpsState === 'fresh').length));
      await expect(tile('On active jobs')).toContainText(String(techs.filter((t) => t.status === 'on_job').length));
      await expect(tile('GPS attention')).toContainText(String(techs.filter((t) => t.gpsState !== 'fresh').length));

      // ── Technician Status and GPS Health filters: every option ──
      const statusFilter = page.getByRole('combobox', { name: 'Technician Status' });
      for (const value of ['available', 'on_job', 'offline', 'all']) {
        await statusFilter.selectOption(value);
        const count = value === 'all' ? techs.length : techs.filter((t) => t.status === value).length;
        await expect(shown).toHaveText(`${count}/${techs.length} shown`);
      }
      const gpsFilter = page.getByRole('combobox', { name: 'GPS Health' });
      for (const value of ['fresh', 'stale', 'missing', 'all']) {
        await gpsFilter.selectOption(value);
        const count = value === 'all' ? techs.length : techs.filter((t) => t.gpsState === value).length;
        await expect(shown).toHaveText(`${count}/${techs.length} shown`);
      }

      // ── Ticket Display: a technician driving to the job (Navigating) counts as started ──
      const ticketDisplay = page.getByRole('combobox', { name: 'Ticket Display' });
      const jobSites = page.locator('div.rounded-lg').filter({ has: page.getByRole('heading', { name: 'Active Job Sites' }) });
      await ticketDisplay.selectOption('in_progress');
      await expect(jobSites.getByText(`${ticketCode(ticket.id)} | ${service.name}`)).toBeVisible();
      await ticketDisplay.selectOption('all');
      await expect(jobSites.getByText(`${ticketCode(ticket.id)} | ${service.name}`)).toBeVisible();

      // ── Search by ticket ID, then a search with no match ──
      const search = page.getByRole('searchbox', { name: /Find technician or job/i });
      await search.fill(ticketCode(ticket.id));
      await expect(shown).toHaveText(`1/${techs.length} shown`);
      const techList = page.locator('div.rounded-lg').filter({ has: page.getByRole('heading', { name: 'Technicians' }) });
      await expect(techList.getByText(techName, { exact: true })).toBeVisible();
      await search.fill('zz-no-such-technician');
      await expect(techList.getByText('No technician or job matches "zz-no-such-technician".')).toBeVisible();
      await search.fill(techName);

      // ── View details: contact links, the job with its own ticket link, Close details ──
      await techList.getByRole('button', { name: 'View details' }).click();
      const details = page.getByRole('region', { name: techName });
      await expect(details).toBeVisible();
      await expect(details.getByText('Fresh', { exact: true })).toBeVisible();
      await expect(details.getByText('+/-9 m')).toBeVisible();
      await expect(details.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:09171234567');
      await expect(details.getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:${techUsername}@afntest.com`);
      await expect(details.getByText(`${ticketCode(ticket.id)} · ${service.name}`)).toBeVisible();
      await expect(details.getByText('En route', { exact: true })).toBeVisible();
      await expect(details.getByText(/direct distance$/)).toBeVisible();
      await expect(techList.getByRole('button', { name: 'Details open' })).toBeVisible();
      await details.getByRole('button', { name: 'Close details' }).click();
      await expect(details).toBeHidden();

      // ── Center on the technician, then Show all markers ──
      await techList.getByRole('button', { name: 'Center', exact: true }).click();
      await expect(page.getByText(`Focused: ${techName}`)).toBeVisible();
      await expect(techList.getByRole('button', { name: 'Centered' })).toBeVisible();
      await expect(details).toBeVisible();
      await page.getByRole('button', { name: 'Show all markers' }).click();
      await expect(page.getByText(/^Focused:/)).toHaveCount(0);

      // ── Center on the job site ──
      await jobSites.locator('div.grid').filter({ hasText: ticketCode(ticket.id) }).getByRole('button', { name: 'Center' }).click();
      await expect(page.getByText(`Focused: ${ticketCode(ticket.id)}`)).toBeVisible();
      await page.getByRole('button', { name: 'Show all markers' }).click();

      // ── The job's Open ticket link opens that ticket on Service Tickets ──
      // Centring on the technician already opened their details.
      await expect(details).toBeVisible();
      await details.getByRole('link', { name: `Open ticket ${ticketCode(ticket.id)}` }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/service-tickets\\?ticketId=${ticket.id}$`));
      await expect(page.getByRole('dialog', { name: ticketCode(ticket.id) })).toBeVisible({ timeout: 30000 });

      // ── Refresh ──
      await page.goto('/admin/technician-tracking');
      await expect(page.getByRole('status')).toContainText('Live', { timeout: 30000 });
      const refreshed = page.waitForResponse((r) => r.url().includes('/api/tracking/') && r.request().method() === 'GET');
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await refreshed;
    });
  });
}
