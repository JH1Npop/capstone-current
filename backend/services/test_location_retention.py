from io import StringIO

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from services.models import TechnicianLocationHistory
from users.models import User


class TechnicianLocationRetentionTests(TestCase):
    def setUp(self):
        self.technician = User.objects.create_user(
            username='location_retention_technician',
            password='pass',
            role='technician',
            status='active',
        )

    @override_settings(TECHNICIAN_LOCATION_RETENTION_DAYS=30)
    def test_command_removes_only_expired_location_rows(self):
        expired = TechnicianLocationHistory.objects.create(
            technician=self.technician,
            latitude=14.1,
            longitude=121.1,
            accuracy=10,
        )
        retained = TechnicianLocationHistory.objects.create(
            technician=self.technician,
            latitude=14.2,
            longitude=121.2,
            accuracy=8,
        )
        TechnicianLocationHistory.objects.filter(pk=expired.pk).update(
            timestamp=timezone.now() - timezone.timedelta(days=31)
        )
        profile = self.technician.technician_profile
        profile.current_latitude = 14.1
        profile.current_longitude = 121.1
        profile.last_location_update = timezone.now() - timezone.timedelta(days=31)
        profile.save(update_fields=['current_latitude', 'current_longitude', 'last_location_update'])

        output = StringIO()
        call_command('purge_technician_locations', stdout=output)

        self.assertFalse(TechnicianLocationHistory.objects.filter(pk=expired.pk).exists())
        self.assertTrue(TechnicianLocationHistory.objects.filter(pk=retained.pk).exists())
        self.assertIn('Deleted 1 technician location row(s)', output.getvalue())
        profile.refresh_from_db()
        self.assertIsNone(profile.current_latitude)
        self.assertIsNone(profile.current_longitude)
        self.assertIsNone(profile.last_location_update)
