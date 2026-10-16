"""Business-flow controls: quotation acceptance, post-dispatch cancellation, client handover, payments, sales prompts."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from services.models import (
    QuotationRecord,
    SalesPayment,
    SalesRecord,
    ServiceRequest,
    ServiceStatusHistory,
    ServiceTicket,
    ServiceType,
    TurnoverAcceptance,
)
from services.views.helpers import apply_ticket_status_change
from users.models import AdminSettings, User


class FlowFixture(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='flow-admin', email='flow@x.test', password='pass', role='admin')
        self.client_user = User.objects.create_user(username='flow-client', password='pass', role='client')
        self.other_client = User.objects.create_user(username='flow-other', password='pass', role='client')
        self.tech = User.objects.create_user(username='flow-tech', password='pass', role='technician')
        self.service = ServiceType.objects.create(name='Flow install', estimated_duration=120, requires_site_inspection=True)

    def ticket(self, status_value='Not Started', ticket_type='installation', technician=None):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service, description='Flow request', status='Approved',
        )
        return ServiceTicket.objects.create(
            request=request_obj, status=status_value, ticket_type=ticket_type,
            technician=technician, scheduled_date=timezone.localdate(),
        )

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client


class QuotationAcceptanceTests(FlowFixture):
    def setUp(self):
        super().setUp()
        self.inspected = self.ticket('Inspection Completed', ticket_type='inspection', technician=self.tech)
        ServiceStatusHistory.objects.create(ticket=self.inspected, status='For Inspection', changed_by=self.admin)
        self.quotation = QuotationRecord.objects.create(
            ticket=self.inspected, client=self.client_user, quotation_number='QUO-FLOW-1', status='Sent',
        )
        self.decision_url = f'/api/services/service-tickets/{self.inspected.id}/inspection_decision/'
        self.respond_url = f'/api/services/quotations/{self.quotation.id}/respond/'

    def test_declining_requires_a_reason_and_keeps_service_blocked(self):
        client = self.as_user(self.client_user)
        self.assertEqual(client.post(self.respond_url, {'decision': 'decline'}, format='json').status_code, 400)
        self.assertEqual(client.post(self.respond_url, {'decision': 'decline', 'note': 'Too expensive.'}, format='json').status_code, 200)
        self.quotation.refresh_from_db()
        self.assertEqual(self.quotation.status, 'Rejected')
        self.assertIsNotNone(self.quotation.client_responded_at)
        blocked = self.as_user(self.admin).post(self.decision_url, {'decision': 'approve_service'}, format='json')
        self.assertEqual(blocked.status_code, 409)

    def test_only_the_quotation_owner_can_respond_once(self):
        self.assertEqual(self.as_user(self.other_client).post(self.respond_url, {'decision': 'accept'}, format='json').status_code, 404)
        self.assertEqual(self.as_user(self.admin).post(self.respond_url, {'decision': 'accept'}, format='json').status_code, 403)
        self.assertEqual(self.as_user(self.client_user).post(self.respond_url, {'decision': 'accept'}, format='json').status_code, 200)
        self.assertEqual(self.as_user(self.client_user).post(self.respond_url, {'decision': 'accept'}, format='json').status_code, 409)

    def test_staff_recorded_acceptance_also_unblocks_service(self):
        QuotationRecord.objects.filter(pk=self.quotation.pk).update(status='Accepted')
        response = self.as_user(self.admin).post(self.decision_url, {'decision': 'approve_service'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_setting_can_turn_the_requirement_off(self):
        settings_obj = AdminSettings.objects.first() or AdminSettings.objects.create()
        settings_obj.require_quotation_acceptance = False
        settings_obj.save(update_fields=['require_quotation_acceptance'])
        response = self.as_user(self.admin).post(self.decision_url, {'decision': 'approve_service'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

    def test_cancelling_after_inspection_needs_no_quotation(self):
        response = self.as_user(self.admin).post(self.decision_url, {'decision': 'cancel', 'notes': 'Roof unsuitable.'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)


class CancellationAfterDispatchTests(FlowFixture):
    def test_client_cannot_cancel_once_the_technician_is_on_the_way(self):
        ticket = self.ticket('Navigating', technician=self.tech)
        url = f'/api/services/service-requests/{ticket.request_id}/cancel/'
        refused = self.as_user(self.client_user).post(url, {'reason': 'Changed my mind.'}, format='json')
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.data['code'], 'cancellation_requires_office')

        allowed = self.as_user(self.admin).post(url, {'reason': 'Client called the office.'}, format='json')
        self.assertEqual(allowed.status_code, 200, allowed.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Cancelled')

    def test_client_can_still_cancel_before_dispatch(self):
        ticket = self.ticket('Not Started', technician=self.tech)
        response = self.as_user(self.client_user).post(
            f'/api/services/service-requests/{ticket.request_id}/cancel/', {'reason': 'No longer needed.'}, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)


class ClientHandoverConfirmationTests(FlowFixture):
    def setUp(self):
        super().setUp()
        self.done = self.ticket('Turned Over / Accepted', technician=self.tech)
        self.turnover = TurnoverAcceptance.objects.create(ticket=self.done, status='finalized', finalized_by=self.admin, finalized_at=timezone.now())
        self.url = f'/api/services/turnover-acceptances/{self.turnover.id}/client-confirm/'

    def test_client_confirms_once(self):
        response = self.as_user(self.client_user).post(self.url, {'note': 'All working.'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.turnover.refresh_from_db()
        self.assertEqual(self.turnover.status, 'accepted')
        self.assertEqual(self.turnover.client_confirmed_by, self.client_user)
        self.assertEqual(self.as_user(self.client_user).post(self.url, {}, format='json').status_code, 409)

    def test_draft_handover_and_other_clients_are_refused(self):
        self.assertEqual(self.as_user(self.other_client).post(self.url, {}, format='json').status_code, 404)
        TurnoverAcceptance.objects.filter(pk=self.turnover.pk).update(status='draft')
        self.assertEqual(self.as_user(self.client_user).post(self.url, {}, format='json').status_code, 409)


class PaymentTrackingTests(FlowFixture):
    def setUp(self):
        super().setUp()
        self.done = self.ticket('Completed', technician=self.tech)
        self.record = SalesRecord.objects.create(
            ticket=self.done, client=self.client_user, status='confirmed', agreed_total=Decimal('10000.00'),
            sale_date=timezone.localdate(),
        )
        self.url = f'/api/services/sales-records/{self.record.id}/payments/'

    def pay(self, amount, **extra):
        return self.as_user(self.admin).post(self.url, {
            'amount': amount, 'paid_on': timezone.localdate().isoformat(), 'method': 'cash', **extra,
        }, format='json')

    def test_partial_then_full_payment(self):
        self.assertEqual(self.pay('4000.00').status_code, 201)
        detail = self.as_user(self.admin).get(f'/api/services/sales-records/{self.record.id}/').data
        self.assertEqual((detail['payment_status'], detail['balance_due']), ('partial', '6000.00'))
        self.assertEqual(self.pay('6000.00').status_code, 201)
        detail = self.as_user(self.admin).get(f'/api/services/sales-records/{self.record.id}/').data
        self.assertEqual((detail['payment_status'], detail['balance_due']), ('paid', '0.00'))

    def test_overpayment_future_dates_and_zero_are_rejected(self):
        self.assertEqual(self.pay('10000.01').status_code, 400)
        self.assertEqual(self.pay('0').status_code, 400)
        future = self.as_user(self.admin).post(self.url, {
            'amount': '100.00', 'paid_on': (timezone.localdate() + timedelta(days=1)).isoformat(), 'method': 'cash',
        }, format='json')
        self.assertEqual(future.status_code, 400)

    def test_voiding_needs_a_reason_and_protects_paid_sales(self):
        payment_id = self.pay('2500.00').data['id']
        void_sale = self.as_user(self.admin).post(f'/api/services/sales-records/{self.record.id}/void/', {'reason': 'Duplicate'}, format='json')
        self.assertEqual(void_sale.status_code, 409)
        void_url = f'/api/services/sales-records/{self.record.id}/void-payment/'
        self.assertEqual(self.as_user(self.admin).post(void_url, {'payment_id': payment_id}, format='json').status_code, 400)
        self.assertEqual(self.as_user(self.admin).post(void_url, {'payment_id': payment_id, 'reason': 'Refunded.'}, format='json').status_code, 200)
        self.assertTrue(SalesPayment.objects.get(pk=payment_id).is_voided)
        void_sale = self.as_user(self.admin).post(f'/api/services/sales-records/{self.record.id}/void/', {'reason': 'Duplicate'}, format='json')
        self.assertEqual(void_sale.status_code, 200, void_sale.data)

    def test_analytics_shows_collections_and_attention(self):
        self.pay('4000.00')
        sales = self.as_user(self.admin).get('/api/admin/analytics/', {'workspace': 'sales'}).data
        collections = sales['kpis']['collections']
        self.assertEqual(Decimal(collections['collected_amount']), Decimal('4000.00'))
        self.assertEqual(Decimal(collections['outstanding_balance']), Decimal('6000.00'))
        self.assertEqual(collections['unpaid_records'], 1)
        attention = self.as_user(self.admin).get('/api/admin/analytics/').data['attention']
        self.assertEqual(attention['unpaid_sales_records'], 1)

    def test_clients_and_drafts_cannot_take_payments(self):
        self.assertEqual(self.as_user(self.client_user).post(self.url, {'amount': '1', 'paid_on': timezone.localdate().isoformat(), 'method': 'cash'}, format='json').status_code, 403)
        SalesRecord.objects.filter(pk=self.record.pk).update(status='draft')
        self.assertEqual(self.pay('100.00').status_code, 409)


class SalesPromptTests(FlowFixture):
    def test_completing_service_work_drafts_a_sales_record_but_inspections_do_not(self):
        service_ticket = self.ticket('In Progress', technician=self.tech)
        apply_ticket_status_change(service_ticket, 'Completed', changed_by=self.tech, notes='Work finished.')
        self.assertTrue(SalesRecord.objects.filter(ticket=service_ticket, status='draft').exists())

        inspection = self.ticket('Inspection Completed', ticket_type='inspection', technician=self.tech)
        apply_ticket_status_change(inspection, 'Completed', changed_by=self.tech, notes='Inspection only.')
        self.assertFalse(SalesRecord.objects.filter(ticket=inspection).exists())
