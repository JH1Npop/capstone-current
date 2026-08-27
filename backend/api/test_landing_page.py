from rest_framework import status
from rest_framework.test import APITestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile

from users.models import AdminSettings, LandingPageAsset, User, UserCapabilityGrant
from users.rbac import PUBLIC_SITE_MANAGE, PUBLIC_SITE_VIEW


class LandingPageSettingsTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='landing-admin',
            password='test-password',
            role='admin',
        )
        self.client_user = User.objects.create_user(
            username='landing-client',
            password='test-password',
            role='client',
        )

    def test_public_endpoint_returns_safe_landing_configuration(self):
        response = self.client.get('/api/public/landing-page/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('landingPageContent', response.data)
        self.assertIn('solarCalculatorSettings', response.data)
        self.assertNotIn('supportEmail', response.data)

    def test_admin_can_publish_landing_content_and_public_endpoint_reflects_it(self):
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=PUBLIC_SITE_MANAGE)
        self.client.force_authenticate(user=self.admin)
        response = self.client.put(
            '/api/admin/settings/',
            {
                'landingPageContent': {'headline': 'Power your future'},
                'solarCalculatorSettings': {
                    'enabled': True,
                    'defaultPeakSunHours': 5,
                    'defaultPerformanceRatio': 0.8,
                    'defaultPanelWattage': 550,
                    'defaultElectricityRate': 12,
                    'defaultDesiredOffset': 100,
                },
                'landingPagePromotions': [{
                    'id': 'panel-offer',
                    'name': '550 W panel offer',
                    'active': True,
                    'panelWattage': 550,
                    'ctaUrl': '#contact',
                }],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(AdminSettings.objects.get().landing_page_content['headline'], 'Power your future')
        self.assertEqual(AdminSettings.objects.get().landing_page_promotions[0]['panelWattage'], 550)

        self.client.force_authenticate(user=None)
        public_response = self.client.get('/api/public/landing-page/')
        self.assertEqual(public_response.data['landingPageContent']['headline'], 'Power your future')

    def test_client_cannot_update_landing_content(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.put(
            '/api/admin/settings/',
            {'landingPageContent': {'headline': 'Unauthorized change'}},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_without_public_site_capability_cannot_read_or_publish_landing_settings(self):
        self.client.force_authenticate(user=self.admin)

        read_response = self.client.get('/api/admin/settings/')
        write_response = self.client.put(
            '/api/admin/settings/',
            {'landingPageContent': {'headline': 'Unauthorized change'}},
            format='json',
        )

        self.assertEqual(read_response.status_code, status.HTTP_200_OK)
        self.assertNotIn('landingPageContent', read_response.data)
        self.assertFalse(read_response.data['canViewLandingPage'])
        self.assertEqual(write_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_view_only_admin_can_read_but_cannot_publish_landing_settings(self):
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user=self.admin)

        read_response = self.client.get('/api/admin/settings/')
        write_response = self.client.put(
            '/api/admin/settings/',
            {'landingPageContent': {'headline': 'View-only change'}},
            format='json',
        )

        self.assertEqual(read_response.status_code, status.HTTP_200_OK)
        self.assertIn('landingPageContent', read_response.data)
        self.assertTrue(read_response.data['canViewLandingPage'])
        self.assertFalse(read_response.data['canManageLandingPage'])
        self.assertEqual(write_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_endpoint_filters_scheduled_expired_and_inactive_promotions(self):
        today = timezone.localdate()
        settings = AdminSettings.objects.create(
            landing_page_promotions=[
                {'id': 'current', 'name': 'Current offer', 'active': True, 'startDate': str(today), 'endDate': str(today)},
                {'id': 'future', 'name': 'Future offer', 'active': True, 'startDate': str(today + timezone.timedelta(days=1))},
                {'id': 'expired', 'name': 'Expired offer', 'active': True, 'endDate': str(today - timezone.timedelta(days=1))},
                {'id': 'inactive', 'name': 'Inactive offer', 'active': False},
            ]
        )

        response = self.client.get('/api/public/landing-page/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item['id'] for item in response.data['landingPagePromotions']], ['current'])
        settings.delete()

    def test_manage_capability_can_upload_and_delete_valid_image(self):
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=PUBLIC_SITE_MANAGE)
        self.client.force_authenticate(user=self.admin)
        image = SimpleUploadedFile(
            'solar-panel.png',
            b'\x89PNG\r\n\x1a\n' + (b'\x00' * 24),
            content_type='image/png',
        )

        upload_response = self.client.post(
            '/api/admin/settings/landing-images/',
            {'image': image},
            format='multipart',
        )

        self.assertEqual(upload_response.status_code, status.HTTP_201_CREATED, upload_response.data)
        asset_id = upload_response.data['id']
        self.assertTrue(LandingPageAsset.objects.filter(pk=asset_id).exists())
        self.assertIn('/landing_page/', upload_response.data['url'])

        delete_response = self.client.delete(f'/api/admin/settings/landing-images/{asset_id}/')
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(LandingPageAsset.objects.filter(pk=asset_id).exists())

    def test_view_only_capability_cannot_upload_image(self):
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user=self.admin)
        image = SimpleUploadedFile(
            'solar-panel.png',
            b'\x89PNG\r\n\x1a\n' + (b'\x00' * 24),
            content_type='image/png',
        )

        response = self.client.post(
            '/api/admin/settings/landing-images/',
            {'image': image},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(LandingPageAsset.objects.exists())

    def test_upload_rejects_spoofed_image_content(self):
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=PUBLIC_SITE_MANAGE)
        self.client.force_authenticate(user=self.admin)
        fake_image = SimpleUploadedFile(
            'not-really-an-image.png',
            b'this is plain text',
            content_type='image/png',
        )

        response = self.client.post(
            '/api/admin/settings/landing-images/',
            {'image': fake_image},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(LandingPageAsset.objects.exists())
