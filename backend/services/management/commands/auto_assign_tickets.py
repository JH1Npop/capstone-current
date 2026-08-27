"""
Management command to perform manual auto-dispatch for unassigned tickets.

This command can be used to:
1. Process all unassigned tickets (if auto-dispatch is enabled)
2. Force reassignment of existing tickets
3. Test auto-dispatch logic

Usage:
    python manage.py auto_assign_tickets                    # Auto-assign all pending tickets
    python manage.py auto_assign_tickets --verbose          # Show detailed output
    python manage.py auto_assign_tickets --dry-run          # Show what would happen without making changes
    python manage.py auto_assign_tickets --reassign          # Attempt to reassign already-assigned tickets
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from services.models import ServiceTicket
from services.auto_dispatch import (
    auto_assign_technician,
    should_attempt_auto_dispatch,
    reassign_if_needed,
)
from services.views import ACTIVE_TICKET_STATUSES
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Perform auto-assignment of technicians to unassigned service tickets"

    def add_arguments(self, parser):
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed output including processing of each ticket',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would happen without making actual changes',
        )
        parser.add_argument(
            '--reassign',
            action='store_true',
            help='Attempt to reassign already-assigned tickets if conditions warrant',
        )
        parser.add_argument(
            '--ticket-ids',
            type=str,
            help='Comma-separated list of ticket IDs to process',
        )

    def handle(self, *args, **options):
        verbose = options['verbose']
        dry_run = options['dry_run']
        reassign = options['reassign']
        ticket_ids_str = options.get('ticket_ids')

        mode = "DRY-RUN" if dry_run else "LIVE"
        self.stdout.write(
            self.style.SUCCESS(
                f"Starting auto-assignment [{mode}] at {timezone.now().isoformat()}"
            )
        )

        # Get tickets to process
        if ticket_ids_str:
            ticket_ids = [int(tid.strip()) for tid in ticket_ids_str.split(',')]
            tickets = ServiceTicket.objects.filter(id__in=ticket_ids)
        else:
            # Get unassigned active tickets
            if reassign:
                # Get all active tickets (assigned or not)
                tickets = ServiceTicket.objects.filter(
                    status__in=ACTIVE_TICKET_STATUSES,
                )
            else:
                # Get only unassigned active tickets
                tickets = ServiceTicket.objects.filter(
                    status__in=ACTIVE_TICKET_STATUSES,
                    technician__isnull=True,
                )

        if verbose:
            self.stdout.write(f"Found {tickets.count()} ticket(s) to process")

        successful_assignments = 0
        skipped_assignments = 0
        reassignments = 0

        for ticket in tickets:
            if verbose:
                status_info = f"[{ticket.id}] {ticket.request.service_type.name} - "
                if ticket.technician:
                    status_info += f"Assigned to {ticket.technician.username}"
                else:
                    status_info += "Unassigned"
                self.stdout.write(status_info)

            if reassign and ticket.technician:
                # Attempt reassignment if enabled
                if verbose:
                    self.stdout.write(f"  → Checking if reassignment needed...")

                if dry_run:
                    # Just evaluate, don't make changes
                    if should_attempt_auto_dispatch(ticket):
                        self.stdout.write(
                            self.style.WARNING(f"  → Would attempt reassignment")
                        )
                    else:
                        self.stdout.write(f"  → Reassignment not applicable")
                else:
                    if reassign_if_needed(ticket):
                        self.stdout.write(
                            self.style.SUCCESS(f"  → Reassigned to new technician")
                        )
                        reassignments += 1
                    else:
                        self.stdout.write(f"  → No reassignment needed")
                        skipped_assignments += 1

            elif not ticket.technician:
                # Attempt assignment for unassigned tickets
                if should_attempt_auto_dispatch(ticket):
                    if verbose:
                        self.stdout.write(f"  → Attempting assignment...")

                    if dry_run:
                        self.stdout.write(
                            self.style.WARNING(
                                f"  → [DRY-RUN] Would attempt auto-assignment"
                            )
                        )
                        skipped_assignments += 1
                    else:
                        if auto_assign_technician(ticket):
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  → Assigned to {ticket.technician.username} "
                                    f"(score: {ticket.smart_assignment_score})"
                                )
                            )
                            successful_assignments += 1
                        else:
                            self.stdout.write(
                                self.style.WARNING(
                                    f"  → No suitable technician found"
                                )
                            )
                            skipped_assignments += 1
                else:
                    if verbose:
                        self.stdout.write(f"  → Skipped (not applicable for auto-dispatch)")
                    skipped_assignments += 1
            else:
                # Already assigned, no action unless reassign is enabled
                skipped_assignments += 1

        # Print summary
        self.stdout.write("\n" + "="*60)
        self.stdout.write(self.style.SUCCESS("SUMMARY"))
        self.stdout.write("="*60)
        self.stdout.write(f"Successful assignments: {successful_assignments}")
        self.stdout.write(f"Reassignments: {reassignments}")
        self.stdout.write(f"Skipped: {skipped_assignments}")
        self.stdout.write(
            f"Total processed: {successful_assignments + reassignments + skipped_assignments}"
        )

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "\n[DRY-RUN MODE] No changes were actually made"
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"\nAuto-assignment completed at {timezone.now().isoformat()}"
            )
        )
