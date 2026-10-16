"""Guards for the canonical ticket status groups in services/ticket_status.py."""

from datetime import date

from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceTicket, ServiceType
from services.ticket_status import (
    ACTIVE_TICKET_STATUSES,
    ALL_TICKET_STATUSES,
    CLOSED_TICKET_STATUSES,
    COMPLETED_TICKET_STATUSES,
    FIELD_WORK_TICKET_STATUSES,
    SCHEDULED_LOAD_TICKET_STATUSES,
)
from users.models import User


class TicketStatusGroupTests(SimpleTestCase):
    def test_every_status_is_either_active_or_closed(self):
        # A new status added to STATUS_CHOICES must be placed deliberately; this fails until it is.
        self.assertEqual(set(ACTIVE_TICKET_STATUSES) | set(CLOSED_TICKET_STATUSES), set(ALL_TICKET_STATUSES))
        self.assertFalse(set(ACTIVE_TICKET_STATUSES) & set(CLOSED_TICKET_STATUSES))

    def test_groups_are_consistent(self):
        self.assertIn('Turned Over / Accepted', COMPLETED_TICKET_STATUSES)
        self.assertTrue(set(COMPLETED_TICKET_STATUSES) <= set(CLOSED_TICKET_STATUSES))
        self.assertTrue(set(FIELD_WORK_TICKET_STATUSES) <= set(ACTIVE_TICKET_STATUSES))
        self.assertNotIn('Cancelled', SCHEDULED_LOAD_TICKET_STATUSES)
        self.assertEqual(set(SCHEDULED_LOAD_TICKET_STATUSES), set(ALL_TICKET_STATUSES) - {'Cancelled'})


class ActiveQueueTests(APITestCase):
    def test_active_queue_excludes_handed_over_tickets(self):
        admin = User.objects.create_superuser(username='queue-admin', email='queue@x.test', password='pass', role='admin')
        client = User.objects.create_user(username='queue-client', password='pass', role='client')
        service = ServiceType.objects.create(name='Queue service', estimated_duration=60)
        tickets = {}
        for ticket_status in ['Not Started', 'Completed', 'Turned Over / Accepted', 'Cancelled']:
            request_obj = ServiceRequest.objects.create(client=client, service_type=service, description='Queue', status='Approved')
            tickets[ticket_status] = ServiceTicket.objects.create(request=request_obj, status=ticket_status, scheduled_date=date.today())
        self.client.force_authenticate(admin)

        response = self.client.get('/api/services/service-tickets/', {'queue': 'active', 'page_size': 50})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        returned = {row['id'] for row in rows}
        self.assertIn(tickets['Not Started'].id, returned)
        for closed in ['Completed', 'Turned Over / Accepted', 'Cancelled']:
            self.assertNotIn(tickets[closed].id, returned)
