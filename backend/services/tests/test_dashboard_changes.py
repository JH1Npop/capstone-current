from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext

from ._imports import *  # noqa: F403,F405


class DashboardChangeTokenTests(APITestCase):
    url = '/api/dashboard/changes/'

    def setUp(self):
        self.admin = User.objects.create_user(username='changes-admin', password='x', role='superadmin', is_staff=True, is_superuser=True)
        self.client_user = User.objects.create_user(username='changes-client', password='x', role='client')
        self.service_type = ServiceType.objects.create(name='Changes', description='x', estimated_duration=60)
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='Watch me', status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj, scheduled_date=timezone.localdate(), status='Not Started',
        )

    def token(self, user, role, now=960_000.0):
        self.client.force_authenticate(user=user)
        with patch('services.views_dashboard.time.time', return_value=now):
            response = self.client.get(self.url, {'role': role})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data['token']

    def test_token_is_stable_until_dashboard_data_changes(self):
        first = self.token(self.admin, 'admin')
        self.assertEqual(self.token(self.admin, 'admin'), first)

        # A partial save does not touch updated_at, but the change log still moves.
        self.ticket.status = 'Navigating'
        self.ticket.save(update_fields=['status'])
        self.assertNotEqual(self.token(self.admin, 'admin'), first)

    def test_token_rolls_over_each_minute_for_time_based_states(self):
        first = self.token(self.client_user, 'client', now=960_000.0)
        self.assertEqual(self.token(self.client_user, 'client', now=960_030.0), first)
        self.assertNotEqual(self.token(self.client_user, 'client', now=960_061.0), first)

    def test_token_is_opaque_and_cheap(self):
        self.client.force_authenticate(user=self.admin)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url, {'role': 'admin'})
        token = response.data['token']
        self.assertRegex(token, r'^[0-9a-f]{24}$')
        # Authentication/capability checks plus a single aggregate.
        self.assertLessEqual(len(queries), 6)

    def test_token_follows_dashboard_workspace_access(self):
        self.client.force_authenticate(user=self.client_user)
        self.assertEqual(self.client.get(self.url, {'role': 'admin'}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.url, {'role': 'technician'}).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get(self.url, {'role': 'unknown'}).status_code, status.HTTP_400_BAD_REQUEST)

        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get(self.url, {'role': 'client'}).status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
