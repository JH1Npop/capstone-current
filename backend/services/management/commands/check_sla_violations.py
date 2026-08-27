"""
Management command to check and escalate SLA violations.

Usage:
    python manage.py check_sla_violations          # Check for all violations and warnings
    python manage.py check_sla_violations --warnings-only     # Only check for warnings
    python manage.py check_sla_violations --escalations-only  # Only perform escalations
"""

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from services.sla import check_and_escalate_sla_breaches, check_sla_warnings
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Check and escalate SLA violations for service requests and tickets"

    def add_arguments(self, parser):
        parser.add_argument(
            '--warnings-only',
            action='store_true',
            help='Only check for SLA warnings, do not escalate breaches',
        )
        parser.add_argument(
            '--escalations-only',
            action='store_true',
            help='Only escalate SLA breaches, do not check for warnings',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed output',
        )

    def handle(self, *args, **options):
        warnings_only = options['warnings_only']
        escalations_only = options['escalations_only']
        verbose = options['verbose']

        self.stdout.write(
            self.style.SUCCESS(
                f"Starting SLA violation check at {timezone.now().isoformat()}"
            )
        )

        try:
            # Check for escalations (SLA breaches)
            if not warnings_only:
                self.stdout.write("Checking for SLA breaches...")
                escalations = check_and_escalate_sla_breaches()

                total_escalations = sum(escalations.values())
                if total_escalations > 0:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Found {total_escalations} SLA breach(es) to escalate:"
                        )
                    )
                    for escalation_type, count in escalations.items():
                        if count > 0:
                            self.stdout.write(f"  - {escalation_type}: {count}")
                else:
                    self.stdout.write(
                        self.style.SUCCESS("No SLA breaches found")
                    )

            # Check for warnings (approaching breach)
            if not escalations_only:
                self.stdout.write("\nChecking for SLA warnings...")
                warnings = check_sla_warnings()

                total_warnings = sum(warnings.values())
                if total_warnings > 0:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Found {total_warnings} SLA warning(s):"
                        )
                    )
                    for warning_type, count in warnings.items():
                        if count > 0:
                            self.stdout.write(f"  - {warning_type}: {count}")
                else:
                    self.stdout.write(
                        self.style.SUCCESS("No SLA warnings found")
                    )

            self.stdout.write(
                self.style.SUCCESS(
                    f"\nSLA check completed at {timezone.now().isoformat()}"
                )
            )

        except Exception as e:
            logger.error(f"Error during SLA check: {e}", exc_info=True)
            raise CommandError(f"Error checking SLA violations: {e}")
