// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/dispatch-board, for admin and superadmin. Fresh technicians and tickets
// are created through the API; assignments are made for real and checked against the API.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const ticketCode = (id) => `TKT-${String(id).padStart(4, '0')}`;
let nextDay = 53;

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
  test.describe(`Dispatch board controls as ${username}`, () => {
    test.describe.configure({ timeout: 300000 });

    test(`18 - ${username}: every Dispatch Board control works`, async ({ page, request }) => {
      const auth = loadAuthStateFromBackend(username);
      const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
      const client = apiAs(request, loadAuthStateFromBackend('client_test'));
      const stamp = Date.now();
      const tag = username === 'admin_test' ? 'A' : 'S';
      const service = await admin.post('/api/admin/services/', {
        name: `E2E Dispatch ${tag} ${stamp}`,
        description: 'Created by the dispatch board controls check.',
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
      const makeTech = async (first) => {
        const name = `${first}${tag}${stamp}`;
        const created = await admin.post('/api/admin/technicians/', {
          username: name.toLowerCase(),
          email: `${name.toLowerCase()}@afntest.com`,
          password: 'TestPass123!',
          password_confirm: 'TestPass123!',
          first_name: first,
          last_name: `${tag}${stamp}`,
          phone: '09171234567',
          role: 'technician',
          status: 'active',
          is_available: true,
        });
        await admin.put(`/api/admin/technicians/${created.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
        return { id: created.id, name: `${first} ${tag}${stamp}` };
      };
      const lead = await makeTech('Lead');
      const crew = await makeTech('Crew');
      const spare = await makeTech('Spare');
      // Smart assignment scores distance, so give the spare technician a live position near the site.
      const spareAuth = loadAuthStateFromBackend(`spare${tag}${stamp}`.toLowerCase());
      await apiAs(request, spareAuth).post('/api/services/technician/location/', { latitude: 14.279, longitude: 121.126, accuracy: 10 });
      const makeTicket = async (label) => {
        const created = await client.post('/api/services/service-requests/', {
          service_type: service.id,
          description: `E2E dispatch ${label} ${stamp}`,
          priority: 'Normal',
          location_address: 'Dispatch Street, Brgy. Pulo',
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
      const manualTicket = await makeTicket('manual');
      const matchTicket = await makeTicket('match');

      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      await page.goto('/admin/dispatch-board');
      const readyButton = (ticket) => page.getByRole('button', { name: new RegExp(`^${ticketCode(ticket.id)}\\b`) });
      await expect(readyButton(manualTicket)).toBeVisible({ timeout: 30000 });

      // ── Stat cards agree with the summary API ──
      const summary = await admin.get('/api/services/service-tickets/summary/');
      const card = (title) => page.locator('.stat-card').filter({ hasText: title });
      for (const [title, key] of [['Ready to Assign', 'dispatchable'], ['Assigned Active', 'assignedActive'], ['Needs Reschedule', 'missedDispatch']]) {
        if (summary[key] !== undefined) await expect(card(title)).toContainText(String(summary[key]));
      }

      // ── Nothing selected: team buttons disabled, review asks for a ticket ──
      await expect(page.getByText('Select a ticket from the ready-to-assign queue to start an assignment.')).toBeVisible();
      await expect(page.getByRole('button', { name: `Set lead ${lead.name}` })).toBeDisabled();

      // ── Select a ticket; skill filter narrows the team list ──
      await readyButton(manualTicket).click();
      await expect(readyButton(manualTicket)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('heading', { name: new RegExp(`Team for ${service.name}$`) })).toBeVisible();
      const skillFilter = page.getByRole('combobox').filter({ has: page.locator('option', { hasText: 'All Skills' }) });
      await skillFilter.selectOption({ label: service.name });
      for (const tech of [lead, crew, spare]) await expect(page.getByRole('button', { name: `Set lead ${tech.name}` })).toBeVisible();
      await skillFilter.selectOption('all');

      // ── Lead, crew, crew toggle, and clearing the selection ──
      await page.getByRole('button', { name: `Set lead ${lead.name}` }).click();
      await expect(page.getByRole('button', { name: `Selected lead ${lead.name}` })).toBeVisible();
      await page.getByRole('button', { name: `Add crew ${crew.name}` }).click();
      await page.getByRole('button', { name: `Selected crew ${crew.name}` }).click();
      await expect(page.getByRole('button', { name: `Add crew ${crew.name}` })).toBeVisible();
      await page.getByRole('button', { name: `Add crew ${crew.name}` }).click();
      await page.getByRole('button', { name: 'Clear selected ticket' }).click();
      await expect(readyButton(manualTicket)).toHaveAttribute('aria-pressed', 'false');
      await expect(page.getByRole('button', { name: `Set lead ${lead.name}` })).toBeDisabled();

      // ── Equipment plan: add, invalid quantity blocks confirm, remove ──
      await readyButton(manualTicket).click();
      await page.getByRole('button', { name: `Set lead ${lead.name}` }).click();
      await page.getByRole('button', { name: `Add crew ${crew.name}` }).click();
      const confirmButton = page.getByRole('button', { name: 'Confirm Assignment' });
      const addItem = page.getByRole('button', { name: 'Add item' });
      if (await addItem.isEnabled()) {
        const rowsBefore = await page.getByRole('button', { name: 'Remove', exact: true }).count();
        await addItem.click();
        const quantities = page.getByLabel('Quantity');
        await expect(quantities).toHaveCount(rowsBefore + 1);
        await quantities.last().fill('');
        await expect(confirmButton).toBeDisabled();
        await expect(page.getByRole('alert').filter({ hasText: 'quantity of at least 1' })).toBeVisible();
        await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
        await expect(quantities).toHaveCount(rowsBefore);
      }

      // ── Edited plan + crew: Find Best Match asks first; keeping selections changes nothing ──
      await page.getByRole('button', { name: 'Find Best Match' }).click();
      const replaceDialog = page.getByRole('dialog', { name: 'Replace your selections?' });
      await expect(replaceDialog).toContainText('The crew you selected will be removed.');
      await replaceDialog.getByRole('button', { name: 'Keep my selections' }).click();
      await expect(replaceDialog).toBeHidden();
      await expect(page.getByRole('button', { name: `Selected crew ${crew.name}` })).toBeVisible();
      expect((await admin.get(`/api/services/service-tickets/${manualTicket.id}/`)).technician).toBeFalsy();

      // ── Confirm Assignment (real) ──
      await expect(confirmButton).toBeEnabled();
      await confirmButton.click();
      await expect(page.getByText(`Assigned ${service.name} (${ticketCode(manualTicket.id)}) to ${lead.name} with crew: ${crew.name}.`)).toBeVisible();
      await expect.poll(async () => {
        const saved = await admin.get(`/api/services/service-tickets/${manualTicket.id}/`);
        return Number(saved.technician?.id ?? saved.technician);
      }).toBe(lead.id);
      const saved = await admin.get(`/api/services/service-tickets/${manualTicket.id}/`);
      expect(JSON.stringify(saved.crew_members || saved.crew_assignments || saved)).toContain(String(crew.id));

      // ── Current Assignments: the row's Edit opens it for update ──
      const assignmentsHeading = page.getByRole('heading', { name: /^Current Assignments \(\d+\)$/ });
      await expect(assignmentsHeading).toBeVisible();
      const editButton = page.getByRole('button', { name: `Edit assignment for ${ticketCode(manualTicket.id)}` }).locator('visible=true');
      const assignedCount = Number((await assignmentsHeading.innerText()).match(/\((\d+)\)/)[1]);
      if (assignedCount > 10 && !(await editButton.count())) {
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible();
      }
      await editButton.first().click();
      await expect(page.getByText('Editing existing assignment. Choose a new lead or adjust crew, then update.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Update Assignment' })).toBeEnabled();
      await expect(page.getByRole('button', { name: `Selected lead ${lead.name}` })).toBeVisible();
      await page.getByRole('button', { name: 'Clear selected ticket' }).click();

      // ── Find Best Match with nothing to lose runs straight away and names the technician ──
      await readyButton(matchTicket).click();
      await page.getByRole('button', { name: 'Find Best Match' }).click();
      await expect(page.getByRole('dialog', { name: 'Replace your selections?' })).toHaveCount(0);
      const outcome = page.getByText(new RegExp(`^Auto-assigned ${ticketCode(matchTicket.id)} to `)).or(page.getByRole('alert'));
      await expect(outcome.first()).toBeVisible({ timeout: 30000 });
      const matched = await admin.get(`/api/services/service-tickets/${matchTicket.id}/`);
      const matchedId = Number(matched.technician?.id ?? matched.technician);
      if (matchedId) {
        const directory = list(await admin.get('/api/admin/technicians/'));
        const tech = directory.find((entry) => Number(entry.id) === matchedId);
        const fullName = tech?.full_name || [tech?.first_name, tech?.last_name].filter(Boolean).join(' ');
        await expect(page.getByText(`Auto-assigned ${ticketCode(matchTicket.id)} to ${fullName}.`)).toBeVisible();
      } else {
        throw new Error('Find Best Match found no technician although a nearby, skilled, free one exists');
      }

      // ── Refresh board ──
      const refreshed = page.waitForResponse((r) => r.url().includes('/api/services/service-tickets/') && r.request().method() === 'GET');
      await page.getByRole('button', { name: 'Refresh board' }).click();
      await refreshed;

      // ── Load failure is reported ──
      await page.route('**/api/services/service-tickets/?*', (route) => route.fulfill({ status: 500, json: { detail: 'Dispatch data unavailable' } }));
      await page.reload();
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 30000 });
    });
  });
}
