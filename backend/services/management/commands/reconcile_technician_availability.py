from django.core.management.base import BaseCommand

from services.views.helpers import (
    get_expected_technician_availability,
    sync_technician_availability,
)
from users.models import User


class Command(BaseCommand):
    help = (
        'Report stale technician availability derived from active field work. '
        'Use --apply to repair mismatches.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist the derived availability values (default is dry-run).',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']
        checked = 0
        mismatched = 0
        changed = 0

        technicians = User.objects.filter(role='technician').order_by('id')
        for technician in technicians.iterator():
            checked += 1
            expected = get_expected_technician_availability(technician)
            if technician.is_available == expected:
                continue

            mismatched += 1
            self.stdout.write(
                f'Technician ID {technician.id}: '
                f'is_available={technician.is_available}, expected={expected}'
            )
            if apply_changes and sync_technician_availability(technician):
                changed += 1

        mode = 'applied' if apply_changes else 'dry-run'
        self.stdout.write(
            self.style.SUCCESS(
                f'Availability reconciliation {mode}: checked={checked}, '
                f'mismatched={mismatched}, changed={changed}.'
            )
        )
