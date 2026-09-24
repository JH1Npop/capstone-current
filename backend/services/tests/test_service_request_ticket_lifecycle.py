"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class ServiceRequestTicketLifecycleTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='request-client',
            password='pass',
            role='client',
        )
        self.admin_user = User.objects.create_user(
            username='request-admin',
            password='pass',
            role='admin',
        )
        self.service_type = ServiceType.objects.create(
            name='Installation',
            description='Installation service',
            estimated_duration=90,
        )
        self.other_client_user = User.objects.create_user(
            username='other-client',
            password='pass',
            role='client',
        )
        self.technician_user = User.objects.create_user(
            username='request-tech',
            password='pass',
            role='technician',
        )

    def test_creating_request_stays_pending_until_reviewed(self):
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            '/api/services/service-requests/',
            {
                'client': self.other_client_user.id,
                'service_type': self.service_type.id,
                'description': 'Need an installation visit',
                'priority': 'Normal',
                'location_address': '123 Workflow Street',
                'location_city': 'Makati',
                'location_province': 'Metro Manila',
                'latitude': '14.554700',
                'longitude': '121.024400',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_obj = ServiceRequest.objects.get(id=response.data['id'])
        self.assertEqual(request_obj.client, self.client_user)
        self.assertEqual(request_obj.status, 'Pending')
        self.assertFalse(request_obj.auto_ticket_created)
        self.assertEqual(ServiceTicket.objects.filter(request=request_obj).count(), 0)
        self.assertEqual(ServiceStatusHistory.objects.filter(ticket__request=request_obj).count(), 0)
        self.assertTrue(hasattr(request_obj, 'location'))
        self.assertEqual(request_obj.location.address, '123 Workflow Street')
        self.assertEqual(float(request_obj.location.latitude), 14.5547)
        self.assertEqual(float(request_obj.location.longitude), 121.0244)

    def test_request_creation_replays_same_idempotency_key(self):
        self.client.force_authenticate(user=self.client_user)
        payload = {
            'service_type': self.service_type.id,
            'description': 'Retry-safe installation request',
            'location_address': '123 Retry Street',
            'location_city': 'Makati',
            'location_province': 'Metro Manila',
            'latitude': '14.554700',
            'longitude': '121.024400',
        }
        headers = {'HTTP_IDEMPOTENCY_KEY': 'request-retry-123'}

        first = self.client.post('/api/services/service-requests/', payload, format='json', **headers)
        second = self.client.post('/api/services/service-requests/', payload, format='json', **headers)

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data['id'], first.data['id'])
        self.assertEqual(
            ServiceRequest.objects.filter(client=self.client_user, idempotency_key='request-retry-123').count(),
            1,
        )

    def test_similar_requests_without_idempotency_key_remain_distinct(self):
        self.client.force_authenticate(user=self.client_user)
        payload = {
            'service_type': self.service_type.id,
            'description': 'Two separate units need identical installation work',
            'location_address': '123 Multiple Units Street',
            'location_city': 'Makati',
            'location_province': 'Metro Manila',
            'latitude': '14.554700',
            'longitude': '121.024400',
        }

        first = self.client.post('/api/services/service-requests/', payload, format='json')
        second = self.client.post('/api/services/service-requests/', payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(second.data['id'], first.data['id'])

    def test_admin_can_reject_pending_request(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Request needs review',
            priority='Normal',
            status='Pending',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/reject/',
            {'reason': 'Request details could not be verified.'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'Cancelled')
        self.assertFalse(ServiceTicket.objects.filter(request=request_obj).exists())

    def test_reject_requires_a_reason(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Request needs an auditable decision',
            status='Pending',
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/reject/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'Pending')

    def test_service_request_and_ticket_cannot_be_hard_deleted(self):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Retain operational history',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=timezone.localdate(),
            status='Not Started',
        )
        self.client.force_authenticate(user=self.admin_user)

        request_response = self.client.delete(f'/api/services/service-requests/{request_obj.id}/')
        ticket_response = self.client.delete(f'/api/services/service-tickets/{ticket.id}/')

        self.assertEqual(request_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(ticket_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(ServiceRequest.objects.filter(pk=request_obj.pk).exists())
        self.assertTrue(ServiceTicket.objects.filter(pk=ticket.pk).exists())

    def test_legacy_location_payload_is_mapped_and_persisted(self):
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            '/api/services/service-requests/',
            {
                'service_type': self.service_type.id,
                'notes': 'Legacy request payload still works',
                'lat': '14.600000',
                'lng': '121.050000',
                'locationDesc': 'Legacy landmark payload',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_obj = ServiceRequest.objects.get(id=response.data['id'])
        self.assertEqual(request_obj.service_type, self.service_type)
        self.assertEqual(request_obj.description, 'Legacy request payload still works')
        self.assertEqual(request_obj.location.address, 'Legacy landmark payload')
        self.assertEqual(request_obj.location.city, 'Unspecified')
        self.assertEqual(request_obj.location.province, 'Unspecified')

    def test_high_precision_coordinates_are_rounded_for_service_request(self):
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            '/api/services/service-requests/',
            {
                'service_type': self.service_type.id,
                'description': 'High precision map coordinates',
                'priority': 'Normal',
                'location_address': 'Precision Street',
                'location_city': 'Makati',
                'location_province': 'Metro Manila',
                'latitude': '14.599499999987',
                'longitude': '120.984200000019',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_obj = ServiceRequest.objects.get(id=response.data['id'])
        self.assertEqual(request_obj.location.latitude, Decimal('14.599500'))
        self.assertEqual(request_obj.location.longitude, Decimal('120.984200'))

    def test_frontend_payload_with_optional_nulls_creates_request(self):
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            '/api/services/service-requests/',
            {
                'service_type': self.service_type.id,
                'description': 'Frontend payload with optional fields omitted',
                'priority': 'Normal',
                'preferred_date': None,
                'preferred_time_slot': None,
                'scheduling_notes': None,
                'location_address': '123 Solar Street, Green City',
                'location_city': '',
                'location_province': '',
                'latitude': '14.599499999987',
                'longitude': '120.984200000019',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        request_obj = ServiceRequest.objects.get(id=response.data['id'])
        self.assertIsNone(request_obj.preferred_date)
        self.assertIsNone(request_obj.preferred_time_slot)
        self.assertIsNone(request_obj.scheduling_notes)
        self.assertEqual(request_obj.location.address, '123 Solar Street, Green City')
        self.assertEqual(request_obj.location.city, 'Unspecified')
        self.assertEqual(request_obj.location.province, 'Unspecified')
        self.assertEqual(request_obj.location.latitude, Decimal('14.599500'))
        self.assertEqual(request_obj.location.longitude, Decimal('120.984200'))

    def test_admin_walk_in_request_creates_real_ticket_after_approval(self):
        second_service = ServiceType.objects.create(
            name='Solar Panel Cleaning',
            description='Panel cleaning service',
            estimated_duration=60,
        )
        preferred_date = timezone.localdate() + timedelta(days=1)

        self.client.force_authenticate(user=self.admin_user)
        create_response = self.client.post(
            '/api/services/service-requests/',
            {
                'client': self.other_client_user.id,
                'service_type': self.service_type.id,
                'service_types': [self.service_type.id, second_service.id],
                'description': 'Walk-in client requested installation and cleaning.',
                'priority': 'High',
                'request_source': 'walk_in',
                'preferred_date': preferred_date.isoformat(),
                'preferred_time_slot': 'morning',
                'scheduling_notes': 'Client is waiting for dispatch confirmation.',
                'location_address': '12 Walk-in Counter Street',
                'location_city': 'Naval',
                'location_province': 'Biliran',
                'latitude': '11.560000',
                'longitude': '124.395000',
            },
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        request_obj = ServiceRequest.objects.get(id=create_response.data['id'])
        self.assertEqual(request_obj.client, self.other_client_user)
        self.assertEqual(request_obj.status, 'Pending')
        self.assertEqual(request_obj.request_source, 'walk_in')
        self.assertEqual(create_response.data['request_source_label'], 'Walk-in')
        self.assertEqual(request_obj.service_items.count(), 2)
        self.assertEqual(request_obj.location.address, '12 Walk-in Counter Street')
        self.assertEqual(request_obj.location.latitude, Decimal('11.560000'))
        self.assertFalse(ServiceTicket.objects.filter(request=request_obj).exists())

        approve_response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )

        self.assertEqual(approve_response.status_code, status.HTTP_200_OK)
        request_obj.refresh_from_db()
        ticket = ServiceTicket.objects.get(request=request_obj)
        self.assertEqual(request_obj.status, 'Approved')
        self.assertTrue(request_obj.auto_ticket_created)
        self.assertEqual(ticket.assigned_admin, self.admin_user)
        self.assertEqual(ticket.scheduled_date, preferred_date)
        self.assertEqual(ticket.scheduled_time_slot, 'morning')
        self.assertEqual(ticket.notes, 'Client is waiting for dispatch confirmation.')

        tickets_response = self.client.get('/api/services/service-tickets/')
        self.assertEqual(tickets_response.status_code, status.HTTP_200_OK)
        serialized_ticket = next(
            item for item in tickets_response.data['results']
            if item['id'] == ticket.id
        )
        self.assertEqual(
            serialized_ticket['request_details']['service_summary'],
            'Installation, Solar Panel Cleaning',
        )
        self.assertEqual(serialized_ticket['request_details']['request_source'], 'walk_in')
        self.assertEqual(serialized_ticket['request_details']['request_source_label'], 'Walk-in')
        self.assertEqual(
            serialized_ticket['request_details']['client_fullname'],
            self.other_client_user.username,
        )

    def test_approving_request_notifies_dispatch_management_when_ticket_needs_assignment(self):
        dispatch_admin = User.objects.create_user(
            username='dispatch-management',
            password='pass',
            role='admin',
        )
        UserCapabilityGrant.objects.create(
            user=dispatch_admin,
            capability_code=SUPERVISOR_DISPATCH_VIEW,
            granted_by=self.admin_user,
        )
        request_obj = ServiceRequest.objects.create(
            client=self.other_client_user,
            service_type=self.service_type,
            description='Needs dispatch notification',
            priority='Normal',
            status='Pending',
        )

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-requests/{request_obj.id}/approve/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket = ServiceTicket.objects.get(request=request_obj)
        self.assertTrue(Notification.objects.filter(
            user=dispatch_admin,
            ticket=ticket,
            request=request_obj,
            title='Ticket Ready for Dispatch',
            status='unread',
            type='warning',
        ).exists())

    def test_completed_ticket_becomes_heatmap_ready(self):
        self.client.force_authenticate(user=self.client_user)

        create_response = self.client.post(
            '/api/services/service-requests/',
            {
                'service_type': self.service_type.id,
                'description': 'Heatmap ready workflow',
                'priority': 'Normal',
                'location_address': '456 Completion Avenue',
                'location_city': 'Pasig',
                'location_province': 'Metro Manila',
                'latitude': '14.576400',
                'longitude': '121.085100',
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
        ticket.technician = self.technician_user
        ticket.save(update_fields=['technician'])

        self.client.force_authenticate(user=self.technician_user)
        ticket.status = 'Arrived on Site'
        ticket.save(update_fields=['status'])
        start_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/start_work/',
            {},
            format='json',
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        InspectionChecklist.objects.create(
            ticket=ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )

        complete_response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/complete_work/',
            {
                'completion_proof_images': ['https://example.com/proof/job-complete.jpg'],
                'completion_notes': 'All work completed successfully.',
            },
            format='json',
        )

        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        ticket.refresh_from_db()
        request_obj.refresh_from_db()
        self.assertEqual(ticket.status, 'Completed')
        self.assertIsNotNone(ticket.completed_date)
        self.assertEqual(request_obj.status, 'Completed')
        self.assertEqual(ticket.completion_proof_images, ['https://example.com/proof/job-complete.jpg'])
        self.assertEqual(ticket.completion_notes, 'All work completed successfully.')

        self.client.force_authenticate(user=self.admin_user)
        heatmap_response = self.client.get('/api/services/coverage-heatmap/service_density/')

        self.assertEqual(heatmap_response.status_code, status.HTTP_200_OK)
        self.assertEqual(heatmap_response.data['total_points'], 1)
        self.assertEqual(heatmap_response.data['heatmap_data'][0]['address'], '456 Completion Avenue')
        self.assertEqual(heatmap_response.data['heatmap_data'][0]['count'], 1)
