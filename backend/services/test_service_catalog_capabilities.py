from rest_framework import status
from rest_framework.test import APITestCase

from services.models import ServiceType
from users.models import User, UserCapabilityGrant
from users.rbac import PUBLIC_SITE_VIEW, SERVICE_CATALOG_MANAGE, SERVICE_CATALOG_VIEW


class ServiceCatalogCapabilityTests(APITestCase):
    def setUp(self):
        self.active_service = ServiceType.objects.create(
            name='Solar Site Assessment', estimated_duration=120, is_active=True
        )
        self.inactive_service = ServiceType.objects.create(
            name='Legacy Solar Survey', estimated_duration=120, is_active=False
        )
        self.admin_url = '/api/admin/services/'
        self.public_url = '/api/services/service-types/'
        self.payload = {
            'name': 'Solar Installation',
            'description': 'Install an approved solar design.',
            'estimated_duration': 480,
            'estimated_cost': '1000.00',
            'max_daily_assignments': 1,
            'is_active': True,
        }

    def create_admin(self, username, capability):
        user = User.objects.create_user(username=username, password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=user, capability_code=capability)
        return user

    def test_public_catalog_exposes_only_active_services(self):
        response = self.client.get(f'{self.public_url}?include_inactive=true')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {item['name'] for item in response.data['results']}
        self.assertIn(self.active_service.name, names)
        self.assertNotIn(self.inactive_service.name, names)

    def test_view_only_admin_can_read_full_catalog_but_cannot_write(self):
        user = self.create_admin('service-viewer', SERVICE_CATALOG_VIEW)
        self.client.force_authenticate(user)

        response = self.client.get(self.admin_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(self.admin_url, self.payload, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_service_manager_can_read_and_write_catalog(self):
        user = self.create_admin('service-manager', SERVICE_CATALOG_MANAGE)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.admin_url).status_code, status.HTTP_200_OK)
        response = self.client.post(self.admin_url, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_unrelated_configured_admin_cannot_open_admin_catalog(self):
        user = self.create_admin('landing-editor', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.admin_url).status_code, status.HTTP_403_FORBIDDEN)
