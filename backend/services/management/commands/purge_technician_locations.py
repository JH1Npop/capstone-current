from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from services.models import TechnicianLocationHistory
from users.models import TechnicianProfile


class Command(BaseCommand):
    help = 'Delete technician GPS history older than the configured retention period.'

    def handle(self, *args, **options):
        retention_days = settings.TECHNICIAN_LOCATION_RETENTION_DAYS
        cutoff = timezone.now() - timezone.timedelta(days=retention_days)
        deleted_count, _ = TechnicianLocationHistory.objects.filter(
            timestamp__lt=cutoff
        ).delete()
        cleared_profile_count = TechnicianProfile.objects.filter(
            last_location_update__lt=cutoff
        ).update(
            current_latitude=None,
            current_longitude=None,
            last_location_update=None,
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'Deleted {deleted_count} technician location row(s) older than '
                f'{retention_days} day(s) and cleared {cleared_profile_count} '
                'expired current-location profile(s).'
            )
        )
