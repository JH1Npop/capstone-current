"""List inspection visits stuck by the two bugs the flow explorer found (fixed 2026-11-18).

A. Still travelling/on site/working, but the report record is already complete (a service checklist
   was saved on the visit). Nothing could move it. --apply moves it to "Inspection Completed" so the
   office can review it, the same step the report submission makes.
B. In "Ready for Service" / "Awaiting Materials" while still an inspection visit (a manual status
   change skipped the office review). Reported only: the office decides (dispatch the inspection
   again from the Dispatch Board, or cancel).

Dry-run by default; nothing is written without --apply.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from services.models import InspectionChecklist, ServiceStatusHistory, ServiceTicket
from services.views.helpers import apply_ticket_status_change

FIELD = ('Navigating', 'Arrived on Site', 'In Progress')


class Command(BaseCommand):
    help = 'Report inspection visits that cannot move (dry-run). --apply repairs case A.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Move case A visits to Inspection Completed.')

    def handle(self, *args, **options):
        apply_changes = options['apply']
        complete_reports = InspectionChecklist.objects.filter(is_completed=True).values('ticket_id')
        case_a = ServiceTicket.objects.filter(
            ticket_type='inspection', status__in=FIELD, pk__in=complete_reports,
        ).order_by('id')
        case_a = list(case_a)
        case_b = ServiceTicket.objects.filter(
            ticket_type='inspection', status__in=('Ready for Service', 'Awaiting Materials'),
        ).order_by('id')
        case_b = list(case_b)

        repaired = 0
        for ticket in case_a:
            self.stdout.write(f'A  TKT-{ticket.id:04d}  {ticket.status}: report is complete but the visit never moved on')
            if not apply_changes:
                continue
            with transaction.atomic():
                ticket = ServiceTicket.objects.select_for_update().get(pk=ticket.pk)
                note = 'Repaired: the inspection report was already complete (find_stuck_inspection_visits).'
                if ticket.status != 'In Progress':
                    if ticket.status == 'Navigating':
                        apply_ticket_status_change(ticket, 'Arrived on Site', changed_by=None, notes=note)
                    apply_ticket_status_change(ticket, 'In Progress', changed_by=None, notes=note)
                apply_ticket_status_change(ticket, 'Inspection Completed', changed_by=None, notes=note)
                repaired += 1
        for ticket in case_b:
            reported = ServiceStatusHistory.objects.filter(ticket=ticket, status='Inspection Completed').exists()
            self.stdout.write(
                f'B  TKT-{ticket.id:04d}  {ticket.status}: inspection visit outside the review'
                f"{' (it was reported before)' if reported else ''}; dispatch the inspection again or cancel it"
            )

        mode = 'applied' if apply_changes else 'dry-run'
        self.stdout.write(self.style.SUCCESS(
            f'Stuck inspection visits {mode}: case A={len(case_a)}, '
            f'repaired={repaired}, case B={len(case_b)}.'
        ))
