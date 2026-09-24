// @ts-check
import { test, expect } from '@playwright/test';

/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SUITE 1 — PUBLIC PAGES (No Authentication Required)
 *  Tests landing, about, login, register, forgot-password pages
 * ═══════════════════════════════════════════════════════════════════════
 */

test.describe('Public Pages', () => {

  test('1.1 — Landing page loads with hero and navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // The page should render without errors
    await expect(page).toHaveTitle(/AFN|Service/i);

    // Hero section or main content should be visible
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check for navigation links
    const loginLink = page.getByRole('link', { name: /sign in|login|log in/i });
    await expect(loginLink.first()).toBeVisible();

    await expect(page.getByRole('heading', { name: /estimate your solar system/i })).toBeVisible();
    await expect(page.getByText(/recommended panels/i)).toBeVisible();
    await expect(page.getByLabel(/monthly consumption/i)).toHaveValue('450');

    await page.getByRole('button', { name: /per appliance/i }).click();
    await expect(page.getByText(/appliance load schedule/i)).toBeVisible();
    await page.getByLabel('Appliance').selectOption({ label: 'Air conditioner' });
    await page.getByLabel('Day hours').fill('8');
    await expect(page.getByText(/calculated monthly use/i)).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/01-landing-page.png', fullPage: true });
  });

  test('1.1b - Landing actions and cross-page section links work', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const primaryAction = page.getByRole('link', { name: /get started/i });
    await expect(primaryAction).toBeVisible();
    await expect(primaryAction).toHaveCSS('background-color', 'rgb(37, 99, 235)');

    await page.getByRole('link', { name: /our services/i }).click();
    await expect(page).toHaveURL(/#services$/);
    await expect(page.getByRole('heading', { name: /solutions for energy, security, and comfort/i })).toBeInViewport();

    await page.getByRole('link', { name: 'About Us', exact: true }).click();
    await expect(page).toHaveURL(/\/about-us$/);
    await page.getByRole('link', { name: 'Services', exact: true }).click();
    await expect(page).toHaveURL(/\/#services$/);
    await expect(page.getByRole('heading', { name: /solutions for energy, security, and comfort/i })).toBeInViewport();
  });

  test('1.1c - Mobile landing navigation exposes every public destination', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /open navigation menu/i }).click();
    await expect(page.getByRole('link', { name: 'Solar Calculator', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /create an account/i })).toBeVisible();
    await page.getByRole('link', { name: 'Solar Calculator', exact: true }).click();
    await expect(page).toHaveURL(/#solar-calculator$/);
    await expect(page.getByRole('heading', { name: /estimate your solar system/i })).toBeInViewport();

    await page.screenshot({ path: 'test-results/screenshots/01-landing-page-mobile.png', fullPage: true });
  });

  test('1.2 — About Us page renders and has back navigation', async ({ page }) => {
    await page.goto('/about-us');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should have content about the company/service
    const content = page.locator('main, [class*="about"], [class*="container"]');
    await expect(content.first()).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/01-about-us.png', fullPage: true });
  });

  test('1.3 — Login page renders with form fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Username/email field
    const usernameInput = page.locator('input[autocomplete="username"], input[placeholder*="username" i], input[placeholder*="email" i]');
    await expect(usernameInput.first()).toBeVisible();

    // Password field
    const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]');
    await expect(passwordInput.first()).toBeVisible();

    // Submit button
    const submitButton = page.getByRole('button', { name: /sign in|login|log in/i });
    await expect(submitButton).toBeVisible();

    // Forgot password link
    const forgotLink = page.getByRole('link', { name: /forgot/i });
    await expect(forgotLink).toBeVisible();

    // Register link
    const registerLink = page.getByRole('link', { name: /create account|register|sign up/i });
    await expect(registerLink).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/01-login-page.png' });
  });

  test('1.4 — Register page renders and constrains the account address to CALABARZON', async ({ page }) => {
    let submittedRegistration = null;
    await page.route('**/api/users/register/', async (route) => {
      submittedRegistration = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { username: submittedRegistration.username, email: submittedRegistration.email },
          message: 'Account created. Please check your email to verify your account before signing in.',
        }),
      });
    });
    await page.route('**/api/v2/provinces/*/cities-municipalities', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { code: '0405624000', name: 'City of Lucena' },
          { code: '0405616000', name: 'Pagbilao' },
        ]),
      });
    });
    await page.route('**/api/v2/cities-municipalities/*/barangays', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          { code: '0405624001', name: 'Barangay 1' },
          { code: '0405624002', name: 'Barangay 2' },
        ]),
      });
    });
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should have form fields
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(3); // At minimum: username, email, password

    const province = page.getByLabel('Province');
    const city = page.getByLabel('City / Municipality');
    const barangay = page.getByLabel('Barangay');
    await expect(province.locator('option')).toHaveCount(6);
    await expect(city).toBeDisabled();
    await expect(barangay).toBeDisabled();

    await province.selectOption({ label: 'Quezon' });
    await expect(city).toBeEnabled();
    await city.selectOption({ label: 'City of Lucena' });
    await expect(barangay).toBeEnabled();
    await barangay.selectOption({ label: 'Barangay 1' });

    await province.selectOption({ label: 'Laguna' });
    await expect(city).toHaveValue('');
    await expect(barangay).toHaveValue('');
    await expect(barangay).toBeDisabled();

    await page.screenshot({ path: 'test-results/screenshots/01-register-page.png', fullPage: true });

    await province.selectOption({ label: 'Quezon' });
    await city.selectOption({ label: 'City of Lucena' });
    await barangay.selectOption({ label: 'Barangay 1' });
    await page.getByLabel('Username *').fill('calabarzon_client');
    await page.getByLabel('Email *').fill('calabarzon-client@example.com');
    await page.getByLabel('Password *', { exact: true }).fill('StrongPass123!');
    await page.getByLabel('Confirm password *').fill('StrongPass123!');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect.poll(() => submittedRegistration?.address).toBe('Barangay 1, City of Lucena, Quezon');
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /resend available in/i })).toBeDisabled();
  });

  test('1.4b — Register page explains password rules and keeps API errors with their fields', async ({ page }) => {
    await page.route('**/api/users/register/', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ email: ['This email address is already in use.'] }),
      });
    });
    await page.goto('/register');

    await expect(page.getByText(/use at least 8 characters/i)).toBeVisible();
    await page.getByLabel('Username *').fill('existing_client');
    await page.getByLabel('Email *').fill('existing@example.com');
    await page.getByLabel('Password *', { exact: true }).fill('StrongPass123!');
    await page.getByLabel('Confirm password *').fill('DifferentPass123!');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();

    await page.getByLabel('Confirm password *').fill('StrongPass123!');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText('This email address is already in use.')).toBeVisible();
    await expect(page.getByLabel('Email *')).toHaveAttribute('aria-invalid', 'true');
  });

  test('1.5 — Forgot Password page renders with email input', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Email input
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]');
    await expect(emailInput.first()).toBeVisible();

    await page.screenshot({ path: 'test-results/screenshots/01-forgot-password.png' });
  });

  test('1.6 — Invalid login shows error message', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill in invalid credentials
    const usernameInput = page.locator('input[autocomplete="username"], input[placeholder*="username" i]');
    await usernameInput.first().fill('invalid_user_xyz');

    const passwordInput = page.locator('input[type="password"], input[autocomplete="current-password"]');
    await passwordInput.first().fill('wrong_password_123');

    // Click submit
    const submitButton = page.getByRole('button', { name: /sign in|login|log in/i });
    // The submit handler disables the button immediately while authentication
    // is pending. Force the already-visible control so Playwright does not
    // retry actionability after that intentional state change.
    await submitButton.click({ force: true });

    // Wait for the visible login failure state instead of relying only on
    // implementation-specific class names. The backend can take longer than
    // 10s to reject credentials on the local dev stack.
    await expect(
      page.getByText(/invalid credentials|invalid username or password|login failed/i)
    ).toBeVisible({ timeout: 45000 });

    await page.screenshot({ path: 'test-results/screenshots/01-login-error.png' });
  });
});
