from ._imports import *  # noqa: F403,F405
from notifications.models import Notification
from services.models import QuotationRecord
from users.models import ActivityLog


class QuotationRevisionAfterDeclineTests(APITestCase):
    """A declined quotation can be revised and re-sent; an accepted one stays locked."""

    def setUp(self):
        self.admin = User.objects.create_superuser(username='quote-admin', email='qa@example.com', password='x', role='admin')
        self.client_user = User.objects.create_user(username='quote-client', password='x', role='client')
        service = ServiceType.objects.create(name='Quoted Install', estimated_duration=120)
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='Quote me', status='Approved')
        self.ticket = ServiceTicket.objects.create(request=request_obj, scheduled_date=timezone.localdate(), status='Inspection Completed')

    def send(self, total):
        self.client.force_authenticate(self.admin)
        return self.client.post('/api/services/quotations/', {
            'ticket': self.ticket.id, 'client': self.client_user.id, 'total_amount': total, 'status': 'Sent',
        }, format='json')

    def respond(self, quotation_id, decision, note=''):
        self.client.force_authenticate(self.client_user)
        return self.client.post(f'/api/services/quotations/{quotation_id}/respond/', {'decision': decision, 'note': note}, format='json')

    def test_declined_quotation_is_revised_resent_and_then_locked_once_accepted(self):
        first = self.send('PHP 80,000.00')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(first.data['quotation_number'], f'QUO-{self.ticket.id:04d}')
        self.assertEqual(self.respond(first.data['id'], 'decline', 'Too expensive.').status_code, status.HTTP_200_OK)

        revised = self.send('PHP 60,000.00')
        self.assertEqual(revised.status_code, status.HTTP_200_OK, revised.data)
        self.assertEqual(revised.data['id'], first.data['id'])
        self.assertEqual(revised.data['quotation_number'], f'QUO-{self.ticket.id:04d}-R2')
        self.assertEqual(revised.data['status'], 'Sent')
        self.assertEqual(revised.data['total_amount'], 'PHP 60,000.00')
        self.assertIsNone(revised.data['client_responded_at'])
        self.assertEqual(revised.data['client_response_note'], '')
        self.assertTrue(Notification.objects.filter(user=self.client_user, message__icontains='-R2').exists())
        log = ActivityLog.objects.filter(message__icontains='revised as').latest('id')
        self.assertEqual(log.metadata['client_decline_note'], 'Too expensive.')

        # A second decline and revision keeps counting.
        self.respond(first.data['id'], 'decline', 'Still too high.')
        self.assertEqual(self.send('PHP 55,000.00').data['quotation_number'], f'QUO-{self.ticket.id:04d}-R3')

        self.assertEqual(self.respond(first.data['id'], 'accept').status_code, status.HTTP_200_OK)
        locked = self.send('PHP 1.00')
        self.assertEqual(locked.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(QuotationRecord.objects.get(pk=first.data['id']).total_amount, 'PHP 55,000.00')

    def test_declined_quotation_cannot_be_edited_without_resending(self):
        first = self.send('PHP 80,000.00')
        self.respond(first.data['id'], 'decline', 'No thanks.')
        self.client.force_authenticate(self.admin)
        response = self.client.patch(f"/api/services/quotations/{first.data['id']}/", {'payment_terms': 'Changed'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        quotation = QuotationRecord.objects.get(pk=first.data['id'])
        self.assertEqual(quotation.status, 'Rejected')
        self.assertEqual(quotation.client_response_note, 'No thanks.')
