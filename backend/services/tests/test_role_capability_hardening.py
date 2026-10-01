from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from progress.models import TicketProgress
from services.models import AfterSalesCase, ServiceRequest, ServiceTicket, ServiceType
from users.models import User, UserCapabilityGrant
from users.rbac import (
    AFTER_SALES_CASES_MANAGE,
    AFTER_SALES_CASES_VIEW,
    ANALYTICS_VIEW,
    REPORTS_VIEW,
    SERVICE_TICKET_MANAGE,
    SUPERVISOR_TRACKING_VIEW,
    USER_MANAGEMENT_MANAGE,
)


class LegacyAdminEndpointCapabilityTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='role-boundary-client',
            password='pass',
            role='client',
        )
        self.technician = User.objects.create_user(
            username='role-boundary-technician',
            password='pass',
            role='technician',
        )
        self.service_type = ServiceType.objects.create(name='Role Boundary Service')
        self.service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Capability boundary request',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate(),
            status='Completed',
            completed_date=timezone.now(),
        )
        self.case = AfterSalesCase.objects.create(
            service_ticket=self.ticket,
            client=self.client_user,
            case_type='follow_up',
            status='open',
            summary='Capability boundary case',
        )
        TicketProgress.objects.create(
            ticket=self.ticket,
            updated_by=self.technician,
            progress_status='Completed',
        )

    def create_scoped_admin(self, username, *capabilities):
        user = User.objects.create_user(username=username, password='pass', role='admin')
        for capability in capabilities:
            UserCapabilityGrant.objects.create(user=user, capability_code=capability)
        return user

    def test_analytics_only_admin_cannot_call_unrelated_legacy_admin_apis(self):
        user = self.create_scoped_admin('analytics-only-admin', ANALYTICS_VIEW)
        self.client.force_authenticate(user=user)

        requests = [
            ('delete', f'/api/services/follow-up-cases/{self.case.id}/', None),
            ('post', '/api/services/service-locations/', {'request': self.service_request.id}),
            ('post', '/api/services/technician-skills/', {
                'technician': self.technician.id,
                'service_type': self.service_type.id,
                'skill_level': 'expert',
            }),
            ('post', '/api/services/inspections/', {'ticket': self.ticket.id}),
            ('get', '/api/progress/ticket-progress/report/', None),
            ('post', '/api/progress/ticket-progress/', {
                'ticket': self.ticket.id,
                'progress_status': 'Unauthorized update',
            }),
            ('get', '/api/services/gis-dashboard/dashboard_data/', None),
        ]

        for method, path, payload in requests:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, payload, format='json')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_after_sales_view_does_not_allow_case_deletion(self):
        viewer = self.create_scoped_admin('after-sales-viewer', AFTER_SALES_CASES_VIEW)
        self.client.force_authenticate(user=viewer)

        response = self.client.delete(f'/api/services/follow-up-cases/{self.case.id}/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(AfterSalesCase.objects.filter(pk=self.case.pk).exists())

    def test_after_sales_manager_reaches_preserved_audit_trail_delete_guard(self):
        manager = self.create_scoped_admin('after-sales-manager', AFTER_SALES_CASES_MANAGE)
        self.client.force_authenticate(user=manager)

        response = self.client.delete(f'/api/services/follow-up-cases/{self.case.id}/')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(AfterSalesCase.objects.filter(pk=self.case.pk).exists())

    def test_ticket_manager_can_mutate_ticket_operational_records(self):
        manager = self.create_scoped_admin('ticket-manager', SERVICE_TICKET_MANAGE)
        self.client.force_authenticate(user=manager)

        location_response = self.client.post('/api/services/service-locations/', {
            'request': self.service_request.id,
            'address': '123 Capability Street',
            'city': 'Lucena City',
            'province': 'Quezon',
        }, format='json')
        progress_response = self.client.post('/api/progress/ticket-progress/', {
            'ticket': self.ticket.id,
            'progress_status': 'Manager update',
        }, format='json')
        inspection_response = self.client.post('/api/services/inspections/', {}, format='json')

        self.assertEqual(location_response.status_code, status.HTTP_201_CREATED, location_response.data)
        self.assertEqual(progress_response.status_code, status.HTTP_201_CREATED, progress_response.data)
        self.assertEqual(inspection_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_report_and_tracking_capabilities_open_only_their_legacy_reads(self):
        reports_admin = self.create_scoped_admin('reports-admin', REPORTS_VIEW)
        tracking_admin = self.create_scoped_admin('tracking-admin', SUPERVISOR_TRACKING_VIEW)

        self.client.force_authenticate(user=reports_admin)
        self.assertEqual(self.client.get('/api/progress/ticket-progress/report/').status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.get('/api/services/gis-dashboard/dashboard_data/').status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(user=tracking_admin)
        self.assertEqual(
            self.client.get('/api/services/gis-dashboard/dashboard_data/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(self.client.get('/api/progress/ticket-progress/report/').status_code, status.HTTP_403_FORBIDDEN)

    def test_user_manager_cannot_change_technician_skills_outside_superadmin_flow(self):
        user_manager = self.create_scoped_admin('user-manager', USER_MANAGEMENT_MANAGE)
        self.client.force_authenticate(user=user_manager)

        response = self.client.post('/api/services/technician-skills/', {
            'technician': self.technician.id,
            'service_type': self.service_type.id,
            'skill_level': 'expert',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_can_change_technician_skills(self):
        superadmin = User.objects.create_user(
            username='role-boundary-superadmin',
            password='pass',
            role='superadmin',
        )
        self.client.force_authenticate(user=superadmin)

        response = self.client.post('/api/services/technician-skills/', {
            'technician': self.technician.id,
            'service_type': self.service_type.id,
            'skill_level': 'expert',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
