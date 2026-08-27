from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceTicket, ServiceType
from users.models import ActivityLog, User, UserCapabilityGrant
from users.rbac import (
    PUBLIC_SITE_VIEW,
    SERVICE_REQUEST_REVIEW,
    SERVICE_TICKET_MANAGE,
    SUPERVISOR_TICKETS_VIEW,
)


class RequestTicketCapabilityTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='workflow-client', password='pass', role='client'
        )
        self.service_type = ServiceType.objects.create(
            name='Solar Assessment', estimated_duration=120
        )
        self.pending_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Assess the property for solar.',
            status='Pending',
        )
        self.approved_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Install an approved solar design.',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.approved_request,
            scheduled_date=timezone.localdate(),
        )

    def create_admin(self, username, capability):
        user = User.objects.create_user(username=username, password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=user, capability_code=capability)
        return user

    def test_ticket_viewer_can_read_but_cannot_review_or_edit(self):
        user = self.create_admin('ticket-viewer', SUPERVISOR_TICKETS_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(
            self.client.get('/api/services/service-requests/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get('/api/services/service-tickets/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.post(
                f'/api/services/service-requests/{self.pending_request.id}/approve/', {}, format='json'
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                f'/api/services/service-tickets/{self.ticket.id}/',
                {'priority': 'High'},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_request_reviewer_can_approve_only_pending_requests(self):
        user = self.create_admin('request-reviewer', SERVICE_REQUEST_REVIEW)
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        url = f'/api/services/service-requests/{self.pending_request.id}/approve/'

        self.assertEqual(self.client.post(url, {}, format='json').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(url, {}, format='json').status_code, status.HTTP_400_BAD_REQUEST)
        self.pending_request.refresh_from_db()
        self.assertEqual(self.pending_request.status, 'Approved')
        audit_log = ActivityLog.objects.filter(
            target_model='servicerequest',
            target_id=self.pending_request.id,
        ).latest('created_at')
        self.assertEqual(audit_log.actor, user)
        self.assertEqual(audit_log.metadata['old_value'], 'Pending')
        self.assertEqual(audit_log.metadata['new_value'], 'Approved')
        self.assertEqual(audit_log.metadata['reason'], 'Approved after admin review.')

    def test_request_reviewer_can_reject_only_pending_requests(self):
        user = self.create_admin('request-rejector', SERVICE_REQUEST_REVIEW)
        self.client.force_authenticate(user)
        pending = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Second assessment request.',
        )
        url = f'/api/services/service-requests/{pending.id}/reject/'

        self.assertEqual(
            self.client.post(url, {'reason': 'Outside service area.'}, format='json').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.post(url, {'reason': 'Again'}, format='json').status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_ticket_manager_can_read_and_edit_ticket(self):
        user = self.create_admin('ticket-manager', SERVICE_TICKET_MANAGE)
        self.client.force_authenticate(user)

        self.assertEqual(
            self.client.get('/api/services/service-tickets/').status_code,
            status.HTTP_200_OK,
        )
        response = self.client.patch(
            f'/api/services/service-tickets/{self.ticket.id}/',
            {'priority': 'High'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.priority, 'High')
        invalid_status_response = self.client.patch(
            f'/api/services/service-tickets/{self.ticket.id}/',
            {'status': 'Completed'},
            format='json',
        )
        self.assertEqual(invalid_status_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'Not Started')

    def test_request_status_cannot_bypass_decision_actions(self):
        user = self.create_admin('request-patcher', SERVICE_REQUEST_REVIEW)
        self.client.force_authenticate(user)

        response = self.client.patch(
            f'/api/services/service-requests/{self.pending_request.id}/',
            {'status': 'Completed'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.pending_request.refresh_from_db()
        self.assertEqual(self.pending_request.status, 'Pending')

    def test_unrelated_configured_admin_cannot_read_or_mutate_workflow(self):
        user = self.create_admin('landing-only', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(
            self.client.get('/api/services/service-requests/').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get('/api/services/service-tickets/').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f'/api/services/service-requests/{self.pending_request.id}/cancel/', {}, format='json'
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
