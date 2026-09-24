"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class OperationalDataAccessTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='ops_client',
            password='pass',
            role='client',
        )
        self.operations_admin = User.objects.create_user(
            username='ops_admin',
            password='pass',
            role='admin',
        )

    def test_client_cannot_access_operational_intelligence_endpoints(self):
        self.client.force_authenticate(user=self.client_user)

        endpoints = [
            '/api/services/gis-dashboard/dashboard_data/',
            '/api/services/analytics/',
            '/api/services/technician-performance/',
            '/api/services/demand-forecasts/',
            '/api/services/service-trends/',
            '/api/services/coverage-heatmap/service_density/',
        ]

        for endpoint in endpoints:
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, endpoint)

    def test_admin_can_access_operational_dashboards(self):
        self.client.force_authenticate(user=self.operations_admin)

        for endpoint in (
            '/api/services/gis-dashboard/dashboard_data/',
            '/api/services/analytics/',
            '/api/services/coverage-heatmap/service_density/',
        ):
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, status.HTTP_200_OK, endpoint)

    def test_coverage_and_job_history_use_distinct_capabilities(self):
        tracking_admin = User.objects.create_user(
            username='coverage-only-admin', password='pass', role='admin'
        )
        history_admin = User.objects.create_user(
            username='history-only-admin', password='pass', role='admin'
        )
        UserCapabilityGrant.objects.create(
            user=tracking_admin,
            capability_code=SUPERVISOR_TRACKING_VIEW,
        )
        UserCapabilityGrant.objects.create(
            user=history_admin,
            capability_code=ADMIN_JOB_HISTORY_VIEW,
        )

        self.client.force_authenticate(user=tracking_admin)
        self.assertEqual(
            self.client.get('/api/services/coverage-heatmap/service_density/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get('/api/services/coverage-heatmap/completed_jobs/').status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(user=history_admin)
        self.assertEqual(
            self.client.get('/api/services/coverage-heatmap/service_density/').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get('/api/services/coverage-heatmap/completed_jobs/').status_code,
            status.HTTP_200_OK,
        )
