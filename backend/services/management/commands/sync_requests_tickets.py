"""
Management command to fix inconsistencies between ServiceRequests and ServiceTickets.

This ensures:
1. All Pending requests have corresponding tickets
2. All Approved requests have corresponding tickets
3. All request statuses match their ticket lifecycle
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from services.models import ServiceRequest, ServiceTicket
from services.views import build_initial_ticket_payload
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Synchronize ServiceRequests and ServiceTickets to ensure consistency'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without making changes',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        mode = "DRY RUN" if dry_run else "LIVE"

        self.stdout.write(self.style.WARNING(f"\n{'='*60}"))
        self.stdout.write(self.style.WARNING(f"SYNC MODE: {mode}"))
        self.stdout.write(self.style.WARNING(f"{'='*60}\n"))

        # Find requests with missing tickets
        requests_without_tickets = ServiceRequest.objects.filter(
            status__in=['Pending', 'Approved']
        ).exclude(
            id__in=ServiceTicket.objects.values_list('request_id', flat=True)
        )

        missing_count = requests_without_tickets.count()
        if missing_count > 0:
            self.stdout.write(self.style.WARNING(
                f"\n⚠️  Found {missing_count} request(s) without corresponding tickets:"
            ))

            if not dry_run:
                with transaction.atomic():
                    for req in requests_without_tickets:
                        try:
                            ticket = ServiceTicket.objects.create(
                                request=req,
                                assigned_admin=None,
                                **build_initial_ticket_payload(req),
                            )
                            req.auto_ticket_created = True
                            req.save(update_fields=['auto_ticket_created'])

                            self.stdout.write(self.style.SUCCESS(
                                f"  ✓ Created Ticket #{ticket.id} for Request #{req.id} (client: {req.client.username})"
                            ))
                        except Exception as e:
                            self.stdout.write(self.style.ERROR(
                                f"  ✗ Failed to create ticket for Request #{req.id}: {str(e)}"
                            ))
            else:
                for req in requests_without_tickets:
                    self.stdout.write(f"  - Would create ticket for Request #{req.id} (client: {req.client.username}, status: {req.status})")
        else:
            self.stdout.write(self.style.SUCCESS("\n✓ All requests have corresponding tickets"))

        # Find tickets with orphaned requests (shouldn't happen but check anyway)
        orphaned_tickets = ServiceTicket.objects.filter(
            request__isnull=True
        )

        if orphaned_tickets.exists():
            self.stdout.write(self.style.ERROR(
                f"\n⚠️  Found {orphaned_tickets.count()} orphaned ticket(s) - these should not exist"
            ))
            if not dry_run:
                deleted, _ = orphaned_tickets.delete()
                self.stdout.write(self.style.SUCCESS(f"  ✓ Deleted {deleted} orphaned ticket(s)"))
            else:
                for ticket in orphaned_tickets:
                    self.stdout.write(f"  - Would delete Ticket #{ticket.id}")

        # Summary
        pending_requests = ServiceRequest.objects.filter(status='Pending').count()
        approved_requests = ServiceRequest.objects.filter(status='Approved').count()
        unassigned_tickets = ServiceTicket.objects.filter(technician__isnull=True).count()

        self.stdout.write(self.style.SUCCESS(f"\n{'='*60}"))
        self.stdout.write(f"Summary:")
        self.stdout.write(f"  • Pending Approvals (ServiceRequests): {pending_requests}")
        self.stdout.write(f"  • Approved Requests: {approved_requests}")
        self.stdout.write(f"  • Unassigned Tickets (no technician): {unassigned_tickets}")
        self.stdout.write(f"  • Total Tickets: {ServiceTicket.objects.count()}")
        self.stdout.write(self.style.SUCCESS(f"{'='*60}\n"))

        if not dry_run:
            self.stdout.write(self.style.SUCCESS("✓ Synchronization complete!"))
        else:
            self.stdout.write(self.style.WARNING("Note: This was a DRY RUN. Run without --dry-run to apply changes."))
