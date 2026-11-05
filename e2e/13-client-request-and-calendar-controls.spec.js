// @ts-check
// Button-by-button checks for the client "New Request" page and for the Calendar as seen by BOTH the admin and the
// superadmin accounts. Geocoding calls are answered with fixed data so the map, search and address autofill can be
// checked without the internet.
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState, visitWorkspacePage } from './helpers';

const PARK_ASSISTANT = () => {
  window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
};

const REVERSE_RESULT = {
  lookup_status: 'ok',
  display_name: 'Test Road, Pulo, Cabuyao, Laguna, Philippines',
  address: { road: 'Test Road', village: 'Pulo', city: 'Cabuyao', state: 'Laguna' },
};

async function mockGeocoding(page, { searchResults = null, searchStatus = 200 } = {}) {
  await page.route('**/api/geocode/reverse/**', (route) => route.fulfill({ json: REVERSE_RESULT }));
  await page.route('**/api/geocode/search/**', (route) => {
    if (searchStatus !== 200) return route.fulfill({ status: searchStatus, json: { detail: 'Search is down.' } });
    return route.fulfill({
      json: {
        results: searchResults || [
          { display_name: 'SM City Calamba, Calamba, Laguna', lat: '14.2000', lon: '121.1500' },
          { display_name: 'SM City Sta. Rosa, Santa Rosa, Laguna', lat: '14.3100', lon: '121.1100' },
        ],
      },
    });
  });
}

async function mockPosition(page, { denied = false } = {}) {
  await page.addInitScript(({ deny }) => {
    const position = () => ({
      coords: { latitude: 14.27, longitude: 121.12, accuracy: 8, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success, failure) => (deny ? failure({ code: 1, message: 'User denied Geolocation' }) : success(position())),
        watchPosition: () => 1,
        clearWatch: () => {},
      },
    });
  }, { deny: denied });
}

const apiGet = (page, path) => page.evaluate(async (url) => {
  const token = sessionStorage.getItem('afn_token');
  const response = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  return response.json();
}, path);
const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const pad = (value) => String(value).padStart(2, '0');
const localKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
// Lists are paginated (10 per page), so walk every page before looking for a record.
const listAll = async (page, path) => {
  const rows = [];
  for (let number = 1; number <= 30; number += 1) {
    const payload = await apiGet(page, `${path}${path.includes('?') ? '&' : '?'}page=${number}`);
    rows.push(...list(payload));
    if (!payload?.next) break;
  }
  return rows;
};


// A job that has not started yet: the only kind the calendar offers "Reschedule" for.
async function createNotStartedJob(request, label) {
  const tokens = {
    admin: loadAuthStateFromBackend('superadmin_test'),
    client: loadAuthStateFromBackend('client_test'),
    tech: loadAuthStateFromBackend('tech_test'),
  };
  const call = async (who, method, path, data) => {
    const response = await request[method](path, { headers: { Authorization: `Token ${tokens[who].token}` }, ...(data !== undefined ? { data } : {}) });
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  const serviceName = `E2E Calendar ${label} ${Date.now()}`;
  const service = await call('admin', 'post', '/api/admin/services/', {
    name: serviceName, description: 'Made by the calendar controls test.', estimated_duration: 120, estimated_cost: 5000,
    max_daily_assignments: 5, is_active: true, requires_site_inspection: false,
    procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
    inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
  });
  const services = list(await call('admin', 'get', '/api/admin/services/'));
  const base = services.find((entry) => entry.name === 'E2E Solar Installation');
  const ids = [...new Set([service.id, base?.id].filter(Boolean))];
  await call('admin', 'put', `/api/admin/technicians/${tokens.tech.user.id}/`, { skills: ids.map((id) => ({ service_type: id, skill_level: 'expert' })) });
  const day = (offset) => localKey(new Date(Date.now() + offset * 86400000));
  const created = await call('client', 'post', '/api/services/service-requests/', {
    service_type: service.id, description: `${serviceName} request`, priority: 'Normal', location_address: 'Calendar Street, Brgy. Pulo',
    location_city: 'Cabuyao', location_province: 'Laguna', preferred_date: day(3), latitude: '14.27', longitude: '121.12',
  });
  await call('admin', 'post', `/api/services/service-requests/${created.id}/approve/`);
  const ticket = list(await call('admin', 'get', `/api/services/service-tickets/?request=${created.id}`)).find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
  const scheduled = day(3);
  await call('admin', 'post', `/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: tokens.tech.user.id, dispatch_stage: 'service', scheduled_date: scheduled });
  return { serviceName, ticketId: ticket.id, scheduled };
}

// ====================================================================================== Client: New Request

test.describe('Client New Request - every control', () => {
  test.describe.configure({ timeout: 120000 });
  let clientAuth;

  test.beforeAll(() => {
    clientAuth = loadAuthStateFromBackend('client_test');
  });

  test.beforeEach(async ({ page }) => {
    await seedAuthState(page, clientAuth);
    await page.addInitScript(PARK_ASSISTANT);
    await mockGeocoding(page);
  });

  const openPage = async (page) => {
    await page.goto('/client/service-requests');
    await expect(page.getByRole('heading', { name: 'Choose services' })).toBeVisible();
  };
  const pickDate = async (page, index = 0) => {
    // Availability loads after the month appears and can switch dates off, so pin the date by its label first.
    await page.waitForTimeout(600);
    const label = await page.locator('[role="gridcell"]:not([disabled])').nth(index).getAttribute('aria-label');
    const cell = page.locator(`[role="gridcell"][aria-label="${label}"]`);
    await cell.click();
    await expect(cell).toHaveAttribute('aria-selected', 'true');
  };
  const address = (page) => page.getByPlaceholder('House number, street, barangay, or nearby landmark');
  const fillAddress = async (page) => {
    await address(page).fill('Journey Street, Brgy. Pulo');
    await page.getByPlaceholder('Enter city name').fill('Cabuyao');
    await page.getByPlaceholder('Enter province name').fill('Laguna');
  };
  const pinText = (page) => page.getByText(/Pin selected: |No location pin selected yet/);
  const submitButton = (page) => page.getByRole('button', { name: 'Create Service Request' });

  test('13.1 - The page opens with its four steps, an empty form and no pin', async ({ page }) => {
    await openPage(page);
    const steps = page.getByRole('region', { name: 'Request steps' });
    for (const step of ['Service', 'Location', 'Schedule', 'Details']) await expect(steps).toContainText(step);
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
    await expect(address(page)).toHaveValue('');
    await expect(page.getByPlaceholder('Enter city name')).toHaveValue('');
    await expect(page.getByPlaceholder('Enter province name')).toHaveValue('');
    await expect(page.locator('#request-time-slot')).toHaveValue('');
    await expect(page.locator('#request-details')).toHaveValue('');
    await expect(pinText(page)).toHaveText('No location pin selected yet');
    await expect(submitButton(page)).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Use My Location' })).toBeEnabled();
  });

  test('13.2 - Service checkboxes can be ticked and cleared one by one', async ({ page }) => {
    await openPage(page);
    const boxes = page.getByRole('checkbox');
    await expect(boxes.first()).toBeVisible();
    const count = await boxes.count();
    expect(count).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < count; i += 1) await boxes.nth(i).check();
    for (let i = 0; i < count; i += 1) await expect(boxes.nth(i)).toBeChecked();
    await expect(page.getByText(/^Selected services:/)).toContainText('E2E Solar Installation');
    await boxes.nth(0).uncheck();
    await expect(boxes.nth(0)).not.toBeChecked();
    await expect(boxes.nth(1)).toBeChecked();
    for (let i = 0; i < count; i += 1) await boxes.nth(i).uncheck();
    for (let i = 0; i < count; i += 1) await expect(boxes.nth(i)).not.toBeChecked();
  });

  test('13.3 - The form asks for each missing piece in order before it lets you review', async ({ page }) => {
    await mockPosition(page);
    await openPage(page);
    const confirm = page.getByRole('dialog', { name: 'Submit service request?' });
    // Nothing filled: the browser stops the submit on the required address field, so no review dialog opens.
    await submitButton(page).click();
    await expect(confirm).toHaveCount(0);

    // Address filled but no service chosen.
    await fillAddress(page);
    await submitButton(page).click();
    await expect(page.getByText('Please choose at least one service type.')).toBeVisible();

    // Service chosen, no pin.
    await page.getByRole('checkbox').first().check();
    await submitButton(page).click();
    await expect(page.getByText('Please select location on the map (lat/lng).')).toBeVisible();

    // Pin set, no date.
    await page.getByRole('button', { name: 'Use My Location' }).click();
    await expect(pinText(page)).toContainText('Pin selected:');
    await submitButton(page).click();
    await expect(page.getByText('Please select a preferred appointment date.')).toBeVisible();

    // Date chosen: now the review dialog opens.
    await pickDate(page);
    await submitButton(page).click();
    await expect(confirm).toBeVisible();
  });

  test('13.4 - Use My Location fills the pin and address, and explains when location is blocked', async ({ page }) => {
    await mockPosition(page);
    await openPage(page);
    await page.getByRole('button', { name: 'Use My Location' }).click();
    await expect(pinText(page)).toContainText('Pin selected: 14.27');
    await expect(address(page)).toHaveValue('Test Road, Pulo');
    await expect(page.getByPlaceholder('Enter city name')).toHaveValue('Cabuyao');
    await expect(page.getByPlaceholder('Enter province name')).toHaveValue('Laguna');
    await expect(page.getByText(/Current location selected/)).toBeVisible();
  });

  test('13.4b - A blocked location shows a clear message and leaves the pin empty', async ({ page }) => {
    await mockPosition(page, { denied: true });
    await openPage(page);
    await page.getByRole('button', { name: 'Use My Location' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /location|permission|allow/i })).toBeVisible();
    await expect(pinText(page)).toHaveText('No location pin selected yet');
  });

  test('13.5 - The map zooms in and out and a click on it drops a pin and fills the address', async ({ page }) => {
    await openPage(page);
    const map = page.locator('.leaflet-container').first();
    await expect(map).toBeVisible();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(map).toBeVisible();
    await map.click({ position: { x: 150, y: 150 } });
    await expect(pinText(page)).toContainText('Pin selected:');
    await expect(address(page)).toHaveValue('Test Road, Pulo');
    await expect(page.getByPlaceholder('Enter city name')).toHaveValue('Cabuyao');
  });

  test('13.6 - Address search lists places, a click on one pins it, and a failing search says so', async ({ page }) => {
    await openPage(page);
    const search = page.getByLabel('Search service location');
    await search.fill('SM City');
    const first = page.getByRole('button', { name: /SM City Calamba/ });
    await expect(first).toBeVisible();
    await expect(page.getByRole('button', { name: /SM City Sta\. Rosa/ })).toBeVisible();
    await first.click();
    await expect(pinText(page)).toContainText('Pin selected: 14.2');
    await expect(search).toHaveValue('');
    await expect(page.getByRole('button', { name: /SM City Calamba/ })).toHaveCount(0);
    await expect(address(page)).toHaveValue('Test Road, Pulo');

    // Clearing the box clears the list.
    await search.fill('SM');
    await expect(page.getByRole('button', { name: /SM City Calamba/ })).toBeVisible();
    await search.fill('');
    await expect(page.getByRole('button', { name: /SM City Calamba/ })).toHaveCount(0);
  });

  test('13.6b - A search that fails shows an error instead of a list', async ({ page }) => {
    await page.unroute('**/api/geocode/search/**');
    await page.route('**/api/geocode/search/**', (route) => route.fulfill({ status: 500, json: { detail: 'Search is down.' } }));
    await openPage(page);
    await page.getByLabel('Search service location').fill('anything');
    await expect(page.getByText(/Search is down|Unable to search|failed/i).first()).toBeVisible();
  });

  test('13.7 - The appointment calendar moves between months, picks a date and the time slot list works', async ({ page }) => {
    await openPage(page);
    const grid = page.getByRole('grid');
    const month = await grid.getAttribute('aria-label');
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(grid).not.toHaveAttribute('aria-label', month || '');
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(grid).toHaveAttribute('aria-label', month || '');
    await pickDate(page, 1);
    await expect(page.getByRole('status').filter({ hasText: /available|limited/i })).toBeVisible();
    const slot = page.locator('#request-time-slot');
    const values = await slot.locator('option').evaluateAll((options) => options.map((option) => option.value));
    expect(values).toEqual(['', 'morning', 'midday', 'afternoon']);
    for (const value of values) {
      await slot.selectOption(value);
      await expect(slot).toHaveValue(value);
    }
    // Choosing a different date moves the selection.
    await pickDate(page, 3);
    await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(1);
  });

  const fillWholeForm = async (page, note) => {
    await page.getByRole('checkbox').first().check();
    await fillAddress(page);
    await page.getByRole('button', { name: 'Use My Location' }).click();
    await expect(pinText(page)).toContainText('Pin selected:');
    await fillAddress(page);
    await pickDate(page, 4);
    await page.locator('#request-time-slot').selectOption('morning');
    await page.locator('#request-details').fill(note);
  };

  test('13.8 - The review dialog shows what you entered, Review again and Escape go back without sending', async ({ page }) => {
    await mockPosition(page);
    await openPage(page);
    const before = (await listAll(page, '/api/services/service-requests/')).length;
    await fillWholeForm(page, 'E2E review dialog note');
    await submitButton(page).click();
    const confirm = page.getByRole('dialog', { name: 'Submit service request?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Journey Street, Brgy. Pulo');
    await expect(confirm).toContainText('Cabuyao, Laguna');
    await expect(confirm).toContainText('Morning (8 AM - 11 AM)');
    await expect(confirm).toContainText('E2E review dialog note');
    await confirm.getByRole('button', { name: 'Review again' }).click();
    await expect(confirm).toBeHidden();
    await expect(address(page)).toHaveValue('Journey Street, Brgy. Pulo');
    await expect(page.locator('#request-details')).toHaveValue('E2E review dialog note');

    await submitButton(page).click();
    await expect(confirm).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    expect((await listAll(page, '/api/services/service-requests/')).length).toBe(before);
  });

  test('13.9 - Confirm submit sends the request, shows the success box, clears the form and lists it', async ({ page }) => {
    await mockPosition(page);
    await openPage(page);
    const note = `E2E client request ${Date.now()}`;
    await fillWholeForm(page, note);
    await submitButton(page).click();
    await page.getByRole('button', { name: 'Confirm submit' }).click();
    await expect(page.getByRole('heading', { name: 'Request submitted' })).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByRole('heading', { name: 'Request submitted' })).toBeHidden();

    // The form is back to empty.
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
    await expect(address(page)).toHaveValue('');
    await expect(page.locator('#request-details')).toHaveValue('');
    await expect(pinText(page)).toHaveText('No location pin selected yet');
    await expect(page.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(0);

    const created = (await listAll(page, '/api/services/service-requests/')).find((entry) => entry.description === note);
    expect(created, 'request saved').toBeTruthy();
    expect(created.status).toBe('Pending');
    await page.goto('/client/requests');
    await expect(page.getByText(`REQ-${String(created.id).padStart(4, '0')}`).locator('visible=true').first()).toBeVisible();
  });

  test('13.10 - When the server refuses the request the form keeps your answers and shows why', async ({ page }) => {
    await mockPosition(page);
    await page.route('**/api/services/service-requests/', async (route) => {
      if (route.request().method() === 'POST') return route.fulfill({ status: 400, json: { detail: 'E2E: that date cannot be booked.' } });
      return route.continue();
    });
    await openPage(page);
    await fillWholeForm(page, 'E2E refused note');
    await submitButton(page).click();
    await page.getByRole('button', { name: 'Confirm submit' }).click();
    await expect(page.getByText(/E2E: that date cannot be booked\./)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Request submitted' })).toHaveCount(0);
    await expect(address(page)).toHaveValue('Journey Street, Brgy. Pulo');
    await expect(page.locator('#request-details')).toHaveValue('E2E refused note');
    await expect(submitButton(page)).toBeEnabled();
  });

  test('13.11 - On a phone the whole form is reachable and nothing spills sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPage(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    for (const target of [page.getByRole('checkbox').first(), address(page), page.locator('#request-time-slot'), submitButton(page), page.getByRole('button', { name: 'Use My Location' })]) {
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeVisible();
    }
  });
});

// ====================================================================================== Calendar: admin and superadmin

for (const account of ['admin_test', 'superadmin_test']) {
  test.describe(`Calendar controls as ${account}`, () => {
    test.describe.configure({ timeout: 150000 });
    let auth;
    const monthLabel = (page) => page.getByRole('heading', { level: 3, name: /^[A-Z][a-z]+ 20\d\d$/ });
    const showing = (page) => page.getByText(/^Showing \d+ of \d+ events?$/);
    const todayLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    test.beforeAll(() => {
      auth = loadAuthStateFromBackend(account);
    });

    test.beforeEach(async ({ page }) => {
      await seedAuthState(page, auth);
      await page.addInitScript(PARK_ASSISTANT);
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}1 - Month buttons, Today, Include completed, the colour legend and every filter work`, async ({ page }) => {
      await visitWorkspacePage(page, '/admin/calendar');
      const label = monthLabel(page);
      const current = await label.innerText();
      await page.getByRole('button', { name: 'Next month' }).click();
      await expect(label).not.toHaveText(current);
      await page.getByRole('button', { name: 'Previous month' }).click();
      await expect(label).toHaveText(current);
      await page.getByRole('button', { name: 'Previous month' }).click();
      await expect(label).not.toHaveText(current);
      await page.getByRole('button', { name: 'Today', exact: true }).click();
      await expect(label).toHaveText(current);

      const includeCompleted = page.getByLabel('Include completed');
      await includeCompleted.check();
      await expect(includeCompleted).toBeChecked();
      await includeCompleted.uncheck();
      await expect(includeCompleted).not.toBeChecked();

      const legendToggle = page.getByRole('button', { name: /Service colors|Hide service colors/ });
      await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');
      await legendToggle.click();
      await expect(legendToggle).toHaveAttribute('aria-expanded', 'true');
      await legendToggle.click();
      await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');

      await expect(showing(page)).toBeVisible();
      // The event count settles a moment after the page appears; wait until two reads agree.
      const settled = async () => {
        let previous = '';
        for (let i = 0; i < 20; i += 1) {
          const now = await showing(page).innerText();
          if (now === previous) return now;
          previous = now;
          await page.waitForTimeout(600);
        }
        return previous;
      };
      const initial = await settled();
      const filters = ['Filter by workflow', 'Filter by service', 'Filter by technician', 'Filter by status'];
      for (const name of filters) {
        const select = page.getByLabel(name);
        const values = await select.locator('option').evaluateAll((options) => options.map((option) => option.value));
        for (const value of values) {
          await select.selectOption(value);
          await expect(select).toHaveValue(value);
          await expect(showing(page)).toBeVisible();
        }
        await select.selectOption('all');
      }
      await page.getByLabel('Filter by technician').selectOption('unassigned');
      await page.getByLabel('Filter by status').selectOption('scheduled');
      await page.getByRole('button', { name: 'Clear filters' }).click();
      for (const name of filters) await expect(page.getByLabel(name)).toHaveValue('all');
      await expect(showing(page)).toHaveText(initial);
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}0 - With appointments loaded, no two buttons overlap and an empty part of a day still selects it`, async ({ page }) => {
      await visitWorkspacePage(page, '/admin/calendar');
      await expect(page.getByRole('button', { name: /E2E .* (scheduled|inspect)/i }).first()).toBeVisible();
      const collisions = await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('main button')]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          })
          .map((element) => ({ element, rect: element.getBoundingClientRect(), label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 60) }));
        const found = [];
        for (let i = 0; i < buttons.length; i += 1) {
          for (let j = i + 1; j < buttons.length; j += 1) {
            const a = buttons[i];
            const b = buttons[j];
            const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
            const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
            if (width > 1 && height > 1 && !a.element.contains(b.element) && !b.element.contains(a.element)) found.push(`${a.label} <> ${b.label}`);
          }
        }
        return found;
      });
      expect(collisions).toEqual([]);

      // Clicking the empty lower part of today's cell (below its appointments) still opens that day.
      const todayButton = page.getByRole('button', { name: new RegExp(`^${todayLabel()},`) }).last();
      const cell = todayButton.locator('xpath=..');
      const box = await cell.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4);
      await expect(page.getByRole('dialog', { name: /Appointments for/ })).toBeVisible();
      await page.keyboard.press('Escape');

      // Keyboard users still reach the day through its date-row button.
      await todayButton.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: /Appointments for/ })).toBeVisible();
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}2 - A day opens its appointments and closes by the X, Escape or a click outside`, async ({ page }) => {
      await visitWorkspacePage(page, '/admin/calendar');
      const day = page.getByRole('button', { name: new RegExp(`^${todayLabel()},`) }).last();
      const agenda = page.getByRole('dialog', { name: /Appointments for/ });
      await day.click({ position: { x: 12, y: 12 } });
      await expect(agenda).toBeVisible();
      await agenda.getByRole('button', { name: 'Close selected day appointments' }).click();
      await expect(agenda).toBeHidden();
      await day.click({ position: { x: 12, y: 12 } });
      await expect(agenda).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(agenda).toBeHidden();
      await day.click({ position: { x: 12, y: 12 } });
      await expect(agenda).toBeVisible();
      await page.mouse.click(5, 5);
      await expect(agenda).toBeHidden();
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}3 - A job opens its details, closes, and links to the ticket queue and dispatch board`, async ({ page }) => {
      await visitWorkspacePage(page, '/admin/calendar');
      const job = page.getByRole('button', { name: /E2E .* (scheduled|inspect)/i }).first();
      await expect(job).toBeVisible();
      await job.click();
      const details = page.getByRole('dialog').filter({ hasText: /TKT-\d+/ }).last();
      await expect(details).toBeVisible();
      await details.getByRole('button', { name: 'Close event details' }).click();
      await expect(page.getByRole('button', { name: 'Close event details' })).toHaveCount(0);

      await job.click();
      await expect(page.getByRole('button', { name: 'Open ticket queue' }).last()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Close event details' })).toHaveCount(0);

      await job.click();
      await page.getByRole('button', { name: 'Open ticket queue' }).last().click();
      await expect(page).toHaveURL(/\/admin\/service-tickets/);
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Service Calendar', exact: true })).toBeVisible();
      await page.waitForTimeout(800);
      const dispatch = page.getByRole('button', { name: 'Open dispatch' });
      if (!(await dispatch.last().isVisible().catch(() => false))) await page.getByRole('button', { name: /E2E .* (scheduled|inspect)/i }).first().click();
      await dispatch.last().click();
      await expect(page).toHaveURL(/\/admin\/dispatch/);
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}4 - Reschedule from the calendar checks its fields, can be dismissed and saves the new date`, async ({ page, request }) => {
      const made = await createNotStartedJob(request, account === 'admin_test' ? 'Admin' : 'Super');
      await visitWorkspacePage(page, '/admin/calendar');
      if (new Date(`${made.scheduled}T00:00:00`).getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Next month' }).click();
      const job = page.getByRole('button', { name: new RegExp(made.serviceName) }).first();
      await expect(job).toBeVisible();
      await job.click();
      const reschedule = page.getByRole('button', { name: 'Reschedule', exact: true });
      await expect(reschedule).toBeVisible();
      await reschedule.click();
      await expect(page.getByRole('heading', { name: 'Reschedule Ticket' })).toBeVisible();
      for (const field of ['New Date', 'Time Slot', 'Exact Time', 'Reschedule Reason']) await expect(page.getByText(field, { exact: false }).first()).toBeVisible();

      // Dismiss and the X both close it without saving.
      await page.getByRole('button', { name: 'Dismiss' }).click();
      await expect(page.getByRole('heading', { name: 'Reschedule Ticket' })).toBeHidden();
      await job.click();
      await reschedule.click();
      await page.getByRole('button', { name: 'Close reschedule dialog' }).click();
      await expect(page.getByRole('heading', { name: 'Reschedule Ticket' })).toBeHidden();

      // A reason is required.
      await job.click();
      await reschedule.click();
      const target = new Date(Date.now() + 40 * 86400000);
      const targetKey = localKey(target);
      await page.locator('input[type="date"]').last().fill(targetKey);
      await page.getByRole('button', { name: 'Save Schedule' }).click();
      await expect(page.getByRole('heading', { name: 'Reschedule Ticket' })).toBeVisible();
      await expect(page.getByText(/reason/i).first()).toBeVisible();

      await page.getByPlaceholder('Explain why the schedule is changing for the audit record.').fill(`E2E calendar reschedule by ${account}`);
      await page.getByRole('button', { name: 'Save Schedule' }).click();
      await expect(page.getByRole('heading', { name: 'Reschedule Ticket' })).toBeHidden({ timeout: 15000 });
      const moved = await apiGet(page, `/api/services/service-tickets/${made.ticketId}/`);
      expect(moved.scheduled_date).toBe(targetKey);
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}5 - Availability: close a day, see it blocked, reopen it, then limit and reopen a whole range`, async ({ page }) => {
      await visitWorkspacePage(page, '/admin/calendar');
      await page.getByRole('button', { name: 'Configure Availability' }).click();
      await expect(page.getByRole('button', { name: 'Done Configuring' })).toHaveAttribute('aria-pressed', 'true');

      // Go to a date about three weeks away.
      const target = new Date(Date.now() + 21 * 86400000);
      const label = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      if (target.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Next month' }).click();
      const cell = page.getByRole('button', { name: new RegExp(`^${label},.*open availability configuration$`) }).last();
      await cell.click({ position: { x: 12, y: 12 } });
      const panel = page.getByRole('dialog', { name: /Configure availability for/ });
      await expect(panel).toBeVisible();
      for (const heading of ['Current booking position', 'Daily booking limit', 'Manual availability override', 'Existing manual restrictions']) {
        await expect(panel.getByRole('heading', { name: heading })).toBeVisible();
      }
      await expect(panel).toContainText('No manual restrictions for this date.');
      await expect(panel).toContainText('jobs maximum per date');

      // Status choices and the reason rule.
      const status = panel.getByLabel('Availability status');
      await expect(status.locator('option')).toHaveCount(3);
      await status.selectOption('closed');
      await panel.getByLabel('Affected time').selectOption({ index: 0 });
      await panel.getByRole('button', { name: /^Close availability$/ }).click();
      await expect(panel.getByText(/reason/i).first()).toBeVisible();
      await panel.getByPlaceholder('Reason for limiting or closing new bookings').fill('E2E closed for a company event');
      await panel.getByRole('button', { name: /^Close availability$/ }).click();
      const closeConfirm = page.getByRole('dialog', { name: /Close this date range/ });
      if (await closeConfirm.isVisible({ timeout: 2000 }).catch(() => false)) await closeConfirm.getByRole('button', { name: 'Apply closed' }).click();
      await expect(panel.getByText('No manual restrictions for this date.')).toBeHidden({ timeout: 15000 });
      await expect(panel).toContainText('E2E closed for a company event');
      await expect(page.getByLabel(new RegExp(`Closure for ${localKey(target)}`)).first()).toBeVisible();

      // Reopen from the restriction list.
      await panel.getByRole('button', { name: 'Reopen', exact: true }).first().click();
      const reopenConfirm = page.getByRole('dialog', { name: /Reopen this/ });
      if (await reopenConfirm.isVisible({ timeout: 2000 }).catch(() => false)) await reopenConfirm.getByRole('button', { name: /Reopen/ }).click();
      await expect(panel.getByText('No manual restrictions for this date.')).toBeVisible({ timeout: 15000 });

      // A range: Bulk Edit, Limited, apply, then reopen the same range.
      await panel.getByRole('button', { name: 'Bulk Edit' }).click();
      await expect(panel.getByRole('button', { name: 'Bulk Edit' })).toHaveAttribute('aria-pressed', 'true');
      await expect(panel.getByText(/dates? selected/)).toBeVisible();
      const end = localKey(new Date(target.getTime() + 2 * 86400000));
      await panel.getByLabel('End date').fill(end);
      await expect(panel.getByText(/3 dates selected/)).toBeVisible();
      await panel.getByLabel('Availability status').selectOption('limited');
      await panel.getByPlaceholder('Reason for limiting or closing new bookings').fill('E2E limited range');
      await panel.getByRole('button', { name: 'Apply Limited to range' }).click();
      await page.getByRole('dialog', { name: /Limit this date range/ }).getByRole('button', { name: 'Apply limited' }).click();
      await expect(panel).toContainText('E2E limited range', { timeout: 15000 });
      await panel.getByLabel('Availability status').selectOption('open');
      await panel.getByRole('button', { name: 'Reopen selected range' }).click();
      await page.getByRole('dialog', { name: /Reopen this date range/ }).getByRole('button', { name: 'Reopen range' }).click();
      await expect(panel.getByText('No manual restrictions for this date.')).toBeVisible({ timeout: 15000 });

      // Leave cleanly.
      await panel.getByRole('button', { name: 'Close availability configuration' }).click();
      const discard = page.getByRole('dialog', { name: 'Discard availability changes?' });
      if (await discard.count()) await discard.getByRole('button', { name: 'Discard changes' }).click();
      await expect(panel).toBeHidden();
      await page.getByRole('button', { name: 'Done Configuring' }).click();
      await expect(page.getByRole('button', { name: 'Configure Availability' })).toHaveAttribute('aria-pressed', 'false');
    });

    test(`13.${account === 'admin_test' ? 'A' : 'S'}6 - On a phone the filters fold away, the date box works and a day opens its list`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await visitWorkspacePage(page, '/admin/calendar');
      const toggle = page.getByRole('button', { name: /^(Show|Hide) filters/ });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByLabel('Filter by status')).toBeHidden();
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByLabel('Filter by status')).toBeVisible();
      await page.getByLabel('Filter by status').selectOption({ index: 1 });
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page.getByLabel('Filter by status')).toHaveValue('all');
      await toggle.click();
      await expect(page.getByLabel('Filter by status')).toBeHidden();

      const dateBox = page.locator('input[type="date"]').first();
      await expect(dateBox).toBeVisible();
      const key = localKey(new Date());
      await dateBox.fill(key);
      await expect(dateBox).toHaveValue(key);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      const mobileDay = page.getByRole('button', { name: new RegExp(`^${todayLabel()},`) }).first();
      await mobileDay.click();
      await expect(page.getByRole('dialog', { name: /Appointments for/ })).toBeVisible();
      await page.getByRole('button', { name: 'Close selected day appointments' }).click();
      await expect(page.getByRole('dialog', { name: /Appointments for/ })).toBeHidden();
    });
  });
}
