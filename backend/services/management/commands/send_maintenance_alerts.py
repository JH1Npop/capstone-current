from django.core.management.base import BaseCommand

from services.maintenance import process_maintenance_alerts


class Command(BaseCommand):
    help = 'Send due-soon and due maintenance alerts to admin and follow-up users.'

    def handle(self, *args, **options):
        summary = process_maintenance_alerts()
        due_soon_total = summary.get('seven_day', 0) + summary.get('three_day', 0)
        self.stdout.write(
            self.style.SUCCESS(
                f"Processed maintenance alerts: {due_soon_total} due soon, {summary['due']} due."
            )
        )

