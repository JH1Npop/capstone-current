// @ts-check
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadAuthStateFromBackend, seedAuthState } from './helpers';

// Progress billing (server rules: backend/services/tests/test_progress_billing.py): the office sets a
// 30/60/10 payment schedule on the quotation and records a payment; the client sees the schedule on
// the request; an overdue stage shows on the office's Sales Records page.

const runShell = (script) => {
  const repoRoot = process.cwd();
  const python = process.platform === 'win32' ? path.join(repoRoot, 'venv', 'Scripts', 'python.exe') : 'python';
  return execFileSync(python, [path.join(repoRoot, 'backend', 'manage.py'), 'shell', '-c', script], {
    cwd: repoRoot, env: { ...process.env, DJANGO_SETTINGS_MODULE: 'afn_service_management.settings_e2e' }, encoding: 'utf8',
  });
};

test.describe('Progress billing', () => {
  test.describe.configure({ timeout: 300000 });

  test('71 - schedule, payment, the client view and the overdue list', async ({ browser, request }) => {
    const adminAuth = loadAuthStateFromBackend('admin_test');
    const clientAuth = loadAuthStateFromBackend('client_test');
    const stamp = Date.now();
    const output = runShell([
      'from datetime import timedelta',
      'from django.utils import timezone',
      'from services.business_time import business_today',
      'from services.models import QuotationRecord, ServiceRequest, ServiceTicket, ServiceType',
      'from users.models import User',
      'client = User.objects.get(username="client_test")',
      `service = ServiceType.objects.create(name="E2E Billing ${stamp}", estimated_duration=60)`,
      'req = ServiceRequest.objects.create(client=client, service_type=service, description="Rooftop solar", status="Approved", auto_ticket_created=True)',
      'ticket = ServiceTicket.objects.create(request=req, scheduled_date=business_today() + timedelta(days=3), status="Not Started")',
      `quote = QuotationRecord.objects.create(ticket=ticket, client=client, quotation_number="QUO-E2E-${stamp}", total_amount="PHP 100,000.00", status="Sent")`,
      'print(f"IDS {req.id} {ticket.id} {quote.id}")',
    ].join('\n'));
    const [requestId, ticketId, quoteId] = output.match(/IDS (\d+) (\d+) (\d+)/).slice(1).map(Number);
    const office = { Authorization: `Token ${adminAuth.token}` };

    const plan = await request.put(`/api/services/quotations/${quoteId}/billing-plan/`, {
      headers: office,
      data: { milestones: [
        { label: 'Downpayment', percent: '30', trigger: 'acceptance' },
        { label: 'On installation', percent: '60', trigger: 'work_start' },
        { label: 'At handover', percent: '10', trigger: 'handover' },
      ] },
    });
    expect(plan.ok(), await plan.text()).toBeTruthy();
    const accepted = await request.post(`/api/services/quotations/${quoteId}/respond/`, {
      headers: { Authorization: `Token ${clientAuth.token}` }, data: { decision: 'accept' },
    });
    expect(accepted.ok(), await accepted.text()).toBeTruthy();
    const paid = await request.post(`/api/services/quotations/${quoteId}/progress-payments/`, {
      headers: office, data: { amount: '10000', paid_on: new Date().toISOString().slice(0, 10), method: 'gcash' },
    });
    expect(paid.status(), await paid.text()).toBe(201);
    // The downpayment was due a week after acceptance; move acceptance back so it is overdue.
    runShell(`from datetime import timedelta\nfrom django.utils import timezone\nfrom services.models import QuotationRecord\nQuotationRecord.objects.filter(pk=${quoteId}).update(client_responded_at=timezone.now() - timedelta(days=20))`);

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      await seedAuthState(page, clientAuth);
      await page.goto(`/client/requests/${requestId}?entity=request`, { waitUntil: 'domcontentloaded' });
      const schedule = page.getByTestId('billing-plan');
      await expect(schedule).toContainText('Payment schedule', { timeout: 30000 });
      await expect(schedule).toContainText('Downpayment');
      await expect(schedule).toContainText('Overdue');
      await expect(schedule).toContainText('Balance');
      await expect(schedule.getByRole('button', { name: /schedule|Record payment/ })).toHaveCount(0);
    } finally {
      await context.close();
    }

    const officeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await officeContext.newPage();
      await seedAuthState(page, adminAuth);
      await page.goto('/admin/sales-records', { waitUntil: 'domcontentloaded' });
      const overdue = page.getByTestId('overdue-payments');
      await expect(overdue).toContainText(`TKT-${String(ticketId).padStart(4, '0')}`, { timeout: 30000 });
      await expect(overdue).toContainText('Downpayment');
    } finally {
      await officeContext.close();
    }
  });
});
