from unittest.mock import patch
from django.test import TestCase
from django.db import DatabaseError
from rest_framework import status
from rest_framework.test import APIClient


class HealthProbeTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_liveness_endpoint_returns_200(self):
        response = self.client.get('/api/health/liveness/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ok')
        self.assertEqual(response.data['service'], 'afn_service_management')

    def test_readiness_endpoint_healthy(self):
        response = self.client.get('/api/health/readiness/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ready')
        self.assertIn('database', response.data['checks'])
        self.assertIn('cache', response.data['checks'])
        self.assertIn('storage', response.data['checks'])
        self.assertEqual(response.data['checks']['database'], 'ready')

    @patch('django.db.connection.cursor')
    def test_readiness_endpoint_database_failure(self, mock_cursor):
        mock_cursor.side_effect = DatabaseError('DB connection lost')
        response = self.client.get('/api/health/readiness/')
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data['status'], 'unavailable')
        self.assertEqual(response.data['checks']['database'], 'unavailable')

    def test_database_health_endpoint(self):
        response = self.client.get('/api/health/database/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'ready')
