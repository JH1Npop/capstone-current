"""Every sales record step on every status, and who may take it.

Statuses: draft (edit, confirm), confirmed (void with a reason once no payment remains, take and void
payments), voided (read-only; a replacement is prepared). Clients see only their confirmed records;
technicians see none; payment entries are office-only. More detailed rules (sources, manual value,
balances, business-day sale date) are in services/test_sales_records.py.
"""

from decimal import Decimal

from ._imports import *  # noqa: F403,F405
from services.business_time import business_today
from services.models import QuotationRecord, SalesPayment, SalesRecord
from users.rbac import DOCUMENTS_VIEW, REPORTS_VIEW

ACTIONS = ['edit', 'confirm', 'void', 'pay', 'void payment']
# What the office gets for each action on each status.
EXPECTED_BY_STATUS = {
    'draft':     {'edit': 200, 'confirm': 200, 'void': 409, 'pay': 409, 'void payment': 200},
    'confirmed': {'edit': 409, 'confirm': 409, 'void': 200, 'pay': 201, 'void payment': 200},
    'voided':    {'edit': 409, 'confirm': 409, 'void': 409, 'pay': 409, 'void payment': 409},
}


class SalesFixture(APITestCase):
    def setUp(self):
        mk = User.objects.create_user
        self.owner = mk(username='sr-owner', password='x', role='client')
        self.superadmin = mk(username='sr-super', password='x', role='superadmin')
        self.tech = mk(username='sr-lead', password='x', role='technician', status='active')
        self.service = ServiceType.objects.create(name='Sales rules', estimated_duration=60)

    def record(self, status_value='draft', ticket_status='Completed'):
        req = ServiceRequest.objects.create(client=self.owner, service_type=self.service, description='s', status='Completed')
        ticket = ServiceTicket.objects.create(request=req, technician=self.tech, scheduled_date=business_today(), status=ticket_status, completed_date=timezone.now())
        QuotationRecord.objects.create(ticket=ticket, client=self.owner, quotation_number=f'QSR-{ticket.id}', total_amount='PHP 10,000.00', status='Accepted')
        return SalesRecord.objects.create(ticket=ticket, client=self.owner, status=status_value, agreed_total=Decimal('10000.00'), currency_code='PHP', record_number=f'SAL-R{ticket.id}')

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def attempt(self, action, record, user):
        base = f'/api/services/sales-records/{record.id}/'
        client = self.as_(user)
        if action == 'edit':
            return client.patch(base, {'notes': 'Checked by the office.'}, format='json')
        if action == 'confirm':
            return client.post(f'{base}confirm/', {}, format='json')
        if action == 'void':
            return client.post(f'{base}void/', {'reason': 'Wrong total entered.'}, format='json')
        if action == 'pay':
            return client.post(f'{base}payments/', {'amount': '100', 'paid_on': business_today().isoformat(), 'method': 'cash'}, format='json')
        payment = SalesPayment.objects.create(sales_record=record, amount=Decimal('100'), paid_on=business_today(), method='cash', recorded_by=self.superadmin)
        return client.post(f'{base}void-payment/', {'payment_id': payment.id, 'reason': 'Bounced.'}, format='json')


class SalesStatusRuleTests(SalesFixture):
    def test_every_action_on_every_status(self):
        for status_value, expected in EXPECTED_BY_STATUS.items():
            for action in ACTIONS:
                with self.subTest(status=status_value, action=action):
                    record = self.record(status_value)
                    self.assertEqual(self.attempt(action, record, self.superadmin).status_code, expected[action])

    def test_prepare_refuses_open_or_cancelled_work_and_reuses_the_active_record(self):
        for ticket_status in ['Cancelled', 'In Progress', 'Not Started']:
            with self.subTest(ticket_status=ticket_status):
                req = ServiceRequest.objects.create(client=self.owner, service_type=self.service, description='p', status='Approved')
                ticket = ServiceTicket.objects.create(request=req, scheduled_date=business_today(), status=ticket_status)
                response = self.as_(self.superadmin).post('/api/services/sales-records/prepare/', {'ticket_id': ticket.id}, format='json')
                self.assertEqual(response.status_code, 409)
        confirmed = self.record('confirmed')
        again = self.as_(self.superadmin).post('/api/services/sales-records/prepare/', {'ticket_id': confirmed.ticket_id}, format='json')
        self.assertEqual((again.status_code, again.data['id']), (200, confirmed.id))

    def test_a_voided_sale_is_replaced_not_reopened(self):
        record = self.record('confirmed')
        self.assertEqual(self.attempt('void', record, self.superadmin).status_code, 200)
        replacement = self.as_(self.superadmin).post('/api/services/sales-records/prepare/', {'ticket_id': record.ticket_id}, format='json')
        self.assertEqual(replacement.status_code, 201)
        self.assertEqual(replacement.data['replaces'], record.id)
        self.assertEqual(replacement.data['status'], 'draft')

    def test_a_sale_with_live_payments_cannot_be_voided(self):
        record = self.record('confirmed')
        SalesPayment.objects.create(sales_record=record, amount=Decimal('500'), paid_on=business_today(), method='cash', recorded_by=self.superadmin)
        response = self.attempt('void', record, self.superadmin)
        self.assertEqual(response.status_code, 409)
        record.refresh_from_db()
        self.assertEqual(record.status, 'confirmed')


class SalesVisibilityTests(SalesFixture):
    def test_clients_see_only_their_confirmed_records(self):
        other = User.objects.create_user(username='sr-other', password='x', role='client')
        for status_value, expected in [('confirmed', 200), ('draft', 404), ('voided', 404)]:
            with self.subTest(status=status_value):
                record = self.record(status_value)
                self.assertEqual(self.as_(self.owner).get(f'/api/services/sales-records/{record.id}/').status_code, expected)
                self.assertEqual(self.as_(other).get(f'/api/services/sales-records/{record.id}/').status_code, 404)
        self.assertEqual(self.as_(self.tech).get('/api/services/sales-records/').data.get('results', []), [])


class SalesRoleTests(SalesFixture):
    ROLES = ['owner client', 'other client', 'lead tech', 'docs viewer', 'admin', 'scoped admin', 'superadmin']
    EXPECTED = {
        'view confirmed': [200, 404, 404, 200, 200, 403, 200],
        'prepare':        [403, 403, 403, 403, 200, 403, 200],
        'edit':           [403, 403, 403, 403, 200, 403, 200],
        'confirm':        [403, 403, 403, 403, 200, 403, 200],
        'void':           [403, 403, 403, 403, 200, 403, 200],
        'pay':            [403, 403, 403, 403, 201, 403, 201],
        'void payment':   [403, 403, 403, 403, 200, 403, 200],
        'list payments':  [403, 403, 403, 200, 200, 403, 200],
    }

    def setUp(self):
        super().setUp()
        mk = User.objects.create_user
        self.users = {
            'owner client': self.owner,
            'other client': mk(username='sr-other2', password='x', role='client'),
            'lead tech': self.tech,
            'docs viewer': mk(username='sr-viewer', password='x', role='admin'),
            'admin': mk(username='sr-admin', password='x', role='admin'),
            'scoped admin': mk(username='sr-scoped', password='x', role='admin'),
            'superadmin': self.superadmin,
        }
        UserCapabilityGrant.objects.create(user=self.users['scoped admin'], capability_code=REPORTS_VIEW)
        UserCapabilityGrant.objects.create(user=self.users['docs viewer'], capability_code=DOCUMENTS_VIEW)

    def code(self, action, user):
        record = self.record('draft' if action in ('edit', 'confirm') else 'confirmed')
        if action == 'view confirmed':
            return self.as_(user).get(f'/api/services/sales-records/{record.id}/').status_code
        if action == 'prepare':
            return self.as_(user).post('/api/services/sales-records/prepare/', {'ticket_id': record.ticket_id}, format='json').status_code
        if action == 'list payments':
            return self.as_(user).get(f'/api/services/sales-records/{record.id}/payments/').status_code
        return self.attempt(action, record, user).status_code

    def test_each_role_on_each_action(self):
        for action, expected in self.EXPECTED.items():
            for role, code in zip(self.ROLES, expected):
                with self.subTest(action=action, role=role):
                    self.assertEqual(self.code(action, self.users[role]), code)
