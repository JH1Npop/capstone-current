"""Technician tracking accuracy: which phone readings become the current position."""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import TechnicianLocationHistory
from users.models import User

URL = '/api/services/technician/location/'


class LocationQualityTests(APITestCase):
    def setUp(self):
        self.technician = User.objects.create_user(username='gps_tech', password='pass', role='technician')
        self.client.force_authenticate(user=self.technician)

    def post(self, lat, lng, accuracy, **extra):
        response = self.client.post(URL, {'latitude': lat, 'longitude': lng, 'accuracy': accuracy, **extra}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def profile(self):
        return self.technician._get_or_create_technician_profile()

    def test_precise_reading_is_saved_as_current_position(self):
        data = self.post('14.284000', '121.092000', 8)
        self.assertTrue(data['accepted'])
        self.assertEqual(self.profile().current_latitude, Decimal('14.284000'))
        self.assertEqual(TechnicianLocationHistory.objects.filter(technician=self.technician).count(), 1)

    def test_rough_reading_does_not_replace_a_recent_precise_one(self):
        self.post('14.284000', '121.092000', 8)
        data = self.post('14.300000', '121.120000', 1500)
        self.assertFalse(data['accepted'])
        self.assertEqual(data['reason'], 'rough_reading')
        self.assertEqual(self.profile().current_latitude, Decimal('14.284000'))
        self.assertEqual(TechnicianLocationHistory.objects.filter(technician=self.technician).count(), 1)

    def test_rough_reading_is_used_when_no_recent_precise_one_exists(self):
        first = self.post('14.284000', '121.092000', 8)
        self.assertTrue(first['accepted'])
        TechnicianLocationHistory.objects.filter(technician=self.technician).update(
            timestamp=timezone.now() - timezone.timedelta(minutes=4),
        )
        data = self.post('14.300000', '121.120000', 1500)
        self.assertTrue(data['accepted'])
        self.assertEqual(self.profile().current_latitude, Decimal('14.300000'))

    def test_cached_reading_older_than_two_minutes_is_ignored(self):
        data = self.post('14.284000', '121.092000', 8, reading_age_ms=180000)
        self.assertFalse(data['accepted'])
        self.assertEqual(data['reason'], 'stale_reading')
        self.assertIsNone(self.profile().current_latitude)
        self.assertFalse(TechnicianLocationHistory.objects.filter(technician=self.technician).exists())

    def test_reading_is_stamped_with_when_the_phone_measured_it(self):
        before = timezone.now()
        self.post('14.284000', '121.092000', 8, reading_age_ms=45000)
        history = TechnicianLocationHistory.objects.get(technician=self.technician)
        expected = before - timezone.timedelta(seconds=45)
        self.assertLess(abs((history.timestamp - expected).total_seconds()), 3)
        self.assertLess(abs((self.profile().last_location_update - expected).total_seconds()), 3)

    def test_missing_or_invalid_age_means_measured_now(self):
        self.post('14.284000', '121.092000', 8, reading_age_ms='abc')
        history = TechnicianLocationHistory.objects.get(technician=self.technician)
        self.assertLess(abs((history.timestamp - timezone.now()).total_seconds()), 3)

    def test_two_rough_readings_never_show_as_moving(self):
        now = timezone.now()
        for seconds_ago, lat, accuracy in ((30, '14.280000', 400), (0, '14.284000', 450)):
            row = TechnicianLocationHistory.objects.create(
                technician=self.technician, latitude=Decimal(lat), longitude=Decimal('121.092000'), accuracy=accuracy,
            )
            TechnicianLocationHistory.objects.filter(pk=row.pk).update(timestamp=now - timezone.timedelta(seconds=seconds_ago))
        profile = self.profile()
        profile.current_latitude = Decimal('14.284000')
        profile.current_longitude = Decimal('121.092000')
        profile.last_location_update = now
        profile.save()
        admin = User.objects.create_user(username='gps_admin', password='pass', role='superadmin')
        self.client.force_authenticate(user=admin)
        response = self.client.get('/api/tracking/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        marker = next(item for item in response.data['techMarkers'] if item['id'] == self.technician.id)
        self.assertEqual(marker['movementState'], 'unknown')
        self.assertEqual(marker['gpsAccuracy'], 450)
