from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User

from .models import TicketProgress


class TicketProgressAccessTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='progress_admin',
            password='StrongPass123!',
            role='admin',
            email_verified=True,
        )
        self.client_user = User.objects.create_user(
            username='progress_client',
            password='StrongPass123!',
            role='client',
            email_verified=True,
        )
        self.other_client = User.objects.create_user(
            username='other_progress_client',
            password='StrongPass123!',
            role='client',
            email_verified=True,
        )
        self.lead = User.objects.create_user(
            username='progress_lead',
            password='StrongPass123!',
            role='technician',
            email_verified=True,
        )
        self.crew = User.objects.create_user(
            username='progress_crew',
            password='StrongPass123!',
            role='technician',
            email_verified=True,
        )
        self.unassigned = User.objects.create_user(
            username='progress_unassigned',
            password='StrongPass123!',
            role='technician',
            email_verified=True,
        )

        service_type = ServiceType.objects.create(name='Progress Test Service')
        request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=service_type,
            description='Owned progress test request',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=request,
            technician=self.lead,
            assigned_admin=self.admin,
            scheduled_date=timezone.localdate(),
        )
        TicketCrewAssignment.objects.create(ticket=self.ticket, technician=self.crew)
        self.progress = TicketProgress.objects.create(
            ticket=self.ticket,
            updated_by=self.lead,
            progress_status='Assigned',
            comment='Initial assignment',
        )

        other_request = ServiceRequest.objects.create(
            client=self.other_client,
            service_type=service_type,
            description='Other progress test request',
            status='Approved',
        )
        other_ticket = ServiceTicket.objects.create(
            request=other_request,
            technician=self.unassigned,
            assigned_admin=self.admin,
            scheduled_date=timezone.localdate(),
        )
        self.other_progress = TicketProgress.objects.create(
            ticket=other_ticket,
            updated_by=self.unassigned,
            progress_status='Assigned',
        )

        self.list_url = reverse('ticketprogress-list')

    def authenticate(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_client_can_only_read_progress_for_owned_tickets(self):
        self.authenticate(self.client_user)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        result_ids = {item['id'] for item in response.data['results']}
        self.assertEqual(result_ids, {self.progress.id})

    def test_client_cannot_create_progress(self):
        self.authenticate(self.client_user)

        response = self.client.post(self.list_url, {
            'ticket': self.ticket.id,
            'progress_status': 'Client supplied update',
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unassigned_technician_cannot_create_progress(self):
        self.authenticate(self.unassigned)

        response = self.client.post(self.list_url, {
            'ticket': self.ticket.id,
            'progress_status': 'Unauthorized update',
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lead_and_crew_can_append_progress_for_assigned_ticket(self):
        for user in (self.lead, self.crew):
            with self.subTest(user=user.username):
                self.authenticate(user)
                response = self.client.post(self.list_url, {
                    'ticket': self.ticket.id,
                    'progress_status': f'Update by {user.username}',
                    'updated_by': self.admin.id,
                })

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                created = TicketProgress.objects.get(pk=response.data['id'])
                self.assertEqual(created.updated_by, user)

    def test_admin_can_append_progress(self):
        self.authenticate(self.admin)

        response = self.client.post(self.list_url, {
            'ticket': self.ticket.id,
            'progress_status': 'Administrative update',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(TicketProgress.objects.get(pk=response.data['id']).updated_by, self.admin)

    def test_progress_records_cannot_be_edited_or_deleted(self):
        self.authenticate(self.admin)
        detail_url = reverse('ticketprogress-detail', args=[self.progress.id])

        patch_response = self.client.patch(detail_url, {'comment': 'Rewritten history'})
        delete_response = self.client.delete(detail_url)

        self.assertEqual(patch_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(delete_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.progress.refresh_from_db()
        self.assertEqual(self.progress.comment, 'Initial assignment')
