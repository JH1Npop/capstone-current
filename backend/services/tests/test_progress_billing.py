"""Progress billing: a quotation's payment schedule, payments toward it, and overdue stages."""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.core.management import call_command
from django.utils import timezone
from io import StringIO

from notifications.models import Notification
from services.billing import billing_plan
from services.business_time import business_today
from services.deposits import quotation_deposit_summary
from services.models import QuotationRecord, SalesPayment

from .test_job_type_cancel_matrix import JobWalker

PLAN = [
    {'label': 'Downpayment', 'percent': '30', 'trigger': 'acceptance'},
    {'label': 'On installation', 'percent': '60', 'trigger': 'work_start'},
    {'label': 'At handover', 'percent': '10', 'trigger': 'handover'},
]


class ProgressBillingTests(JobWalker):
    def job_with_quote(self, type_name='direct', accept=False):
        job = self.new_job(type_name)
        for stage in ('pending', 'approved', 'quote_sent'):
            self.step(job, stage)
        if accept:
            self.step(job, 'quote_accepted')
        job['quote'].refresh_from_db()
        return job

    def set_plan(self, job, rows=PLAN, who=None):
        return self.as_(who or self.office).put(
            f"/api/services/quotations/{job['quote'].id}/billing-plan/", {'milestones': rows}, format='json',
        )

    def pay(self, job, amount, who=None):
        return self.as_(who or self.office).post(f"/api/services/quotations/{job['quote'].id}/progress-payments/", {
            'amount': str(amount), 'paid_on': business_today().isoformat(), 'method': 'gcash',
        }, format='json')

    def test_the_office_sets_a_schedule_and_amounts_add_up_to_the_total(self):
        job = self.job_with_quote()
        response = self.set_plan(job)
        self.assertEqual(response.status_code, 200, response.data)
        amounts = [Decimal(row['amount']) for row in response.data['milestones']]
        self.assertEqual(amounts, [Decimal('3000.00'), Decimal('6000.00'), Decimal('1000.00')])
        self.assertEqual(sum(amounts), Decimal(response.data['total']))
        self.assertEqual([row['status'] for row in response.data['milestones']], ['upcoming'] * 3)

    def test_bad_schedules_are_refused(self):
        job = self.job_with_quote()
        for rows, message in [
            ([], 'at least one'),
            ([{**PLAN[0], 'percent': '50'}], 'add up to 100'),
            ([{'label': '', 'percent': '100', 'trigger': 'acceptance'}], 'needs a name'),
            ([{'label': 'X', 'percent': '100', 'trigger': 'someday'}], 'when it is due'),
            ([{'label': 'X', 'percent': '100', 'trigger': 'date'}], 'due date'),
        ]:
            response = self.set_plan(job, rows)
            self.assertEqual(response.status_code, 400, rows)
            self.assertIn(message, str(response.data))

    def test_clients_read_their_schedule_but_cannot_change_it(self):
        job = self.job_with_quote()
        self.set_plan(job)
        read = self.as_(job['client']).get(f"/api/services/quotations/{job['quote'].id}/billing-plan/")
        self.assertEqual(read.status_code, 200)
        self.assertEqual(len(read.data['milestones']), 3)
        self.assertIn(self.set_plan(job, who=job['client']).status_code, (403, 404))
        self.assertIn(self.pay(job, 100, who=job['client']).status_code, (403, 404))

    def test_payments_fill_the_stages_in_order_and_due_dates_follow_the_job(self):
        job = self.job_with_quote(accept=False)
        self.set_plan(job)
        self.step(job, 'quote_accepted')
        plan = billing_plan(QuotationRecord.objects.get(pk=job['quote'].id))
        self.assertEqual(plan['milestones'][0]['status'], 'due')  # accepted: downpayment due
        self.assertEqual(plan['milestones'][1]['status'], 'upcoming')  # work not started

        self.assertEqual(self.pay(job, 3500).status_code, 201)
        plan = billing_plan(QuotationRecord.objects.get(pk=job['quote'].id))
        self.assertEqual([row['status'] for row in plan['milestones']][:1], ['paid'])
        self.assertEqual(plan['milestones'][1]['paid'], '500.00')
        self.assertEqual(plan['balance'], '6500.00')

        # More than the balance is refused; a progress payment is not the deposit.
        self.assertEqual(self.pay(job, 7000).status_code, 409)
        self.assertEqual(SalesPayment.objects.get(quotation=job['quote'], amount=Decimal('3500')).kind, 'progress')

    def test_an_accepted_schedule_is_locked_but_a_paper_one_can_be_recorded_once(self):
        job = self.job_with_quote()
        self.set_plan(job)
        self.step(job, 'quote_accepted')
        self.assertEqual(self.set_plan(job).status_code, 409)

        other = self.job_with_quote(accept=True)
        self.assertEqual(self.set_plan(other).status_code, 200)  # agreed on paper, recorded after acceptance
        self.assertEqual(self.set_plan(other).status_code, 409)

    def test_the_deposit_rule_is_unchanged_and_comes_first(self):
        job = self.job_with_quote('direct with deposit')
        self.set_plan(job)
        self.step(job, 'quote_accepted')
        response = self.pay(job, 1000)
        self.assertEqual(response.status_code, 409)
        self.assertIn('deposit first', response.data['detail'])
        for stage in ('deposit_partial', 'deposit_paid'):
            self.step(job, stage)
        quotation = QuotationRecord.objects.get(pk=job['quote'].id)
        self.assertEqual(quotation_deposit_summary(quotation)['deposit_status'], 'paid')
        self.assertEqual(self.pay(job, 1000).status_code, 201)
        quotation = QuotationRecord.objects.get(pk=job['quote'].id)
        # The progress payment does not change the deposit figures; both count toward the schedule.
        self.assertEqual(quotation_deposit_summary(quotation)['deposit_paid_amount'], Decimal('2000.00'))
        self.assertEqual(billing_plan(quotation)['paid'], '3000.00')

    def test_overdue_stages_are_listed_for_the_office_and_reminded_once(self):
        job = self.job_with_quote()
        self.set_plan(job)
        self.step(job, 'quote_accepted')
        QuotationRecord.objects.filter(pk=job['quote'].id).update(client_responded_at=timezone.now() - timedelta(days=20))

        overdue = self.as_(self.office).get('/api/services/quotations/billing-overdue/')
        self.assertEqual(overdue.status_code, 200)
        self.assertEqual([row['quotation_id'] for row in overdue.data], [job['quote'].id])
        self.assertEqual(overdue.data[0]['overdue_amount'], '3000.00')
        self.assertIn(self.as_(job['client']).get('/api/services/quotations/billing-overdue/').status_code, (403, 404))

        call_command('send_after_sales_alerts', stdout=StringIO())
        call_command('send_after_sales_alerts', stdout=StringIO())
        self.assertEqual(Notification.objects.filter(user=job['client'], title='Payment due').count(), 1)

    def test_a_cancelled_job_keeps_its_schedule_closed(self):
        job = self.job_with_quote()
        self.set_plan(job)
        self.step(job, 'quote_accepted')
        self.as_(self.office).post(f"/api/services/service-requests/{job['request'].id}/cancel/", {'reason': 'Client phoned.'}, format='json')
        self.assertEqual(self.pay(job, 100).status_code, 409)
        self.assertEqual(self.set_plan(job).status_code, 409)
        plan = billing_plan(QuotationRecord.objects.get(pk=job['quote'].id))
        self.assertEqual({row['status'] for row in plan['milestones']}, {'cancelled'})
