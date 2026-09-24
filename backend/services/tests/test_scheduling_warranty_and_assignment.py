"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class SchedulingWarrantyAndAssignmentTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='structured-client',
            password='pass',
            role='client',
        )
        self.admin_user = User.objects.create_user(
            username='structured-admin',
            password='pass',
            role='admin',
        )
        self.supervisor_user = User.objects.create_user(
            username='structured-supervisor',
            password='pass',
            role='admin',
        )
        self.follow_up_user = User.objects.create_user(
            username='structured-follow-up',
            password='pass',
            role='admin',
        )
        self.superadmin_user = User.objects.create_user(
            username='structured-superadmin',
            password='pass',
            role='superadmin',
        )
        self.technician_user = User.objects.create_user(
            username='structured-tech',
            password='pass',
            role='technician',
            status='active',
            is_available=True,
            current_latitude='14.560000',
            current_longitude='121.020000',
        )
        self.backup_technician = User.objects.create_user(
            username='backup-tech',
            password='pass',
            role='technician',
            status='active',
            is_available=True,
            current_latitude='14.580000',
            current_longitude='121.030000',
        )
        self.service_type = ServiceType.objects.create(
            name='Structured Service',
            description='Structured service type',
            estimated_duration=120,
        )
        TechnicianSkill.objects.create(
            technician=self.technician_user,
            service_type=self.service_type,
            skill_level='expert',
        )
        TechnicianSkill.objects.create(
            technician=self.backup_technician,
            service_type=self.service_type,
            skill_level='beginner',
        )

    def test_technician_arrival_starts_job_and_notifies_client_and_admins(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Arrival workflow service',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            assigned_admin=self.supervisor_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'in_progress'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        request_obj.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')
        self.assertEqual(request_obj.status, 'In Progress')
        self.assertIsNotNone(ticket.start_time)
        self.assertTrue(Notification.objects.filter(
            user=self.client_user,
            message__icontains='Work has started',
        ).exists())
        self.assertTrue(Notification.objects.filter(
            user=self.admin_user,
            message__icontains='arrived at the site',
        ).exists())
        self.assertTrue(Notification.objects.filter(
            user=self.supervisor_user,
            message__icontains='arrived at the site',
        ).exists())
        self.assertTrue(Notification.objects.filter(
            user=self.superadmin_user,
            message__icontains='arrived at the site',
        ).exists())

    def test_start_navigation_notifies_client_and_admins_only_once(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Navigation workflow service',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            assigned_admin=self.supervisor_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        first_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/start-navigation/',
            {},
            format='json',
        )
        second_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/start-navigation/',
            {},
            format='json',
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(first_response.data['status'], 'notified')
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.data['status'], 'already_notified')
        self.assertEqual(
            ServiceStatusHistory.objects.filter(ticket=ticket, status='Navigation Started').count(),
            1,
        )
        self.assertEqual(Notification.objects.filter(
            user=self.client_user,
            message__icontains='on the way',
        ).count(), 1)
        self.assertEqual(Notification.objects.filter(
            user=self.admin_user,
            message__icontains='started navigation',
        ).count(), 1)
        self.assertEqual(Notification.objects.filter(
            user=self.supervisor_user,
            message__icontains='started navigation',
        ).count(), 1)
        self.assertEqual(Notification.objects.filter(
            user=self.superadmin_user,
            message__icontains='started navigation',
        ).count(), 1)

    def test_request_preferences_seed_ticket_schedule_and_reschedule_workflow(self):
        preferred_date = timezone.localdate() + timedelta(days=3)
        self.client.force_authenticate(user=self.client_user)

        create_response = self.client.post(
            '/api/services/service-requests/',
            {
                'service_type': self.service_type.id,
                'description': 'Need an appointment slot',
                'priority': 'Normal',
                'preferred_date': preferred_date.isoformat(),
                'preferred_time_slot': 'afternoon',
                'scheduling_notes': 'Please avoid lunch hours.',
                'location_address': '100 Scheduling Street',
                'location_city': 'Pasig',
                'location_province': 'Metro Manila',
                'latitude': '14.572000',
                'longitude': '121.049000',
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        request_obj = ServiceRequest.objects.get(id=create_response.data['id'])

        self.client.force_authenticate(user=self.admin_user)
        approve_response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )
        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)

        ticket = ServiceTicket.objects.get(request=request_obj)
        self.assertEqual(ticket.scheduled_date, preferred_date)
        self.assertEqual(ticket.scheduled_time_slot, 'afternoon')
        self.assertEqual(ticket.scheduled_time.strftime('%H:%M'), '15:00')

        self.client.force_authenticate(user=self.client_user)
        reschedule_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_reschedule/',
            {
                'preferred_date': (preferred_date + timedelta(days=2)).isoformat(),
                'preferred_time_slot': 'evening',
                'reason': 'Building access is only allowed after 5 PM.',
            },
            format='json',
        )

        self.assertEqual(reschedule_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        request_obj.refresh_from_db()
        self.assertTrue(ticket.reschedule_requested)
        self.assertEqual(ticket.reschedule_reason, 'Building access is only allowed after 5 PM.')
        self.assertEqual(request_obj.preferred_time_slot, 'evening')

        self.client.force_authenticate(user=self.admin_user)
        confirm_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/reschedule/',
            {
                'scheduled_date': (preferred_date + timedelta(days=2)).isoformat(),
                'scheduled_time_slot': 'evening',
                'notes': 'Confirmed with dispatch.',
            },
            format='json',
        )

        self.assertEqual(confirm_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertFalse(ticket.reschedule_requested)
        self.assertEqual(ticket.scheduled_time_slot, 'evening')
        self.assertEqual(ticket.scheduled_time.strftime('%H:%M'), '18:00')

    def test_reschedule_rejects_malformed_or_past_dates(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Validate reschedule inputs',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
        )
        self.client.force_authenticate(user=self.admin_user)

        malformed = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/reschedule/',
            {'scheduled_date': 'not-a-date'},
            format='json',
        )
        past = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/reschedule/',
            {'scheduled_date': (timezone.localdate() - timedelta(days=1)).isoformat()},
            format='json',
        )

        self.assertEqual(malformed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(past.status_code, status.HTTP_400_BAD_REQUEST)
        ticket.refresh_from_db()
        self.assertEqual(ticket.scheduled_date, timezone.localdate() + timedelta(days=1))

    def test_reschedule_rejects_exact_time_overlap_for_assigned_technician(self):
        scheduled_date = timezone.localdate() + timedelta(days=2)
        existing_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Existing morning appointment',
            status='Approved',
        )
        ServiceTicket.objects.create(
            request=existing_request,
            technician=self.technician_user,
            scheduled_date=scheduled_date,
            scheduled_time=time(hour=9),
            status='Not Started',
        )
        candidate_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Appointment being moved',
            status='Approved',
        )
        candidate = ServiceTicket.objects.create(
            request=candidate_request,
            technician=self.technician_user,
            scheduled_date=scheduled_date,
            scheduled_time=time(hour=15),
            status='Not Started',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{candidate.id}/reschedule/',
            {
                'scheduled_date': scheduled_date.isoformat(),
                'scheduled_time': '10:00',
                'notes': 'Client requested a morning visit.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlapping appointment', response.data['error'])
        candidate.refresh_from_db()
        self.assertEqual(candidate.scheduled_time, time(hour=15))

    def test_assignment_rejects_overlap_when_technician_is_existing_ticket_crew(self):
        scheduled_date = timezone.localdate() + timedelta(days=2)
        existing_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Crew appointment',
            status='Approved',
        )
        existing = ServiceTicket.objects.create(
            request=existing_request,
            technician=self.technician_user,
            scheduled_date=scheduled_date,
            scheduled_time=time(hour=9),
            status='Not Started',
        )
        TicketCrewAssignment.objects.create(ticket=existing, technician=self.backup_technician)
        candidate_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Conflicting lead appointment',
            status='Approved',
        )
        candidate = ServiceTicket.objects.create(
            request=candidate_request,
            scheduled_date=scheduled_date,
            scheduled_time=time(hour=10),
            status='Not Started',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{candidate.id}/assign/',
            {'technician_id': self.backup_technician.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('overlapping appointment', response.data['error'])
        candidate.refresh_from_db()
        self.assertIsNone(candidate.technician)

    def test_reschedule_requires_and_preserves_operator_reason(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Reasoned reschedule',
            status='Approved',
        )
        original_date = timezone.localdate() + timedelta(days=1)
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=original_date,
            status='Not Started',
        )
        self.client.force_authenticate(user=self.admin_user)

        missing_reason = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/reschedule/',
            {'scheduled_date': (original_date + timedelta(days=1)).isoformat()},
            format='json',
        )
        accepted = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/reschedule/',
            {
                'scheduled_date': (original_date + timedelta(days=1)).isoformat(),
                'notes': '  Client confirmed the revised access window.  ',
            },
            format='json',
        )

        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.scheduled_date, original_date + timedelta(days=1))
        history = ServiceStatusHistory.objects.filter(ticket=ticket).latest('timestamp')
        self.assertEqual(history.notes, 'Client confirmed the revised access window.')

    def test_manual_status_change_requires_and_preserves_operator_reason(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Reasoned status exception',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
        )
        self.client.force_authenticate(user=self.admin_user)

        missing_reason = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/update_status/',
            {'status': 'Cancelled'},
            format='json',
        )
        accepted = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/update_status/',
            {'status': 'Cancelled', 'reason': '  Client withdrew before dispatch.  '},
            format='json',
        )

        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Cancelled')
        history = ServiceStatusHistory.objects.get(ticket=ticket, status='Cancelled')
        self.assertEqual(history.notes, 'Client withdrew before dispatch.')

    def test_awaiting_materials_inspection_decision_requires_reason(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Inspection materials exception',
            status='In Progress',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            ticket_type='inspection',
            status='Inspection Completed',
        )
        self.client.force_authenticate(user=self.admin_user)

        missing_reason = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/inspection_decision/',
            {'decision': 'awaiting_materials'},
            format='json',
        )
        accepted = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/inspection_decision/',
            {'decision': 'awaiting_materials', 'notes': 'Panel rails require a special-order length.'},
            format='json',
        )

        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        history = ServiceStatusHistory.objects.get(ticket=ticket, status='Awaiting Materials')
        self.assertEqual(history.notes, 'Panel rails require a special-order length.')

    def test_client_reschedule_request_rejects_invalid_time_slot(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Validate requested slot',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
        )
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_reschedule/',
            {'preferred_time_slot': 'late-night', 'reason': 'Need a later visit.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        ticket.refresh_from_db()
        self.assertFalse(ticket.reschedule_requested)

    def test_auto_assign_moves_installation_ticket_to_ready_for_service(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Auto dispatch installation state',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='300 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            ticket_type='installation',
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Ready for Service')

    def test_management_cannot_bypass_completion_checklist(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Checklist completion guard',
            status='In Progress',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            start_time=timezone.now(),
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/update_status/',
            {'status': 'Completed', 'notes': 'Close from dispatch.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    def test_checklist_submission_tracks_warranty_and_proof_media(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Install with warranty',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='200 Warranty Lane',
            city='Quezon City',
            province='Metro Manila',
            latitude='14.650000',
            longitude='121.040000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        checklist_response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': {'0': True, '1': True},
                'notes': 'Captured completion evidence.',
                'photos': ['before.jpg'],
                'videos': ['walkthrough.mp4'],
                'warranty_provided': True,
                'warranty_period_days': 60,
                'warranty_notes': 'Labor warranty only.',
                'maintenance_required': False,
            },
            format='json',
        )

        self.assertEqual(checklist_response.status_code, status.HTTP_200_OK)
        checklist = InspectionChecklist.objects.get(ticket=ticket)
        self.assertEqual(len(checklist.proof_media), 2)
        self.assertTrue(any(item['type'] == 'video' for item in checklist.proof_media))
        self.assertTrue(checklist.warranty_provided)
        self.assertEqual(checklist.warranty_period_days, 60)
        ticket.refresh_from_db()
        self.assertEqual(ticket.warranty_status, 'not_applicable')
        self.assertIsNone(ticket.warranty_start_date)
        self.assertIsNone(ticket.warranty_end_date)

        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])

        start_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'in_progress'},
            format='json',
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

        complete_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {
                'status': 'completed',
                'completion_proof_images': ['data:image/jpeg;base64,warranty-proof'],
            },
            format='json',
        )
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.warranty_status, 'active')
        self.assertEqual(ticket.warranty_period_days, 60)
        self.assertEqual(ticket.warranty_end_date, ticket.completed_date.date() + timedelta(days=60))
        warranty_case = FollowUpCase.objects.get(
            service_ticket=ticket,
            case_type='warranty',
            creation_source='completion_flow',
        )
        self.assertEqual(warranty_case.client, self.client_user)
        self.assertEqual(warranty_case.created_by, self.technician_user)
        self.assertEqual(
            warranty_case.due_date,
            ticket.completed_date.date() + timedelta(days=3),
        )

    def test_assignment_rejects_technician_over_daily_duration_limit(self):
        scheduled_date = timezone.localdate() + timedelta(days=1)
        for index in range(4):
            request_obj = ServiceRequest.objects.create(
                client=self.client_user,
                service_type=self.service_type,
                description=f'Existing scheduled job {index + 1}',
                priority='Normal',
                status='Approved',
            )
            ServiceTicket.objects.create(
                request=request_obj,
                technician=self.technician_user,
                scheduled_date=scheduled_date,
                status='Not Started',
                priority='Normal',
            )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Overflow scheduled job',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=scheduled_date,
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {'technician_id': self.technician_user.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('daily limit', response.data['error'])
        ticket.refresh_from_db()
        self.assertIsNone(ticket.technician)

    def test_inspection_required_ticket_rejects_direct_service_dispatch(self):
        self.service_type.requires_site_inspection = True
        self.service_type.save(update_fields=['requires_site_inspection'])
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Install requires site visit first',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {
                'technician_id': self.technician_user.id,
                'dispatch_stage': 'service',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('requires a site inspection', response.data['error'])
        ticket.refresh_from_db()
        self.assertIsNone(ticket.technician)

    def test_inspection_required_ticket_allows_inspection_dispatch_then_start(self):
        self.service_type.requires_site_inspection = True
        self.service_type.save(update_fields=['requires_site_inspection'])
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Inspect before installation',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        assign_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {
                'technician_id': self.technician_user.id,
                'dispatch_stage': 'inspection',
            },
            format='json',
        )

        self.assertEqual(assign_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.technician, self.technician_user)
        self.assertEqual(ticket.status, 'For Inspection')

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        start_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/start_work/',
            {},
            format='json',
        )

        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    def test_normal_service_rejects_inspection_dispatch(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Direct service job',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {
                'technician_id': self.technician_user.id,
                'dispatch_stage': 'inspection',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('does not require a site inspection', response.data['error'])

    def test_smart_assignment_skips_technician_over_daily_duration_limit(self):
        scheduled_date = timezone.localdate() + timedelta(days=1)
        for index in range(4):
            request_obj = ServiceRequest.objects.create(
                client=self.client_user,
                service_type=self.service_type,
                description=f'Existing smart dispatch job {index + 1}',
                priority='Normal',
                status='Approved',
            )
            ServiceTicket.objects.create(
                request=request_obj,
                technician=self.technician_user,
                scheduled_date=scheduled_date,
                status='Not Started',
                priority='Normal',
            )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Smart dispatch should use backup technician',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='260 Capacity Street',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=scheduled_date,
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.technician, self.backup_technician)

    def test_smart_assignment_prefers_less_loaded_technician_after_completed_work(self):
        scheduled_date = timezone.localdate() + timedelta(days=1)
        completed_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed earlier job',
            priority='Normal',
            status='Completed',
        )
        ServiceTicket.objects.create(
            request=completed_request,
            technician=self.technician_user,
            scheduled_date=scheduled_date,
            status='Completed',
            priority='Normal',
            completed_date=timezone.now(),
        )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Next job should go to less loaded technician',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='270 Fair Dispatch Street',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=scheduled_date,
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.technician, self.backup_technician)

    def test_warranty_case_requires_active_coverage(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed work',
            priority='Normal',
            status='Completed',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate(),
            status='Completed',
            completed_date=timezone.now(),
            priority='Normal',
        )

        self.client.force_authenticate(user=self.follow_up_user)
        rejected = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': ticket.id,
                'case_type': 'warranty',
                'summary': 'Customer says part failed',
                'priority': 'high',
            },
            format='json',
        )
        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)

        ticket.warranty_status = 'active'
        ticket.warranty_period_days = 45
        ticket.warranty_start_date = timezone.localdate()
        ticket.warranty_end_date = timezone.localdate() + timedelta(days=45)
        ticket.save(update_fields=[
            'warranty_status',
            'warranty_period_days',
            'warranty_start_date',
            'warranty_end_date',
            'updated_at',
        ])

        accepted = self.client.post(
            '/api/services/follow-up-cases/',
            {
                'service_ticket': ticket.id,
                'case_type': 'warranty',
                'summary': 'Customer says part failed',
                'priority': 'high',
            },
            format='json',
        )
        self.assertEqual(accepted.status_code, status.HTTP_201_CREATED)

    def test_completion_flow_auto_creates_follow_up_case_from_checklist_handoff(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Need revisit after completion',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='250 Handoff Avenue',
            city='Pasig',
            province='Metro Manila',
            latitude='14.575000',
            longitude='121.035000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )
        due_date = timezone.localdate() + timedelta(days=4)

        self.client.force_authenticate(user=self.technician_user)
        checklist_response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': {'0': True, '1': True},
                'notes': 'System commissioned, but customer wants a final alignment revisit.',
                'maintenance_required': False,
                'warranty_provided': True,
                'warranty_period_days': 30,
                'warranty_notes': 'Standard warranty applies.',
                'follow_up_required': True,
                'follow_up_case_type': 'revisit',
                'follow_up_due_date': due_date.isoformat(),
                'follow_up_summary': 'Return to fine tune panel alignment.',
                'follow_up_details': 'Customer requested one more visit after observing roof shading.',
            },
            format='json',
        )
        self.assertEqual(checklist_response.status_code, status.HTTP_200_OK)

        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])

        start_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'in_progress'},
            format='json',
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

        complete_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {
                'status': 'completed',
                'completion_proof_images': ['data:image/jpeg;base64,follow-up-proof'],
            },
            format='json',
        )
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()

        warranty_case = FollowUpCase.objects.get(
            service_ticket=ticket,
            case_type='warranty',
            creation_source='completion_flow',
        )
        self.assertEqual(
            warranty_case.due_date,
            ticket.completed_date.date() + timedelta(days=3),
        )

        follow_up_case = FollowUpCase.objects.get(
            service_ticket=ticket,
            case_type='revisit',
            creation_source='completion_flow',
        )
        self.assertEqual(follow_up_case.case_type, 'revisit')
        self.assertEqual(follow_up_case.status, 'open')
        self.assertEqual(follow_up_case.created_by, self.technician_user)
        self.assertTrue(follow_up_case.requires_revisit)
        self.assertEqual(follow_up_case.summary, 'Return to fine tune panel alignment.')
        self.assertEqual(follow_up_case.due_date, due_date)

        self.client.force_authenticate(user=self.follow_up_user)
        dashboard_response = self.client.get('/api/services/dashboard/', format='json')
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard_response.data['overview']['total_cases'], 2)
        self.assertEqual(dashboard_response.data['overview']['open_cases'], 2)
        self.assertEqual(dashboard_response.data['after_sales']['recent_cases'][0]['creation_source'], 'completion_flow')

    def test_completion_flow_uses_latest_checklist_follow_up_handoff(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Need complaint handoff',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='255 Recovery Avenue',
            city='Taguig',
            province='Metro Manila',
            latitude='14.540000',
            longitude='121.050000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        initial_response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': {'0': True, '1': True},
                'notes': 'Client asked for a manager callback.',
                'maintenance_required': False,
                'warranty_provided': False,
                'follow_up_required': True,
                'follow_up_case_type': 'complaint',
                'follow_up_summary': 'Customer is dissatisfied with the finish quality.',
                'follow_up_details': 'Escalate to after-sales for customer recovery.',
            },
            format='json',
        )
        self.assertEqual(initial_response.status_code, status.HTTP_200_OK)

        updated_response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': {'0': True, '1': True},
                'notes': 'Client asked for a same-day callback from management.',
                'maintenance_required': False,
                'warranty_provided': False,
                'follow_up_required': True,
                'follow_up_case_type': 'complaint',
                'follow_up_summary': 'Urgent customer recovery callback needed.',
                'follow_up_details': 'Customer remains dissatisfied and wants a manager response today.',
            },
            format='json',
        )
        self.assertEqual(updated_response.status_code, status.HTTP_200_OK)

        complete_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/complete_work/',
            {
                'completion_notes': 'Completed with after-sales handoff.',
                'completion_proof_images': ['data:image/jpeg;base64,after-sales-proof'],
            },
            format='json',
        )
        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)

        self.assertEqual(
            FollowUpCase.objects.filter(service_ticket=ticket, creation_source='completion_flow').count(),
            1,
        )
        follow_up_case = FollowUpCase.objects.get(service_ticket=ticket, creation_source='completion_flow')
        self.assertEqual(follow_up_case.summary, 'Urgent customer recovery callback needed.')
        self.assertIn('manager response today', follow_up_case.details)

    def test_auto_assign_returns_smart_assignment_metadata(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Need smart dispatch',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='300 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertIsNotNone(ticket.smart_assignment_score)
        self.assertTrue(ticket.smart_assignment_summary)
        self.assertIn('assignment_score', response.data)
        self.assertGreater(len(response.data['candidate_ranking']), 0)

    def test_auto_assign_rejects_technicians_with_overlapping_appointments(self):
        scheduled_date = timezone.localdate() + timedelta(days=1)
        scheduled_time = time(9, 0)
        for technician in (self.technician_user, self.backup_technician):
            existing_request = ServiceRequest.objects.create(
                client=self.client_user,
                service_type=self.service_type,
                description=f'Existing appointment for {technician.username}',
                priority='Normal',
                status='Approved',
            )
            ServiceTicket.objects.create(
                request=existing_request,
                technician=technician,
                scheduled_date=scheduled_date,
                scheduled_time=scheduled_time,
                status='Not Started',
                priority='Normal',
            )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Conflicting smart-dispatch appointment',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='305 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=scheduled_date,
            scheduled_time=scheduled_time,
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        ticket.refresh_from_db()
        self.assertIsNone(ticket.technician)
        self.assertIn('schedule', response.data['error'])

    def test_auto_assign_keeps_current_technician_when_still_best_match(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Recheck the current smart assignment',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='306 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.560000',
            longitude='121.020000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.technician, self.technician_user)

    @patch('notifications.notification_utils.send_notification_email', return_value=True)
    def test_auto_assign_notifies_assignee_and_assigned_admin_team(self, mock_send_email):
        existing_team_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Existing team workload',
            priority='Normal',
            status='Approved',
        )
        ServiceTicket.objects.create(
            request=existing_team_request,
            technician=self.backup_technician,
            assigned_admin=self.supervisor_user,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='In Progress',
            priority='Normal',
        )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Need smart dispatch with team awareness',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='302 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
            assigned_admin=self.supervisor_user,
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assignee_notification = Notification.objects.filter(
            user=self.technician_user,
            ticket=ticket,
            type='ticket_assigned',
        ).first()
        team_notification = Notification.objects.filter(
            user=self.backup_technician,
            ticket=ticket,
            type='ticket_assigned',
        ).first()

        self.assertIsNotNone(assignee_notification)
        self.assertIn(f'auto-assigned to ticket #{ticket.id}', assignee_notification.message)
        self.assertIsNotNone(team_notification)
        self.assertIn(f'Ticket #{ticket.id} was auto-assigned to {self.technician_user.username}', team_notification.message)
        self.assertGreaterEqual(mock_send_email.call_count, 2)

    def test_auto_assign_returns_conflict_when_no_eligible_technician_exists(self):
        self.technician_user.is_available = False
        self.technician_user.save(update_fields=['is_available'])
        self.backup_technician.is_available = False
        self.backup_technician.save(update_fields=['is_available'])

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Need smart dispatch but nobody is available',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='400 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/auto_assign/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['success'], False)
        self.assertIn('No available technician', response.data['error'])

    def test_assigned_admin_can_assign_ticket_when_status_is_assignable(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Admin dispatch assignment',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='301 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
            assigned_admin=self.supervisor_user,
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {'technician_id': self.technician_user.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.technician, self.technician_user)

    def test_assigned_admin_can_assign_ticket_with_crew_and_crew_member_can_work_it(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Admin dispatch assignment with crew',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='301 Crew Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
            assigned_admin=self.supervisor_user,
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {
                'technician_id': self.technician_user.id,
                'crew_ids': [self.backup_technician.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.backup_technician.refresh_from_db()

        self.assertEqual(ticket.technician, self.technician_user)
        self.assertTrue(
            TicketCrewAssignment.objects.filter(
                ticket=ticket,
                technician=self.backup_technician,
            ).exists()
        )
        self.assertEqual(len(response.data['crew_members']), 1)
        self.assertTrue(self.backup_technician.is_available)

        self.client.force_authenticate(user=self.backup_technician)
        jobs_response = self.client.get('/api/technician/jobs/')
        self.assertEqual(jobs_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(jobs_response.data), 1)
        self.assertEqual(jobs_response.data[0]['assignment_role'], 'crew')

        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        start_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/start_work/',
            {},
            format='json',
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    def test_admin_approval_creates_assigned_admin_owned_ticket(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Admin-owned approval flow',
            priority='Normal',
            status='Pending',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='302 Admin Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket = ServiceTicket.objects.get(request=request_obj)
        self.assertEqual(ticket.assigned_admin, self.supervisor_user)

    def test_admin_approval_keeps_ticket_visible_in_admin_queue(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Admin-created queue work',
            priority='Normal',
            status='Pending',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='401 Shared Queue Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )

        self.client.force_authenticate(user=self.admin_user)
        approve_response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )

        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        ticket = ServiceTicket.objects.get(request=request_obj)
        self.assertEqual(ticket.assigned_admin, self.admin_user)

        self.client.force_authenticate(user=self.supervisor_user)
        queue_response = self.client.get('/api/services/service-tickets/')
        dashboard_response = self.client.get('/api/services/dashboard/')

        self.assertEqual(queue_response.status_code, status.HTTP_200_OK)
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        self.assertIn(ticket.id, [item['id'] for item in queue_response.data['results']])
        self.assertTrue(any(item['id'] == ticket.id for item in dashboard_response.data['operations']['recent_tickets']))

    def test_non_admin_with_tracking_capability_cannot_approve_request(self):
        tracking_only_user = User.objects.create_user(
            username='tracking_only_staff',
            password='pass',
            role='technician',
        )
        UserCapabilityGrant.objects.create(
            user=tracking_only_user,
            capability_code=SUPERVISOR_TRACKING_VIEW,
            granted_by=self.admin_user,
        )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Approval should be blocked',
            priority='Normal',
            status='Pending',
        )

        self.client.force_authenticate(user=tracking_only_user)
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(ServiceTicket.objects.filter(request=request_obj).exists())

    def test_checklist_accepts_uploaded_proof_files(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Checklist proof upload',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        photo = SimpleUploadedFile(
            'site-photo.png',
            base64.b64decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
            ),
            content_type='image/png',
        )
        video = SimpleUploadedFile(
            'site-video.mp4',
            b'\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom',
            content_type='video/mp4',
        )

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': '{"0": true, "1": true}',
                'notes': 'Uploaded proof files are attached.',
                'maintenance_required': 'false',
                'warranty_provided': 'false',
                'follow_up_required': 'false',
                'photo_files': [photo],
                'video_files': [video],
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        checklist = InspectionChecklist.objects.get(ticket=ticket)
        self.assertEqual(len(checklist.proof_media), 2)
        self.assertTrue(all(item['url'].startswith('http://testserver/media/checklists/') for item in checklist.proof_media))

    def test_checklist_rejects_spoofed_image_upload(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Reject spoofed proof upload',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Arrived on Site',
        )
        spoofed_photo = SimpleUploadedFile(
            'not-really-an-image.jpg',
            b'<script>alert(1)</script>',
            content_type='image/jpeg',
        )
        self.client.force_authenticate(user=self.technician_user)

        response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': '{"0": true}',
                'photo_files': [spoofed_photo],
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(InspectionChecklist.objects.filter(ticket=ticket).exists())

    @patch('notifications.notification_utils.send_notification_email', return_value=True)
    def test_assign_notifies_assignee_and_existing_team_members(self, mock_send_email):
        existing_team_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Existing scheduled work',
            priority='Normal',
            status='Approved',
        )
        ServiceTicket.objects.create(
            request=existing_team_request,
            technician=self.backup_technician,
            assigned_admin=self.supervisor_user,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
        )

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Supervisor dispatch assignment with team awareness',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='303 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.565000',
            longitude='121.025000',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
            assigned_admin=self.supervisor_user,
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/assign/',
            {'technician_id': self.technician_user.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        assignee_notification = Notification.objects.filter(
            user=self.technician_user,
            ticket=ticket,
            type='ticket_assigned',
        ).first()
        team_notification = Notification.objects.filter(
            user=self.backup_technician,
            ticket=ticket,
            type='ticket_assigned',
        ).first()

        self.assertIsNotNone(assignee_notification)
        self.assertIn(f'assigned to ticket #{ticket.id}', assignee_notification.message)
        self.assertIsNotNone(team_notification)
        self.assertIn(f'Ticket #{ticket.id} was assigned to {self.technician_user.username}', team_notification.message)
        self.assertGreaterEqual(mock_send_email.call_count, 2)

    def test_admin_tracking_only_returns_owned_open_tickets(self):
        owned_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Owned admin ticket',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=owned_request,
            address='302 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.566000',
            longitude='121.026000',
        )
        owned_ticket = ServiceTicket.objects.create(
            request=owned_request,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='On Hold',
            priority='Normal',
            assigned_admin=self.supervisor_user,
        )

        other_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Unowned admin ticket',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=other_request,
            address='303 Dispatch Avenue',
            city='Makati',
            province='Metro Manila',
            latitude='14.567000',
            longitude='121.027000',
        )
        other_ticket = ServiceTicket.objects.create(
            request=other_request,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.supervisor_user)
        response = self.client.get('/api/tracking')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket_ids = [item['id'] for item in response.data['ticketMarkers']]
        self.assertIn(owned_ticket.id, ticket_ids)
        self.assertIn(other_ticket.id, ticket_ids)

    def test_complete_work_requires_in_progress_ticket(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completion guard',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/complete_work/',
            {'completion_proof_images': ['https://example.com/proof/guard.jpg']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Cannot move ticket', response.data['error'])

    def test_technician_completion_requires_completed_checklist(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Checklist completion guard',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
            start_time=timezone.now(),
        )

        self.client.force_authenticate(user=self.technician_user)
        blocked_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'completed'},
            format='json',
        )

        self.assertEqual(blocked_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Complete the job checklist', blocked_response.data['error'])

        InspectionChecklist.objects.create(
            ticket=ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )
        completed_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'completed'},
            format='json',
        )

        self.assertEqual(completed_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('completion photo', completed_response.data['error'])

        completed_response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {
                'status': 'completed',
                'completion_proof_images': ['data:image/jpeg;base64,checklist-proof'],
            },
            format='json',
        )

        self.assertEqual(completed_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Completed')

    def test_technician_completion_saves_post_service_proof(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Post-service proof should be visible to client',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
            start_time=timezone.now(),
        )
        InspectionChecklist.objects.create(
            ticket=ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )

        proof_images = ['data:image/jpeg;base64,finished-work-proof']
        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'In Progress'
        ticket.save(update_fields=['status'])
        response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {
                'status': 'completed',
                'completion_notes': 'Finished and tested with the client.',
                'completion_proof_images': proof_images,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Completed')
        self.assertEqual(ticket.completion_notes, 'Finished and tested with the client.')
        self.assertEqual(ticket.completion_proof_images, proof_images)
        self.assertEqual(response.data['completion_proof_images'], proof_images)

    def test_complete_work_requires_completed_checklist(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Checklist guard for complete work',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
            start_time=timezone.now(),
        )

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'In Progress'
        ticket.save(update_fields=['status'])
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/complete_work/',
            {'completion_proof_images': ['https://example.com/proof/checklist.jpg']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Complete the job checklist', response.data['error'])

    def test_complete_work_requires_post_service_proof(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completion proof guard',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
            start_time=timezone.now(),
        )
        InspectionChecklist.objects.create(
            ticket=ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )

        self.client.force_authenticate(user=self.technician_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/complete_work/',
            {'completion_proof_images': []},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('completion photo', response.data['error'])
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    def test_complete_work_requires_lead_technician(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Crew member should not close the job',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
            start_time=timezone.now(),
        )
        InspectionChecklist.objects.create(
            ticket=ticket,
            checklist_items=[{'label': 'Done', 'completed': True}],
            is_completed=True,
        )
        TicketCrewAssignment.objects.create(
            ticket=ticket,
            technician=self.backup_technician,
        )

        self.client.force_authenticate(user=self.backup_technician)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/complete_work/',
            {'completion_proof_images': ['https://example.com/proof/crew.jpg']},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('lead technician', str(response.data.get('detail', '')).lower())

    def test_technician_status_endpoint_requires_lead_for_completion(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Crew member should not complete via technician endpoint',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
            start_time=timezone.now(),
        )
        InspectionChecklist.objects.create(
            ticket=ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )
        TicketCrewAssignment.objects.create(
            ticket=ticket,
            technician=self.backup_technician,
        )

        self.client.force_authenticate(user=self.backup_technician)
        response = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'completed'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('lead technician', str(response.data.get('error', '')).lower())

    def test_parts_request_requires_started_work(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Parts guard',
            priority='Normal',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_parts/',
            {'parts': 'Replacement sensor'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('only be requested for active or inspected tickets', response.data['error'])

    def test_cancel_request_cascades_to_open_ticket(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Cancel request cascade',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )
        self.technician_user.is_available = False
        self.technician_user.save(update_fields=['is_available'])

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/cancel/',
            {'reason': 'Client no longer needs the scheduled work.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        ticket.refresh_from_db()
        self.technician_user.refresh_from_db()
        self.assertEqual(request_obj.status, 'Cancelled')
        self.assertEqual(ticket.status, 'Cancelled')
        self.assertTrue(self.technician_user.is_available)
        self.assertTrue(ServiceStatusHistory.objects.filter(ticket=ticket, status='Cancelled').exists())

    def test_technician_cannot_cancel_assigned_request(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Technician cancellation guard',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/cancel/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        request_obj.refresh_from_db()
        ticket.refresh_from_db()
        self.assertEqual(request_obj.status, 'Approved')
        self.assertEqual(ticket.status, 'Arrived on Site')

    def test_client_cannot_request_reschedule_after_work_starts(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Reschedule guard',
            priority='Normal',
            status='In Progress',
            preferred_date=timezone.localdate() + timedelta(days=1),
            preferred_time_slot='morning',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            start_time=timezone.now(),
            priority='Normal',
        )

        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_reschedule/',
            {
                'preferred_date': (timezone.localdate() + timedelta(days=2)).isoformat(),
                'preferred_time_slot': 'afternoon',
                'reason': 'Need another slot',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('before work has started', response.data['error'])
