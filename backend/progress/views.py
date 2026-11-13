from django.db import transaction
from django.db.models import Q
from django.utils.decorators import method_decorator
from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import TicketProgress
from .serializers import TicketProgressSerializer, TicketProgressReportSerializer
from users.permissions import CanManageServiceTickets, CanViewReports, CanViewTechnicianJobs
from users.rbac import is_admin_workspace_role

# Progress can be reported while the job is under way (including while paused).
REPORTABLE_TICKET_STATUSES = {'Arrived on Site', 'In Progress', 'On Hold'}
MAX_PROGRESS_PHOTOS = 10


def _cleanup_failed_uploads(view):
    from services.views.helpers import cleanup_failed_proof_uploads

    return cleanup_failed_proof_uploads(view)


class TicketProgressViewSet(viewsets.ModelViewSet):
    queryset = TicketProgress.objects.all()
    serializer_class = TicketProgressSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Progress is an append-only operational record. Corrections should be
    # represented by a new progress entry instead of rewriting history.
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        queryset = TicketProgress.objects.select_related(
            'ticket',
            'ticket__request',
            'ticket__request__client',
            'ticket__technician',
            'updated_by',
        )
        ticket_id = self.request.query_params.get('ticket')
        if ticket_id:
            queryset = queryset.filter(ticket_id=ticket_id) if str(ticket_id).isdigit() else queryset.none()

        if is_admin_workspace_role(getattr(user, 'role', None)):
            return queryset.order_by('-updated_at')

        if getattr(user, 'role', None) == 'technician':
            return queryset.filter(
                Q(ticket__technician=user) |
                Q(ticket__crew_assignments__technician=user)
            ).distinct().order_by('-updated_at')

        if getattr(user, 'role', None) == 'client':
            return queryset.filter(ticket__request__client=user).order_by('-updated_at')

        return queryset.none()

    def get_permissions(self):
        """Allow owned reads while limiting progress creation to field staff."""
        if self.action == 'report':
            return [CanViewReports()]
        if self.action == 'create':
            if is_admin_workspace_role(getattr(self.request.user, 'role', None)):
                return [CanManageServiceTickets()]
            return [CanViewTechnicianJobs()]
        return [permissions.IsAuthenticated()]

    def _ticket_for_reporting(self, ticket_id):
        """The ticket if this user may report on it; access is checked before the form is validated."""
        from services.models import ServiceTicket

        user = self.request.user
        if getattr(user, 'role', None) == 'client':
            raise PermissionDenied('Clients cannot create ticket progress updates.')
        tickets = ServiceTicket.objects.filter(pk=ticket_id) if str(ticket_id or '').isdigit() else ServiceTicket.objects.none()
        if not is_admin_workspace_role(getattr(user, 'role', None)):
            tickets = tickets.filter(Q(technician=user) | Q(crew_assignments__technician=user))
        ticket = tickets.distinct().first()
        if ticket is None:
            raise PermissionDenied('You cannot update progress for this ticket.')
        return ticket

    @method_decorator(_cleanup_failed_uploads)
    def create(self, request, *args, **kwargs):
        self._ticket_for_reporting(request.data.get('ticket'))
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        from rest_framework.exceptions import ValidationError

        from services.business_time import business_today
        from services.views.helpers import create_notification, save_uploaded_proof_media, validate_proof_upload_batch

        user = self.request.user
        # Access is checked on the ticket itself (assigned lead or crew; admins), not on earlier updates.
        ticket = self._ticket_for_reporting(serializer.validated_data.get('ticket').pk)
        # Technicians report while the job is under way; an admin may add a note at any time.
        if not is_admin_workspace_role(getattr(user, 'role', None)) and ticket.status not in REPORTABLE_TICKET_STATUSES:
            raise ValidationError({'ticket': 'Progress can be reported only while the job is under way.'})

        files = self.request.FILES.getlist('photo_files') if hasattr(self.request.FILES, 'getlist') else []
        if len(files) > MAX_PROGRESS_PHOTOS:
            raise ValidationError({'photo_files': f'Attach no more than {MAX_PROGRESS_PHOTOS} photos to one update.'})
        validate_proof_upload_batch(files)
        with transaction.atomic():
            photos = save_uploaded_proof_media(
                ticket=ticket, uploaded_files=files, request=self.request, media_type='photo',
                saved_names=getattr(self.request, '_proof_upload_names', None),
            ) if files else []
            progress = serializer.save(
                updated_by=user,
                work_date=serializer.validated_data.get('work_date') or business_today(),
                photo_urls=[entry['url'] for entry in photos],
            )

        # The client sees each report as it is posted.
        client = getattr(getattr(ticket, 'request', None), 'client', None)
        if client:
            percent = f' ({progress.percent_complete}% done)' if progress.percent_complete is not None else ''
            create_notification(
                client,
                f'A progress update was posted on TKT-{ticket.id:04d}{percent}.',
                'info',
                title='Job progress update',
                ticket=ticket,
            )

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Operations Ticket Report endpoint with proper field formatting"""
        # Use the report serializer for proper field names
        queryset = self.get_queryset().select_related(
            'ticket',
            'ticket__request__client',
            'ticket__request__service_type',
            'ticket__technician',
            'updated_by'
        ).order_by('-updated_at')

        serializer = TicketProgressReportSerializer(queryset, many=True)
        return Response(serializer.data)
