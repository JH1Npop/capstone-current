// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Flow explorer finding (2026-11-18): a reported inspection visit waits for the office review.
// The technician's map no longer offers "Start travel" on it (the server refuses it too) and says
// what happens next. Server rules: backend/services/tests/test_flow_explorer_findings.py.

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Technician and a reported inspection', () => {
  test.describe.configure({ timeout: 300000 });

  test('70 - a reported inspection offers no Start travel and says the office reviews it next', async ({ browser, request }) => {
    const techAuth = loadAuthStateFromBackend('tech_test');
    const stamp = Date.now();
    const output = runShell([
      'from services.business_time import business_today',
      'from services.models import ServiceLocation, ServiceRequest, ServiceStatusHistory, ServiceTicket, ServiceType',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      'tech = User.objects.get(username="tech_test")',
      `service = ServiceType.objects.create(name="E2E Reported Inspection ${stamp}", estimated_duration=60, requires_site_inspection=True)`,
      'req = ServiceRequest.objects.create(client=client, service_type=service, description="Roof check", status="In Progress", auto_ticket_created=True)',
      'ServiceLocation.objects.create(request=req, address="9 Bonifacio St, Calamba", city="Calamba", province="Laguna", latitude=14.2117, longitude=121.1653)',
      'ticket = ServiceTicket.objects.create(request=req, technician=tech, ticket_type="inspection", scheduled_date=business_today(), scheduled_time_slot="morning", status="Inspection Completed")',
      'ServiceStatusHistory.objects.create(ticket=ticket, status="For Inspection", notes="Dispatched for site inspection")',
      'ServiceStatusHistory.objects.create(ticket=ticket, status="Inspection Completed", notes="Technician submitted the site inspection report.")',
      'print(f"ID {ticket.id}")',
    ].join('\n'));
    const ticketId = Number(output.match(/ID (\d+)/)[1]);

    // The server refuses travel on it.
    const travel = await request.post(`/api/technician/jobs/${ticketId}/start-navigation/`, {
      headers: { Authorization: `Token ${techAuth.token}` },
    });
    expect(travel.status()).toBe(400);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, techAuth);
      // Map tiles come from the internet; the notice does not need them.
      await page.goto(`/technician/map-navigation?ticketId=${ticketId}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('Your inspection report is in. The office reviews it next')).toBeVisible({ timeout: 30000 });
      await expect(page.getByRole('button', { name: /Start (travel|navigation)/i })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('70.2 - the client reports a problem from the handover and lands on a filled-in support case', async ({ browser }) => {
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();
    const output = runShell([
      'from django.utils import timezone',
      'from services.models import ServiceRequest, ServiceTicket, ServiceType, TurnoverAcceptance',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      `service = ServiceType.objects.create(name="E2E Handover Problem ${stamp}", estimated_duration=60)`,
      'req = ServiceRequest.objects.create(client=client, service_type=service, description="Panels", status="Completed", auto_ticket_created=True)',
      'ticket = ServiceTicket.objects.create(request=req, scheduled_date=timezone.localdate(), status="Turned Over / Accepted", completed_date=timezone.now())',
      'TurnoverAcceptance.objects.create(ticket=ticket, status="finalized", finalized_at=timezone.now())',
      'print(f"IDS {req.id} {ticket.id}")',
    ].join('\n'));
    const [requestId, ticketId] = output.match(/IDS (\d+) (\d+)/).slice(1).map(Number);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, clientAuth);
      await page.goto(`/client/requests/${requestId}?entity=request`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: 'Report a problem' }).click({ timeout: 30000 });
      await expect(page).toHaveURL(new RegExp(`/client/support\\?ticket=${ticketId}`));
      await expect(page.locator('input[value="Problem with the finished work"]')).toBeVisible({ timeout: 30000 });
      await expect(page.locator('select').filter({ hasText: 'Service concern' }).first()).toHaveValue('complaint');
    } finally {
      await context.close();
    }
  });
});
