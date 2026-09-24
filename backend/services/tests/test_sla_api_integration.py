"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class SLAApiIntegrationTests(APITestCase):
    def setUp(self):
        self.now = timezone.make_aware(datetime(2026, 3, 22, 10, 0, 0))
        self.admin_user = User.objects.create_user(
            username='sla-admin',
            password='pass',
            role='admin',
        )
        self.supervisor_user = User.objects.create_user(
            username='sla-supervisor',
            password='pass',
            role='admin',
        )
        self.client_user = User.objects.create_user(
            username='sla-api-client',
            password='pass',
            role='client',
        )
        self.technician_user = User.objects.create_user(
            username='sla-api-tech',
            password='pass',
            role='technician',
        )
        self.service_type = ServiceType.objects.create(
            name='SLA API Service',
            description='SLA serializer coverage',
            estimated_duration=60,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Request awaiting approval',
            priority='Normal',
            status='Pending',
        )
        self.warning_ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician_user,
            assigned_admin=self.supervisor_user,
            scheduled_date=self.now.date(),
            scheduled_time=(self.now - timedelta(minutes=20)).time(),
            status='Not Started',
            priority='Normal',
        )
        self.execution_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Execution delay ticket',
            priority='Normal',
            status='In Progress',
        )
        self.execution_ticket = ServiceTicket.objects.create(
            request=self.execution_request,
            technician=self.technician_user,
            assigned_admin=self.supervisor_user,
            scheduled_date=self.now.date(),
            scheduled_time=time(hour=8, minute=30),
            status='In Progress',
            priority='Normal',
            start_time=self.now - timedelta(minutes=100),
        )

        ServiceRequest.objects.filter(pk=self.request_obj.pk).update(
            request_date=self.now - timedelta(hours=9),
        )
        ServiceTicket.objects.filter(pk=self.warning_ticket.pk).update(
            created_at=self.now - timedelta(hours=1),
        )
        self.request_obj.refresh_from_db()
        self.warning_ticket.refresh_from_db()
        self.execution_ticket.refresh_from_db()

        self.client.force_authenticate(user=self.admin_user)

    def test_service_request_list_includes_sla_payload(self):
        with patch('services.sla.timezone.now', return_value=self.now):
            response = self.client.get('/api/services/service-requests/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_request = response.data['results'][0]
        self.assertIn('sla', first_request)
        self.assertEqual(first_request['sla']['rule'], 'approval_delay')
        self.assertEqual(first_request['sla']['state'], 'overdue')

    def test_service_ticket_list_includes_sla_payload(self):
        with patch('services.sla.timezone.now', return_value=self.now):
            response = self.client.get('/api/services/service-tickets/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        first_ticket = response.data['results'][0]
        self.assertIn('sla', first_ticket)
        self.assertIn(first_ticket['sla']['rule'], {'start_delay', 'execution_delay'})
        self.assertIn(first_ticket['sla']['state'], {'warning', 'overdue'})

    def test_unassigned_past_scheduled_ticket_is_missed_dispatch(self):
        past_ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=None,
            scheduled_date=self.now.date() - timedelta(days=1),
            status='Not Started',
            priority='Normal',
        )

        state = get_ticket_dispatch_state(past_ticket, now=self.now)

        self.assertTrue(state['is_missed_dispatch'])
        self.assertEqual(state['status'], 'missed_dispatch')
        self.assertEqual(state['action'], 'Assign technician or reschedule')

        with patch('services.sla.timezone.now', return_value=self.now):
            response = self.client.get('/api/services/service-tickets/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        serialized_ticket = next(
            item for item in response.data['results']
            if item['id'] == past_ticket.id
        )
        self.assertTrue(serialized_ticket['is_missed_dispatch'])
        self.assertEqual(serialized_ticket['dispatch_status'], 'missed_dispatch')

    def test_admin_dashboard_includes_sla_overview_and_queue(self):
        with patch('services.views_dashboard.process_maintenance_alerts'):
            with patch('services.views_dashboard.timezone.now', return_value=self.now):
                response = self.client.get('/api/services/dashboard/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('sla_overview', response.data)
        self.assertIn('sla_queue', response.data)
        self.assertEqual(response.data['sla_overview']['approval_risk'], 1)
        self.assertEqual(response.data['sla_overview']['start_delay_risk'], 1)
        self.assertEqual(response.data['sla_overview']['execution_risk'], 1)
        self.assertEqual(response.data['sla_overview']['overdue_count'], 1)
        self.assertEqual(response.data['sla_overview']['warning_count'], 2)
        self.assertEqual(response.data['sla_queue'][0]['entity_type'], 'request')
        self.assertEqual(response.data['sla_queue'][0]['sla']['state'], 'overdue')

    def test_admin_dashboard_alias_includes_team_sla_summary(self):
        self.client.force_authenticate(user=self.supervisor_user)

        with patch('services.views_dashboard.timezone.now', return_value=self.now):
            response = self.client.get('/api/services/dashboard/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('sla_overview', response.data)
        self.assertEqual(response.data['sla_overview']['start_delay_risk'], 1)
        self.assertEqual(response.data['sla_overview']['execution_risk'], 1)
        self.assertEqual(len(response.data['sla_queue']), 3)
