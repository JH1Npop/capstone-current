"""Finished field documents stay on record.

A turnover acceptance, installation contract, technical data sheet or commissioning checklist that
has left draft, and a field service report the client acknowledged, cannot be deleted. They are the
signed or confirmed record of the job (the update rules already lock them).
"""

from rest_framework import status
from rest_framework.response import Response

DRAFT_ONLY_DELETE_MESSAGE = 'Only a draft document can be deleted. A finalized, signed or confirmed document stays on record.'


class KeepFinishedDocumentsMixin:
    """Refuse DELETE for a document that is no longer a draft (409)."""

    def document_is_finished(self, instance):
        return getattr(instance, 'status', 'draft') != 'draft'

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if self.document_is_finished(instance):
            return Response({'detail': DRAFT_ONLY_DELETE_MESSAGE}, status=status.HTTP_409_CONFLICT)
        return super().destroy(request, *args, **kwargs)


# ── A job the office cancelled is closed to its technicians ──
# They may still read it (history, documents), but nothing on it changes any more: no travel or status
# change, no proof upload, no field form, no completion. One plain answer for all of them.

from rest_framework.exceptions import APIException
from rest_framework.permissions import SAFE_METHODS


class JobCancelledConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'job_cancelled'


def cancelled_job_message(ticket):
    return f'The office cancelled ticket #{ticket.id}, so it is no longer on your job list.'


def refuse_technician_change_on_cancelled_job(user, ticket):
    if getattr(user, 'role', None) != 'technician' or ticket is None or ticket.status != 'Cancelled':
        return
    from services.views.helpers import ticket_has_technician_access

    # Only for the technician's own jobs: others get the normal answer, so nothing is revealed.
    if ticket_has_technician_access(ticket, user):
        raise JobCancelledConflict(cancelled_job_message(ticket))


class TechniciansLeaveCancelledJobsMixin:
    """Refuse a technician's change (any non-read request) to a cancelled job, with a 409."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in SAFE_METHODS or getattr(request.user, 'role', None) != 'technician':
            return
        from services.models import ServiceTicket

        if self.kwargs.get(self.lookup_url_kwarg or self.lookup_field):
            # Not found or not allowed: leave the answer to the normal flow.
            try:
                instance = self.get_object()
            except Exception:
                return
            ticket = instance if isinstance(instance, ServiceTicket) else getattr(instance, 'ticket', None)
        else:
            ticket_id = request.data.get('ticket') if hasattr(request.data, 'get') else None
            try:
                ticket = ServiceTicket.objects.only('id', 'status').filter(pk=int(ticket_id)).first() if ticket_id else None
            except (TypeError, ValueError):
                ticket = None
        refuse_technician_change_on_cancelled_job(request.user, ticket)
