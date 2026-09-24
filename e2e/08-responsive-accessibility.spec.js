// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    contentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.contentWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
}

async function expectKeyboardFocus(page) {
  let focused = false;
  // Dashboard data hydration can replace the first focused node. Allow the
  // render to settle, then require focus to reach a visible interactive node.
  await page.waitForTimeout(750);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active || !active.matches('a, button, input, select, textarea, [tabindex]')) return false;
      const rect = active.getBoundingClientRect();
      const style = window.getComputedStyle(active);
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    });
    if (focused) break;
    await page.waitForTimeout(50);
  }
  expect(focused).toBeTruthy();
}

async function expectNoOverlappingMainButtons(page) {
  const result = await page.locator('main button:visible').evaluateAll((buttons) => {
    const entries = buttons.map((button) => ({
      label: button.getAttribute('aria-label') || button.textContent?.trim() || '(unlabelled button)',
      rect: button.getBoundingClientRect(),
    })).filter(({ rect }) => rect.width > 0 && rect.height > 0);

    const collisions = [];
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const a = entries[left];
        const b = entries[right];
        const overlapWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapWidth > 1 && overlapHeight > 1) {
          collisions.push(`${a.label} <> ${b.label}`);
        }
      }
    }
    const clipped = entries
      .filter(({ rect }) => rect.left < -1 || rect.right > window.innerWidth + 1)
      .map(({ label }) => label);
    return { collisions, clipped };
  });
  expect(result.collisions).toEqual([]);
  expect(result.clipped).toEqual([]);
}

async function expectAssistantDoesNotCoverMainButtons(page) {
  const assistant = page.getByRole('button', { name: 'Open analytics assistant' });
  await expect(assistant).toBeVisible({ timeout: 5000 });
  const assistantBox = await assistant.boundingBox();
  const covered = await page.locator('main button:visible').evaluateAll((buttons, box) => (
    buttons.filter((button) => {
      const rect = button.getBoundingClientRect();
      return Math.min(rect.right, box.x + box.width) - Math.max(rect.left, box.x) > 1
        && Math.min(rect.bottom, box.y + box.height) - Math.max(rect.top, box.y) > 1;
    }).map((button) => button.getAttribute('aria-label') || button.textContent?.trim() || '(unlabelled button)')
  ), assistantBox);
  expect(covered).toEqual([]);
}

test.describe('Responsive and keyboard smoke coverage', () => {
  test.describe.configure({ timeout: 120000 });

  test.use({ viewport: MOBILE_VIEWPORT });

  test('public login is usable without horizontal overflow', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await expect(page.locator('input[autocomplete="username"]')).toBeVisible();
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectKeyboardFocus(page);
  });

  for (const workspace of [
    { role: 'admin', username: 'superadmin_test', path: '/admin/dashboard' },
    { role: 'technician', username: 'tech_test', path: '/technician/dashboard' },
    { role: 'client', username: 'client_test', path: '/client/dashboard' },
  ]) {
    test(`${workspace.role} dashboard fits a mobile viewport`, async ({ page }) => {
      const authState = loadAuthStateFromBackend(workspace.username);
      await seedAuthState(page, authState);
      await page.goto(workspace.path);
      await expect(page.locator('main')).toBeVisible({ timeout: 30000 });
      await expectNoHorizontalOverflow(page);
      await expectKeyboardFocus(page);
    });
  }

  test('documents actions do not overlap at a mobile viewport', async ({ page }) => {
    const authState = loadAuthStateFromBackend('superadmin_test');
    await seedAuthState(page, authState);
    await page.goto('/admin/documents');
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: 'Quotation Proposal' }).click();
    await expectNoHorizontalOverflow(page);
    await expectNoOverlappingMainButtons(page);
    await expectAssistantDoesNotCoverMainButtons(page);
    await page.screenshot({ path: 'test-results/screenshots/08-documents-mobile.png', fullPage: true });
  });
});
