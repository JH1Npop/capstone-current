// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Offline field recording (frontend/src/utils/offlineQueue.js): with no signal, a technician's
// field action is saved on the phone and sent when the signal returns. If the server then refuses
// it (here: the office cancelled the job meanwhile), the technician is told instead of it being
// retried for ever. Pages load with domcontentloaded: map tiles and fonts come from the internet.

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Technician offline actions', () => {
  test.describe.configure({ timeout: 300000 });

  test('72 - an action taken offline is sent later, and a refused one is reported', async ({ browser, request }) => {
    const stamp = Date.now();
    const username = `e2e_offline_${stamp}`;
    const output = runShell([
      'from django.utils import timezone',
      'from services.business_time import business_today',
      'from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType, TechnicianSkill',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      `tech = User.objects.create_user(username="${username}", password="TestPass123!", role="technician", status="active", is_available=False, first_name="Offline", last_name="Tech")`,
      `service = ServiceType.objects.create(name="E2E Offline ${stamp}", estimated_duration=60)`,
      'TechnicianSkill.objects.create(technician=tech, service_type=service)',
      'ids = []',
      'for label, status in (("roof", "In Progress"), ("shed", "On Hold")):',
      '    req = ServiceRequest.objects.create(client=client, service_type=service, description=f"Offline {label}", status="In Progress", auto_ticket_created=True)',
      '    ServiceLocation.objects.create(request=req, address="7 Rizal St, Calamba", city="Calamba", province="Laguna", latitude=14.2117, longitude=121.1653)',
      '    ids.append(ServiceTicket.objects.create(request=req, technician=tech, scheduled_date=business_today(), status=status, start_time=timezone.now()).id)',
      'print("IDS", *ids)',
    ].join('\n'));
    const [workingId, heldId] = output.match(/IDS (\d+) (\d+)/).slice(1).map(Number);
    const techAuth = loadAuthStateFromBackend(username);
    const officeAuth = loadAuthStateFromBackend('admin_test');
    const ticketOf = async (id) => (await (await request.get(`/api/services/service-tickets/${id}/`, {
      headers: { Authorization: `Token ${officeAuth.token}` },
    })).json());

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, techAuth);
      const queue = page.getByTestId('offline-queue');

      // 1. Saved offline, sent when the signal returns.
      await page.goto(`/technician/my-jobs?ticketId=${workingId}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Put on Hold/ }).click({ timeout: 30000 });
      await page.getByPlaceholder('For example: waiting for a replacement breaker').fill('Waiting for a replacement breaker.');
      await context.setOffline(true);
      await page.getByRole('button', { name: 'Confirm Hold' }).click();
      await expect(page.getByText(/No signal: saved on this phone/)).toBeVisible({ timeout: 15000 });
      await expect(queue).toContainText('1 action saved on this phone');
      expect((await ticketOf(workingId)).status).toBe('In Progress');

      await context.setOffline(false);
      await expect(queue).toHaveCount(0, { timeout: 45000 });
      await expect.poll(async () => (await ticketOf(workingId)).status, { timeout: 30000 }).toBe('On Hold');

      // 2. Saved offline, but the office cancels the job before it is sent: the technician is told.
      await page.goto(`/technician/my-jobs?ticketId=${heldId}`, { waitUntil: 'domcontentloaded' });
      const resume = page.getByRole('button', { name: 'Resume Job' }).last();
      await expect(resume).toBeVisible({ timeout: 30000 });
      await context.setOffline(true);
      await resume.click();
      await expect(queue).toContainText('1 action saved on this phone', { timeout: 15000 });

      const cancelled = await request.post(`/api/services/service-tickets/${heldId}/update_status/`, {
        headers: { Authorization: `Token ${officeAuth.token}` },
        data: { status: 'Cancelled', reason: 'Office cancelled: client moved away.' },
      });
      expect(cancelled.ok(), await cancelled.text()).toBeTruthy();

      await context.setOffline(false);
      await expect(page.getByRole('alert').filter({ hasText: 'was not saved' })).toBeVisible({ timeout: 45000 });
      expect((await ticketOf(heldId)).status).toBe('Cancelled');

      // 3. Finish Job with a photo while offline: the photo is kept on the phone and arrives later.
      // (Made now: an earlier active job would turn the second job's button into "Hold or Finish Other Job".)
      const finishId = Number(runShell([
        'from django.utils import timezone',
        'from services.business_time import business_today',
        'from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType',
        'from users.models import User',
        `tech = User.objects.get(username="${username}")`,
        `service = ServiceType.objects.get(name="E2E Offline ${stamp}")`,
        'req = ServiceRequest.objects.create(client=User.objects.get(username="client_test"), service_type=service, description="Offline carport", status="In Progress", auto_ticket_created=True)',
        'ServiceLocation.objects.create(request=req, address="7 Rizal St, Calamba", city="Calamba", province="Laguna", latitude=14.2117, longitude=121.1653)',
        'print("ID", ServiceTicket.objects.create(request=req, technician=tech, scheduled_date=business_today(), status="In Progress", start_time=timezone.now()).id)',
      ].join('\n')).match(/ID (\d+)/)[1]);
      const checklist = await request.post('/api/checklist/', {
        headers: { Authorization: `Token ${techAuth.token}` },
        data: { jobId: finishId, completed: { 0: true }, checklist_items: [{ index: 0, label: 'Do the work', completed: true }], notes: 'Done.', maintenance_required: false },
      });
      expect(checklist.ok(), await checklist.text()).toBeTruthy();
      await page.goto('/technician/my-jobs', { waitUntil: 'domcontentloaded' });
      const code = `TKT-${String(finishId).padStart(4, '0')}`;
      const card = page.locator('div.rounded-xl').filter({ has: page.getByRole('button', { name: `Details for ${code}` }) }).first();
      await card.getByRole('button', { name: 'Finish Job' }).click({ timeout: 30000 });
      const finish = page.getByRole('dialog', { name: 'Finish Job' });
      await finish.locator('input[type="file"]').setInputFiles({ name: 'done.png', mimeType: 'image/png', buffer: PNG });
      await expect(finish.getByText('1 selected')).toBeVisible();
      await context.setOffline(true);
      await finish.getByRole('button', { name: 'Finish Job', exact: true }).click();
      await expect(page.getByText(/No signal: saved on this phone.*finish job/)).toBeVisible({ timeout: 15000 });
      expect((await ticketOf(finishId)).status).toBe('In Progress');

      await context.setOffline(false);
      await expect.poll(async () => (await ticketOf(finishId)).status, { timeout: 60000 }).toBe('Completed');
      const photos = runShell(`from services.models import ServiceTicket\nprint("PHOTOS", len(ServiceTicket.objects.get(pk=${finishId}).completion_proof_images or []))`);
      expect(Number(photos.match(/PHOTOS (\d+)/)[1])).toBe(1);
    } finally {
      await context.close();
    }
  });
});
