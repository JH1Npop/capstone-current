from rest_framework import status
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceRequestService, ServiceType
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

    def test_used_service_is_marked_for_deactivation_and_can_be_made_inactive(self):
        manager = self.create_admin('service-lifecycle-manager', SERVICE_CATALOG_MANAGE)
        client_user = User.objects.create_user(
            username='service-history-client', password='pass', role='client'
        )
        service_request = ServiceRequest.objects.create(
            client=client_user,
            service_type=self.active_service,
            description='Historical service request',
        )
        ServiceRequestService.objects.create(
            request=service_request,
            service_type=self.active_service,
        )
        self.client.force_authenticate(manager)

        catalog = self.client.get(self.admin_url)
        self.assertEqual(catalog.status_code, status.HTTP_200_OK)
        row = next(item for item in catalog.data if item['id'] == self.active_service.id)
        self.assertFalse(row['can_delete'])
        self.assertEqual(row['request_count'], 1)
        self.assertEqual(row['service_item_count'], 1)
        self.assertGreaterEqual(row['usage_count'], 2)

        refused = self.client.delete(f'{self.admin_url}{self.active_service.id}/')
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(refused.data['service_item_count'], 1)

        deactivated = self.client.put(
            f'{self.admin_url}{self.active_service.id}/',
            {'is_active': False},
            format='json',
        )
        self.assertEqual(deactivated.status_code, status.HTTP_200_OK, deactivated.data)
        self.active_service.refresh_from_db()
        self.assertFalse(self.active_service.is_active)

    def test_unused_service_is_marked_as_permanently_deletable(self):
        manager = self.create_admin('service-delete-manager', SERVICE_CATALOG_MANAGE)
        self.client.force_authenticate(manager)

        catalog = self.client.get(self.admin_url)
        row = next(item for item in catalog.data if item['id'] == self.inactive_service.id)
        self.assertTrue(row['can_delete'])
        self.assertEqual(row['usage_count'], 0)

        deleted = self.client.delete(f'{self.admin_url}{self.inactive_service.id}/')
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ServiceType.objects.filter(pk=self.inactive_service.id).exists())

    def test_unrelated_configured_admin_cannot_open_admin_catalog(self):
        user = self.create_admin('landing-editor', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.admin_url).status_code, status.HTTP_403_FORBIDDEN)
