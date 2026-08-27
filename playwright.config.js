// @ts-check
import { defineConfig } from '@playwright/test';

const backendPython = process.platform === 'win32'
  ? 'venv\\Scripts\\python.exe'
  : 'python';

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
    baseURL: 'http://localhost:5174',
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

  webServer: [
    {
      command: `${backendPython} backend/manage.py runserver 127.0.0.1:8000 --noreload --noasgi`,
      url: 'http://127.0.0.1:8000/api/health/database/',
      reuseExistingServer: !process.env.CI,
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
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_BACKEND_HOST: 'http://127.0.0.1:8000',
        VITE_DEV_SERVER_PORT: '5174',
      },
    },
  ],

  outputDir: './test-results',
});
