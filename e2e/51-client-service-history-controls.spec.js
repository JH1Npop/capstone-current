// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /client/service-history with its own client and two finished jobs (one rated 5,
// one not rated), each with a completion photo:
// - the summary (count, average rating, "Waiting for your rating" with "Show them");
// - search by REQ code, and "Highest rated first" putting unrated last;
// - phone cards with real buttons ("View and rate" opens Rate This Service, "More" opens the actions);
// - the actions dialog, proof files and photo preview, each a named dialog that Escape closes one
//   layer at a time;
// - the timeline;
// - 44 px buttons and no sideways scroll on a phone, plus a laptop screenshot.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const SITE = { latitude: 14.2786, longitude: 121.125 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const reqCode = (id) => `REQ-${String(id).padStart(4, '0')}`;

test.describe('Client service history controls', () => {
  test.describe.configure({ timeout: 360000 });

  test('51 - every Service History control works', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const as = (auth) => ({ Authorization: `Token ${auth.token}` });
    const call = async (method, path, auth, data, multipart = false) => {
      const options = { headers: as(auth) };
      if (data !== undefined) options[multipart ? 'multipart' : 'data'] = data;
      const response = await request[method](path, options);
      const body = await response.json().catch(() => ({}));
      expect(response.ok(), `${method.toUpperCase()} ${path}: ${response.status()} ${JSON.stringify(body)}`).toBeTruthy();
      return body;
    };
    const stamp = Date.now();
    const makeService = async (label) => call('post', '/api/admin/services/', superAuth, {
      name: `E2E History ${label} ${stamp}`, description: 'History check.', estimated_duration: 60, estimated_cost: 1000,
      max_daily_assignments: 9, is_active: true, requires_site_inspection: false,
      procedures: [{ step: 1, title: 'Do the agreed work', description: 'Work.', requires_photo: false }],
      inspection_procedures: [], deposit_policy: 'none', deposit_value: 0,
    });
    const ratedService = await makeService('Rated');
    const openService = await makeService('Unrated');
    const techName = `shtech${stamp}`.toLowerCase();
    const tech = await call('post', '/api/admin/technicians/', superAuth, {
      username: techName, email: `${techName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Hist', last_name: `Tech${stamp}`, phone: '09171234567', role: 'technician', status: 'active', is_available: true,
    });
    await call('put', `/api/admin/technicians/${tech.id}/`, superAuth, {
      skills: [ratedService, openService].map((service) => ({ service_type: service.id, skill_level: 'expert' })),
    });
    const techAuth = loadAuthStateFromBackend(techName);
    await call('post', '/api/services/technician/location/', techAuth, { latitude: 14.27, longitude: 121.12, accuracy: 9 });
    const clientName = `shclient${stamp}`.toLowerCase();
    await call('post', '/api/admin/users/', superAuth, {
      username: clientName, email: `${clientName}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
      first_name: 'Hist', last_name: `Client${stamp}`, phone: '09171234573', role: 'client',
    });
    const clientAuth = loadAuthStateFromBackend(clientName);

    let nextDay = 120;
    const finishedJob = async (service) => {
      let created;
      let visitDate;
      for (let attempt = 0; attempt < 20 && !created; attempt += 1) {
        visitDate = localKey(new Date(Date.now() + (nextDay++) * 86400000));
        const response = await request.post('/api/services/service-requests/', {
          headers: as(clientAuth),
          data: {
            service_type: service.id, description: `History ${service.name}`, priority: 'Normal',
            location_address: 'History Lane, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
            preferred_date: visitDate, latitude: String(SITE.latitude), longitude: String(SITE.longitude),
          },
        });
        if (response.ok()) created = await response.json();
      }
      await call('post', `/api/services/service-requests/${created.id}/approve/`, superAuth);
      const ticket = list(await call('get', `/api/services/service-tickets/?request=${created.id}`, superAuth))
        .find((entry) => Number(entry.request) === Number(created.id) || Number(entry.request_id) === Number(created.id));
      await call('post', `/api/services/service-tickets/${ticket.id}/assign/`, superAuth, { technician_id: tech.id, dispatch_stage: 'service', scheduled_date: visitDate });
      await call('post', `/api/technician/jobs/${ticket.id}/start-navigation/`, techAuth);
      await call('post', `/api/technician/jobs/${ticket.id}/arrive/`, techAuth, SITE);
      await call('post', `/api/technician/jobs/${ticket.id}/status/`, techAuth, { status: 'in_progress' });
      await call('post', '/api/checklist/', techAuth, {
        jobId: ticket.id, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the agreed work', completed: true }],
        notes: 'Done.', maintenance_required: false,
      });
      await call('post', `/api/services/service-tickets/${ticket.id}/complete_work/`, techAuth, {
        completion_notes: 'Finished and tested.', completion_photo_files: { name: 'done.png', mimeType: 'image/png', buffer: PNG },
      }, true);
      return { requestId: created.id, ticketId: ticket.id };
    };
    const rated = await finishedJob(ratedService);
    const unrated = await finishedJob(openService);
    await call('post', `/api/services/service-tickets/${rated.ticketId}/submit_feedback/`, clientAuth, { rating: 5, feedback: 'Excellent.' });

    // A laptop screenshot for the layout review.
    const laptop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const laptopPage = await laptop.newPage();
    await seedAuthState(laptopPage, clientAuth);
    await laptopPage.goto('/client/service-history');
    await expect(laptopPage.locator('dl[aria-label="Your service summary"]')).toBeVisible({ timeout: 30000 });
    await laptopPage.screenshot({ path: 'test-results/screenshots/51-client-service-history-laptop.png' });
    await laptop.close();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, clientAuth);
    await page.goto('/client/service-history');

    // ── Summary ──
    const summary = page.locator('dl[aria-label="Your service summary"]');
    await expect(summary).toContainText('Completed services2', { timeout: 30000 });
    await expect(summary).toContainText('5.0/5');
    await expect(summary).toContainText('Waiting for your rating1');
    const card = (service) => page.getByRole('article', { name: service.name });

    // ── "Show them" narrows to services that still need a rating ──
    await summary.getByRole('button', { name: 'Show them' }).click();
    await expect(card(openService)).toBeVisible();
    await expect(card(ratedService)).toHaveCount(0);
    await page.getByRole('button', { name: /Clear/ }).first().click();
    await expect(card(ratedService)).toBeVisible();

    // ── Search by REQ code; highest rated first puts unrated last ──
    const search = page.getByRole('searchbox').first();
    await search.fill(reqCode(rated.requestId));
    await expect(page.getByRole('article')).toHaveCount(1);
    await expect(card(ratedService)).toBeVisible();
    await search.fill('');
    const filtersToggle = page.getByRole('button', { name: /^Filters/ });
    if ((await filtersToggle.getAttribute('aria-expanded')) !== 'true') await filtersToggle.click();
    await page.getByLabel('Sort order').selectOption('highest_rating');
    await expect(page.getByRole('article').first()).toHaveAccessibleName(ratedService.name);
    await expect(page.getByRole('article').last()).toHaveAccessibleName(openService.name);

    // ── "View and rate" opens the detail at Rate This Service ──
    const viewAndRate = card(openService).getByRole('button', { name: 'View and rate' });
    expect((await viewAndRate.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await viewAndRate.click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${unrated.requestId}\\?entity=request$`));
    await expect(page.getByRole('heading', { name: 'Rate This Service' })).toBeVisible({ timeout: 30000 });
    await page.goBack();

    // ── Actions, proof files and preview: named dialogs, Escape closes one layer at a time ──
    const more = card(ratedService).getByRole('button', { name: `More actions for ${ratedService.name}` });
    await expect(more).toBeVisible({ timeout: 30000 });
    expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await more.click();
    const actions = page.getByRole('dialog', { name: 'Service Actions' });
    await expect(actions).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(actions).toHaveCount(0);
    await more.click();
    await actions.getByRole('button', { name: 'View proof files' }).click();
    const proofs = page.getByRole('dialog', { name: 'Proof Files' });
    await expect(proofs).toBeVisible();
    await proofs.getByRole('button', { name: /^Preview / }).first().click();
    const preview = page.getByRole('dialog', { name: /proof/i }).last();
    await expect(page.getByRole('dialog')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(proofs).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(proofs).toHaveCount(0);
    expect(preview).toBeTruthy();

    // ── Timeline ──
    await more.click();
    await actions.getByRole('button', { name: 'View timeline' }).click();
    const timeline = page.getByRole('dialog', { name: `TKT-${String(rated.ticketId).padStart(4, '0')}` });
    await expect(timeline).toBeVisible({ timeout: 30000 });
    await page.keyboard.press('Escape');
    await expect(timeline).toHaveCount(0);

    // ── Phone layout ──
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await context.close();
  });
});
