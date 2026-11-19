// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Dead-end review 2026-11-18: the office's ways out of stuck field work
// (server rules: backend/services/tests/test_office_stuck_job_actions.py).
//  - a started job whose lead cannot continue: Pause job, then reassign;
//  - a technician blocked by the GPS arrival check: Confirm arrival;
//  - a cancellation on the company's side: "Office cancelled", not "client withdrew".

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

const makeJobs = (stamp) => {
  const output = runShell([
    'from django.utils import timezone',
    'from services.business_time import business_today',
    'from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType, TechnicianSkill',
    'from users.models import User',
    'client = User.objects.get(username="client_test")',
    `service = ServiceType.objects.create(name="E2E Stuck ${stamp}", estimated_duration=60)`,
    `lead = User.objects.create_user(username="e2e_lead_${stamp}", password="x", role="technician", status="active", is_available=True, first_name="Lead", last_name="${stamp}")`,
    `spare = User.objects.create_user(username="e2e_spare_${stamp}", password="x", role="technician", status="active", is_available=True, first_name="Spare", last_name="${stamp}")`,
    'TechnicianSkill.objects.create(technician=lead, service_type=service, skill_level="expert")',
    'TechnicianSkill.objects.create(technician=spare, service_type=service, skill_level="expert")',
    'today = business_today()',
    'ids = []',
    'for status in ("In Progress", "Navigating", "Not Started"):',
    '    req = ServiceRequest.objects.create(client=client, service_type=service, description=f"Stuck {status}", status="In Progress" if status != "Not Started" else "Approved", auto_ticket_created=True)',
    '    ServiceLocation.objects.create(request=req, address="5 Luna St, Calamba", city="Calamba", province="Laguna", latitude=14.2117, longitude=121.1653)',
    '    t = ServiceTicket.objects.create(request=req, technician=lead, scheduled_date=today, scheduled_time_slot="morning", status=status, start_time=timezone.now() if status == "In Progress" else None)',
    '    ids.append(t.id)',
    'print("IDS", *ids, spare.id)',
  ].join('\n'));
  const [inProgress, navigating, notStarted, spareId] = output.match(/IDS ([\d ]+)/)[1].trim().split(/\s+/).map(Number);
  return { inProgress, navigating, notStarted, spareId };
};

test.describe('Office ways out of stuck jobs', () => {
  test.describe.configure({ timeout: 300000 });

  test('69 - pause and reassign, confirm arrival, and an office-side cancellation', async ({ browser, request }) => {
    const adminAuth = loadAuthStateFromBackend('admin_test');
    const headers = { Authorization: `Token ${adminAuth.token}` };
    const jobs = makeJobs(Date.now());
    const ticketOf = async (id) => (await request.get(`/api/services/service-tickets/${id}/`, { headers })).json();

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, adminAuth);

      // 1. Started job: Pause job (reason required), then it can be reassigned.
      await page.goto(`/admin/service-tickets?ticketId=${jobs.inProgress}`);
      await page.getByRole('button', { name: /Pause job/ }).click({ timeout: 30000 });
      const pauseDialog = page.getByRole('dialog', { name: 'Pause this job?' });
      await expect(pauseDialog.getByRole('button', { name: 'Pause job' })).toBeDisabled();
      await pauseDialog.getByRole('textbox').fill('Lead technician is sick today.');
      await pauseDialog.getByRole('button', { name: 'Pause job' }).click();
      await expect(page.getByText(/paused\. Reassign it on the Dispatch Board/)).toBeVisible({ timeout: 15000 });
      expect((await ticketOf(jobs.inProgress)).status).toBe('On Hold');

      await page.goto(`/admin/service-tickets?ticketId=${jobs.inProgress}`);
      await page.getByRole('button', { name: /Reassign in Dispatch/ }).click({ timeout: 30000 });
      await expect(page).toHaveURL(/\/admin\/dispatch-board/);

      const reassigned = await request.post(`/api/services/service-tickets/${jobs.inProgress}/assign/`, {
        headers,
        data: { technician_id: jobs.spareId, dispatch_stage: 'service' },
      });
      expect(reassigned.ok(), await reassigned.text()).toBeTruthy();
      expect((await ticketOf(jobs.inProgress)).technician).toBe(jobs.spareId);

      // 2. Travelling technician blocked by the GPS check: Confirm arrival.
      await page.goto(`/admin/service-tickets?ticketId=${jobs.navigating}`);
      await page.getByRole('button', { name: /Confirm arrival/ }).click({ timeout: 30000 });
      const arrivalDialog = page.getByRole('dialog', { name: 'Confirm arrival?' });
      await arrivalDialog.getByRole('textbox').fill('Client confirmed by phone; map pin is 80 m off.');
      await arrivalDialog.getByRole('button', { name: 'Confirm arrival' }).click();
      await expect(page.getByText(/marked as arrived on site/)).toBeVisible({ timeout: 15000 });
      expect((await ticketOf(jobs.navigating)).status).toBe('Arrived on Site');

      // 3. Cancelling on the company's side is not recorded as the client's withdrawal.
      await page.goto(`/admin/service-tickets?ticketId=${jobs.notStarted}`);
      await page.getByRole('button', { name: /Dismiss ticket/ }).click({ timeout: 30000 });
      await page.getByLabel('Office cancelled (our side)').check();
      await expect(page.getByText('Why the office is cancelling')).toBeVisible();
      await page.getByPlaceholder('Example: Client confirmed by phone that they no longer want to proceed.').fill('Roof is unsafe to work on.');
      await page.getByRole('button', { name: 'Dismiss ticket', exact: true }).click();
      await expect(page.getByText(/dismissed because the office cancelled it/)).toBeVisible({ timeout: 15000 });
      const history = await (await request.get(`/api/services/service-tickets/${jobs.notStarted}/`, { headers })).json();
      expect(history.status).toBe('Cancelled');
    } finally {
      await context.close();
    }
  });
});
