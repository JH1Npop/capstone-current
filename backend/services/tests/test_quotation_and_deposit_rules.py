"""Every quotation and deposit step, and every refused one.

Quotation statuses: Draft, Sent, Accepted, Rejected. The office drafts, sends, updates, revises a
declined quotation and records an offline acceptance (from Draft or Sent); only the client declines
(with a reason). Accepted is locked. A quotation the client has received is never deleted. Nothing is
sent, accepted or paid for a cancelled job. Deposits: only on an accepted quotation that requires one,
never more than what remains, never zero or dated in the future; voids need a reason, once.
"""

from decimal import Decimal

from ._imports import *  # noqa: F403,F405
from services.business_time import business_today
from services.models import QuotationRecord, SalesPayment
from users.rbac import REPORTS_VIEW

STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected']
# (from, to) moves the office may make through the quotation API.
OFFICE_MOVES = {
    ('Draft', 'Sent'), ('Draft', 'Accepted'),
    ('Sent', 'Accepted'),
    ('Rejected', 'Draft'), ('Rejected', 'Sent'),
}


class QuotationFixture(APITestCase):
    def setUp(self):
        mk = User.objects.create_user
        self.owner = mk(username='qr-owner', password='x', role='client')
        self.superadmin = mk(username='qr-super', password='x', role='superadmin')
        self.tech = mk(username='qr-lead', password='x', role='technician', status='active')
        self.plain = ServiceType.objects.create(name='Quoted', estimated_duration=60)
        self.deposit_service = ServiceType.objects.create(name='Deposit first', estimated_duration=60, deposit_policy='percentage', deposit_value=30)

    def ticket(self, status_value='Inspection Completed', service=None):
        req = ServiceRequest.objects.create(client=self.owner, service_type=service or self.plain, description='q', status='Approved')
        return ServiceTicket.objects.create(request=req, technician=self.tech, scheduled_date=business_today(), status=status_value, ticket_type='inspection')

    def quote(self, status_value, *, ticket=None, deposit=False):
        service = self.deposit_service if deposit else self.plain
        ticket = ticket or self.ticket(service=service)
        return QuotationRecord.objects.create(
            ticket=ticket, client=self.owner, quotation_number=f'QR-{ticket.id}', total_amount='PHP 10,000.00',
            status=status_value, deposit_policy=service.deposit_policy, deposit_value=service.deposit_value,
            required_deposit_amount=Decimal('3000.00') if deposit else Decimal('0'),
        )

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client


class QuotationStatusRuleTests(QuotationFixture):
    def test_every_office_status_move(self):
        for source in STATUSES:
            for target in STATUSES:
                if source == target:
                    continue
                with self.subTest(source=source, target=target):
                    quotation = self.quote(source)
                    response = self.as_(self.superadmin).patch(f'/api/services/quotations/{quotation.id}/', {'status': target}, format='json')
                    quotation.refresh_from_db()
                    if (source, target) in OFFICE_MOVES:
                        self.assertEqual(response.status_code, 200, response.data)
                        self.assertEqual(quotation.status, target)
                    else:
                        self.assertEqual(response.status_code, 400)
                        self.assertEqual(quotation.status, source)

    def test_new_quotations_start_as_draft_or_sent(self):
        for status_value, expected in [('Draft', 201), ('Sent', 201), ('Accepted', 400), ('Rejected', 400)]:
            with self.subTest(status_value=status_value):
                response = self.as_(self.superadmin).post('/api/services/quotations/', {
                    'ticket': self.ticket().id, 'client': self.owner.id, 'total_amount': 'PHP 5,000.00', 'status': status_value,
                }, format='json')
                self.assertEqual(response.status_code, expected)

    def test_only_a_draft_can_be_deleted(self):
        for status_value, expected in [('Draft', 204), ('Sent', 409), ('Accepted', 409), ('Rejected', 409)]:
            with self.subTest(status_value=status_value):
                quotation = self.quote(status_value)
                self.assertEqual(self.as_(self.superadmin).delete(f'/api/services/quotations/{quotation.id}/').status_code, expected)
                self.assertEqual(QuotationRecord.objects.filter(pk=quotation.pk).exists(), expected != 204)

    def test_the_client_answers_only_a_sent_quotation(self):
        for status_value in ['Draft', 'Accepted', 'Rejected']:
            with self.subTest(status_value=status_value):
                quotation = self.quote(status_value)
                response = self.as_(self.owner).post(f'/api/services/quotations/{quotation.id}/respond/', {'decision': 'accept'}, format='json')
                self.assertEqual(response.status_code, 409)
        quotation = self.quote('Sent')
        self.assertEqual(self.as_(self.owner).post(f'/api/services/quotations/{quotation.id}/respond/', {'decision': 'maybe'}, format='json').status_code, 400)
        self.assertEqual(self.as_(self.owner).post(f'/api/services/quotations/{quotation.id}/respond/', {'decision': 'decline'}, format='json').status_code, 400)
        self.assertEqual(self.as_(self.owner).post(f'/api/services/quotations/{quotation.id}/respond/', {'decision': 'decline', 'note': 'Too costly.'}, format='json').status_code, 200)
        quotation.refresh_from_db()
        self.assertEqual((quotation.status, quotation.client_response_note), ('Rejected', 'Too costly.'))


class CancelledJobQuotationTests(QuotationFixture):
    def test_nothing_is_sent_accepted_or_paid_for_a_cancelled_job(self):
        cancelled = self.ticket(status_value='Cancelled')
        send = self.as_(self.superadmin).post('/api/services/quotations/', {
            'ticket': cancelled.id, 'client': self.owner.id, 'total_amount': 'PHP 5,000.00', 'status': 'Sent',
        }, format='json')
        self.assertEqual(send.status_code, 400)
        self.assertIn('cancelled', str(send.data['ticket']))

        sent = self.quote('Sent', ticket=self.ticket(status_value='Cancelled'))
        for decision in ['accept', 'decline']:
            response = self.as_(self.owner).post(f'/api/services/quotations/{sent.id}/respond/', {'decision': decision, 'note': 'x'}, format='json')
            self.assertEqual(response.status_code, 409)
        draft = self.quote('Draft', ticket=self.ticket(status_value='Cancelled'))
        self.assertEqual(self.as_(self.superadmin).patch(f'/api/services/quotations/{draft.id}/', {'status': 'Accepted'}, format='json').status_code, 400)

        accepted = self.quote('Accepted', ticket=self.ticket(status_value='Cancelled', service=self.deposit_service), deposit=True)
        payment = SalesPayment.objects.create(quotation=accepted, amount=Decimal('1000'), paid_on=business_today(), method='cash', recorded_by=self.superadmin)
        new_payment = self.as_(self.superadmin).post(f'/api/services/quotations/{accepted.id}/deposit-payments/', {'amount': '100', 'paid_on': business_today().isoformat(), 'method': 'cash'}, format='json')
        self.assertEqual(new_payment.status_code, 409)
        # An earlier payment can still be voided (for example when it is refunded).
        void = self.as_(self.superadmin).post(f'/api/services/quotations/{accepted.id}/void-deposit-payment/', {'payment_id': payment.id, 'reason': 'Refunded after cancellation.'}, format='json')
        self.assertEqual(void.status_code, 200)


class DepositRuleTests(QuotationFixture):
    def pay(self, quotation, amount, day=None):
        return self.as_(self.superadmin).post(f'/api/services/quotations/{quotation.id}/deposit-payments/', {
            'amount': amount, 'paid_on': (day or business_today()).isoformat(), 'method': 'cash',
        }, format='json')

    def test_amounts_dates_and_the_remaining_balance(self):
        quotation = self.quote('Accepted', deposit=True)
        self.assertEqual(self.pay(quotation, '4000').status_code, 400)
        self.assertEqual(self.pay(quotation, '0').status_code, 400)
        self.assertEqual(self.pay(quotation, '100', business_today() + timedelta(days=1)).status_code, 400)
        self.assertEqual(self.pay(quotation, '1000').status_code, 201)
        self.assertEqual(self.pay(quotation, '2000').data['deposit_status'], 'paid')
        self.assertEqual(self.pay(quotation, '1').status_code, 400)

    def test_deposits_only_on_an_accepted_quotation_that_needs_one(self):
        self.assertEqual(self.pay(self.quote('Sent', deposit=True), '100').status_code, 409)
        self.assertEqual(self.pay(self.quote('Accepted'), '100').status_code, 409)

    def test_a_void_needs_a_reason_and_happens_once(self):
        quotation = self.quote('Accepted', deposit=True)
        self.pay(quotation, '1000')
        payment = SalesPayment.objects.get(quotation=quotation)
        url = f'/api/services/quotations/{quotation.id}/void-deposit-payment/'
        self.assertEqual(self.as_(self.superadmin).post(url, {'payment_id': payment.id}, format='json').status_code, 400)
        self.assertEqual(self.as_(self.superadmin).post(url, {'payment_id': payment.id, 'reason': 'Bounced.'}, format='json').data['deposit_status'], 'unpaid')
        self.assertEqual(self.as_(self.superadmin).post(url, {'payment_id': payment.id, 'reason': 'Again.'}, format='json').status_code, 409)


class QuotationRoleTests(QuotationFixture):
    ROLES = ['owner client', 'other client', 'lead tech', 'other tech', 'admin', 'scoped admin', 'superadmin']
    EXPECTED = {
        'view':    [200, 404, 200, 404, 200, 403, 200],
        'create':  [403, 403, 403, 403, 201, 403, 201],
        'update':  [403, 403, 403, 403, 200, 403, 200],
        'delete':  [403, 403, 403, 403, 204, 403, 204],
        'accept':  [200, 404, 403, 403, 403, 403, 403],
        'decline': [200, 404, 403, 403, 403, 403, 403],
        'pay':     [403, 403, 403, 403, 201, 403, 201],
        'void':    [403, 403, 403, 403, 200, 403, 200],
    }

    def setUp(self):
        super().setUp()
        mk = User.objects.create_user
        self.users = {
            'owner client': self.owner,
            'other client': mk(username='qr-other', password='x', role='client'),
            'lead tech': self.tech,
            'other tech': mk(username='qr-tech2', password='x', role='technician', status='active'),
            'admin': mk(username='qr-admin', password='x', role='admin'),
            'scoped admin': mk(username='qr-scoped', password='x', role='admin'),
            'superadmin': self.superadmin,
        }
        UserCapabilityGrant.objects.create(user=self.users['scoped admin'], capability_code=REPORTS_VIEW)

    def attempt(self, action, user):
        status_for = {'accept': 'Sent', 'decline': 'Sent', 'pay': 'Accepted', 'void': 'Accepted'}
        quotation = self.quote(status_for.get(action, 'Draft'), deposit=action in ('pay', 'void'))
        client = self.as_(user)
        url = f'/api/services/quotations/{quotation.id}/'
        if action == 'view':
            return client.get(url).status_code
        if action == 'create':
            return client.post('/api/services/quotations/', {'ticket': self.ticket().id, 'client': self.owner.id, 'total_amount': 'PHP 5,000.00', 'status': 'Draft'}, format='json').status_code
        if action == 'update':
            return client.patch(url, {'total_amount': 'PHP 6,000.00'}, format='json').status_code
        if action == 'delete':
            return client.delete(url).status_code
        if action in ('accept', 'decline'):
            return client.post(f'{url}respond/', {'decision': action, 'note': 'Too costly.'}, format='json').status_code
        if action == 'pay':
            return client.post(f'{url}deposit-payments/', {'amount': '100', 'paid_on': business_today().isoformat(), 'method': 'cash'}, format='json').status_code
        payment = SalesPayment.objects.create(quotation=quotation, amount=Decimal('100'), paid_on=business_today(), method='cash', recorded_by=self.superadmin)
        return client.post(f'{url}void-deposit-payment/', {'payment_id': payment.id, 'reason': 'Bounced.'}, format='json').status_code

    def test_each_role_on_each_action(self):
        for action, expected in self.EXPECTED.items():
            for role, code in zip(self.ROLES, expected):
                with self.subTest(action=action, role=role):
                    self.assertEqual(self.attempt(action, self.users[role]), code)


class DepositAfterCancellationTests(QuotationFixture):
    """A job cancelled after a deposit was received: the office records Refunded or Kept."""

    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(username='qr-admin2', password='x', role='admin')

    def paid_job(self, ticket_status='Not Started', amount='1500'):
        ticket = self.ticket(status_value=ticket_status, service=self.deposit_service)
        ticket.ticket_type = 'installation'
        ticket.save(update_fields=['ticket_type'])
        quotation = self.quote('Accepted', ticket=ticket, deposit=True)
        SalesPayment.objects.create(quotation=quotation, amount=Decimal(amount), paid_on=business_today(), method='gcash', reference='GC-1', notes='First half', recorded_by=self.superadmin)
        return ticket, quotation

    def cancel_ticket(self, ticket):
        return self.as_(self.superadmin).post(f'/api/services/service-tickets/{ticket.id}/update_status/', {'status': 'Cancelled', 'reason': 'Client backed out: by phone.'}, format='json')

    def settle(self, quotation, outcome, note='Refunded by GCash, ref 99.', user=None):
        return self.as_(user or self.superadmin).post(f'/api/services/quotations/{quotation.id}/settle-deposit/', {'outcome': outcome, 'note': note}, format='json')

    def test_cancelling_a_job_with_a_deposit_asks_the_office_to_decide(self):
        ticket, quotation = self.paid_job()
        self.assertEqual(self.cancel_ticket(ticket).status_code, 200)
        notice = Notification.objects.get(user=self.admin, title=f'Deposit decision needed for Ticket #{ticket.id}')
        self.assertEqual(notice.ticket_id, ticket.id)
        self.assertIn('PHP 1,500.00', notice.message)
        data = self.as_(self.superadmin).get(f'/api/services/quotations/{quotation.id}/').data
        self.assertEqual((data['ticket_status'], data['deposit_decision_needed'], data['deposit_outcome']), ('Cancelled', True, None))

        # The same notice when the client cancels before dispatch; none when nothing was paid.
        client_ticket, _ = self.paid_job(ticket_status='Ready for Service')
        cancelled = self.as_(self.owner).post(f'/api/services/service-requests/{client_ticket.request_id}/cancel/', {'reason': 'Changed plans.'}, format='json')
        self.assertEqual(cancelled.status_code, 200, cancelled.data)
        self.assertTrue(Notification.objects.filter(user=self.admin, title=f'Deposit decision needed for Ticket #{client_ticket.id}').exists())
        unpaid = self.ticket(status_value='Not Started')
        self.cancel_ticket(unpaid)
        self.assertFalse(Notification.objects.filter(title=f'Deposit decision needed for Ticket #{unpaid.id}').exists())

    def test_refunded_voids_the_payments_and_tells_the_client(self):
        ticket, quotation = self.paid_job()
        self.cancel_ticket(ticket)
        response = self.settle(quotation, 'refunded')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['deposit_paid_amount'], '0.00')
        self.assertEqual(response.data['deposit_outcome']['outcome'], 'refunded')
        self.assertEqual(response.data['deposit_outcome']['recorded_by'], self.superadmin.username)
        self.assertFalse(response.data['deposit_decision_needed'])
        payment = SalesPayment.objects.get(quotation=quotation)
        self.assertTrue(payment.is_voided)
        self.assertEqual(payment.void_reason, 'Refunded after the job was cancelled: Refunded by GCash, ref 99.')
        self.assertTrue(Notification.objects.filter(user=self.owner, title='Deposit refunded', ticket=ticket).exists())
        self.assertEqual(self.settle(quotation, 'kept').status_code, 409)

    def test_kept_leaves_the_money_counted_and_notes_each_payment(self):
        ticket, quotation = self.paid_job()
        self.cancel_ticket(ticket)
        response = self.settle(quotation, 'kept', note='Cancellation fee per the signed quotation.')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['deposit_paid_amount'], '1500.00')
        self.assertEqual(response.data['deposit_outcome']['outcome'], 'kept')
        payment = SalesPayment.objects.get(quotation=quotation)
        self.assertFalse(payment.is_voided)
        self.assertEqual(payment.notes, 'First half\nKept after the job was cancelled: Cancellation fee per the signed quotation.')
        self.assertTrue(Notification.objects.filter(user=self.owner, title='Deposit kept after cancellation').exists())

    def test_refusals(self):
        open_ticket, open_quotation = self.paid_job()
        self.assertEqual(self.settle(open_quotation, 'refunded').status_code, 409)
        self.cancel_ticket(open_ticket)
        self.assertEqual(self.settle(open_quotation, 'maybe').status_code, 400)
        self.assertEqual(self.settle(open_quotation, 'refunded', note='ok').status_code, 400)
        self.assertEqual(self.settle(open_quotation, 'refunded', user=self.owner).status_code, 403)
        self.assertEqual(self.settle(open_quotation, 'refunded', user=self.tech).status_code, 403)
        nothing_paid = self.quote('Accepted', ticket=self.ticket(status_value='Cancelled', service=self.deposit_service), deposit=True)
        self.assertEqual(self.settle(nothing_paid, 'refunded').status_code, 409)

    def test_the_client_sees_amounts_and_the_decision_but_not_office_details(self):
        ticket, quotation = self.paid_job()
        self.cancel_ticket(ticket)
        self.settle(quotation, 'kept', note='Cancellation fee.')
        client_view = self.as_(self.owner).get(f'/api/services/quotations/{quotation.id}/').data
        self.assertEqual(set(client_view['deposit_payments'][0]), {'id', 'paid_on', 'method', 'method_label', 'amount', 'is_voided'})
        self.assertEqual(client_view['deposit_outcome']['note'], 'Cancellation fee.')
        self.assertNotIn('recorded_by', client_view['deposit_outcome'])
        office_view = self.as_(self.superadmin).get(f'/api/services/quotations/{quotation.id}/').data
        self.assertIn('notes', office_view['deposit_payments'][0])
        self.assertIn('reference', office_view['deposit_payments'][0])

    def test_kept_deposits_show_in_sales_analytics_and_refunds_do_not(self):
        kept_ticket, kept_quotation = self.paid_job(amount='1500')
        refunded_ticket, refunded_quotation = self.paid_job(amount='800')
        for ticket in (kept_ticket, refunded_ticket):
            self.cancel_ticket(ticket)
        self.settle(kept_quotation, 'kept', note='Cancellation fee.')
        self.settle(refunded_quotation, 'refunded', note='Returned by GCash.')

        sales = self.as_(self.superadmin).get('/api/admin/analytics/', {'workspace': 'sales'}).data
        kept = sales['kpis']['kept_deposits']
        self.assertEqual((Decimal(str(kept['current'])), kept['count'], kept['currency']), (Decimal('1500.00'), 1, 'PHP'))
        # Not a sale: the confirmed sales count is untouched.
        self.assertEqual(sales['kpis']['confirmed_sales_count']['current'], 0)
        other_currency = self.as_(self.superadmin).get('/api/admin/analytics/', {'workspace': 'sales', 'currency': 'USD'}).data
        self.assertEqual(other_currency['kpis']['kept_deposits']['count'], 0)
