// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// A maintenance case and its schedule (server rules: MaintenanceCaseScheduleLinkTests in
// backend/services/tests/test_after_sales_rules.py). On the After-Sales page the office marks the
// maintenance case done: the schedule starts its next cycle (due one interval after today).
// Reopening the case keeps that cycle; it does not jump another cycle ahead.

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Maintenance case and schedule', () => {
  test.describe.configure({ timeout: 300000 });

  test('61 - marking a maintenance case done starts the next cycle; reopening keeps that cycle', async ({ browser, request }) => {
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const headers = { Authorization: `Token ${superAuth.token}` };
    const stamp = Date.now();
    const summary = `E2E maintenance due ${stamp}`;
    // A finished job with a due maintenance schedule and its open maintenance case.
    const output = runShell([
      'from datetime import timedelta',
      'from django.utils import timezone',
      'from services.business_time import business_today',
      'from services.models import AfterSalesCase, MaintenanceSchedule, ServiceRequest, ServiceTicket, ServiceType',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      `service = ServiceType.objects.create(name="E2E Maint ${stamp}", estimated_duration=60)`,
      'req = ServiceRequest.objects.create(client=client, service_type=service, description="m", status="Completed")',
      'today = business_today()',
      'ticket = ServiceTicket.objects.create(request=req, scheduled_date=today - timedelta(days=90), status="Completed", completed_date=timezone.now() - timedelta(days=90))',
      'schedule = MaintenanceSchedule.objects.create(service_ticket=ticket, client=client, service_type=service, maintenance_profile="commercial_area", interval_days=90, follow_up_window_days=14, last_service_date=today - timedelta(days=90), next_due_date=today + timedelta(days=2), notify_on_date=today - timedelta(days=12), status="due_soon")',
      `case = AfterSalesCase.objects.create(service_ticket=ticket, client=client, case_type="maintenance", status="open", priority="normal", summary="${summary}", due_date=today + timedelta(days=2), creation_source="maintenance_alert")`,
      'print(f"IDS {schedule.id} {case.id}")',
    ].join('; '));
    const [scheduleId, caseId] = output.match(/IDS (\d+) (\d+)/).slice(1).map(Number);
    const scheduleStatus = async () => (await (await request.get(`/api/services/maintenance-schedules/${scheduleId}/?status=all`, { headers })).json()).status;
    const scheduleDue = async () => (await (await request.get(`/api/services/maintenance-schedules/${scheduleId}/?status=all`, { headers })).json()).next_due_date;
    const firstDue = await scheduleDue();
    const caseStatus = async () => (await (await request.get(`/api/services/follow-up-cases/${caseId}/`, { headers })).json()).status;
    const caseCode = `ASC-${String(caseId).padStart(4, '0')}`;

    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    try {
      const page = await context.newPage();
      await page.addInitScript(() => {
        window.localStorage.setItem('afn:analytics-assistant-position', JSON.stringify({ x: 12, y: 12 }));
      });
      await seedAuthState(page, superAuth);
      await page.goto('/admin/after-sales-cases');
      await page.getByRole('searchbox', { name: /Find a follow-up case/i }).fill(summary);
      const row = page.locator('tbody tr').filter({ hasText: summary });
      await expect(row).toBeVisible({ timeout: 30000 });

      // ── Mark as Done: the maintenance is recorded as completed ──
      await row.getByRole('button', { name: `Mark as Done: ${caseCode}` }).click();
      const decision = page.getByRole('dialog', { name: 'Resolve case' });
      await decision.getByLabel('Resolution notes').fill('Panels cleaned and inverter checked on site.');
      await decision.getByRole('button', { name: 'Resolve Case' }).click();
      await expect(page.getByRole('status')).toContainText(`${caseCode} is marked as done.`);
      // The next cycle starts: due 90 days after today.
      await expect.poll(scheduleStatus).toBe('scheduled');
      const nextDue = await scheduleDue();
      expect(nextDue).not.toBe(firstDue);

      // ── Reopen: the case reopens; the new cycle is kept (no second jump) ──
      await row.getByRole('button', { name: `Reopen ${caseCode}` }).click();
      const reopen = page.getByRole('dialog', { name: /Reopen case/i });
      await reopen.getByLabel('Reason for reopening').fill('Client reports dust on one string again.');
      await reopen.getByRole('button', { name: 'Reopen Case' }).click();
      await expect.poll(caseStatus).toBe('open');
      expect(await scheduleDue()).toBe(nextDue);
    } finally {
      await context.close();
    }
  });
});
