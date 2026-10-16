"""Canonical service-ticket status groups.

Use these groups instead of writing status lists by hand. A finished ticket moves
Completed -> Turned Over / Accepted after handover, so "finished work" always means
both statuses; hand-written lists that forgot this caused analytics and queue bugs.
"""

from services.models.core import ServiceTicket

ALL_TICKET_STATUSES = tuple(value for value, _label in ServiceTicket.STATUS_CHOICES)

# Work that is done (counts as completed in reports, warranties and follow-ups).
COMPLETED_TICKET_STATUSES = ('Completed', 'Turned Over / Accepted')

# No further field work will happen on the ticket.
CLOSED_TICKET_STATUSES = COMPLETED_TICKET_STATUSES + ('Cancelled',)

# Everything still in the pipeline, from Not Started through On Hold.
ACTIVE_TICKET_STATUSES = tuple(status for status in ALL_TICKET_STATUSES if status not in CLOSED_TICKET_STATUSES)

# The lead technician is travelling to, at, or working on the job right now.
FIELD_WORK_TICKET_STATUSES = ('Navigating', 'Arrived on Site', 'In Progress')

# Statuses that occupy a technician's day (everything except cancelled).
SCHEDULED_LOAD_TICKET_STATUSES = ACTIVE_TICKET_STATUSES + COMPLETED_TICKET_STATUSES
