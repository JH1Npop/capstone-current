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

  test('1.4 — Register page renders with form fields and role selection', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should have form fields
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(3); // At minimum: username, email, password

    await page.screenshot({ path: 'test-results/screenshots/01-register-page.png', fullPage: true });
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
