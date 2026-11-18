// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// A client books their own maintenance visit from the finished job's page (server rules:
// backend/services/tests/test_maintenance_visits.py). The visit is a normal request for review,
// linked to the plan; the page then shows it as booked and offers no second booking.

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Client maintenance booking', () => {
  test.describe.configure({ timeout: 300000 });

  test('67 - the client books a maintenance visit from the finished job', async ({ browser, request }) => {
    const clientAuth = loadAuthStateFromBackend('client_test');
    const superAuth = loadAuthStateFromBackend('superadmin_test');
    const stamp = Date.now();
    // A finished job at a saved site with a maintenance plan due in 5 days.
    const output = runShell([
      'from datetime import timedelta',
      'from django.utils import timezone',
      'from services.business_time import business_today',
      'from services.models import MaintenanceSchedule, ServiceLocation, ServiceRequest, ServiceTicket, ServiceType',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      `service = ServiceType.objects.create(name="E2E Maint Booking ${stamp}", estimated_duration=60)`,
      'today = business_today()',
      'req = ServiceRequest.objects.create(client=client, service_type=service, description="Panel cleaning", status="Completed", auto_ticket_created=True)',
      'ServiceLocation.objects.create(request=req, address="12 Mabini St, Calamba", city="Calamba", province="Laguna", latitude=14.2117, longitude=121.1653)',
      'ticket = ServiceTicket.objects.create(request=req, scheduled_date=today - timedelta(days=85), status="Completed", completed_date=timezone.now() - timedelta(days=85))',
      'plan = MaintenanceSchedule.objects.create(service_ticket=ticket, client=client, service_type=service, maintenance_profile="commercial_area", interval_days=90, follow_up_window_days=7, last_service_date=today - timedelta(days=85), next_due_date=today + timedelta(days=5), notify_on_date=today - timedelta(days=2), status="due_soon")',
      'print(f"IDS {req.id} {plan.id}")',
    ].join('; '));
    const [requestId, planId] = output.match(/IDS (\d+) (\d+)/).slice(1).map(Number);
    const headers = { Authorization: `Token ${superAuth.token}` };
    const planFromOffice = async () => (await (await request.get(`/api/services/maintenance-schedules/${planId}/?status=all`, { headers })).json());

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, clientAuth);
      await page.goto(`/client/requests/${requestId}?entity=request`);
      await expect(page.getByText(/Next maintenance due/)).toBeVisible({ timeout: 30000 });

      await page.getByRole('button', { name: 'Book maintenance visit' }).click();
      const booking = page.getByRole('dialog', { name: 'Book maintenance visit' });
      await expect(booking).toContainText('12 Mabini St, Calamba');
      await booking.getByLabel('Time').selectOption('morning');
      await booking.getByLabel('Notes (optional)').fill('Gate code 1234.');
      await booking.getByRole('button', { name: 'Book visit' }).click();

      await expect(page.getByRole('status')).toContainText(/REQ-\d+ was sent for review/);
      await expect(page.getByText(/Visit booked \(REQ-\d+\)/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Book maintenance visit' })).toHaveCount(0);

      const plan = await planFromOffice();
      expect(plan.booked_visit?.status).toBe('Pending');
      expect(plan.booked_visit?.request_code).toMatch(/^REQ-\d+$/);

      // The page has no sideways scroll on a phone.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      await context.close();
    }
  });
});
