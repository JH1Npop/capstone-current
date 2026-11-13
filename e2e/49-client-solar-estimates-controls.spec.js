// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Every control on /client/solar-estimates, on a phone, with its own client: the empty state's
// "Start a calculation", the calculator opening and closing (aria-expanded), the mode buttons
// (aria-pressed), the appliance remove button (named, 44 px), saving once ("Saved ✓" until a value
// changes, so no duplicate estimates), the card (saved date, kWh, savings per month, plain status),
// "Request assessment", a converted estimate ("Assessment requested", View request, no Delete),
// deleting a draft (confirmation, notice), a failed delete, and the phone layout.

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);

test.describe('Client solar estimates controls', () => {
  test.describe.configure({ timeout: 240000 });

  test('49 - every Solar Estimates control works', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const name = `solar${Date.now()}`.toLowerCase();
    const created = await request.post('/api/admin/users/', {
      headers: { Authorization: `Token ${superAuth.token}` },
      data: {
        username: name, email: `${name}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Solar', last_name: 'Client', phone: '09171234570', role: 'client',
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const auth = loadAuthStateFromBackend(name);
    const headers = { Authorization: `Token ${auth.token}` };
    const myEstimates = async () => list(await (await request.get('/api/services/solar-estimates/', { headers })).json());

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
    });
    await seedAuthState(page, auth);
    await page.goto('/client/solar-estimates');

    // ── Empty: "Start a calculation" opens the calculator; the header button closes it ──
    await expect(page.getByRole('heading', { name: 'No saved estimates yet' })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Start a calculation' }).click();
    const toggle = page.getByRole('button', { name: /Close calculator|New calculation/ });
    await expect(toggle).toHaveAccessibleName('Close calculator');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('heading', { name: 'Estimate Your Solar System' })).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAccessibleName('New calculation');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { name: 'Estimate Your Solar System' })).toHaveCount(0);
    await toggle.click();

    // ── Mode buttons and the appliance remove button ──
    await page.getByRole('button', { name: 'Per appliance' }).click();
    await expect(page.getByRole('button', { name: 'Per appliance' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Monthly kWh' })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Add appliance' }).click();
    const remove = page.getByRole('button', { name: /^Remove / }).last();
    expect((await remove.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await remove.click();
    await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(1);
    await page.getByRole('button', { name: 'Monthly kWh' }).click();

    // ── Save once: the button says "Saved ✓" until a value changes ──
    await page.getByLabel('Monthly consumption').fill('600');
    const save = page.getByRole('button', { name: 'Save estimate' });
    expect((await save.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await save.click();
    const saved = page.getByRole('button', { name: 'Saved ✓' });
    await expect(saved).toBeDisabled();
    await expect(page.getByRole('status').filter({ hasText: /EST-\d+ saved to your account\./ })).toBeVisible();
    expect((await myEstimates()).length).toBe(1);
    await page.getByLabel('Monthly consumption').fill('650');
    await expect(page.getByRole('button', { name: 'Save estimate' })).toBeEnabled();
    await page.getByLabel('Monthly consumption').fill('600');
    await expect(page.getByRole('button', { name: 'Saved ✓' })).toBeDisabled();
    expect((await myEstimates()).length).toBe(1);

    // ── The card: saved date, kWh, savings per month, plain status ──
    const [estimate] = await myEstimates();
    const code = estimate.estimate_code;
    const card = page.getByRole('article', { name: code });
    await expect(card).toContainText(/Saved [A-Z][a-z]{2} \d{1,2}, 20\d\d/);
    await expect(card).toContainText('600 kWh');
    await expect(card).toContainText(/PHP [\d,]+–[\d,]+\/month/);
    await expect(card.getByText('Saved', { exact: true })).toBeVisible();

    // ── Request assessment opens New Request with the estimate linked ──
    await card.getByRole('button', { name: /Request assessment/ }).click();
    await expect(page).toHaveURL(new RegExp(`/client/service-requests\\?solarEstimate=${estimate.id}$`));
    await expect(page.getByText(`${code} is linked.`)).toBeVisible({ timeout: 30000 });

    // ── A converted estimate: "Assessment requested", View request, no Delete ──
    const services = list(await (await request.get('/api/services/service-types/', { headers })).json());
    const conversion = await request.post(`/api/services/solar-estimates/${estimate.id}/convert/`, {
      headers,
      data: {
        service_type: services.find((service) => service.is_active !== false).id, priority: 'Normal',
        location_address: 'Solar Street, Brgy. Pulo', location_city: 'Cabuyao', location_province: 'Laguna',
        latitude: '14.27', longitude: '121.12',
      },
    });
    expect(conversion.ok(), await conversion.text()).toBeTruthy();
    const requestId = (await conversion.json()).service_request.id;
    await page.goto('/client/solar-estimates');
    const converted = page.getByRole('article', { name: code });
    await expect(converted.getByText('Assessment requested')).toBeVisible({ timeout: 30000 });
    await expect(converted.getByRole('button', { name: `Delete ${code}` })).toHaveCount(0);
    await converted.getByRole('button', { name: /View request/ }).click();
    await expect(page).toHaveURL(new RegExp(`/client/requests/${requestId}\\?entity=request$`));

    // ── Deleting a draft: a failure is reported, then a real delete with a notice ──
    const draft = await (await request.post('/api/services/solar-estimates/', {
      headers,
      data: {
        calculation_mode: 'monthly', monthly_consumption: 300, appliances: [], peak_sun_hours: 4.5, system_loss_percent: 20,
        panel_wattage: 550, electricity_rate: 12, desired_offset_percent: 100, daytime_usage_percent: 40, export_credit_rate: 5.5,
        available_roof_area: null, selected_promotion: {},
      },
    })).json();
    await page.goto('/client/solar-estimates');
    const draftCard = page.getByRole('article', { name: draft.estimate_code });
    const deleteButton = draftCard.getByRole('button', { name: `Delete ${draft.estimate_code}` });
    await expect(deleteButton).toBeVisible({ timeout: 30000 });
    expect((await deleteButton.boundingBox()).height).toBeGreaterThanOrEqual(44);
    const draftUrl = `**/api/services/solar-estimates/${draft.id}/`;
    await page.route(draftUrl, (route) => (route.request().method() === 'DELETE'
      ? route.fulfill({ status: 500, json: { detail: 'Could not delete right now.' } })
      : route.continue()));
    await deleteButton.click();
    await page.getByRole('dialog', { name: `Delete draft ${draft.estimate_code}?` }).getByRole('button', { name: 'Delete draft' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(draftCard).toBeVisible();
    await page.unroute(draftUrl);
    await deleteButton.click();
    await page.getByRole('dialog', { name: `Delete draft ${draft.estimate_code}?` }).getByRole('button', { name: 'Delete draft' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Deleted ${draft.estimate_code}.` })).toBeVisible();
    await expect(draftCard).toHaveCount(0);
    expect((await myEstimates()).map((item) => item.id)).not.toContain(draft.id);

    // ── Phone layout ──
    expect((await page.getByRole('button', { name: /New calculation/ }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await context.close();
  });
});
