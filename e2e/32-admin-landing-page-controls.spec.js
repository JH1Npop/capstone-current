// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /admin/landing-page. Admins have no public-site capability by default, so the
// admin run checks they are kept out (page, sidebar link and API). The superadmin run checks:
// a failed load pauses editing with Retry, validation opens the tab with the problem (blank
// required text, unsafe links, promotion prices), promotion status badges, uploads reporting
// beside the photo, delete asking first, list limits, leaving with unpublished changes asking
// first, preview opening in a new tab, and publishing reaching the public endpoint. The public
// content is put back through the API at the end.

const LANDING_FIELDS = ['landingPageContent', 'solarCalculatorSettings', 'landingPagePromotions', 'landingPageProjects'];
const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
// The smallest valid PNG: the server checks the file signature.
const PNG_BYTES = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.describe('Landing page controls as admin_test', () => {
  test('32.A - admin_test: has no access to the landing page editor', async ({ page, request }) => {
    const auth = loadAuthStateFromBackend('admin_test');
    const headers = { Authorization: `Token ${auth.token}` };
    await seedAuthState(page, auth);
    await page.goto('/admin/landing-page');
    await expect(page).not.toHaveURL(/\/admin\/landing-page/, { timeout: 30000 });
    await expect(page.getByRole('link', { name: 'Landing Page' })).toHaveCount(0);

    const response = await request.put('/api/admin/settings/', { headers, data: { landingPageContent: { headline: 'Not allowed' } } });
    expect(response.status()).toBe(403);
  });
});

test.describe('Landing page controls as superadmin_test', () => {
  test.describe.configure({ timeout: 240000 });

  test('32.S - superadmin_test: every Landing Page control works', async ({ page, request }) => {
    const auth = loadAuthStateFromBackend('superadmin_test');
    const headers = { Authorization: `Token ${auth.token}` };
    const getSettings = async () => (await request.get('/api/admin/settings/', { headers })).json();
    const getPublic = async () => (await request.get('/api/public/landing-page/')).json();
    const original = await getSettings();

    try {
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, auth);
      const saveState = page.getByTestId('landing-save-state');
      const publish = page.getByRole('button', { name: 'Publish changes' });
      const tabs = page.getByRole('navigation', { name: 'Landing page sections' });
      const alert = page.getByRole('alert').filter({ hasNotText: /^$/ });

      // ── A failed load pauses editing until Retry works ──
      await page.route('**/api/admin/settings/', (route) => (route.request().method() === 'GET'
        ? route.fulfill({ status: 500, json: { detail: 'Settings are unavailable.' } })
        : route.continue()));
      await page.goto('/admin/landing-page');
      await expect(saveState).toContainText('could not be loaded', { timeout: 30000 });
      await expect(page.getByLabel('Hero headline')).toBeDisabled();
      await expect(publish).toBeDisabled();
      await page.unroute('**/api/admin/settings/');
      await page.getByRole('button', { name: 'Retry' }).click();
      await expect(saveState).toHaveText(/Everything here is published\./, { timeout: 30000 });
      await page.waitForLoadState('networkidle');
      await expect(page.getByLabel('Hero headline')).toBeEnabled();

      // ── Preview opens in a new tab, so the draft is kept ──
      await expect(page.getByRole('link', { name: 'Preview' })).toHaveAttribute('target', '_blank');
      await expect(page.getByRole('link', { name: /view on the published page/i })).toHaveAttribute('target', '_blank');

      // ── Required text: the error opens the right tab ──
      const headline = page.getByLabel('Hero headline');
      const originalHeadline = await headline.inputValue();
      await headline.fill('');
      await expect(saveState).toContainText('Unsaved changes');
      await tabs.getByRole('button', { name: 'Contact & map' }).click();
      await publish.click();
      await expect(alert).toContainText('"Hero headline" cannot be blank.');
      await expect(page).toHaveURL(/tab=hero/);
      await headline.fill(originalHeadline);

      // ── Unsafe contact link is refused on the Contact tab ──
      await tabs.getByRole('button', { name: 'Contact & map' }).click();
      const facebook = page.getByLabel('Facebook page URL');
      const originalFacebook = await facebook.inputValue();
      await facebook.fill('javascript:alert(1)');
      await tabs.getByRole('button', { name: 'Hero' }).click();
      await publish.click();
      await expect(alert).toContainText('Facebook page URL must start with https://.');
      await expect(page).toHaveURL(/tab=contact/);
      await facebook.fill(originalFacebook);
      await expect(saveState).toHaveText(/Everything here is published\./);

      // ── Leaving through the sidebar with unpublished changes asks first ──
      await tabs.getByRole('button', { name: 'Hero' }).click();
      await headline.fill(`${originalHeadline} (draft)`);
      await page.getByRole('link', { name: 'Dashboard' }).locator('visible=true').first().click();
      const leaveDialog = page.getByRole('dialog', { name: 'Leave without publishing?' });
      await expect(leaveDialog).toBeVisible();
      await leaveDialog.getByRole('button', { name: 'Stay on this page' }).click();
      await expect(page).toHaveURL(/\/admin\/landing-page/);
      await expect(headline).toHaveValue(`${originalHeadline} (draft)`);
      await headline.fill(originalHeadline);
      await expect(saveState).toHaveText(/Everything here is published\./);

      // ── List limits and named Add buttons ──
      await tabs.getByRole('button', { name: 'Numbers & testimonials' }).click();
      const addNumber = page.getByRole('button', { name: 'Add key number' });
      const existingNumbers = (original.landingPageContent?.highlights || []).length;
      for (let index = existingNumbers; index < 8; index += 1) await addNumber.click();
      await expect(addNumber).toBeDisabled();
      for (let index = 8; index > existingNumbers; index -= 1) {
        await page.getByRole('button', { name: `Delete key number ${index}` }).click();
      }
      await expect(page.getByRole('button', { name: 'Add testimonial' })).toBeVisible();
      await tabs.getByRole('button', { name: 'FAQ' }).click();
      await expect(page.getByRole('button', { name: 'Add question' })).toBeVisible();

      // ── Promotions: validation, status badges, upload, publish ──
      await tabs.getByRole('button', { name: 'Promotions' }).click();
      await page.getByRole('button', { name: 'Add promotion' }).click();
      const promo = page.locator('article').filter({ has: page.getByRole('heading', { name: /^Promotion \d+/ }) }).last();
      await promo.getByLabel('Product or promotion name').fill('E2E Panel Promo');
      await promo.getByLabel('Regular price (PHP)').fill('1000');
      await promo.getByLabel('Promotional price (PHP)').fill('1500');
      await publish.click();
      await expect(alert).toContainText('the promotional price cannot be higher than the regular price.');
      await promo.getByLabel('Promotional price (PHP)').fill('800');
      await promo.getByLabel('Panel wattage (optional)').fill('550');

      const tomorrow = localKey(new Date(Date.now() + 86400000));
      await promo.getByLabel('Start date').fill(tomorrow);
      await expect(promo.getByText(`Scheduled from ${tomorrow}`)).toBeVisible();
      await promo.getByLabel('Start date').fill('');
      await expect(promo.getByText('Live now')).toBeVisible();
      await promo.getByLabel('Active').uncheck();
      await expect(promo.getByText('Hidden (inactive)')).toBeVisible();
      await promo.getByLabel('Active').check();

      const upload = promo.getByLabel(/^Upload photo for Promotion/);
      await upload.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
      await expect(promo.getByRole('alert')).toHaveText('"notes.txt" is not a JPG, PNG, or WebP image.');
      await upload.setInputFiles({ name: 'promo.png', mimeType: 'image/png', buffer: PNG_BYTES });
      await expect(promo.getByRole('status')).toHaveText('Photo uploaded. Publish changes to show it publicly.', { timeout: 30000 });
      await expect(promo.getByLabel('Promotion image URL')).not.toHaveValue('');

      await publish.click();
      await expect(page.getByRole('status').filter({ hasText: 'Landing page published successfully.' })).toBeVisible();
      await expect(saveState).toHaveText(/Everything here is published\./);
      await expect.poll(async () => (await getPublic()).landingPagePromotions.map((item) => item.name)).toContain('E2E Panel Promo');

      // ── Delete asks first, then publishes the removal ──
      await promo.getByRole('button', { name: /^Delete Promotion \d+: E2E Panel Promo$/ }).click();
      const deleteDialog = page.getByRole('dialog', { name: 'Delete "E2E Panel Promo"?' });
      await deleteDialog.getByRole('button', { name: 'Keep it' }).click();
      await expect(page.getByRole('heading', { name: /: E2E Panel Promo$/ })).toBeVisible();
      await promo.getByRole('button', { name: /^Delete Promotion \d+: E2E Panel Promo$/ }).click();
      await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(page.getByRole('heading', { name: /: E2E Panel Promo$/ })).toHaveCount(0);
      await expect(saveState).toContainText('Unsaved changes');
      await publish.click();
      await expect(saveState).toHaveText(/Everything here is published\./);
      await expect.poll(async () => (await getPublic()).landingPagePromotions.map((item) => item.name)).not.toContain('E2E Panel Promo');

      // ── Projects: a completion date cannot be in the future ──
      await tabs.getByRole('button', { name: 'Projects' }).click();
      await page.getByRole('button', { name: 'Add completed project' }).click();
      const project = page.locator('article').filter({ has: page.getByRole('heading', { name: /^Project \d+/ }) }).last();
      await expect(project.getByText('Draft', { exact: true })).toBeVisible();
      await expect(project.getByLabel('Completion date')).toHaveAttribute('max', localKey(new Date()));
      await project.getByLabel('Project title').fill('E2E Future Project');
      // Computed here, two days ahead, so a run that crosses midnight still uses a future date.
      await project.getByLabel('Completion date').fill(localKey(new Date(Date.now() + 2 * 86400000)));
      await publish.click();
      await expect(alert).toContainText('the completion date cannot be in the future.');
      await project.getByRole('button', { name: /^Delete Project \d+: E2E Future Project$/ }).click();
      await page.getByRole('dialog', { name: 'Delete "E2E Future Project"?' }).getByRole('button', { name: 'Delete', exact: true }).click();
      await expect(saveState).toHaveText(/Everything here is published\./);
    } finally {
      const restore = Object.fromEntries(LANDING_FIELDS.map((key) => [key, original[key]]));
      await request.put('/api/admin/settings/', { headers, data: restore });
    }
    const after = await getSettings();
    expect(after.landingPagePromotions).toEqual(original.landingPagePromotions);
  });
});
