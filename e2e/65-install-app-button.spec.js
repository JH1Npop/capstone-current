// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The system shows an "Install" button on the landing page, the login page and the signed-in top
// bar, on phones as well as computers. With a browser install prompt it installs in one tap; without
// one (iPhone Safari, or a browser that has not offered the prompt) it opens the steps instead.
// Here the browser offers no prompt, so a tap shows the steps.

const PHONE = { width: 390, height: 844 };

test.describe('Install app button', () => {
  test('65 - landing page: button is there on a phone and shows the steps', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    try {
      const page = await context.newPage();
      await page.goto('/');
      const button = page.getByRole('button', { name: 'Install app', exact: true });
      await expect(button).toBeVisible({ timeout: 30000 });
      await button.click();
      const help = page.getByRole('dialog', { name: 'How to install the app' });
      await expect(help).toBeVisible();
      await expect(help).toContainText('Add to Home screen');
      await help.getByRole('button', { name: 'Close' }).click();
      await expect(help).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('65 - login page: button is there and shows the iPhone steps on an iPhone', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: PHONE,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    try {
      const page = await context.newPage();
      await page.goto('/login');
      const button = page.getByRole('button', { name: 'Install the app on this device' });
      await expect(button).toBeVisible({ timeout: 30000 });
      await button.click();
      await expect(page.getByRole('dialog', { name: 'How to install the app' })).toContainText('Add to Home Screen');
    } finally {
      await context.close();
    }
  });

  test('65 - signed in: button is in the top bar on a phone and on a computer', async ({ browser }) => {
    for (const viewport of [PHONE, { width: 1280, height: 800 }]) {
      const context = await browser.newContext({ viewport });
      try {
        const page = await context.newPage();
        await seedAuthState(page, loadAuthStateFromBackend('client_test'));
        await page.goto('/client/dashboard');
        await expect(page.getByRole('button', { name: 'Install', exact: true })).toBeVisible({ timeout: 30000 });
      } finally {
        await context.close();
      }
    }
  });

  test('65 - installed app: the button is hidden', async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => (query.includes('display-mode: standalone')
          ? { matches: true, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }
          : original(query));
      });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /welcome/i }).first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: 'Install the app on this device' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
