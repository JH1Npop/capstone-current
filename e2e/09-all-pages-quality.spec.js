// @ts-check
import { test, expect } from '@playwright/test';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

const PUBLIC_PAGES = [
  ['landing', '/'],
  ['about', '/about-us'],
  ['login', '/login'],
  ['register', '/register'],
  ['forgot password', '/forgot-password'],
  ['reset password', '/reset-password'],
  ['verify email', '/verify-email'],
  ['solar calculator', '/solar-calculator'],
];

const WORKSPACE_PAGES = [
  ...[
    ['dashboard', '/admin/dashboard'],
    ['calendar', '/admin/calendar'],
    ['service tickets', '/admin/service-tickets'],
    ['dispatch board', '/admin/dispatch-board'],
    ['technician tracking', '/admin/technician-tracking'],
    ['technicians directory', '/admin/technicians'],
    ['clients directory', '/admin/clients'],
    ['services', '/admin/services'],
    ['inventory', '/admin/inventory'],
    ['documents', '/admin/documents'],
    ['sales records', '/admin/sales-records'],
    ['analytics', '/admin/analytics'],
    ['reports', '/admin/reports'],
    ['operations report', '/admin/operations-report'],
    ['after-sales cases', '/admin/after-sales-cases'],
    ['user management', '/admin/user-management'],
    ['settings', '/admin/settings'],
    ['landing page editor', '/admin/landing-page'],
    ['landing page preview', '/admin/landing-page/preview'],
    ['activity logs', '/admin/activity-logs'],
    ['profile', '/admin/profile'],
    ['notifications', '/admin/notifications'],
    ['messages', '/admin/messages'],
    ['client support', '/admin/client-support'],
    ['coverage heatmap', '/admin/coverage-heatmap'],
    ['job history', '/admin/job-history'],
  ].map(([name, path]) => ({ area: 'admin', username: 'superadmin_test', name, path })),
  ...[
    ['dashboard', '/technician/dashboard'],
    ['my jobs', '/technician/my-jobs'],
    ['schedule', '/technician/schedule'],
    ['map navigation', '/technician/map-navigation'],
    ['checklist', '/technician/checklist'],
    ['inspection checklist', '/technician/inspection-checklist'],
    ['notifications', '/technician/notifications'],
    ['messages', '/technician/messages'],
    ['job history', '/technician/job-history'],
    ['profile', '/technician/profile'],
  ].map(([name, path]) => ({ area: 'technician', username: 'tech_test', name, path })),
  ...[
    ['dashboard', '/client/dashboard'],
    ['service requests', '/client/service-requests'],
    ['solar estimates', '/client/solar-estimates'],
    ['request tracking', '/client/requests'],
    ['request detail', '/client/requests/1'],
    ['service history', '/client/service-history'],
    ['purchase records', '/client/purchase-records'],
    ['support', '/client/support'],
    ['notifications', '/client/notifications'],
    ['profile', '/client/profile'],
  ].map(([name, path]) => ({ area: 'client', username: 'client_test', name, path })),
];

function observeRuntimeProblems(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const serverErrors = [];
  const pendingServerErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The E2E backend deliberately uses Django's non-ASGI server, so its
    // unavailable WebSocket transport is expected and HTTP polling is tested.
    if (/websocket|failed to load resource/i.test(text)) return;
    consoleErrors.push(text);
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      pendingServerErrors.push(
        response.text()
          .then((body) => serverErrors.push(`${response.status()} ${response.url()}\n${body.slice(0, 2000)}`))
          .catch(() => serverErrors.push(`${response.status()} ${response.url()}`)),
      );
    }
  });

  return { pageErrors, consoleErrors, serverErrors, pendingServerErrors };
}

async function inspectPageLayout(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const labelFor = (element) => (
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent?.replace(/\s+/g, ' ').trim()
      || '(unlabelled button)'
    );
    const hasHorizontalScroller = (element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const overflowX = window.getComputedStyle(current).overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll') && current.scrollWidth > current.clientWidth) return true;
        current = current.parentElement;
      }
      return false;
    };

    const buttons = [...document.querySelectorAll('main button')]
      .filter(visible)
      .map((button) => ({ element: button, label: labelFor(button), rect: button.getBoundingClientRect() }));
    const collisions = [];
    for (let left = 0; left < buttons.length; left += 1) {
      for (let right = left + 1; right < buttons.length; right += 1) {
        const a = buttons[left];
        const b = buttons[right];
        const overlapWidth = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const overlapHeight = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (overlapWidth > 1 && overlapHeight > 1 && !a.element.contains(b.element) && !b.element.contains(a.element)) {
          collisions.push(`${a.label} <> ${b.label}`);
        }
      }
    }

    const clippedButtons = buttons
      .filter(({ element, rect }) => !hasHorizontalScroller(element) && (rect.left < -1 || rect.right > window.innerWidth + 1))
      .map(({ label }) => label);
    const unlabelledButtons = buttons
      .filter(({ element }) => !element.getAttribute('aria-label') && !element.getAttribute('title') && !element.textContent?.trim())
      .map(({ label }) => label);

    return {
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      collisions: [...new Set(collisions)],
      clippedButtons: [...new Set(clippedButtons)],
      unlabelledButtons: [...new Set(unlabelledButtons)],
    };
  });
}

async function auditPage(page, path, expectedPath, viewport) {
  await page.setViewportSize(viewport);
  const runtime = observeRuntimeProblems(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  await page.waitForTimeout(1500);

  expect(new URL(page.url()).pathname).toBe(expectedPath);
  const layout = await inspectPageLayout(page);
  await Promise.all(runtime.pendingServerErrors);
  expect({
    ...layout,
    pageErrors: runtime.pageErrors,
    consoleErrors: runtime.consoleErrors,
    serverErrors: runtime.serverErrors,
  }).toEqual({
    horizontalOverflow: 0,
    collisions: [],
    clippedButtons: [],
    unlabelledButtons: [],
    pageErrors: [],
    consoleErrors: [],
    serverErrors: [],
  });
}

test.describe('Every routed page: desktop and mobile quality', () => {
  test.describe.configure({ timeout: 120000 });

  for (const [name, path] of PUBLIC_PAGES) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`public / ${name} / ${viewportName}`, async ({ page }) => {
        await auditPage(page, path, path, viewport);
      });
    }
  }

  for (const route of WORKSPACE_PAGES) {
    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      test(`${route.area} / ${route.name} / ${viewportName}`, async ({ page }) => {
        const authState = loadAuthStateFromBackend(route.username);
        await seedAuthState(page, authState);
        const expectedPath = route.path === '/admin/technicians' || route.path === '/admin/clients'
          ? '/admin/user-management'
          : route.path;
        await auditPage(page, route.path, expectedPath, viewport);
      });
    }
  }
});
