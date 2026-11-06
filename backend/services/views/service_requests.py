# Auto-split from services/views.py
from datetime import timedelta

from services.views.helpers import (
    CanAccessServiceRequests,
    CanManageServiceRequests,
    PermissionDenied,
    Response,
    ServiceRequest,
    ServiceRequestSerializer,
    ServiceStatusHistory,
    ServiceTicket,
    User,
    action,
    build_initial_ticket_payload,
    clear_reschedule_request,
    create_notification,
    get_ticket_team_members,
    get_visible_service_requests_queryset,
    is_admin_workspace_role,
    logger,
    permissions,
    release_ticket_reservations,
    send_notification_email,
    send_user_notification,
    status,
    sync_ticket_team_availability,
    transaction,
    user_can_manage_service_requests,
    viewsets,
)
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.exceptions import ValidationError
from django.db import IntegrityError
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.shortcuts import get_object_or_404
from services.models import CalendarClosure
from services.ticket_status import COMPLETED_TICKET_STATUSES, FIELD_WORK_TICKET_STATUSES
from services.user_display import client_technician_label
from services.scheduling_policy import (
    ORDERED_BOOKABLE_TIME_SLOTS,
    get_appointment_daily_capacity,
    get_calendar_closure_error,
    lock_appointment_capacity_policy,
    get_scheduled_slot_counts,
    resolve_slot_availability,
)
from users.rbac import SUPERVISOR_DISPATCH_VIEW, user_has_capability


def notify_service_request_submitted(request_obj):
    admins = User.objects.filter(role__in=['superadmin', 'admin'])
    client_label = client_technician_label(request_obj.client) or 'Client'
    for admin in admins:
        create_notification(
            admin,
            f"New service request #{request_obj.id} from {client_label} is pending review.",
            'info'
        )
        send_notification_email(
            admin,
            'New Service Request Submitted',
            f"Service request #{request_obj.id} from {client_label} is waiting for review."
        )

    create_notification(
        request_obj.client,
        f"Your service request #{request_obj.id} has been submitted and is pending review.",
        'info'
    )


def notify_dispatch_ticket_ready(ticket):
    if not ticket or ticket.technician_id:
        return

    service_request = ticket.request
    service_name = service_request.service_type.name if service_request and service_request.service_type else 'service'
    client_label = client_technician_label(service_request.client) if service_request else 'Client'
    recipients = [
        user for user in User.objects.filter(role__in=['superadmin', 'admin'], is_active=True)
        if user_has_capability(user, SUPERVISOR_DISPATCH_VIEW)
    ]

    title = 'Ticket Ready for Dispatch'
    body = (
        f"Ticket #{ticket.id} for {service_name} has been approved and is waiting for technician assignment. "
        f"Client: {client_label or 'Client'}."
    )
    for recipient in recipients:
        send_user_notification(
            user=recipient,
            title=title,
            body=body,
            notification_type='warning',
            ticket=ticket,
            request=service_request,
            send_email=False,
        )

class ServiceRequestViewSet(viewsets.ModelViewSet):
    queryset = ServiceRequest.objects.all()
    serializer_class = ServiceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_throttles(self):
        # The hourly cap protects against client spam; staff intake (walk-in,
        # phone) is not limited by it.
        if self.action == 'create' and getattr(self.request.user, 'role', None) == 'client':
            self.throttle_scope = 'service_request_create'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['create', 'appointment_availability']:
            return [permissions.IsAuthenticated()]  # Any authenticated user can create requests
        elif self.action in ['update', 'partial_update', 'destroy', 'approve', 'reject']:
            return [CanManageServiceRequests()]
        elif self.action == 'cancel':
            return [permissions.IsAuthenticated()]
        return [CanAccessServiceRequests()]

    def get_queryset(self):
        """Filter queryset based on user role"""
        if self.action in ['approve', 'reject', 'update', 'partial_update', 'destroy', 'cancel']:
            return ServiceRequest.objects.select_related('client', 'location', 'service_type').order_by('request_date', 'id')
        return get_visible_service_requests_queryset(self.request.user)

    def get_locked_request(self):
        """Lock one request for the duration of a critical decision transaction."""
        # `location` is optional, so `select_related` produces a LEFT OUTER JOIN.
        # PostgreSQL cannot lock the nullable side of that join. Lock only the
        # ServiceRequest row; related records are read-only during approval.
        queryset = self.filter_queryset(self.get_queryset()).select_for_update(of=('self',))
        service_request = get_object_or_404(queryset, pk=self.kwargs.get(self.lookup_field))
        self.check_object_permissions(self.request, service_request)
        return service_request

    def create(self, request, *args, **kwargs):
        """Create a request, replaying an earlier response for the same explicit key."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        idempotency_key = str(request.headers.get('Idempotency-Key') or '').strip()
        if idempotency_key and len(idempotency_key) > 128:
            return Response(
                {'error': 'Idempotency-Key must be 128 characters or fewer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client = serializer.validated_data.get('client') or request.user
        if idempotency_key:
            existing = ServiceRequest.objects.filter(
                client=client,
                idempotency_key=idempotency_key,
            ).first()
            if existing:
                return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

        try:
            with transaction.atomic():
                request_obj = serializer.save(
                    status='Pending',
                    auto_ticket_created=False,
                    idempotency_key=idempotency_key or None,
                )
        except IntegrityError:
            if not idempotency_key:
                raise
            existing = ServiceRequest.objects.filter(
                client=client,
                idempotency_key=idempotency_key,
            ).first()
            if not existing:
                raise
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

        notify_service_request_submitted(request_obj)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=False, methods=['get'], url_path='appointment-availability')
    def appointment_availability(self, request):
        """Expose privacy-safe schedule activity for the client request calendar.

        The response deliberately contains no ticket, request, client, service,
        location, or technician identifiers. It is an advisory view of current
        non-cancelled appointments, not a dispatch or capacity guarantee.
        """
        today = timezone.localdate()
        start_date = parse_date(str(request.query_params.get('start') or '')) or today
        end_date = parse_date(str(request.query_params.get('end') or '')) or (start_date + timedelta(days=41))

        if start_date < today:
            start_date = today
        if end_date < start_date:
            return Response(
                {'error': 'End date must be on or after start date.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if (end_date - start_date).days > 62:
            return Response(
                {'error': 'Appointment availability can cover at most 63 days.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        daily_capacity = get_appointment_daily_capacity()
        scheduled_counts = get_scheduled_slot_counts(start_date, end_date)

        closures_by_date = {}
        for closure in CalendarClosure.objects.filter(
            date__range=(start_date, end_date),
            is_active=True,
        ).order_by('date', 'time_slot', 'id'):
            closures_by_date.setdefault(closure.date.isoformat(), []).append(closure)

        days = []
        for date_key in sorted(set(scheduled_counts) | set(closures_by_date)):
            counts = scheduled_counts.get(date_key, {})
            daily_count = sum(counts.values())
            closures = closures_by_date.get(date_key, [])
            overrides = {closure.time_slot: closure for closure in closures}
            slot_availability = {
                slot: resolve_slot_availability(
                    count=daily_count,
                    capacity=daily_capacity,
                    all_day_override=overrides.get('all_day'),
                    slot_override=overrides.get(slot),
                )
                for slot in ORDERED_BOOKABLE_TIME_SLOTS
            }
            slot_statuses = [slot_availability[slot]['status'] for slot in ORDERED_BOOKABLE_TIME_SLOTS]
            if all(slot_status in {'closed', 'full'} for slot_status in slot_statuses):
                day_status = 'unavailable'
            elif any(slot_status in {'closed', 'full', 'limited'} for slot_status in slot_statuses):
                day_status = 'limited'
            else:
                day_status = 'available'
            days.append({
                'date': date_key,
                'has_appointments': any(counts.values()),
                'slots': {
                    slot: bool(counts.get(slot, 0))
                    for slot in ('morning', 'midday', 'afternoon', 'unspecified')
                },
                'availability': {
                    'status': day_status,
                    'slots': slot_availability,
                },
                'closure': {
                    'all_day': bool(
                        overrides.get('all_day')
                        and overrides['all_day'].availability_status == 'closed'
                    ),
                    'slots': {
                        slot: bool(
                            overrides.get(slot)
                            and overrides[slot].availability_status == 'closed'
                        )
                        for slot in ('morning', 'midday', 'afternoon')
                    },
                    'reasons': [
                        {
                            'time_slot': closure.time_slot,
                            'time_slot_label': closure.get_time_slot_display(),
                            'availability_status': closure.availability_status,
                        }
                        for closure in closures
                    ],
                },
            })

        return Response({
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
            'capacity_policy': {
                'daily_capacity': daily_capacity,
                'limited_at_remaining_slots': 1,
            },
            'days': days,
            'advisory': (
                'Green is available, orange is limited, and red has no appointment availability. '
                'Availability may change until the request is reviewed and confirmed; other clients\' details and counts are never shown.'
            ),
        })

    def perform_update(self, serializer):
        requested_status = serializer.validated_data.get('status')
        if requested_status and requested_status != serializer.instance.status:
            raise ValidationError({
                'status': 'Use the approve, reject, or cancel action to change request status.'
            })
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'error': 'Service requests cannot be deleted. Use the cancel action to preserve the audit trail.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a pending request and create its operational ticket."""
        with transaction.atomic():
            lock_appointment_capacity_policy()
            service_request = self.get_locked_request()
            require_inspection = (
                str(request.data.get('require_inspection', '')).lower() == 'true'
                or service_request.requires_site_inspection
            )

            if service_request.status != 'Pending':
                return Response(
                    {'error': f'Only pending requests can be approved; this request is {service_request.status.lower()}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            closure_error = get_calendar_closure_error(
                service_request.preferred_date,
                service_request.preferred_time_slot,
            )
            if closure_error:
                return Response({'error': closure_error}, status=status.HTTP_400_BAD_REQUEST)
            if service_request.status != 'Approved':
                service_request.status = 'Approved'
                service_request._activity_reason = 'Approved after admin review.'
                service_request.save(update_fields=['status'])

            # Ensure ticket exists (auto-created at submission, but create if missing for consistency)
            ticket = ServiceTicket.objects.filter(request=service_request).first()
            if not ticket:
                payload = build_initial_ticket_payload(service_request)
                if require_inspection:
                    payload['status'] = 'For Inspection'
                    payload['ticket_type'] = 'inspection'
                    
                ticket = ServiceTicket.objects.create(
                    request=service_request,
                    assigned_admin=None,
                    **payload,
                )
                service_request.auto_ticket_created = True
                service_request.save(update_fields=['auto_ticket_created'])
                # Start the ticket's audit trail (View Timeline) with its creation.
                ServiceStatusHistory.objects.create(
                    ticket=ticket,
                    status=ticket.status,
                    changed_by=request.user,
                    notes=(
                        'Request approved; inspection ticket created.'
                        if require_inspection
                        else 'Request approved; service ticket created.'
                    ),
                )
                logger.info(f"Auto-created missing Ticket #{ticket.id} for Request #{service_request.id} during approval")
            else:
                if require_inspection and ticket.status == 'Not Started':
                    ticket.status = 'For Inspection'
                    ticket.ticket_type = 'inspection'
                    ticket.save(update_fields=['status', 'ticket_type'])
                    ServiceStatusHistory.objects.create(
                        ticket=ticket,
                        status='For Inspection',
                        changed_by=request.user,
                        notes='Admin requested pre-installation inspection.'
                    )

            # Record the admin workspace user who approved the ticket for ownership/audit.
            if ticket and not ticket.assigned_admin and is_admin_workspace_role(request.user.role):
                ticket.assigned_admin = request.user
                ticket.save(update_fields=['assigned_admin'])
            # Attempt auto-dispatch if enabled in admin settings
            from users.models import AdminSettings
            from services.auto_dispatch import should_attempt_auto_dispatch, auto_assign_technician

            try:
                admin_settings = AdminSettings.objects.first()
                auto_dispatch_enabled = admin_settings.auto_dispatch_enabled if admin_settings else False

                if auto_dispatch_enabled and should_attempt_auto_dispatch(ticket):
                    logger.info(f"Attempting auto-dispatch for ticket {ticket.id} (auto_dispatch_enabled={auto_dispatch_enabled})")
                    if auto_assign_technician(ticket):
                        logger.info(f"Successfully auto-assigned ticket {ticket.id} during approval")
                    else:
                        logger.info(f"Auto-dispatch attempted but no suitable technician found for ticket {ticket.id}")
                elif not auto_dispatch_enabled:
                    logger.debug("Auto-dispatch is disabled in admin settings")
            except Exception as e:
                logger.error(f"Error during auto-dispatch for ticket {ticket.id}: {e}")
                # Don't fail the approval if auto-dispatch fails

            notify_dispatch_ticket_ready(ticket)

            # Notify client
            create_notification(
                service_request.client,
                f"Your service request has been approved. Ticket #{ticket.id} is ready for assignment.",
                'success'
            )
            send_notification_email(
                service_request.client,
                'Service Request Approved',
                f'Your service request for {service_request.service_type.name} has been approved. Ticket #{ticket.id} has been created.'
            )

            return Response({'status': 'Request approved'})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a pending service request during admin review."""
        with transaction.atomic():
            service_request = self.get_locked_request()
            if service_request.status != 'Pending':
                return Response(
                    {'error': f'Only pending requests can be rejected; this request is {service_request.status.lower()}.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            reason = str(request.data.get('reason') or '').strip()
            if not reason:
                return Response(
                    {'error': 'A reason is required when rejecting a service request.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            service_request.status = 'Cancelled'
            service_request._activity_reason = reason
            service_request._activity_closure = 'rejected'
            service_request.save(update_fields=['status', 'updated_at'])

            send_user_notification(
                user=service_request.client,
                title='Service Request Rejected',
                body=(
                    f"Your service request was rejected. Reason: {reason}"
                    if reason else
                    'Your service request was rejected after admin review.'
                ),
                notification_type='warning',
                request=service_request,
            )

        return Response({'status': 'Request rejected'})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        """Cancel the service request"""
        service_request = self.get_locked_request()
        related_ticket = ServiceTicket.objects.select_for_update().filter(
            request=service_request,
        ).select_related('technician').first()

        can_cancel = (
            user_can_manage_service_requests(request.user) or
            (request.user.role == 'client' and service_request.client_id == request.user.id)
        )
        if not can_cancel:
            raise PermissionDenied('You do not have permission to cancel this service request.')

        if service_request.status in {'Completed', 'Cancelled'}:
            return Response(
                {'error': f'{service_request.status} requests cannot be cancelled.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if related_ticket and related_ticket.status in FIELD_WORK_TICKET_STATUSES + COMPLETED_TICKET_STATUSES:
            is_office = is_admin_workspace_role(getattr(request.user, 'role', None))
            if related_ticket.status in COMPLETED_TICKET_STATUSES or not is_office:
                return Response(
                    {
                        'error': (
                            'Your technician is already on the way or working on site, so this request can no longer '
                            'be cancelled online. Please contact our office.'
                            if related_ticket.status in FIELD_WORK_TICKET_STATUSES
                            else f'Request cannot be cancelled while ticket #{related_ticket.id} is {related_ticket.status.lower()}.'
                        ),
                        'code': 'cancellation_requires_office',
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response(
                {'error': 'Please provide a reason for cancelling this request.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        service_request.status = 'Cancelled'
        service_request._activity_reason = reason
        service_request._activity_closure = 'cancelled_by_client' if request.user.role == 'client' else 'cancelled_by_office'
        service_request.save(update_fields=['status', 'updated_at'])

        if related_ticket and related_ticket.status != 'Cancelled':
            related_ticket.status = 'Cancelled'
            related_ticket._activity_reason = reason or 'Parent service request was cancelled.'
            clear_reschedule_request(related_ticket)
            related_ticket.save(update_fields=[
                'status',
                'reschedule_requested',
                'reschedule_reason',
                'reschedule_requested_at',
                'updated_at',
            ])
            sync_ticket_team_availability(related_ticket)
            release_ticket_reservations(
                related_ticket,
                performed_by=request.user,
                reason='Released because the parent service request was cancelled.',
            )
            ServiceStatusHistory.objects.create(
                ticket=related_ticket,
                status='Cancelled',
                changed_by=request.user,
                notes=(
                    f'Ticket cancelled because the parent service request was cancelled. Reason: {reason}'
                    if reason else
                    'Ticket cancelled because the parent service request was cancelled.'
                )
            )
            for assigned_technician in get_ticket_team_members(related_ticket):
                send_user_notification(
                    user=assigned_technician,
                    title=f"Ticket #{related_ticket.id} Cancelled",
                    body=f"Ticket #{related_ticket.id} was cancelled before work started.",
                    notification_type='warning',
                    ticket=related_ticket,
                    request=service_request,
                )

        send_user_notification(
            user=service_request.client,
            title='Service Request Cancelled',
            body=(
                f'Your service request has been cancelled. Reason: {reason}'
                if reason else
                'Your service request has been cancelled.'
            ),
            notification_type='warning',
            ticket=related_ticket,
            request=service_request,
        )

        return Response({'status': 'Request cancelled', 'reason': reason})
