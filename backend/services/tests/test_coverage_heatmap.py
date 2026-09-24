"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class CoverageHeatmapTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='heatmap_admin',
            password='pass',
            role='admin'
        )
        self.client.force_authenticate(user=self.admin_user)

        self.client_user = User.objects.create_user(
            username='heatmap_client',
            password='pass',
            role='client'
        )
        self.service_type = ServiceType.objects.create(
            name='Heatmap Service',
            description='Heatmap test service',
            estimated_duration=60
        )

    def test_service_density_route_returns_grouped_hotspots(self):
        first_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request 1',
            priority='Normal',
            status='Completed'
        )
        second_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request 2',
            priority='Normal',
            status='Completed'
        )

        ServiceLocation.objects.create(
            request=first_request,
            address='12 Heatmap Street',
            city='Lagos',
            province='Lagos',
            latitude=6.5001,
            longitude=3.3001
        )
        ServiceLocation.objects.create(
            request=second_request,
            address='12 Heatmap Street',
            city='Lagos',
            province='Lagos',
            latitude=6.5001,
            longitude=3.3001
        )

        response = self.client.get('/api/services/coverage-heatmap/service_density/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_points'], 1)
        self.assertEqual(response.data['max_density'], 2)
        self.assertEqual(response.data['heatmap_data'][0]['count'], 2)

    def test_service_density_excludes_unfinished_requests(self):
        active_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Approved request',
            priority='Normal',
            status='Approved',
        )
        completed_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request',
            priority='Normal',
            status='Completed',
        )

        ServiceLocation.objects.create(
            request=active_request,
            address='16 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.6010,
            longitude=120.9860,
        )
        ServiceLocation.objects.create(
            request=completed_request,
            address='16 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.6010,
            longitude=120.9860,
        )

        response = self.client.get('/api/services/coverage-heatmap/service_density/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_points'], 1)
        point = response.data['heatmap_data'][0]
        self.assertEqual(point['count'], 1)
        self.assertEqual(point['status_breakdown'][0]['name'], 'Completed')

    def test_service_density_supports_client_and_technician_filters(self):
        technician = User.objects.create_user(
            username='heatmap_technician',
            password='pass',
            role='technician',
            status='active',
            current_latitude=14.5995,
            current_longitude=120.9842,
        )
        other_client = User.objects.create_user(
            username='other_heatmap_client',
            password='pass',
            role='client',
        )
        matching_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Matching completed request',
            priority='Normal',
            status='Completed',
        )
        other_request = ServiceRequest.objects.create(
            client=other_client,
            service_type=self.service_type,
            description='Other completed request',
            priority='Normal',
            status='Completed',
        )
        ServiceLocation.objects.create(
            request=matching_request,
            address='14 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.5995,
            longitude=120.9842,
        )
        ServiceLocation.objects.create(
            request=other_request,
            address='15 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.6000,
            longitude=120.9850,
        )
        ServiceTicket.objects.create(
            request=matching_request,
            technician=technician,
            scheduled_date=timezone.localdate(),
            status='Completed',
            completed_date=timezone.now(),
        )

        response = self.client.get(
            '/api/services/coverage-heatmap/service_density/',
            {'client': self.client_user.id, 'technician': technician.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_points'], 1)
        point = response.data['heatmap_data'][0]
        self.assertEqual(point['count'], 1)
        self.assertEqual(point['clients'][0]['id'], self.client_user.id)
        self.assertEqual(point['technicians'][0]['id'], technician.id)
