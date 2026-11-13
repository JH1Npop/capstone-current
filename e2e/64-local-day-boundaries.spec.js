// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Dates are the business's (UTC+8), not the server's UTC dates (the rules themselves, with the clock
// moved, are in backend/services/tests/test_time_cases.py). On screen: a technician filters Job History
// to today and sees the job finished at 07:00 local time today (23:00 UTC "yesterday"), and not the job
// finished at 23:00 local time last night. Before the fix the filter used UTC dates, so both jobs fell
// on yesterday's date and neither was shown.

const localKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Local day boundaries', () => {
  test.describe.configure({ timeout: 180000 });

  test('64 - Job History "today" means the local day', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const stamp = Date.now();
    const username = `daytech${stamp}`.toLowerCase();
    const created = await request.post('/api/admin/technicians/', {
      headers: { Authorization: `Token ${superAuth.token}` },
      data: {
        username, email: `${username}@afntest.com`, password: 'TestPass123!', password_confirm: 'TestPass123!',
        first_name: 'Day', last_name: `Tech${stamp}`, phone: '09171234591', role: 'technician', status: 'active', is_available: true,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const today = localKey(new Date());
    const early = `E2E Early Job ${stamp}`;
    const late = `E2E Late Job ${stamp}`;
    runShell([
      'from datetime import date, datetime, time, timedelta',
      'from services.business_time import business_timezone',
      'from services.models import ServiceRequest, ServiceTicket, ServiceType',
      'from users.models import User',
      `tech = User.objects.get(username='${username}')`,
      "client = User.objects.get(username='client_test')",
      `today = date.fromisoformat('${today}')`,
      'tz = business_timezone()',
      `for name, moment in (('${early}', datetime.combine(today, time(7, 0), tzinfo=tz)), ('${late}', datetime.combine(today - timedelta(days=1), time(23, 0), tzinfo=tz))):`,
      '    service = ServiceType.objects.create(name=name, estimated_duration=60)',
      "    req = ServiceRequest.objects.create(client=client, service_type=service, description=name, status='Completed')",
      "    ServiceTicket.objects.create(request=req, technician=tech, status='Completed', scheduled_date=moment.date(), completed_date=moment, start_time=moment - timedelta(hours=1), end_time=moment)",
    ].join('\n'));

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, loadAuthStateFromBackend(username));
      await page.goto('/technician/job-history');
      await expect(page.getByText(early).first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByText(late).first()).toBeVisible();

      await page.getByLabel('From completed date').fill(today);
      await page.getByLabel('To completed date').fill(today);
      await expect(page.getByText(late)).toHaveCount(0, { timeout: 15000 });
      await expect(page.getByText(early).first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }
  });
});
