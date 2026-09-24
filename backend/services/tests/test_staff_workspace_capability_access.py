"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405
from services.models import TechnicianLocationHistory


class StaffWorkspaceCapabilityAccessTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='staff_cap_admin',
            password='pass',
            role='admin',
        )
        self.operations_admin = User.objects.create_user(
            username='staff_cap_operations_admin',
            password='pass',
            role='admin',
        )
        self.technician_user = User.objects.create_user(
            username='staff_cap_technician',
            password='pass',
            role='technician',
            status='active',
            is_available=True,
        )
        self.client_user = User.objects.create_user(
            username='staff_cap_client',
            password='pass',
            role='client',
            email='staff-cap-client@example.com',
        )
        self.service_type = ServiceType.objects.create(
            name='Staff Capability Service',
            description='Role-scoped capability access test',
            estimated_duration=60,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Assigned request',
            priority='Normal',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=self.request_obj,
            address='100 Staff Capability Lane',
            city='Pasig',
            province='Metro Manila',
            latitude=14.5764,
            longitude=121.0851,
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            assigned_admin=self.operations_admin,
            technician=self.technician_user,
            scheduled_date=timezone.now().date(),
            status='Not Started',
            priority='Normal',
        )

    def test_tracking_only_admin_cannot_open_full_operations_dashboard(self):
        UserCapabilityGrant.objects.create(
            user=self.operations_admin,
            capability_code=SUPERVISOR_TRACKING_VIEW,
            granted_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.operations_admin)

        dashboard_response = self.client.get('/api/dashboard/stats/', {'role': 'supervisor'})
        tracking_response = self.client.get('/api/tracking/')

        self.assertEqual(dashboard_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(tracking_response.status_code, status.HTTP_200_OK)

    def test_dashboard_capability_opens_operations_dashboard(self):
        UserCapabilityGrant.objects.create(
            user=self.operations_admin,
            capability_code=SUPERVISOR_DASHBOARD_VIEW,
            granted_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.operations_admin)

        response = self.client.get('/api/dashboard/stats/', {'role': 'admin'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'admin')

    def test_superadmin_can_open_admin_tracking(self):
        superadmin_user = User.objects.create_user(
            username='staff_cap_superadmin',
            password='pass',
            role='superadmin',
        )
        profile = self.technician_user.technician_profile
        profile.current_latitude = Decimal('14.576400')
        profile.current_longitude = Decimal('121.085100')
        profile.last_location_update = timezone.now()
        profile.save(update_fields=['current_latitude', 'current_longitude', 'last_location_update'])
        TechnicianLocationHistory.objects.create(
            technician=self.technician_user,
            latitude=profile.current_latitude,
            longitude=profile.current_longitude,
            accuracy=12.5,
        )
        self.ticket.status = 'Ready for Service'
        self.ticket.save(update_fields=['status'])
        self.client.force_authenticate(user=superadmin_user)

        tracking_response = self.client.get('/api/tracking/')

        self.assertEqual(tracking_response.status_code, status.HTTP_200_OK)
        self.assertIn('generatedAt', tracking_response.data)
        self.assertEqual(tracking_response.data['trackingConfig']['region']['name'], 'CALABARZON')
        self.assertEqual(tracking_response.data['trackingConfig']['policy']['retentionDays'], 30)
        self.assertEqual(tracking_response.data['trackingConfig']['policy']['recentTrailMinutes'], 60)
        marker = next(item for item in tracking_response.data['techMarkers'] if item['id'] == self.technician_user.id)
        self.assertEqual(marker['gpsState'], 'fresh')
        self.assertEqual(marker['gpsAccuracy'], 12.5)
        self.assertEqual(marker['activeJobs'][0]['id'], self.ticket.id)
        ticket_marker = next(item for item in tracking_response.data['ticketMarkers'] if item['id'] == self.ticket.id)
        self.assertEqual(ticket_marker['city'], 'Pasig')
        self.assertEqual(ticket_marker['priority'], 'Normal')
        self.assertEqual(ticket_marker['status'], 'ready_for_service')

    def test_tracking_admin_can_filter_recent_location_history_by_technician(self):
        UserCapabilityGrant.objects.create(
            user=self.operations_admin,
            capability_code=SUPERVISOR_TRACKING_VIEW,
            granted_by=self.admin_user,
        )
        other_technician = User.objects.create_user(
            username='staff_cap_other_technician',
            password='pass',
            role='technician',
            status='active',
        )
        included = TechnicianLocationHistory.objects.create(
            technician=self.technician_user,
            latitude=Decimal('14.576400'),
            longitude=Decimal('121.085100'),
            accuracy=8,
        )
        TechnicianLocationHistory.objects.create(
            technician=other_technician,
            latitude=Decimal('14.600000'),
            longitude=Decimal('121.100000'),
            accuracy=20,
        )
        self.client.force_authenticate(user=self.operations_admin)

        response = self.client.get('/api/services/technician-locations/', {
            'technician': self.technician_user.id,
            'minutes': 60,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data.get('results', response.data)
        self.assertEqual([row['id'] for row in rows], [included.id])

    def test_location_policy_is_visible_to_technician_but_not_client(self):
        self.client.force_authenticate(user=self.technician_user)
        technician_response = self.client.get('/api/services/technician-locations/policy/')

        self.assertEqual(technician_response.status_code, status.HTTP_200_OK)
        self.assertEqual(technician_response.data['policy']['retentionDays'], 30)
        self.assertEqual(technician_response.data['region']['southWest'], [13.38, 119.88])

        self.client.force_authenticate(user=self.client_user)
        client_response = self.client.get('/api/services/technician-locations/policy/')
        self.assertEqual(client_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_without_tracking_access_cannot_access_technician_location_feeds(self):
        limited_user = User.objects.create_user(
            username='staff_cap_limited_user',
            password='pass',
            role='technician',
        )
        UserCapabilityGrant.objects.create(
            user=limited_user,
            capability_code=SUPERVISOR_TICKETS_VIEW,
            granted_by=self.admin_user,
        )
        self.client.force_authenticate(user=limited_user)

        history_response = self.client.get('/api/services/technician-locations/')
        all_locations_response = self.client.get('/api/services/technician-locations/all_technicians_locations/')

        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(all_locations_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_operations_admin_can_access_technician_location_feeds(self):
        self.technician_user.current_latitude = 14.5764
        self.technician_user.current_longitude = 121.0851
        self.technician_user.save(update_fields=['current_latitude', 'current_longitude'])
        UserCapabilityGrant.objects.create(
            user=self.operations_admin,
            capability_code=SUPERVISOR_TRACKING_VIEW,
            granted_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.operations_admin)

        history_response = self.client.get('/api/services/technician-locations/')
        all_locations_response = self.client.get('/api/services/technician-locations/all_technicians_locations/')

        self.assertEqual(history_response.status_code, status.HTTP_200_OK)
        self.assertEqual(all_locations_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(all_locations_response.data), 1)
        self.assertEqual(all_locations_response.data[0]['id'], self.technician_user.id)

    def test_technician_with_profile_only_capability_cannot_open_dashboard_or_jobs(self):
        UserCapabilityGrant.objects.create(
            user=self.technician_user,
            capability_code=TECHNICIAN_PROFILE_VIEW,
            granted_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.technician_user)

        dashboard_response = self.client.get('/api/technician/dashboard/')
        jobs_response = self.client.get('/api/technician/jobs/')
        profile_response = self.client.get('/api/technician/profile/')

        self.assertEqual(dashboard_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(jobs_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(profile_response.status_code, status.HTTP_200_OK)

    def test_technician_dashboard_endpoint_returns_200_for_granted_technician(self):
        UserCapabilityGrant.objects.create(
            user=self.technician_user,
            capability_code=TECHNICIAN_DASHBOARD_VIEW,
            granted_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.technician_user)

        response = self.client.get('/api/technician/dashboard/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['technician']['id'], self.technician_user.id)
        self.assertIn('full_name', response.data['technician'])
        self.assertIn('current_location', response.data['technician'])
