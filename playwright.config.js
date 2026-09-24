// @ts-check
import { defineConfig } from '@playwright/test';

const backendPython = process.platform === 'win32'
  ? 'venv\\Scripts\\python.exe'
  : 'python';
const backendPort = Number(process.env.E2E_BACKEND_PORT || 8011);
const frontendPort = Number(process.env.E2E_FRONTEND_PORT || 5181);
const backendUrl = `http://127.0.0.1:${backendPort}`;
const frontendUrl = `http://127.0.0.1:${frontendPort}`;
const managedServersInGlobalSetup = process.platform === 'win32';

/**
 * AFN Service Management — Playwright E2E Configuration
 *
 * Features:
 *   - Video recording of every test (visible proof)
 *   - Screenshots on failure
 *   - Trace recording for debugging
 *   - Generous timeouts for real server interactions
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/debug_*.spec.js'],
  globalSetup: './e2e/global-setup.js',
  fullyParallel: false,           // Sequential so login state doesn't collide
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,                     // Single worker to avoid auth race conditions
  reporter: [
    ['html', { open: 'never' }],
    ['list']
  ],
  timeout: 60_000,                // 60s per test — generous for real API calls
  expect: {
    timeout: 15_000,              // 15s for assertions
  },

  use: {
    baseURL: frontendUrl,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,

    // ── Visual proof settings ──────────────────────────────────────────
    video: 'on',                  // Record EVERY test
    screenshot: 'on',             // Capture screenshots on every test
    trace: 'on-first-retry',

    // ── Browser settings ───────────────────────────────────────────────
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    locale: 'en-US',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: ['--disable-blink-features=AutomationControlled'],
        },
      },
    },
  ],

  // Playwright's Windows webServer shutdown shells out to taskkill and can
  // wait forever when that process-tree operation is unavailable. The global
  // setup owns direct child processes on Windows; POSIX/CI retains Playwright's
  // native webServer management.
  webServer: managedServersInGlobalSetup ? undefined : [
    {
      command: `${backendPython} backend/manage.py runserver 127.0.0.1:${backendPort} --noreload --noasgi`,
      url: `${backendUrl}/api/health/database/`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        DATABASE_URL: '',
        DATABASE_ENGINE: 'sqlite3',
        DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e',
        DEBUG: 'True',
      },
    },
    {
      command: 'npm --prefix frontend run dev:e2e',
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_HOST: backendUrl,
        VITE_DEV_SERVER_PORT: String(frontendPort),
      },
    },
  ],

  outputDir: './test-results',
});
