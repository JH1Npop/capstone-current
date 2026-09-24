"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class MaintenanceWorkflowTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='maintenance-client',
            password='pass',
            role='client',
        )
        self.admin_user = User.objects.create_user(
            username='maintenance-admin',
            password='pass',
            role='admin',
        )
        self.follow_up_user = User.objects.create_user(
            username='maintenance-follow-up',
            password='pass',
            role='admin',
        )
        self.technician_user = User.objects.create_user(
            username='maintenance-tech',
            password='pass',
            role='technician',
        )
        self.service_type = ServiceType.objects.create(
            name='Installation',
            description='Installation service',
            estimated_duration=90,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Install equipment with maintenance plan',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ServiceLocation.objects.create(
            request=self.request_obj,
            address='789 Service Road',
            city='Pasig',
            province='Metro Manila',
            latitude=14.5764,
            longitude=121.0851,
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

    def test_checklist_submission_and_completion_create_maintenance_schedule(self):
        self.client.force_authenticate(user=self.technician_user)

        checklist_response = self.client.post(
            '/api/checklist/',
            {
                'jobId': self.ticket.id,
                'completed': {'0': True, '1': True, '2': True},
                'notes': 'Installation complete and site assessed.',
                'photos': ['before.jpg', 'after.jpg'],
                'maintenance_required': True,
                'maintenance_profile': 'commercial_area',
                'maintenance_notes': 'Retail frontage with daily dust exposure.',
            },
            format='json',
        )

        self.assertEqual(checklist_response.status_code, status.HTTP_200_OK)
        checklist = InspectionChecklist.objects.get(ticket=self.ticket)
        self.assertTrue(checklist.maintenance_required)
        self.assertEqual(checklist.maintenance_profile, 'commercial_area')
        self.assertEqual(checklist.maintenance_interval_days, 90)

        self.ticket.status = 'Arrived on Site'
        self.ticket.save(update_fields=['status'])

        start_response = self.client.post(
            f'/api/technician/jobs/{self.ticket.id}/status/',
            {'status': 'in_progress'},
            format='json',
        )

        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        complete_response = self.client.post(
            f'/api/technician/jobs/{self.ticket.id}/status/',
            {
                'status': 'completed',
                'completion_proof_images': ['data:image/jpeg;base64,maintenance-proof'],
            },
            format='json',
        )

        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        schedule = MaintenanceSchedule.objects.get(service_ticket=self.ticket)
        self.ticket.refresh_from_db()
        self.assertEqual(schedule.client, self.client_user)
        self.assertEqual(schedule.service_type, self.service_type)
        self.assertEqual(schedule.interval_days, 90)
        self.assertEqual(
            schedule.next_due_date,
            self.ticket.completed_date.date() + timedelta(days=90),
        )
        self.assertEqual(schedule.notify_on_date, schedule.next_due_date - timedelta(days=7))
        self.assertEqual(schedule.status, 'scheduled')

    def test_checklist_submission_stores_procedure_inputs(self):
        self.client.force_authenticate(user=self.technician_user)

        response = self.client.post(
            '/api/checklist/',
            {
                'jobId': self.ticket.id,
                'serviceType': 'Test Service',
                'procedure_source': 'dynamic',
                'completed': {'0': True, '1': True},
                'checklist_items': [
                    {'index': 0, 'label': 'Inspect site', 'completed': True},
                    {'index': 1, 'label': 'Test output', 'completed': True},
                ],
                'required_equipment_snapshot': ['Multimeter', {'name': 'Ladder', 'quantity': 1}],
                'notes': 'Procedure inputs saved.',
                'maintenance_required': False,
                'warranty_provided': False,
                'follow_up_required': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        checklist = InspectionChecklist.objects.get(ticket=self.ticket)
        self.assertEqual(checklist.ticket, self.ticket)
        self.assertEqual(checklist.submitted_by, self.technician_user)
        self.assertIsNotNone(checklist.submitted_at)
        self.assertEqual(checklist.completed_by, self.technician_user)
        self.assertEqual(checklist.service_type_label, 'Test Service')
        self.assertEqual(checklist.procedure_source, 'dynamic')
        self.assertEqual(checklist.checklist_items[0]['label'], 'Inspect site')
        self.assertTrue(checklist.checklist_items[1]['completed'])
        self.assertEqual(checklist.required_equipment_snapshot[0], 'Multimeter')

    def test_checklist_rejects_conflicting_after_sales_decision(self):
        self.client.force_authenticate(user=self.technician_user)

        response = self.client.post(
            '/api/checklist/',
            {
                'jobId': self.ticket.id,
                'completed': {'0': True, '1': True},
                'notes': 'After-sales decision mismatch.',
                'maintenance_required': False,
                'after_sales_decision': 'none',
                'warranty_provided': True,
                'warranty_period_days': 30,
                'follow_up_required': False,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('after_sales_decision', response.data)

    def test_due_soon_alerts_create_maintenance_case_notifications_and_dashboard_queue(self):
        InspectionChecklist.objects.create(
            ticket=self.ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
            site_accessible=True,
            electrical_available=True,
            electrical_adequate=True,
            safety_equipment_present=True,
            recommendation='Approved',
            maintenance_required=True,
            maintenance_profile='commercial_area',
            maintenance_interval_days=90,
            maintenance_notes='Commercial site maintenance plan.',
        )

        self.ticket.status = 'Completed'
        self.ticket.completed_date = timezone.now() - timedelta(days=85)
        self.ticket.end_time = self.ticket.completed_date
        self.ticket.save(update_fields=['status', 'completed_date', 'end_time'])
        self.request_obj.status = 'Completed'
        self.request_obj.save(update_fields=['status'])

        schedule = MaintenanceSchedule.objects.create(
            service_ticket=self.ticket,
            client=self.client_user,
            service_type=self.service_type,
            maintenance_profile='commercial_area',
            interval_days=90,
            follow_up_window_days=14,
            last_service_date=(timezone.localdate() - timedelta(days=85)),
            next_due_date=timezone.localdate() + timedelta(days=5),
            notify_on_date=timezone.localdate(),
            status='scheduled',
            maintenance_notes='Commercial site maintenance plan.',
        )

        call_command('send_maintenance_alerts')

        schedule.refresh_from_db()
        self.assertEqual(schedule.status, 'due_soon')
        self.assertIsNotNone(schedule.due_soon_notified_at)
        case = FollowUpCase.objects.get(service_ticket=self.ticket, case_type='maintenance')
        self.assertEqual(case.status, 'open')
        self.assertEqual(case.due_date, schedule.next_due_date)
        self.assertTrue(AfterSalesCaseEvent.objects.filter(
            case=case,
            event_type='created',
        ).exists())

        recipients = Notification.objects.filter(ticket=self.ticket, type='reminder')
        self.assertEqual(recipients.count(), 2)

        self.client.force_authenticate(user=self.follow_up_user)
        response = self.client.get('/api/services/dashboard/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['overview']['due_soon_maintenance'], 1)
        self.assertEqual(len(response.data['maintenance_queue']), 1)
        self.assertEqual(response.data['maintenance_queue'][0]['ticket_id'], self.ticket.id)

    @patch('services.maintenance._send_client_maintenance_email', return_value=False)
    def test_late_scheduler_catch_up_sends_three_day_stage_first(self, _mock_email):
        schedule = MaintenanceSchedule.objects.create(
            service_ticket=self.ticket,
            client=self.client_user,
            service_type=self.service_type,
            maintenance_profile='commercial_area',
            interval_days=90,
            follow_up_window_days=14,
            last_service_date=timezone.localdate() - timedelta(days=88),
            next_due_date=timezone.localdate() + timedelta(days=2),
            notify_on_date=timezone.localdate() - timedelta(days=5),
            status='scheduled',
        )

        call_command('send_maintenance_alerts')

        schedule.refresh_from_db()
        self.assertIsNotNone(schedule.three_day_notified_at)
        self.assertIsNone(schedule.due_soon_notified_at)
