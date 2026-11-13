from datetime import datetime, timezone as dt_timezone
from unittest import mock

from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceType
from users.models import User


class ClientRequestRulesTests(APITestCase):
    """Booking rules the server enforces for clients, whatever the page sends."""

    def setUp(self):
        self.client_user = User.objects.create_user(username='rules-client', password='pass', role='client')
        self.admin = User.objects.create_user(username='rules-admin', password='pass', role='superadmin')
        self.service_type = ServiceType.objects.create(name='Panel cleaning', description='x', estimated_duration=60, is_active=True)

    def payload(self, **overrides):
        data = {
            'service_type': self.service_type.id, 'description': 'Clean the panels.', 'priority': 'Normal',
            'location_address': 'Rule Street, Brgy. Pulo', 'location_city': 'Cabuyao', 'location_province': 'Laguna',
            'latitude': '14.27', 'longitude': '121.12', 'preferred_date': '2026-11-09',
        }
        data.update(overrides)
        return data

    def test_yesterday_in_the_philippines_is_refused_even_while_utc_is_still_on_that_day(self):
        # 23:30 UTC on 8 November is 07:30 on 9 November in the business timezone.
        early_morning = datetime(2026, 11, 8, 23, 30, tzinfo=dt_timezone.utc)
        self.client.force_authenticate(user=self.client_user)

        with mock.patch('django.utils.timezone.now', return_value=early_morning):
            yesterday = self.client.post('/api/services/service-requests/', self.payload(preferred_date='2026-11-08'), format='json')
            today = self.client.post('/api/services/service-requests/', self.payload(preferred_date='2026-11-09'), format='json')
            calendar = self.client.get('/api/services/service-requests/appointment-availability/')

        self.assertEqual(yesterday.status_code, 400, yesterday.data)
        self.assertIn('preferred_date', yesterday.data)
        self.assertEqual(today.status_code, 201, today.data)
        self.assertEqual(calendar.status_code, 200, calendar.data)
        self.assertEqual(calendar.data['start'], '2026-11-09')

    def test_ticket_api_returns_structured_fields_as_json_not_python_text(self):
        from django.utils import timezone

        from services.models import ServiceTicket

        service_request = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='x', priority='Normal', status='Completed',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request, status='Completed', priority='Normal', scheduled_date=timezone.localdate(),
            completion_proof_images=['https://example.test/media/done.png'],
            project_details={'system_capacity_kwp': '5.5'},
        )
        self.client.force_authenticate(user=self.client_user)

        data = self.client.get(f'/api/services/service-tickets/{ticket.id}/').data

        # Before the fix these came back as "['https://…']" and "{'system_capacity_kwp': …}" strings.
        self.assertEqual(data['completion_proof_images'], ['https://example.test/media/done.png'])
        self.assertEqual(data['project_details'], {'system_capacity_kwp': '5.5'})

    def test_a_client_cannot_book_outside_the_service_area(self):
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            '/api/services/service-requests/',
            self.payload(latitude='10.3157', longitude='123.8854', preferred_date='2030-01-15'),  # Cebu
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('service area', str(response.data['latitude']))
        self.assertFalse(ServiceRequest.objects.filter(client=self.client_user).exists())

    def test_reschedule_date_follows_the_business_day(self):
        from django.utils import timezone

        from services.models import ServiceTicket

        service_request = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='x', priority='Normal', status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request, status='Not Started', priority='Normal', scheduled_date=timezone.localdate(),
        )
        early_morning = datetime(2026, 11, 8, 23, 30, tzinfo=dt_timezone.utc)  # 07:30 on 9 November, UTC+8
        self.client.force_authenticate(user=self.client_user)
        url = f'/api/services/service-tickets/{ticket.id}/request_reschedule/'

        with mock.patch('django.utils.timezone.now', return_value=early_morning):
            yesterday = self.client.post(url, {'preferred_date': '2026-11-08', 'preferred_time_slot': 'morning', 'reason': 'Away'}, format='json')
            today = self.client.post(url, {'preferred_date': '2026-11-09', 'preferred_time_slot': 'morning', 'reason': 'Away'}, format='json')

        self.assertEqual(yesterday.status_code, 400, yesterday.data)
        self.assertEqual(today.status_code, 200, today.data)
        service_request.refresh_from_db()
        self.assertEqual(str(service_request.preferred_date), '2026-11-09')
