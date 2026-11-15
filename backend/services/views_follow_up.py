from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from users.permissions import CanAccessAfterSales, CanManageAfterSalesCases

from .maintenance import (
    ACTIVE_PLAN_EXCLUDED_STATUSES,
    OPEN_VISIT_REQUEST_STATUSES,
    open_maintenance_visit,
    visit_service_type_for,
    apply_reminder_window,
    ensure_maintenance_follow_up_case,
    evaluate_schedule_status,
    process_maintenance_alerts,
    start_next_maintenance_cycle,
)
from .models import AfterSalesCase as FollowUpCase, AfterSalesCaseEvent, MaintenanceSchedule, ServiceRequest, ServiceTicket
from .serializers import FollowUpCaseSerializer, MaintenanceScheduleSerializer
from .views.helpers import _display_name, _notify_admin_superadmin
from services.business_time import business_today
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
                due_date__lt=business_today(),
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
                or service_ticket.warranty_end_date < business_today()
            ):
                raise ValidationError({
                    'service_ticket': 'Warranty cases can only be opened while the ticket warranty is active.',
                })

        priority = serializer.validated_data.get('priority', 'normal')
        due_date = serializer.validated_data.get('due_date')
        if due_date is None:
            response_days = {'urgent': 1, 'high': 2, 'normal': 3, 'low': 5}
            due_date = business_today() + timedelta(days=response_days.get(priority, 3))

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

        # A maintenance case drives its schedule only while the schedule is active: "resolved" means
        # the maintenance was done (the next cycle starts); "closed" ends the case without the work, so
        # reminders continue. A stopped (or legacy completed) schedule is never changed from a case;
        # use the schedule's own Resume action for that.
        schedule_is_active = maintenance_schedule is not None and maintenance_schedule.status not in {'completed', 'dismissed'}
        if schedule_is_active and case.case_type == 'maintenance' and case.status != 'closed':
            if case.status == 'resolved':
                # Done: start the next cycle, but only the first time this case is resolved
                # (reopening and resolving it again must not skip another cycle ahead).
                resolved_before = AfterSalesCaseEvent.objects.filter(case=case, to_status='resolved').exists()
                if previous_status != 'resolved' and not resolved_before:
                    maintenance_schedule._activity_reason = case.resolution_notes or 'Maintenance case resolved.'
                    start_next_maintenance_cycle(maintenance_schedule)
            else:
                today = business_today()
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
        today = business_today()
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
        if self.action in {'book_visit', 'mine'}:
            # The plan's own client may book and see their plans; the action checks ownership.
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), CanAccessAfterSales()]

    @staticmethod
    def _base_queryset():
        open_visits = ServiceRequest.objects.filter(status__in=OPEN_VISIT_REQUEST_STATUSES).select_related(
            'service_type',
        ).prefetch_related('serviceticket_set').order_by('-id')
        return MaintenanceSchedule.objects.select_related(
            'client', 'service_type__maintenance_service', 'service_ticket__request__location',
        ).prefetch_related(Prefetch('maintenance_visits', queryset=open_visits, to_attr='open_visits'))

    def get_queryset(self):
        queryset = self._base_queryset()
        status_filter = self.request.query_params.get('status') or 'active'
        today = business_today()
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
        return get_object_or_404(
            self._base_queryset().select_for_update(of=('self',)),
            pk=pk,
        )

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

        today = business_today()
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
        if next_due_date < business_today():
            raise ValidationError({'next_due_date': 'The maintenance date cannot be in the past.'})

        schedule._activity_reason = reason
        schedule.next_due_date = next_due_date
        apply_reminder_window(schedule)
        schedule.status = evaluate_schedule_status(schedule, reference_date=business_today())
        reminder_fields = [
            'due_soon_notified_at', 'three_day_notified_at', 'due_notified_at',
            'client_notified_at', 'client_three_day_notified_at', 'client_due_notified_at',
        ]
        for field_name in reminder_fields:
            setattr(schedule, field_name, None)
        schedule.save(update_fields=[
            'next_due_date', 'notify_on_date', 'follow_up_window_days', 'status', *reminder_fields, 'updated_at',
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

        performed_on = business_today()
        raw_performed_on = str(request.data.get('performed_on') or '').strip()
        if raw_performed_on:
            performed_on = parse_date(raw_performed_on)
            if performed_on is None:
                raise ValidationError({'performed_on': 'Choose a valid date for when the maintenance was done.'})
            if performed_on > business_today():
                raise ValidationError({'performed_on': 'The maintenance date cannot be in the future.'})
            if performed_on < schedule.last_service_date:
                raise ValidationError({'performed_on': 'The maintenance date cannot be before the last service date.'})

        self._close_linked_cases(
            schedule,
            actor=request.user,
            status_value='resolved',
            reason=f'Maintenance completed: {reason}',
        )
        # The plan continues: the next cycle starts from the day the work was done.
        schedule._activity_reason = reason
        start_next_maintenance_cycle(schedule, performed_on=performed_on)
        return Response(self.get_serializer(schedule).data)

    @action(detail=False, methods=['get'])
    def summary(self, request):
        today = business_today()
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

    @action(detail=False, methods=['get'])
    def warranties(self, request):
        """Every job with a warranty and when it ends. Filters: warranty_status = active (default,
        includes ending soon), ending_soon (30 days or less), expired, void or all; search."""
        from .after_sales_alerts import WARRANTY_REMINDER_DAYS
        from .maintenance import evaluate_warranty_status
        from .user_display import client_technician_label

        today = business_today()
        queryset = ServiceTicket.objects.select_related(
            'request__client', 'request__service_type', 'request__location',
        ).filter(warranty_end_date__isnull=False, warranty_period_days__isnull=False).order_by('warranty_end_date', 'id')
        status_filter = request.query_params.get('warranty_status') or 'active'
        if status_filter == 'active':
            queryset = queryset.exclude(warranty_status='void').filter(warranty_end_date__gte=today)
        elif status_filter == 'ending_soon':
            queryset = queryset.exclude(warranty_status='void').filter(
                warranty_end_date__gte=today, warranty_end_date__lte=today + timedelta(days=WARRANTY_REMINDER_DAYS),
            )
        elif status_filter == 'expired':
            queryset = queryset.exclude(warranty_status='void').filter(warranty_end_date__lt=today)
        elif status_filter == 'void':
            queryset = queryset.filter(warranty_status='void')
        search = str(request.query_params.get('search') or '').strip()
        if search:
            term = Q()
            for field in ('request__client__username', 'request__client__first_name', 'request__client__last_name',
                          'request__client__email', 'request__service_type__name', 'request__location__address'):
                term |= Q(**{f'{field}__icontains': search})
            if search.upper().startswith('TKT-') and search[4:].isdigit():
                term |= Q(id=int(search[4:]))
            queryset = queryset.filter(term)

        def row(ticket):
            client = ticket.request.client
            try:
                address = ticket.request.location.address
            except Exception:
                address = client.address or None
            return {
                'ticket_id': ticket.id,
                'ticket_code': f"TKT-{ticket.id:04d}",
                'client_name': client_technician_label(client) or client.username,
                'client_email': client.email,
                'client_phone': getattr(client, 'phone', ''),
                'service_type_name': ticket.request.service_type.name if ticket.request.service_type else '',
                'service_address': address,
                'warranty_period_days': ticket.warranty_period_days,
                'warranty_start_date': ticket.warranty_start_date,
                'warranty_end_date': ticket.warranty_end_date,
                'warranty_status': evaluate_warranty_status(ticket, reference_date=today),
                'days_left': (ticket.warranty_end_date - today).days,
                'warranty_notes': ticket.warranty_notes or '',
            }

        page = self.paginate_queryset(queryset)
        if page is not None:
            return self.get_paginated_response([row(ticket) for ticket in page])
        return Response([row(ticket) for ticket in queryset])

    @action(detail=True, methods=['post'], url_path='book-visit')
    @transaction.atomic
    def book_visit(self, request, pk=None):
        """Book the plan's maintenance visit as a normal service request at the plan's site, linked to
        the plan. It then goes through the usual review, approval and dispatch. The office (after-sales
        manage) or the plan's own client may book; one open visit per plan."""
        from services.models import ServiceLocation
        from services.serializers import ServiceRequestSerializer
        from services.views.service_requests import notify_service_request_submitted

        schedule = self._get_locked_schedule(pk)
        user = request.user
        is_owner = getattr(user, 'role', None) == 'client' and schedule.client_id == user.id
        if not is_owner and not CanManageAfterSalesCases().has_permission(request, self):
            raise PermissionDenied("Only the office or the plan's client can book a maintenance visit.")
        if schedule.status in ACTIVE_PLAN_EXCLUDED_STATUSES:
            raise ValidationError({'status': 'This maintenance plan is not active. Resume it before booking a visit.'})
        existing = open_maintenance_visit(schedule)
        if existing is not None:
            raise ValidationError({'booked_visit': f'A visit is already booked for this plan: REQ-{existing.id:04d}.'})

        original = schedule.service_ticket.request
        try:
            location = original.location
        except ServiceLocation.DoesNotExist:
            location = None
        if location is None or location.latitude is None or location.longitude is None:
            raise ValidationError({'location': 'This plan has no saved site location. Use New Request instead.'})
        preferred_date = str(request.data.get('preferred_date') or '').strip()
        if not preferred_date:
            raise ValidationError({'preferred_date': 'Choose a preferred visit date.'})

        notes = str(request.data.get('notes') or '').strip()[:2000]
        service_name = schedule.service_type.name if schedule.service_type else 'service'
        description = (
            f"Maintenance visit for the {service_name} maintenance plan of TKT-{schedule.service_ticket_id:04d} "
            f"(due {schedule.next_due_date})."
        )
        if notes:
            description = f"{description} {notes}"
        payload = {
            'service_type': request.data.get('service_type') or visit_service_type_for(schedule).id,
            'description': description,
            'priority': 'Normal',
            'preferred_date': preferred_date,
            'preferred_time_slot': request.data.get('preferred_time_slot') or None,
            'scheduling_notes': notes or None,
            'location_address': location.address,
            'location_city': location.city or '',
            'location_province': location.province or '',
            'latitude': str(location.latitude),
            'longitude': str(location.longitude),
        }
        if not is_owner:
            payload['client'] = schedule.client_id
        serializer = ServiceRequestSerializer(data=payload, context={'request': request})
        serializer.is_valid(raise_exception=True)
        visit = serializer.save(status='Pending', auto_ticket_created=False, maintenance_plan=schedule)
        transaction.on_commit(lambda: notify_service_request_submitted(visit))

        schedule = self._base_queryset().get(pk=schedule.pk)
        return Response(
            {
                'request': ServiceRequestSerializer(visit, context={'request': request}).data,
                'plan': self.get_serializer(schedule).data,
            },
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'])
    def mine(self, request):
        """The signed-in client's own maintenance plans (active and stopped), with any booked visit.
        Office-only fields (risk scores, reminder history) are left out."""
        if getattr(request.user, 'role', None) != 'client':
            raise PermissionDenied('This list is for clients. The office uses the maintenance list.')
        queryset = self._base_queryset().filter(client=request.user).exclude(status='completed').order_by('next_due_date', 'id')
        serializer = self.get_serializer(queryset, many=True)
        keep = (
            'id', 'ticket_id', 'ticket_code', 'service_type', 'service_type_name', 'visit_service_type',
            'visit_service_type_name', 'service_address', 'maintenance_profile_label', 'interval_days', 'last_service_date', 'next_due_date', 'status', 'days_until_due', 'booked_visit',
        )
        return Response([{key: row[key] for key in keep} for row in serializer.data])
