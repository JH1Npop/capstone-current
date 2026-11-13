// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control and flow on /technician/my-jobs, with its own technicians and seven jobs:
// loading state, the "show more" control, a deep link opening a job, Start Job from a card (other
// cards then say to finish that job first), Put on Hold (reason checked inside the dialog) and
// Resume, the equipment request (quantity checked inside the dialog, a real request, the form
// cleared when you leave the job, discard prompt on Escape), the timeline, Finish Job (photos the
// server would refuse are named and left out, a server failure shown inside the dialog, the real
// completion, a discard prompt), a crew member's limits, a failed refresh keeping the list, and the
// phone layout.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayKey = (offset) => localKey(new Date(Date.now() + offset * 86400000));
const code = (id) => `TKT-${String(id).padStart(4, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
let nextDay = 50;

const apiAs = (request, auth) => {
  const headers = { Authorization: `Token ${auth.token}` };
  const call = async (method, path, data) => {
    const options = { headers };
    if (data !== undefined) options.data = data;
    const response = await request[method](path, options);
    const body = await response.json().catch(() => ({}));
    expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
    return body;
  };
  return { get: (path) => call('get', path), post: (path, data) => call('post', path, data ?? {}), put: (path, data) => call('put', path, data) };
};

test.describe('Technician jobs controls', () => {
  test.describe.configure({ timeout: 420000 });

  test('36 - every Technician Jobs control and flow works', async ({ page, browser, request }) => {
    const admin = apiAs(request, loadAuthStateFromBackend('superadmin_test'));
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();

    const service = await admin.post('/api/admin/services/', {
      name: `E2E Jobs ${stamp}`, description: 'Technician jobs check.', estimated_duration: 90, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Complete and test.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const makeTech = async (suffix) => {
      const username = `jobs${suffix}${stamp}`.toLowerCase();
      const tech = await admin.post('/api/admin/technicians/', {
        username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Jobs', last_name: `${suffix}${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
      });
      await admin.put(`/api/admin/technicians/${tech.id}/`, { skills: [{ service_type: service.id, skill_level: 'expert' }] });
      return { ...tech, username };
    };
    const lead = await makeTech('Lead');
    const crew = await makeTech('Crew');
    const makeJob = async (crewIds = []) => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 15 && !created; attempt += 1) {
        visitDate = dayKey(nextDay++);
        const response = await request.post('/api/services/service-requests/', {
          headers: { Authorization: `Token ${clientAuth.token}` },
          data: {
            service_type: service.id, description: `E2E jobs scope ${stamp}`, priority: 'Normal',
            location_address: 'Jobs Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
        else expect(await response.text()).toContain('no appointment availability');
      }
      await admin.post(`/api/services/service-requests/${created.id}/approve/`);
      const ticket = list(await admin.get(`/api/services/service-tickets/?request=${created.id}`))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await admin.post(`/api/services/service-tickets/${ticket.id}/assign/`, { technician_id: lead.id, crew_ids: crewIds, dispatch_stage: 'service', scheduled_date: visitDate });
      return ticket.id;
    };
    const jobs = [];
    for (let index = 0; index < 6; index += 1) jobs.push(await makeJob());
    const crewJob = await makeJob([crew.id]);
    jobs.push(crewJob);
    const [first, second] = jobs;

    const leadAuth = loadAuthStateFromBackend(lead.username);
    const leadApi = apiAs(request, leadAuth);
    const status = async (id) => (await leadApi.get(`/api/technician/jobs/${id}/`)).status;
    await leadApi.post('/api/services/technician/location/', { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    await leadApi.post(`/api/technician/jobs/${first}/start-navigation/`);
    await leadApi.post(`/api/technician/jobs/${first}/arrive/`, SITE);

    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, leadAuth);

    // ── While the list loads it says so (not "No active jobs") ──
    let releaseJobs;
    const held = new Promise((resolve) => { releaseJobs = resolve; });
    const holdJobs = async (route) => { await held; await route.continue().catch(() => {}); };
    await page.route('**/api/technician/jobs/?*', holdJobs);
    await page.goto('/technician/my-jobs');
    await expect(page.getByText('Loading your jobs…')).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('No active jobs')).toHaveCount(0);
    releaseJobs();
    await expect(page.getByRole('heading', { name: 'Active Jobs (7)' })).toBeVisible({ timeout: 30000 });
    await page.unroute('**/api/technician/jobs/?*', holdJobs);

    // ── Every active job can be reached ──
    await expect(page.getByRole('button', { name: /^Details for TKT-/ })).toHaveCount(5);
    await page.getByRole('button', { name: 'Show 2 more active jobs' }).click();
    await expect(page.getByRole('button', { name: /^Details for TKT-/ })).toHaveCount(7);
    await page.getByRole('button', { name: 'Show fewer' }).click();
    await expect(page.getByRole('button', { name: /^Details for TKT-/ })).toHaveCount(5);
    await page.getByRole('button', { name: 'Show 2 more active jobs' }).click();

    // ── Start Job from the card; the other jobs then wait ──
    // The list shows five jobs until "Show more" is used (a reload collapses it again).
    const detailsButton = async (id) => {
      const button = page.getByRole('button', { name: `Details for ${code(id)}` });
      const more = page.getByRole('button', { name: /^Show \d+ more active job/ });
      if (!(await button.count()) && (await more.count())) await more.click();
      return button;
    };
    const card = (id) => page.locator('div.rounded-xl').filter({ has: page.getByRole('button', { name: `Details for ${code(id)}` }) }).first();
    await card(first).getByRole('button', { name: 'Start Job' }).click();
    await expect(page.getByRole('status').filter({ hasText: `${code(first)} started. Work is now in progress.` })).toBeVisible();
    await expect.poll(() => status(first)).toBe('In Progress');
    await expect(card(first).getByRole('link', { name: 'Complete Checklist First' })).toHaveAttribute('href', `/technician/checklist?ticketId=${first}`);
    await expect(card(second).getByText(`Hold or finish ${code(first)} first`)).toBeVisible();

    // ── Details: a deep link opens the job; hold needs a real reason; resume ──
    await page.goto(`/technician/my-jobs?ticketId=${first}`);
    const details = page.getByRole('dialog', { name: service.name });
    await expect(details).toContainText(`${code(first)} for`);
    await details.getByRole('button', { name: 'Put on Hold' }).click();
    await details.getByLabel('Why are you putting this job on hold?').fill('no');
    await details.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(details.getByRole('alert')).toHaveText('Give a reason of at least 5 characters for putting the job on hold.');
    await details.getByLabel('Why are you putting this job on hold?').fill('Waiting for a replacement breaker');
    await details.getByRole('button', { name: 'Confirm Hold' }).click();
    await expect(page.getByRole('status').filter({ hasText: `${code(first)} is on hold.` })).toBeVisible();
    await expect.poll(() => status(first)).toBe('On Hold');
    await details.getByRole('button', { name: 'Resume Job' }).click();
    await expect(page.getByRole('status').filter({ hasText: `${code(first)} resumed.` })).toBeVisible();
    await expect.poll(() => status(first)).toBe('In Progress');

    // ── Equipment request: quantity checked in the dialog, then a real request ──
    await details.getByRole('button', { name: 'Choose equipment' }).click();
    const kit = details.getByRole('checkbox').first();
    await kit.check();
    await page.keyboard.press('Escape'); // closes the list only
    await expect(details).toBeVisible();
    await details.getByRole('spinbutton', { name: 'Quantity' }).fill('999');
    await details.getByRole('button', { name: 'Request Equipment' }).click();
    await expect(details.getByRole('alert')).toContainText('Enter a quantity between 1 and');
    await details.getByRole('spinbutton', { name: 'Quantity' }).fill('1');
    await details.getByLabel('Reason or details for admin').fill('Need one more for the second panel.');
    await details.getByRole('button', { name: 'Request Equipment' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Equipment requested.' })).toBeVisible();
    await expect.poll(async () => (await leadApi.get(`/api/technician/jobs/${first}/`)).inventory_reservations?.length || 0).toBeGreaterThan(0);

    // ── The form is cleared when you leave a job, and Escape asks before discarding ──
    await details.getByRole('button', { name: 'Choose equipment' }).click();
    await details.getByRole('checkbox').first().check();
    await page.keyboard.press('Escape'); // list
    await page.keyboard.press('Escape'); // dialog: asks first
    const discard = page.getByRole('dialog', { name: 'Discard what you entered?' });
    await discard.getByRole('button', { name: 'Keep editing' }).click();
    await expect(details).toBeVisible();
    await details.getByRole('button', { name: 'Close job details' }).click();
    await discard.getByRole('button', { name: 'Discard' }).click();
    await expect(details).toHaveCount(0);
    await (await detailsButton(second)).click();
    await expect(details.getByRole('button', { name: 'Choose equipment' })).toBeVisible();
    await details.getByRole('button', { name: 'Close job details' }).click();
    await expect(details).toHaveCount(0);

    // ── Timeline ──
    await (await detailsButton(first)).click();
    await details.getByRole('button', { name: 'View Timeline' }).click();
    await expect(page.getByRole('dialog').filter({ hasText: /timeline/i }).last()).toBeVisible();
    await page.keyboard.press('Escape');
    await details.getByRole('button', { name: 'Close job details' }).click();

    // ── Finish Job: refused photos are named, a failure stays in the dialog, then it completes ──
    await leadApi.post('/api/checklist/', {
      jobId: first, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
      notes: 'Done.', maintenance_required: false,
    });
    await page.getByRole('button', { name: 'Refresh' }).click();
    await detailsButton(first);
    await card(first).getByRole('button', { name: 'Finish Job' }).click();
    const finish = page.getByRole('dialog', { name: 'Finish Job' });
    const photos = finish.locator('input[type="file"]');
    await photos.setInputFiles([
      { name: 'animation.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') },
      { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
    ]);
    await expect(finish.getByRole('alert')).toHaveText('Not added: animation.gif is not a JPG, PNG or WebP photo; huge.png is larger than 10 MB.');
    await expect(finish.getByRole('button', { name: 'Finish Job', exact: true })).toBeDisabled();
    await photos.setInputFiles({ name: 'done.png', mimeType: 'image/png', buffer: PNG });
    await expect(finish.getByText('1 selected')).toBeVisible();
    await finish.getByLabel('Completion notes').fill('Replaced the breaker and tested.');
    // Closing with a photo added asks first.
    await page.keyboard.press('Escape');
    const discardPhotos = page.getByRole('dialog', { name: 'Discard the photos and notes?' });
    await discardPhotos.getByRole('button', { name: 'Keep editing' }).click();
    await expect(finish.getByText('1 selected')).toBeVisible();
    await page.route(`**/api/technician/jobs/${first}/status/`, (route) => route.fulfill({ status: 400, json: { error: 'Upload completion photos as image files.' } }));
    await finish.getByRole('button', { name: 'Finish Job', exact: true }).click();
    await expect(finish.getByRole('alert')).toHaveText('Upload completion photos as image files.');
    await page.unroute(`**/api/technician/jobs/${first}/status/`);
    await finish.getByRole('button', { name: 'Finish Job', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: `${code(first)} completed. It is now in Job History.` })).toBeVisible();
    await expect.poll(() => status(first)).toBe('Completed');
    await expect(page.getByRole('button', { name: `Details for ${code(first)}` })).toHaveCount(0);

    // ── A failed refresh keeps the list ──
    await page.route('**/api/technician/jobs/?*', (route) => route.fulfill({ status: 500, json: { detail: 'Jobs are unavailable.' } }));
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Showing the last list we received.' })).toBeVisible();
    await expect(await detailsButton(second)).toBeVisible();
    await page.unroute('**/api/technician/jobs/?*');

    // ── Phone layout ──
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

    // ── A crew member sees the job but cannot pause it ──
    const crewContext = await browser.newContext();
    const crewPage = await crewContext.newPage();
    await crewPage.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(crewPage, loadAuthStateFromBackend(crew.username));
    await crewPage.goto(`/technician/my-jobs?ticketId=${crewJob}`);
    const crewDetails = crewPage.getByRole('dialog', { name: service.name });
    await expect(crewDetails).toContainText('Crew Member', { timeout: 30000 });
    await expect(crewDetails.getByRole('button', { name: 'Put on Hold' })).toHaveCount(0);
    await crewContext.close();
  });
});
