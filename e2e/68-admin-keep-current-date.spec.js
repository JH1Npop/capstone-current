// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// The office answers a client's reschedule request with "Keep Current Date" (server rules:
// backend/services/tests/test_reschedule_decline.py). The date stays, the request closes,
// and the client is told why.

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Office keeps the current date', () => {
  test.describe.configure({ timeout: 300000 });

  test('68 - the office declines a client reschedule request and keeps the date', async ({ browser, request }) => {
    const clientAuth = loadAuthStateFromBackend('client_test');
    const adminAuth = loadAuthStateFromBackend('admin_test');
    const stamp = Date.now();
    const output = runShell([
      'from datetime import timedelta',
      'from services.business_time import business_today',
      'from services.models import ServiceRequest, ServiceTicket, ServiceType',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      `service = ServiceType.objects.create(name="E2E Keep Date ${stamp}", estimated_duration=60)`,
      'kept = business_today() + timedelta(days=4)',
      'req = ServiceRequest.objects.create(client=client, service_type=service, description="Keep date", status="Approved", auto_ticket_created=True, preferred_date=kept, preferred_time_slot="morning")',
      'ticket = ServiceTicket.objects.create(request=req, scheduled_date=kept, scheduled_time_slot="morning", status="Not Started")',
      'print(f"IDS {ticket.id} {kept.isoformat()}")',
    ].join('; '));
    const [, ticketIdText, keptDate] = output.match(/IDS (\d+) (\S+)/);
    const ticketId = Number(ticketIdText);
    const clientHeaders = { Authorization: `Token ${clientAuth.token}` };
    const adminHeaders = { Authorization: `Token ${adminAuth.token}` };

    const asked = await request.post(`/api/services/service-tickets/${ticketId}/request_reschedule/`, {
      headers: clientHeaders,
      data: { reason: 'Out of town that week.', preferred_time_slot: 'afternoon' },
    });
    expect(asked.ok()).toBeTruthy();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, adminAuth);
      await page.goto(`/admin/service-tickets?ticketId=${ticketId}`);
      await page.getByRole('button', { name: /Reschedule Ticket/ }).click({ timeout: 30000 });

      const banner = page.getByTestId('client-reschedule-request');
      await expect(banner).toContainText('Out of town that week.');

      // A reason is required before keeping the date.
      await page.getByRole('button', { name: 'Keep Current Date' }).click();
      await expect(page.getByText('Add a reason so the client knows why the current date stays.')).toBeVisible();

      await page.getByPlaceholder('Explain why the schedule is changing for the audit record.').fill('Crew is fully booked that week.');
      await page.getByRole('button', { name: 'Keep Current Date' }).click();
      await expect(page.getByRole('heading', { name: 'Reschedule Ticket' })).toBeHidden({ timeout: 15000 });
      await expect(page.getByText(/keeps its current date/)).toBeVisible();

      const ticket = await (await request.get(`/api/services/service-tickets/${ticketId}/`, { headers: adminHeaders })).json();
      expect(ticket.reschedule_requested).toBe(false);
      expect(ticket.scheduled_date).toBe(keptDate);

      const notes = await (await request.get('/api/notifications/', { headers: clientHeaders })).json();
      const list = Array.isArray(notes) ? notes : notes.results || [];
      const told = list.find((note) => note.related_ticket === ticketId && String(note.title || '').includes('Schedule Unchanged'));
      expect(told?.message).toContain('Crew is fully booked that week.');
    } finally {
      await context.close();
    }
  });
});
