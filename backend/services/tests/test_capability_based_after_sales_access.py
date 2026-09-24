"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class CapabilityBasedAfterSalesAccessTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='capability_admin',
            password='pass',
            role='admin',
        )
        self.capability_user = User.objects.create_user(
            username='capability_user',
            password='pass',
            role='admin',
        )
        self.client_user = User.objects.create_user(
            username='capability_client',
            password='pass',
            role='client',
            email='capability-client@example.com',
            phone='+15550000003',
            address='88 Capability Street',
        )
        self.service_type = ServiceType.objects.create(
            name='Capability Service',
            description='Capability-based follow-up access test',
            estimated_duration=60,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request for capability test',
            priority='Normal',
            status='Completed',
        )
        ServiceLocation.objects.create(
            request=self.request_obj,
            address='500 Capability Avenue',
            city='Pasig',
            province='Metro Manila',
            latitude=14.5764,
            longitude=121.0851,
        )
        self.completed_ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            scheduled_date=timezone.now().date(),
            status='Completed',
            priority='Normal',
            completed_date=timezone.now(),
        )

        for capability_code in (
            AFTER_SALES_DASHBOARD_VIEW,
            AFTER_SALES_CASES_VIEW,
            AFTER_SALES_CASES_MANAGE,
        ):
            UserCapabilityGrant.objects.create(
                user=self.capability_user,
                capability_code=capability_code,
                granted_by=self.admin_user,
            )

    def test_after_sales_only_user_uses_case_workspace_not_full_dashboard(self):
        self.client.force_authenticate(user=self.capability_user)

        dashboard_response = self.client.get('/api/dashboard/stats/', {'role': 'follow_up'})
        cases_response = self.client.get('/api/services/follow-up-cases/')

        self.assertEqual(dashboard_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(cases_response.status_code, status.HTTP_200_OK)

    def test_capability_granted_user_can_manage_follow_up_cases(self):
        self.client.force_authenticate(user=self.capability_user)

        response = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': self.completed_ticket.id,
                'case_type': 'follow_up',
                'status': 'open',
                'priority': 'normal',
                'summary': 'Capability-based after-sales case',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['client_email'], 'capability-client@example.com')

    def test_capability_granted_user_can_request_after_sales_ticket_workspace(self):
        turned_over_ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            scheduled_date=timezone.localdate(),
            status='Turned Over / Accepted',
            priority='Normal',
            completed_date=timezone.now(),
        )
        self.client.force_authenticate(user=self.capability_user)

        response = self.client.get('/api/services/service-tickets/', {'workspace': 'after_sales'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket_results = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual({ticket['id'] for ticket in ticket_results}, {
            self.completed_ticket.id,
            turned_over_ticket.id,
        })
