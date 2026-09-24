"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class DashboardRoleTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='client1',
            password='pass',
            role='client',
            email='client1@example.com',
            phone='+15550000001',
            address='45 Client Street',
        )
        self.admin_user = User.objects.create_user(
            username='admin1',
            password='pass',
            role='admin'
        )
        self.operations_admin = User.objects.create_user(
            username='operations-admin1',
            password='pass',
            role='admin'
        )
        self.after_sales_admin = User.objects.create_user(
            username='after-sales-admin1',
            password='pass',
            role='admin'
        )
        self.technician_user = User.objects.create_user(
            username='tech1',
            password='pass',
            role='technician'
        )

        self.service_type = ServiceType.objects.create(
            name='Test Service',
            description='Test service',
            estimated_duration=60,
            color='#22c55e',
        )

        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Test request',
            priority='Normal',
            status='Pending'
        )

        self.service_location = ServiceLocation.objects.create(
            request=self.request_obj,
            address='123 Test St',
            city='Testville',
            province='Test',
            latitude=10.0,
            longitude=20.0,
        )

        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician_user,
            assigned_admin=self.operations_admin,
            scheduled_date=timezone.now().date(),
            status='Not Started',
            priority='Normal',
        )

        self.api_client = APIClient()

    def test_admin_dashboard(self):
        self.ticket.technician = None
        self.ticket.save(update_fields=['technician'])
        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/services/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'admin')
        self.assertIn('overview', response.data)
        self.assertEqual(response.data['overview']['total_tickets'], 1)
        self.assertIn('client_schedule', response.data)
        self.assertEqual(len(response.data['client_schedule']), 1)
        self.assertEqual(response.data['client_schedule'][0]['id'], self.ticket.id)
        self.assertEqual(response.data['overview']['unassigned_scheduled_jobs'], 1)

    def test_admin_stats_dashboard_prefers_full_names(self):
        self.client_user.first_name = 'Mia'
        self.client_user.last_name = 'Dela Cruz'
        self.client_user.save(update_fields=['first_name', 'last_name'])
        self.technician_user.first_name = 'Marco'
        self.technician_user.last_name = 'Reyes'
        self.technician_user.save(update_fields=['first_name', 'last_name'])

        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/dashboard/stats/', {'role': 'admin'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['client_schedule'][0]['client'], 'Mia Dela Cruz')
        self.assertEqual(response.data['client_schedule'][0]['assigned_technician'], 'Marco Reyes')

    def test_admin_dashboard_keeps_navigation_and_arrival_jobs_visible(self):
        self.api_client.force_authenticate(user=self.admin_user)

        for ticket_status, expected_progress, expected_label in (
            ('Navigating', 40, 'Technician en route'),
            ('Arrived on Site', 55, 'Technician on site'),
        ):
            self.ticket.status = ticket_status
            self.ticket.save(update_fields=['status'])

            response = self.api_client.get('/api/services/dashboard/')

            self.assertEqual(response.status_code, 200)
            job = next(
                item for item in response.data['operations']['active_technician_jobs']
                if item['id'] == self.ticket.id
            )
            self.assertEqual(job['progress'], expected_progress)
            self.assertEqual(job['progress_label'], expected_label)
            self.assertEqual(job['progress_basis'], 'workflow_status')
            self.assertFalse(job['progress_paused'])
            self.assertEqual(job['progress_track'], 'service')
            self.assertEqual(job['progress_track_label'], 'Service job')

    def test_inspection_ticket_uses_its_own_progress_track(self):
        self.ticket.ticket_type = 'inspection'
        self.api_client.force_authenticate(user=self.admin_user)

        for ticket_status, expected_progress, expected_label in (
            ('For Inspection', 15, 'Ready for inspection'),
            ('Navigating', 35, 'Inspector en route'),
            ('Arrived on Site', 55, 'Inspector on site'),
            ('In Progress', 75, 'Inspection underway'),
            ('Inspection Completed', 90, 'Inspection submitted for review'),
        ):
            self.ticket.status = ticket_status
            self.ticket.save(update_fields=['ticket_type', 'status'])

            response = self.api_client.get('/api/services/dashboard/')

            self.assertEqual(response.status_code, 200)
            job = next(
                item for item in response.data['operations']['active_technician_jobs']
                if item['id'] == self.ticket.id
            )
            self.assertEqual(job['progress'], expected_progress)
            self.assertEqual(job['progress_label'], expected_label)
            self.assertEqual(job['progress_track'], 'inspection')
            self.assertEqual(job['progress_track_label'], 'Inspection visit')

    def test_admin_dashboard_hold_preserves_last_recorded_stage(self):
        ServiceStatusHistory.objects.create(
            ticket=self.ticket,
            status='In Progress',
            changed_by=self.technician_user,
            notes='Work started.',
        )
        ServiceStatusHistory.objects.create(
            ticket=self.ticket,
            status='On Hold',
            changed_by=self.technician_user,
            notes='Waiting for safe access.',
        )
        self.ticket.status = 'On Hold'
        self.ticket.start_time = timezone.now() - timedelta(hours=12)
        self.ticket.save(update_fields=['status', 'start_time'])
        self.api_client.force_authenticate(user=self.admin_user)

        response = self.api_client.get('/api/services/dashboard/')

        self.assertEqual(response.status_code, 200)
        job = next(
            item for item in response.data['operations']['active_technician_jobs']
            if item['id'] == self.ticket.id
        )
        self.assertEqual(job['progress'], 70)
        self.assertEqual(job['progress_label'], 'Paused — Work underway')
        self.assertTrue(job['progress_paused'])

    def test_ticket_api_exposes_same_canonical_workflow_progress(self):
        self.ticket.status = 'Arrived on Site'
        self.ticket.save(update_fields=['status'])
        self.api_client.force_authenticate(user=self.client_user)

        response = self.api_client.get(f'/api/services/service-tickets/{self.ticket.id}/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['workflow_progress'], 55)
        self.assertEqual(response.data['workflow_progress_label'], 'Technician on site')
        self.assertEqual(response.data['workflow_progress_basis'], 'workflow_status')
        self.assertFalse(response.data['workflow_progress_paused'])
        self.assertEqual(response.data['workflow_progress_track'], 'service')
        self.assertEqual(response.data['workflow_progress_track_label'], 'Service job')

    def test_client_can_submit_multiple_services_in_one_request(self):
        second_service = ServiceType.objects.create(
            name='Battery Inspection',
            description='Battery inspection',
            estimated_duration=45,
        )

        self.api_client.force_authenticate(user=self.client_user)
        response = self.api_client.post('/api/services/service-requests/', {
            'service_type': self.service_type.id,
            'service_types': [self.service_type.id, second_service.id],
            'description': 'Please handle both services together.',
            'priority': 'Normal',
            'preferred_date': (timezone.localdate() + timedelta(days=1)).isoformat(),
            'location_address': '123 Test St',
            'location_city': 'Testville',
            'location_province': 'Test',
            'latitude': '10.000000',
            'longitude': '20.000000',
        }, format='json')

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['service_summary'], 'Test Service, Battery Inspection')
        self.assertEqual(len(response.data['service_items']), 2)
        request_obj = ServiceRequest.objects.get(pk=response.data['id'])
        self.assertEqual(request_obj.service_items.count(), 2)

    def test_admin_calendar_uses_ticket_and_request_database_rows(self):
        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/admin/calendar/', {
            'start': self.ticket.scheduled_date.isoformat(),
            'end': self.ticket.scheduled_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['events']), 1)
        event = response.data['events'][0]
        self.assertEqual(event['entity_type'], 'ticket')
        self.assertEqual(event['ticket_id'], self.ticket.id)
        self.assertEqual(event['request_id'], self.request_obj.id)
        self.assertEqual(event['client'], 'client1')
        self.assertEqual(event['service_type'], 'Test Service')
        self.assertEqual(event['service_type_color'], '#22c55e')
        self.assertEqual(event['calendar_status'], 'pending_approval')
        self.assertEqual(event['assignment_status'], 'assigned')
        self.assertEqual(event['assigned_technician'], 'tech1')

    def test_admin_calendar_marks_past_unassigned_ticket_as_missed_dispatch(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Past unassigned request',
            priority='Normal',
            status='Approved',
        )
        scheduled_date = timezone.localdate() - timedelta(days=1)
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=None,
            scheduled_date=scheduled_date,
            status='Not Started',
            priority='Normal',
        )

        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/admin/calendar/', {
            'start': scheduled_date.isoformat(),
            'end': scheduled_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        event = next(item for item in response.data['events'] if item['ticket_id'] == ticket.id)
        self.assertEqual(event['calendar_status'], 'missed_dispatch')
        self.assertEqual(event['dispatch_status'], 'missed_dispatch')
        self.assertTrue(event['is_missed_dispatch'])

    def test_admin_calendar_request_event_includes_scheduling_notes(self):
        preferred_date = timezone.localdate() + timedelta(days=7)
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Request awaiting approval',
            scheduling_notes='Client is available after 1 PM.',
            preferred_date=preferred_date,
            priority='Normal',
            status='Pending',
        )

        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/admin/calendar/', {
            'start': preferred_date.isoformat(),
            'end': preferred_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        event = next(item for item in response.data['events'] if item['request_id'] == request_obj.id)
        self.assertEqual(event['entity_type'], 'request')
        self.assertEqual(event['scheduling_notes'], 'Client is available after 1 PM.')

    def test_admin_calendar_keeps_completed_and_hides_cancelled_tickets(self):
        self.ticket.status = 'Completed'
        self.ticket.completed_date = timezone.now()
        self.ticket.save(update_fields=['status', 'completed_date'])

        cancelled_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Cancelled service',
            priority='Normal',
            status='Approved',
        )
        cancelled_ticket = ServiceTicket.objects.create(
            request=cancelled_request,
            technician=self.technician_user,
            scheduled_date=self.ticket.scheduled_date,
            status='Cancelled',
            priority='Normal',
        )
        old_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Old completed service',
            priority='Normal',
            status='Approved',
        )
        old_date = timezone.localdate() - timedelta(days=45)
        old_completed_ticket = ServiceTicket.objects.create(
            request=old_request,
            technician=self.technician_user,
            scheduled_date=old_date,
            status='Completed',
            priority='Normal',
            completed_date=timezone.now() - timedelta(days=45),
        )

        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/admin/calendar/', {
            'start': old_date.isoformat(),
            'end': self.ticket.scheduled_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        ticket_ids = {event['ticket_id'] for event in response.data['events'] if event['ticket_id']}
        completed_event = next(event for event in response.data['events'] if event['ticket_id'] == self.ticket.id)
        self.assertIn(self.ticket.id, ticket_ids)
        self.assertEqual(completed_event['calendar_status'], 'completed')
        self.assertNotIn(cancelled_ticket.id, ticket_ids)
        self.assertNotIn(old_completed_ticket.id, ticket_ids)

        history_response = self.api_client.get('/api/admin/calendar/', {
            'start': old_date.isoformat(),
            'end': self.ticket.scheduled_date.isoformat(),
            'show_completed': '1',
        })

        self.assertEqual(history_response.status_code, 200)
        history_ticket_ids = {
            event['ticket_id'] for event in history_response.data['events'] if event['ticket_id']
        }
        self.assertIn(old_completed_ticket.id, history_ticket_ids)

    def test_admin_calendar_does_not_show_request_fallback_when_ticket_exists_outside_range(self):
        preferred_date = timezone.localdate() + timedelta(days=3)
        scheduled_date = preferred_date + timedelta(days=35)
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Rescheduled request',
            priority='Normal',
            status='Approved',
            preferred_date=preferred_date,
        )
        ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            assigned_admin=self.operations_admin,
            scheduled_date=scheduled_date,
            status='Not Started',
            priority='Normal',
        )

        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/admin/calendar/', {
            'start': preferred_date.isoformat(),
            'end': preferred_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        self.assertFalse(any(event['request_id'] == request_obj.id for event in response.data['events']))

    def test_non_admin_cannot_access_admin_calendar(self):
        self.api_client.force_authenticate(user=self.technician_user)
        response = self.api_client.get('/api/admin/calendar/')

        self.assertEqual(response.status_code, 403)

    def test_operations_dashboard_alias_uses_admin_workspace(self):
        self.api_client.force_authenticate(user=self.operations_admin)
        response = self.api_client.get('/api/services/dashboard/', {'role': 'supervisor'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'admin')
        self.assertIn('operations', response.data)
        self.assertEqual(response.data['overview']['team_tickets'], 1)
        self.assertEqual(len(response.data['operations']['technician_performance']), 1)

    def test_technician_dashboard(self):
        self.api_client.force_authenticate(user=self.technician_user)
        response = self.api_client.get('/api/services/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'technician')
        self.assertEqual(response.data['overview']['total_assigned'], 1)
        # ensure active ticket appears in active_work
        self.assertEqual(len(response.data['active_work']), 1)
        self.assertEqual(response.data['active_work'][0]['id'], self.ticket.id)

    def test_operations_dashboard_alias_lists_tickets(self):
        self.api_client.force_authenticate(user=self.operations_admin)
        response = self.api_client.get('/api/services/dashboard/', {'role': 'operations'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'admin')
        self.assertEqual(response.data['overview']['team_tickets'], 1)
        self.assertTrue(any(t['id'] == self.ticket.id for t in response.data['operations']['recent_tickets']))

    def test_invalid_role_returns_bad_request(self):
        unknown_user = User.objects.create_user(
            username='unknown',
            password='pass',
            role='client'
        )
        # monkeypatch role to invalid role for runtime behavior
        unknown_user.role = 'ghost'
        unknown_user.save()

        self.api_client.force_authenticate(user=unknown_user)
        response = self.api_client.get('/api/services/dashboard/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid role', response.data['error'])

    def test_client_dashboard_with_data(self):
        self.api_client.force_authenticate(user=self.client_user)
        response = self.api_client.get('/api/services/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'client')
        self.assertEqual(response.data['status_breakdown']['pending'], 1)

    def test_client_dashboard_no_requests_boundary(self):
        client2 = User.objects.create_user(
            username='client2',
            password='pass',
            role='client'
        )
        self.api_client.force_authenticate(user=client2)
        response = self.api_client.get('/api/services/dashboard/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'client')
        self.assertEqual(response.data['status_breakdown']['pending'], 0)

    def test_follow_up_dashboard(self):
        self.ticket.status = 'Completed'
        self.ticket.completed_date = timezone.now()
        self.ticket.save(update_fields=['status', 'completed_date'])
        candidate_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Second completed request',
            priority='Normal',
            status='Completed'
        )
        ServiceLocation.objects.create(
            request=candidate_request,
            address='456 Callback Ave',
            city='Followup City',
            province='Metro Manila',
            latitude=11.0,
            longitude=21.0,
        )
        candidate_ticket = ServiceTicket.objects.create(
            request=candidate_request,
            scheduled_date=timezone.now().date(),
            status='Completed',
            priority='Normal',
            completed_date=timezone.now(),
        )
        case = FollowUpCase.objects.create(
            service_ticket=self.ticket,
            client=self.client_user,
            assigned_to=self.after_sales_admin,
            created_by=self.admin_user,
            case_type='follow_up',
            status='open',
            priority='normal',
            summary='Customer requested a callback'
        )

        self.api_client.force_authenticate(user=self.after_sales_admin)
        response = self.api_client.get('/api/services/dashboard/', {'role': 'follow_up'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'admin')
        self.assertEqual(response.data['overview']['total_cases'], 1)
        self.assertEqual(response.data['after_sales']['recent_cases'][0]['id'], case.id)
        self.assertEqual(response.data['after_sales']['recent_cases'][0]['client'], 'client1')

    def test_business_display_normalization_uses_singapore_time(self):
        from django.conf import settings as django_settings
        from services.views_dashboard import get_business_now, get_business_today

        self.assertEqual(django_settings.TIME_ZONE, 'UTC')
        self.assertEqual(django_settings.BUSINESS_DISPLAY_TIMEZONE, 'Asia/Singapore')
        self.assertEqual(str(get_business_now().tzinfo), 'Asia/Singapore')
        self.assertIsNotNone(get_business_today())

        self.api_client.force_authenticate(user=self.admin_user)
        response = self.api_client.get('/api/services/dashboard/')
        self.assertEqual(response.status_code, 200)
