import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5174';
const SCREENSHOT_DIR = path.resolve('test-results/manual_qa');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function logStep(msg) {
  console.log(`[MANUAL QA] ${msg}`);
}

async function runManualCheck() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ==========================================
    // 1. ADMIN / SUPERADMIN MANUAL WALKTHROUGH
    // ==========================================
    await logStep('1. Navigating to Login Page...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_page.png') });

    await logStep('2. Logging in as Superadmin (superadmin_test)...');
    await page.fill('input[autocomplete="username"], input[placeholder*="username" i]', 'superadmin_test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")');

    await page.waitForURL(/\/admin\/dashboard/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await logStep('3. Admin Dashboard loaded successfully! Checking KPI cards...');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_admin_dashboard.png') });

    await logStep('4. Navigating to Service Tickets (/admin/service-tickets)...');
    await page.goto(`${BASE_URL}/admin/service-tickets`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_admin_service_tickets.png') });

    await logStep('5. Navigating to Dispatch Board (/admin/dispatch-board)...');
    await page.goto(`${BASE_URL}/admin/dispatch-board`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_admin_dispatch_board.png') });

    await logStep('6. Navigating to Inventory (/admin/inventory)...');
    await page.goto(`${BASE_URL}/admin/inventory`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_admin_inventory.png') });

    // Logout
    await logStep('7. Logging out Admin account...');
    await page.evaluate(() => {
      localStorage.removeItem('afn_token');
      localStorage.removeItem('afn_user');
    });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // ==========================================
    // 2. TECHNICIAN MANUAL WALKTHROUGH
    // ==========================================
    await logStep('8. Logging in as Technician (tech_test)...');
    await page.fill('input[autocomplete="username"], input[placeholder*="username" i]', 'tech_test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")');

    await page.waitForURL(/\/technician\//, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await logStep('9. Technician Dashboard loaded successfully!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_technician_dashboard.png') });

    await logStep('10. Checking Technician My Jobs (/technician/my-jobs)...');
    await page.goto(`${BASE_URL}/technician/my-jobs`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_technician_my_jobs.png') });

    await logStep('11. Checking Technician Checklist (/technician/checklist)...');
    await page.goto(`${BASE_URL}/technician/checklist`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_technician_checklist.png') });

    // Logout
    await logStep('12. Logging out Technician account...');
    await page.evaluate(() => {
      localStorage.removeItem('afn_token');
      localStorage.removeItem('afn_user');
    });
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');

    // ==========================================
    // 3. CLIENT MANUAL WALKTHROUGH
    // ==========================================
    await logStep('13. Logging in as Client (client_test)...');
    await page.fill('input[autocomplete="username"], input[placeholder*="username" i]', 'client_test');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")');

    await page.waitForURL(/\/client\/dashboard/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await logStep('14. Client Dashboard loaded successfully!');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_client_dashboard.png') });

    await logStep('15. Checking New Service Request Form (/client/service-requests)...');
    await page.goto(`${BASE_URL}/client/service-requests`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_client_service_requests.png') });

    await logStep('16. Checking Client Request Tracking (/client/requests)...');
    await page.goto(`${BASE_URL}/client/requests`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_client_request_tracking.png') });

    await logStep('=== ALL MANUAL QA WALKTHROUGH STEPS COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('[MANUAL QA ERROR]', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runManualCheck();
