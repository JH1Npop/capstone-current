"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class FollowUpCaseApiTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='follow-up-client',
            password='pass',
            role='client',
            email='followup-client@example.com',
            phone='+15550000002',
            address='100 Queue Lane',
        )
        self.admin_user = User.objects.create_user(
            username='follow-up-admin',
            password='pass',
            role='admin',
        )
        self.service_type = ServiceType.objects.create(
            name='Maintenance',
            description='Maintenance service',
            estimated_duration=45,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Routine maintenance request',
            priority='Normal',
            status='Completed',
        )
        ServiceLocation.objects.create(
            request=self.request_obj,
            address='321 Service Road',
            city='Makati',
            province='Metro Manila',
            latitude=14.554700,
            longitude=121.024400,
        )
        self.completed_ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=None,
            assigned_admin=None,
            scheduled_date=timezone.now().date(),
            status='Completed',
            priority='Normal',
            completed_date=timezone.now(),
        )
        self.pending_ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=None,
            assigned_admin=None,
            scheduled_date=timezone.now().date(),
            status='Not Started',
            priority='Normal',
        )

    def test_admin_can_create_case_for_completed_ticket(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': self.completed_ticket.id,
                'case_type': 'follow_up',
                'status': 'open',
                'priority': 'high',
                'summary': 'Confirm installation quality',
                'details': 'Customer requested a follow-up call.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        case = FollowUpCase.objects.get(id=response.data['id'])
        self.assertEqual(case.client, self.client_user)
        self.assertEqual(case.created_by, self.admin_user)
        self.assertIsNone(case.assigned_to)
        self.assertEqual(case.service_ticket, self.completed_ticket)
        self.assertEqual(response.data['client_email'], 'followup-client@example.com')
        self.assertEqual(response.data['client_phone'], '+15550000002')
        self.assertEqual(response.data['service_address'], '321 Service Road')

    def test_follow_up_case_creation_rejects_non_completed_ticket(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': self.pending_ticket.id,
                'case_type': 'complaint',
                'status': 'open',
                'priority': 'normal',
                'summary': 'Attempted early complaint case',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('service_ticket', response.data)
        self.assertEqual(FollowUpCase.objects.count(), 0)

    def test_follow_up_case_filters_run_in_database(self):
        self.client.force_authenticate(user=self.admin_user)
        today = timezone.localdate()
        overdue_case = FollowUpCase.objects.create(
            service_ticket=self.completed_ticket,
            client=self.client_user,
            assigned_to=self.admin_user,
            created_by=self.admin_user,
            case_type='complaint',
            status='open',
            priority='urgent',
            creation_source='manual',
            summary='Overdue customer recovery',
            due_date=today - timedelta(days=1),
        )
        FollowUpCase.objects.create(
            service_ticket=self.completed_ticket,
            client=self.client_user,
            assigned_to=self.admin_user,
            created_by=self.admin_user,
            case_type='feedback',
            status='resolved',
            priority='low',
            creation_source='completion_flow',
            summary='Resolved completion feedback',
            due_date=today + timedelta(days=3),
        )

        response = self.client.get(
            '/api/services/follow-up-cases/',
            {'status': 'overdue', 'case_type': 'complaint', 'priority': 'urgent'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data.get('results', response.data)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], overdue_case.id)

    def test_follow_up_case_search_uses_api_query(self):
        self.client.force_authenticate(user=self.admin_user)
        matching_case = FollowUpCase.objects.create(
            service_ticket=self.completed_ticket,
            client=self.client_user,
            assigned_to=self.admin_user,
            created_by=self.admin_user,
            case_type='warranty',
            status='in_progress',
            priority='high',
            creation_source='completion_flow',
            summary='Solar inverter warranty callback',
        )
        FollowUpCase.objects.create(
            service_ticket=self.completed_ticket,
            client=self.client_user,
            assigned_to=self.admin_user,
            created_by=self.admin_user,
            case_type='feedback',
            status='open',
            priority='normal',
            creation_source='manual',
            summary='General service feedback',
        )

        response = self.client.get('/api/services/follow-up-cases/', {'search': 'inverter'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data.get('results', response.data)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], matching_case.id)

    def test_case_lifecycle_requires_notes_and_records_events(self):
        self.client.force_authenticate(user=self.admin_user)
        create_response = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': self.completed_ticket.id,
                'case_type': 'complaint',
                'status': 'open',
                'priority': 'urgent',
                'summary': 'Client reported a recurring inverter fault',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        case_id = create_response.data['id']
        self.assertTrue(AfterSalesCaseEvent.objects.filter(case_id=case_id, event_type='created').exists())

        missing_notes = self.client.patch(
            f'/api/services/follow-up-cases/{case_id}/',
            {'status': 'resolved'},
            format='json',
        )
        self.assertEqual(missing_notes.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('resolution_notes', missing_notes.data)

        resolved = self.client.patch(
            f'/api/services/follow-up-cases/{case_id}/',
            {
                'status': 'resolved',
                'resolution_notes': 'Replaced the loose connector and verified stable output.',
                'status_change_note': 'Replaced the loose connector and verified stable output.',
            },
            format='json',
        )
        self.assertEqual(resolved.status_code, status.HTTP_200_OK)
        self.assertTrue(AfterSalesCaseEvent.objects.filter(
            case_id=case_id,
            event_type='status_changed',
            from_status='open',
            to_status='resolved',
        ).exists())

        missing_reopen_reason = self.client.patch(
            f'/api/services/follow-up-cases/{case_id}/',
            {'status': 'open'},
            format='json',
        )
        self.assertEqual(missing_reopen_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('status_change_note', missing_reopen_reason.data)

        reopened = self.client.patch(
            f'/api/services/follow-up-cases/{case_id}/',
            {'status': 'open', 'status_change_note': 'The fault returned during client verification.'},
            format='json',
        )
        self.assertEqual(reopened.status_code, status.HTTP_200_OK)
        self.assertEqual(reopened.data['events'][0]['to_status'], 'open')

    def test_new_case_cannot_start_in_terminal_status(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': self.completed_ticket.id,
                'case_type': 'follow_up',
                'status': 'closed',
                'priority': 'normal',
                'summary': 'Invalid terminal case creation',
                'resolution_notes': 'Should not be accepted.',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('status', response.data)

    def test_warranty_case_response_due_date_is_not_coverage_expiry(self):
        self.completed_ticket.warranty_status = 'active'
        self.completed_ticket.warranty_end_date = timezone.localdate() + timedelta(days=365)
        self.completed_ticket.save(update_fields=['warranty_status', 'warranty_end_date'])
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': self.completed_ticket.id,
                'case_type': 'warranty',
                'status': 'open',
                'priority': 'high',
                'summary': 'Warranty response needed',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['due_date'], (timezone.localdate() + timedelta(days=2)).isoformat())
        self.assertEqual(response.data['ticket_warranty_end_date'], self.completed_ticket.warranty_end_date.isoformat())

    def test_approving_auto_created_request_does_not_create_duplicate_ticket(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Need a follow-up visit',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.now().date(),
            status='Not Started',
        )
        ServiceStatusHistory.objects.create(
            ticket=ticket,
            status='Not Started',
            changed_by=self.client_user,
            notes='Initial ticket created',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'Approved')
        self.assertTrue(request_obj.auto_ticket_created)
        self.assertEqual(ServiceTicket.objects.filter(request=request_obj).count(), 1)
        self.assertEqual(ServiceStatusHistory.objects.filter(ticket__request=request_obj).count(), 1)
