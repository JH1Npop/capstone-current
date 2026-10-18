from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from users.permissions import CanAccessAfterSales, CanManageAfterSalesCases

from .maintenance import ensure_maintenance_follow_up_case, evaluate_schedule_status, process_maintenance_alerts
from .models import AfterSalesCase as FollowUpCase, AfterSalesCaseEvent, MaintenanceSchedule, ServiceTicket
from .serializers import FollowUpCaseSerializer, MaintenanceScheduleSerializer
from .views.helpers import _display_name, _notify_admin_superadmin
from services.ticket_status import COMPLETED_TICKET_STATUSES


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
            return [permissions.IsAuthenticated(), CanManageAfterSalesCases()]
        return [permissions.IsAuthenticated(), CanAccessAfterSales()]

    def get_queryset(self):
        queryset = FollowUpCase.objects.select_related(
            'service_ticket__request__client',
            'service_ticket__request__service_type',
            'assigned_to',
            'created_by',
            'client',
        ).prefetch_related('events__actor')

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

        assigned_to = self.request.query_params.get('assigned_to')
        if assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)

        return queryset

    @transaction.atomic
    def perform_create(self, serializer):
        service_ticket = ServiceTicket.objects.select_for_update().get(
            pk=serializer.validated_data['service_ticket'].pk,
        )
        assigned_to = serializer.validated_data.get('assigned_to')
        case_type = serializer.validated_data.get('case_type', 'follow_up')

        if service_ticket.status not in COMPLETED_TICKET_STATUSES:
            raise ValidationError({'service_ticket': 'Follow-up cases can only be opened for completed tickets.'})

        if case_type == 'warranty':
            if (
                service_ticket.warranty_status != 'active'
                or not service_ticket.warranty_end_date
                or service_ticket.warranty_end_date < timezone.localdate()
            ):
                raise ValidationError({
                    'service_ticket': 'Warranty cases can only be opened while the ticket warranty is active.',
                })

        priority = serializer.validated_data.get('priority', 'normal')
        due_date = serializer.validated_data.get('due_date')
        if due_date is None:
            response_days = {'urgent': 1, 'high': 2, 'normal': 3, 'low': 5}
            due_date = timezone.localdate() + timedelta(days=response_days.get(priority, 3))

        case = serializer.save(
            client=service_ticket.request.client,
            created_by=self.request.user,
            creation_source='manual',
            assigned_to=assigned_to,
            due_date=due_date,
        )
        AfterSalesCaseEvent.objects.create(
            case=case,
            actor=self.request.user,
            event_type='created',
            to_status=case.status,
            notes='After-sales case created.',
            metadata={'assigned_to_id': case.assigned_to_id},
        )

    @transaction.atomic
    def perform_update(self, serializer):
        locked_case = FollowUpCase.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = locked_case
        previous_status = locked_case.status
        previous_assigned_to_id = locked_case.assigned_to_id
        previous_priority = locked_case.priority
        previous_due_date = locked_case.due_date
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

        status_note = getattr(serializer, 'status_change_note', '')
        if previous_status != case.status:
            event_notes = status_note
            if case.status in resolved_statuses:
                event_notes = case.resolution_notes or event_notes
            AfterSalesCaseEvent.objects.create(
                case=case,
                actor=self.request.user,
                event_type='status_changed',
                from_status=previous_status,
                to_status=case.status,
                notes=event_notes,
            )

        if previous_assigned_to_id != case.assigned_to_id:
            AfterSalesCaseEvent.objects.create(
                case=case,
                actor=self.request.user,
                event_type='assigned' if previous_assigned_to_id is None else 'reassigned',
                from_status=case.status,
                to_status=case.status,
                notes=status_note or 'Case owner updated.',
                metadata={
                    'previous_assigned_to_id': previous_assigned_to_id,
                    'assigned_to_id': case.assigned_to_id,
                },
            )

        if previous_priority != case.priority or previous_due_date != case.due_date:
            AfterSalesCaseEvent.objects.create(
                case=case,
                actor=self.request.user,
                event_type='updated',
                from_status=case.status,
                to_status=case.status,
                notes=status_note or 'Case priority or response deadline updated.',
                metadata={
                    'previous_priority': previous_priority,
                    'priority': case.priority,
                    'previous_due_date': previous_due_date.isoformat() if previous_due_date else None,
                    'due_date': case.due_date.isoformat() if case.due_date else None,
                },
            )

    @action(detail=False, methods=['get'])
    def assignees(self, request):
        User = get_user_model()
        users = User.objects.filter(
            role__in=['admin', 'superadmin'],
            status='active',
            is_active=True,
        ).order_by('first_name', 'last_name', 'username', 'id')
        return Response([
            {
                'id': user.id,
                'name': _display_name(user) or user.username,
                'role': user.role,
            }
            for user in users
        ])

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'error': 'After-sales cases cannot be deleted; close the case to preserve its audit trail.'},
            status=405,
        )

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = timezone.now().date()
        queryset = self.get_queryset()
        open_statuses = ['open', 'in_progress']

        summary = queryset.aggregate(
            total_cases=Count('id'),
            open_cases=Count('id', filter=Q(status__in=open_statuses)),
            new_cases=Count('id', filter=Q(status='open')),
            in_progress_cases=Count('id', filter=Q(status='in_progress')),
            resolved_cases=Count('id', filter=Q(status='resolved')),
            overdue_cases=Count('id', filter=Q(status__in=open_statuses, due_date__lt=today)),
            revisit_cases=Count('id', filter=Q(requires_revisit=True)),
        )

        follow_up_candidates = ServiceTicket.objects.filter(status__in=COMPLETED_TICKET_STATUSES).exclude(
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


class MaintenanceScheduleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MaintenanceScheduleSerializer
    permission_classes = [permissions.IsAuthenticated, CanAccessAfterSales]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        'client__username', 'client__first_name', 'client__last_name',
        'client__email', 'client__phone', 'service_type__name',
        'maintenance_profile', 'maintenance_notes', 'service_ticket__request__location__address',
    ]
    ordering_fields = ['next_due_date', 'last_service_date', 'status', 'risk_score', 'updated_at']
    ordering = ['next_due_date', 'id']

    def get_permissions(self):
        if self.action in {'dismiss', 'resume', 'reschedule', 'complete'}:
            return [permissions.IsAuthenticated(), CanManageAfterSalesCases()]
        return [permissions.IsAuthenticated(), CanAccessAfterSales()]

    @staticmethod
    def _base_queryset():
        return MaintenanceSchedule.objects.select_related(
            'client', 'service_type', 'service_ticket__request__location',
        )

    def get_queryset(self):
        queryset = self._base_queryset()
        status_filter = self.request.query_params.get('status') or 'active'
        today = timezone.localdate()
        if status_filter == 'active':
            queryset = queryset.exclude(status__in=['completed', 'dismissed'])
        elif status_filter == 'upcoming':
            queryset = queryset.filter(status__in=['scheduled', 'due_soon'], next_due_date__gt=today)
        elif status_filter == 'overdue':
            queryset = queryset.exclude(status__in=['completed', 'dismissed']).filter(next_due_date__lt=today)
        elif status_filter and status_filter != 'all':
            queryset = queryset.filter(status=status_filter)
        return queryset

    def _get_locked_schedule(self, pk):
        return get_object_or_404(self._base_queryset().select_for_update(), pk=pk)

    @staticmethod
    def _required_reason(request):
        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            raise ValidationError({'reason': 'A reason is required.'})
        if len(reason) > 2000:
            raise ValidationError({'reason': 'Reason must be 2,000 characters or fewer.'})
        return reason

    @staticmethod
    def _close_linked_cases(schedule, *, actor, status_value, reason):
        now = timezone.now()
        for case in FollowUpCase.objects.select_for_update().filter(
            service_ticket=schedule.service_ticket,
            case_type='maintenance',
            status__in=['open', 'in_progress'],
        ):
            previous_status = case.status
            case.status = status_value
            case.resolution_notes = reason
            case.resolved_at = now
            case._activity_reason = reason
            case.save(update_fields=['status', 'resolution_notes', 'resolved_at', 'updated_at'])
            AfterSalesCaseEvent.objects.create(
                case=case,
                actor=actor,
                event_type='status_changed',
                from_status=previous_status,
                to_status=status_value,
                notes=reason,
            )

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def dismiss(self, request, pk=None):
        schedule = self._get_locked_schedule(pk)
        reason = self._required_reason(request)
        if schedule.status == 'completed':
            raise ValidationError({'status': 'Completed maintenance cannot be stopped.'})
        if schedule.status == 'dismissed':
            raise ValidationError({'status': 'Maintenance reminders are already stopped.'})

        schedule._activity_reason = reason
        schedule.status = 'dismissed'
        schedule.save(update_fields=['status', 'updated_at'])
        self._close_linked_cases(
            schedule,
            actor=request.user,
            status_value='closed',
            reason=f'Maintenance reminders stopped: {reason}',
        )
        return Response(self.get_serializer(schedule).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def resume(self, request, pk=None):
        schedule = self._get_locked_schedule(pk)
        reason = self._required_reason(request)
        if schedule.status != 'dismissed':
            raise ValidationError({'status': 'Only stopped maintenance reminders can be resumed.'})

        today = timezone.localdate()
        schedule._activity_reason = reason
        if today >= schedule.next_due_date:
            schedule.status = 'due'
        elif today >= schedule.notify_on_date:
            schedule.status = 'due_soon'
        else:
            schedule.status = 'scheduled'
        schedule.save(update_fields=['status', 'updated_at'])
        if schedule.status in {'due_soon', 'due'}:
            ensure_maintenance_follow_up_case(schedule)
        return Response(self.get_serializer(schedule).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reschedule(self, request, pk=None):
        schedule = self._get_locked_schedule(pk)
        reason = self._required_reason(request)
        if schedule.status in {'completed', 'dismissed'}:
            raise ValidationError({'status': 'Only active maintenance can be rescheduled.'})

        next_due_date = parse_date(str(request.data.get('next_due_date') or '').strip())
        if next_due_date is None:
            raise ValidationError({'next_due_date': 'Choose a valid maintenance date.'})
        if next_due_date < timezone.localdate():
            raise ValidationError({'next_due_date': 'The maintenance date cannot be in the past.'})

        schedule._activity_reason = reason
        schedule.next_due_date = next_due_date
        schedule.notify_on_date = next_due_date - timedelta(days=schedule.follow_up_window_days)
        schedule.status = evaluate_schedule_status(schedule, reference_date=timezone.localdate())
        reminder_fields = [
            'due_soon_notified_at', 'three_day_notified_at', 'due_notified_at',
            'client_notified_at', 'client_three_day_notified_at', 'client_due_notified_at',
        ]
        for field_name in reminder_fields:
            setattr(schedule, field_name, None)
        schedule.save(update_fields=[
            'next_due_date', 'notify_on_date', 'status', *reminder_fields, 'updated_at',
        ])

        if schedule.status == 'scheduled':
            self._close_linked_cases(
                schedule,
                actor=request.user,
                status_value='closed',
                reason=f'Maintenance rescheduled: {reason}',
            )
        else:
            ensure_maintenance_follow_up_case(schedule)
        return Response(self.get_serializer(schedule).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def complete(self, request, pk=None):
        schedule = self._get_locked_schedule(pk)
        reason = self._required_reason(request)
        if schedule.status == 'dismissed':
            raise ValidationError({'status': 'Resume stopped reminders before marking maintenance completed.'})
        if schedule.status == 'completed':
            raise ValidationError({'status': 'Maintenance is already completed.'})

        schedule._activity_reason = reason
        schedule.status = 'completed'
        schedule.save(update_fields=['status', 'updated_at'])
        self._close_linked_cases(
            schedule,
            actor=request.user,
            status_value='resolved',
            reason=f'Maintenance completed: {reason}',
        )
        return Response(self.get_serializer(schedule).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = timezone.localdate()
        queryset = MaintenanceSchedule.objects.all()
        active = queryset.exclude(status__in=['completed', 'dismissed'])
        return Response({
            'total': queryset.count(),
            'active': active.count(),
            'upcoming': active.filter(next_due_date__gt=today).count(),
            'due_today': active.filter(next_due_date=today).count(),
            'overdue': active.filter(next_due_date__lt=today).count(),
            'completed': queryset.filter(status='completed').count(),
            'dismissed': queryset.filter(status='dismissed').count(),
        })
