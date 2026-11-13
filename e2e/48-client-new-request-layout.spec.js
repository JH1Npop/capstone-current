// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// What spec 13 does not cover on /client/service-requests: the map now sits inside the Location step
// (above Submit) on laptops and phones; the step bar shows progress and jumps to a step; a missing pin
// is reported in the Location step, in view; search says when nothing is found, Enter picks the first
// place without submitting and Escape closes the list; the review shows a readable date; the success
// box closes with Escape and "View request" opens the new request; and a half-filled form warns
// before the page is closed.

const REVERSE_RESULT = {
  lookup_status: 'ok',
  display_name: 'Test Road, Pulo, Cabuyao, Laguna, Philippines',
  address: { road: 'Test Road', village: 'Pulo', city: 'Cabuyao', state: 'Laguna' },
};

async function prepare(page, { emptySearch = false } = {}) {
  await page.addInitScript(() => {
    window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success) => success({ coords: { latitude: 14.27, longitude: 121.12, accuracy: 8 }, timestamp: Date.now() }),
        watchPosition: () => 1,
        clearWatch: () => {},
      },
    });
  });
  await page.route('**/api/geocode/reverse/**', (route) => route.fulfill({ json: REVERSE_RESULT }));
  await page.route('**/api/geocode/search/**', (route) => {
    const query = new URL(route.request().url()).searchParams.get('q') || '';
    if (emptySearch || query.includes('zzz')) return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: { results: [{ display_name: 'SM City Calamba, Calamba, Laguna', lat: '14.2000', lon: '121.1500' }] } });
  });
  await seedAuthState(page, loadAuthStateFromBackend('client_test'));
  await page.goto('/client/service-requests');
  await expect(page.getByRole('heading', { name: 'Choose services' })).toBeVisible({ timeout: 30000 });
  // The form initially renders its empty catalog state. Wait for the catalog's
  // single state update before comparing geometry so every box uses one layout.
  await expect(page.getByRole('checkbox').first()).toBeVisible();
}

const submit = (page) => page.getByRole('button', { name: 'Create Service Request' });
const pickFirstDate = async (page) => {
  await page.waitForTimeout(600);
  const label = await page.locator('[role="gridcell"]:not([disabled])').first().getAttribute('aria-label');
  await page.locator(`[role="gridcell"][aria-label="${label}"]`).click();
};

test.describe('Client new request: layout and guidance', () => {
  test.describe.configure({ timeout: 180000 });

  for (const [width, height] of [[1366, 768], [390, 844]]) {
    test(`48 - ${width}px: the map is inside the Location step, above Submit`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await prepare(page);
      const map = page.locator('.leaflet-container').first();
      const mapBox = await map.boundingBox();
      const submitBox = await submit(page).boundingBox();
      const locationHeading = await page.getByRole('heading', { name: 'Service location' }).boundingBox();
      const scheduleHeading = await page.getByRole('heading', { name: 'Preferred schedule' }).boundingBox();
      expect(mapBox.y).toBeGreaterThan(locationHeading.y);
      expect(mapBox.y).toBeLessThan(scheduleHeading.y);
      expect(mapBox.y).toBeLessThan(submitBox.y);
      for (const control of [submit(page), page.getByRole('button', { name: 'Use My Location' }), page.getByLabel('Search service location').locator('xpath=..'), page.locator('#request-address')]) {
        expect(Math.round((await control.boundingBox()).height)).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  }

  test('48 - steps, guidance in place, search, review, success and the leave warning', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepare(page);
    const steps = page.getByRole('region', { name: 'Request steps' });

    // ── The step bar shows what is done and jumps to a step ──
    await page.getByRole('checkbox').first().check();
    await expect(steps.getByRole('button', { name: 'Service (done)' })).toBeVisible();
    await steps.getByRole('button', { name: 'Schedule', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Preferred schedule' })).toBeInViewport();

    // ── A missing pin is reported inside the Location step, in view ──
    await page.locator('#request-address').fill('Journey Street, Brgy. Pulo');
    await page.locator('#request-city').fill('Cabuyao');
    await page.locator('#request-province').fill('Laguna');
    await submit(page).click();
    const pinError = page.getByRole('alert').filter({ hasText: 'Please select location on the map (lat/lng).' });
    await expect(pinError).toBeInViewport();
    // In page order the error sits between the Location and Schedule headings (independent of scrolling).
    const errorPlace = await page.evaluate(() => {
      const byText = (text) => [...document.querySelectorAll('h2')].find((node) => node.textContent.trim() === text);
      const error = [...document.querySelectorAll('[role="alert"]')].find((node) => node.textContent.includes('Please select location on the map'));
      const after = (first, second) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { afterLocation: after(byText('Service location'), error), beforeSchedule: after(error, byText('Preferred schedule')) };
    });
    expect(errorPlace).toEqual({ afterLocation: true, beforeSchedule: true });

    // ── Search: nothing found, Escape closes the list, Enter picks the first place without submitting ──
    const search = page.getByLabel('Search service location');
    await search.fill('zzz nowhere');
    await expect(page.getByText('No places found in the service area.', { exact: false })).toBeVisible();
    await search.fill('SM City');
    await expect(page.getByRole('button', { name: /SM City Calamba/ })).toBeVisible();
    await search.press('Escape');
    await expect(page.getByRole('button', { name: /SM City Calamba/ })).toHaveCount(0);
    await search.fill('SM City Cal');
    await expect(page.getByRole('button', { name: /SM City Calamba/ })).toBeVisible();
    await search.press('Enter');
    await expect(page.getByText(/^Pin selected: 14\.2/)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Submit service request?' })).toHaveCount(0);
    await expect(steps.getByRole('button', { name: 'Location (done)' })).toBeVisible();

    // Use My Location reports next to the map.
    await page.getByRole('button', { name: 'Use My Location' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Current location selected/ })).toBeInViewport();

    // ── The review shows a readable date ──
    await page.locator('#request-address').fill('Journey Street, Brgy. Pulo');
    await pickFirstDate(page);
    const note = `E2E layout request ${Date.now()}`;
    await page.locator('#request-details').fill(note);
    await submit(page).click();
    const review = page.getByRole('dialog', { name: 'Submit service request?' });
    await expect(review).toContainText(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [A-Z][a-z]{2} \d{1,2}, 20\d\d/);

    // ── The success box closes with Escape ──
    await review.getByRole('button', { name: 'Confirm submit' }).click();
    const success = page.getByRole('dialog', { name: 'Request submitted' });
    await expect(success).toBeVisible({ timeout: 30000 });
    await page.keyboard.press('Escape');
    await expect(success).toHaveCount(0);

    // ── A second request: "View request" opens it ──
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: 'Use My Location' }).click();
    await expect(page.locator('#request-address')).toHaveValue('Test Road, Pulo');
    await pickFirstDate(page);
    await submit(page).click();
    await page.getByRole('dialog', { name: 'Submit service request?' }).getByRole('button', { name: 'Confirm submit' }).click();
    await page.getByRole('dialog', { name: 'Request submitted' }).getByRole('button', { name: 'View request' }).click();
    await expect(page).toHaveURL(/\/client\/requests\/\d+\?entity=request$/);

    // ── A half-filled form warns before the page is closed ──
    await page.goto('/client/service-requests');
    await page.getByRole('checkbox').first().check();
    const warned = new Promise((resolve) => {
      page.once('dialog', async (dialog) => {
        resolve(dialog.type());
        await dialog.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await warned).toBe('beforeunload');
  });
});
