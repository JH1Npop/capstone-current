"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class ServiceStatusHistoryAccessTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(username='history_admin', password='pass', role='admin')
        self.client_user = User.objects.create_user(username='history_client', password='pass', role='client')
        self.other_client = User.objects.create_user(username='history_other_client', password='pass', role='client')
        self.technician_user = User.objects.create_user(username='history_tech', password='pass', role='technician')
        self.service_type = ServiceType.objects.create(
            name='History Service',
            description='Timeline history service',
            estimated_duration=60,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Visible request',
            priority='Normal',
            status='Approved',
        )
        self.other_request = ServiceRequest.objects.create(
            client=self.other_client,
            service_type=self.service_type,
            description='Hidden request',
            priority='Normal',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )
        self.other_ticket = ServiceTicket.objects.create(
            request=self.other_request,
            technician=None,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )
        self.visible_event = ServiceStatusHistory.objects.create(
            ticket=self.ticket,
            status='Assigned',
            changed_by=self.admin_user,
            notes='Technician assigned.',
        )
        self.hidden_event = ServiceStatusHistory.objects.create(
            ticket=self.other_ticket,
            status='Not Started',
            changed_by=self.admin_user,
            notes='Other client event.',
        )

    def history_results(self, response):
        return response.data.get('results', response.data)

    def test_status_history_can_be_filtered_to_one_ticket(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get('/api/services/status-history/', {'ticket': self.ticket.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([event['id'] for event in self.history_results(response)], [self.visible_event.id])

    def test_client_status_history_filter_does_not_leak_other_tickets(self):
        self.client.force_authenticate(user=self.client_user)

        own_response = self.client.get('/api/services/status-history/', {'ticket': self.ticket.id})
        other_response = self.client.get('/api/services/status-history/', {'ticket': self.other_ticket.id})

        self.assertEqual(own_response.status_code, status.HTTP_200_OK)
        self.assertEqual([event['id'] for event in self.history_results(own_response)], [self.visible_event.id])
        self.assertEqual(other_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.history_results(other_response), [])
