from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from users.permissions import CanAccessAfterSales, CanManageAfterSalesCases, IsAdmin

from .maintenance import process_maintenance_alerts
from .models import AfterSalesCase as FollowUpCase, MaintenanceSchedule, ServiceTicket
from .serializers import FollowUpCaseSerializer
from .views.helpers import _display_name, _notify_admin_superadmin


class FollowUpCaseViewSet(viewsets.ModelViewSet):
    serializer_class = FollowUpCaseSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'summary',
        'details',
        'status',
        'priority',
        'case_type',
        'creation_source',
        'service_ticket__request__client__username',
        'service_ticket__request__client__first_name',
        'service_ticket__request__client__last_name',
        'service_ticket__request__client__email',
        'service_ticket__request__client__phone',
        'service_ticket__request__service_type__name',
        'service_ticket__technician__username',
        'service_ticket__technician__first_name',
        'service_ticket__technician__last_name',
    ]
    ordering_fields = ['created_at', 'updated_at', 'due_date', 'status', 'priority']
    ordering = ['-created_at']

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update']:
            return [permissions.IsAuthenticated(), CanManageAfterSalesCases()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), IsAdmin()]
        return [permissions.IsAuthenticated(), CanAccessAfterSales()]

    def get_queryset(self):
        queryset = FollowUpCase.objects.select_related(
            'service_ticket__request__client',
            'service_ticket__request__service_type',
            'assigned_to',
            'created_by',
            'client',
        )

        status_filter = self.request.query_params.get('status')
        if status_filter == 'open_work':
            queryset = queryset.filter(status__in=['open', 'in_progress'])
        elif status_filter == 'overdue':
            queryset = queryset.filter(
                status__in=['open', 'in_progress'],
                due_date__lt=timezone.localdate(),
            )
        elif status_filter:
            queryset = queryset.filter(status=status_filter)

        case_type = self.request.query_params.get('case_type') or self.request.query_params.get('type')
        if case_type:
            queryset = queryset.filter(case_type=case_type)

        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority)

        creation_source = self.request.query_params.get('creation_source') or self.request.query_params.get('source')
        if creation_source:
            queryset = queryset.filter(creation_source=creation_source)

        assigned_only = self.request.query_params.get('assigned_only')
        if assigned_only == 'true':
            queryset = queryset.filter(assigned_to=self.request.user)

        return queryset

    def perform_create(self, serializer):
        service_ticket = serializer.validated_data['service_ticket']
        assigned_to = serializer.validated_data.get('assigned_to')
        case_type = serializer.validated_data.get('case_type', 'follow_up')

        if service_ticket.status != 'Completed':
            raise ValidationError({'service_ticket': 'Follow-up cases can only be opened for completed tickets.'})

        if case_type == 'warranty':
            if service_ticket.warranty_status != 'active' or not service_ticket.warranty_end_date:
                raise ValidationError({
                    'service_ticket': 'Warranty cases can only be opened while the ticket warranty is active.',
                })

        serializer.save(
            client=service_ticket.request.client,
            created_by=self.request.user,
            creation_source='manual',
            assigned_to=assigned_to,
            due_date=serializer.validated_data.get('due_date') or (
                service_ticket.warranty_end_date if case_type == 'warranty' else serializer.validated_data.get('due_date')
            ),
        )

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        case = serializer.save()
        resolved_statuses = {'resolved', 'closed'}
        maintenance_schedule = MaintenanceSchedule.objects.filter(service_ticket=case.service_ticket).first()

        if case.status in resolved_statuses and case.resolved_at is None:
            case.resolved_at = timezone.now()
            case.save(update_fields=['resolved_at'])
        elif case.status not in resolved_statuses and case.resolved_at is not None:
            case.resolved_at = None
            case.save(update_fields=['resolved_at'])

        if maintenance_schedule and case.case_type == 'maintenance':
            if case.status in resolved_statuses:
                maintenance_schedule.status = 'completed'
            else:
                today = timezone.localdate()
                if today >= maintenance_schedule.next_due_date:
                    maintenance_schedule.status = 'due'
                elif today >= maintenance_schedule.notify_on_date:
                    maintenance_schedule.status = 'due_soon'
                else:
                    maintenance_schedule.status = 'scheduled'
            maintenance_schedule.save(update_fields=['status', 'updated_at'])

        if previous_status not in resolved_statuses and case.status in resolved_statuses:
            actor_name = _display_name(self.request.user) or 'A staff member'
            client_name = _display_name(case.client) or 'the client'
            status_label = case.get_status_display().lower()
            _notify_admin_superadmin(
                message=(
                    f"{actor_name} marked after-sales case #{case.id} as {status_label}: "
                    f"{case.summary} for {client_name}."
                ),
                notification_type='success',
                include_user=case.assigned_to if case.assigned_to_id else None,
            )

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = timezone.now().date()
        queryset = self.get_queryset()
        open_statuses = ['open', 'in_progress']

        summary = queryset.aggregate(
            total_cases=Count('id'),
            open_cases=Count('id', filter=Q(status__in=open_statuses)),
            overdue_cases=Count('id', filter=Q(status__in=open_statuses, due_date__lt=today)),
            revisit_cases=Count('id', filter=Q(requires_revisit=True)),
        )

        follow_up_candidates = ServiceTicket.objects.filter(status='Completed').exclude(
            after_sales_cases__isnull=False
        ).count()
        maintenance_summary = MaintenanceSchedule.objects.exclude(status__in=['completed', 'dismissed']).aggregate(
            scheduled_maintenance=Count('id'),
            maintenance_due_soon=Count('id', filter=Q(status='due_soon')),
            maintenance_due=Count('id', filter=Q(status='due')),
        )

        return Response({
            **summary,
            'follow_up_candidates': follow_up_candidates,
            **maintenance_summary,
        })
