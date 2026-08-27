from datetime import datetime, time, timedelta

from django.utils import timezone


SLA_STATE_INACTIVE = 'inactive'
SLA_STATE_HEALTHY = 'healthy'
SLA_STATE_WARNING = 'warning'
SLA_STATE_OVERDUE = 'overdue'
from datetime import datetime, time, timedelta

from django.utils import timezone


SLA_STATE_INACTIVE = 'inactive'
SLA_STATE_HEALTHY = 'healthy'
SLA_STATE_WARNING = 'warning'
SLA_STATE_OVERDUE = 'overdue'
SLA_STATE_PAUSED = 'paused'

SLA_RULE_LABELS = {
    'approval_delay': 'Approval delay',
    'assignment_delay': 'Assignment delay',
    'start_delay': 'Start delay',
    'execution_delay': 'Execution delay',
    'reschedule_delay': 'Reschedule delay',
    'inspection_delay': 'Inspection delay',
    'service_ready_delay': 'Service ready delay',
}

TIME_SLOT_DEFAULTS = {
    'morning': time(hour=9, minute=0),
    'midday': time(hour=12, minute=0),
    'afternoon': time(hour=15, minute=0),
    'evening': time(hour=18, minute=0),
}

APPROVAL_WARNING_AFTER = timedelta(hours=3)
APPROVAL_OVERDUE_AFTER = timedelta(hours=8)
ASSIGNMENT_WARNING_AFTER = timedelta(hours=2)
ASSIGNMENT_OVERDUE_AFTER = timedelta(hours=6)
START_WARNING_AFTER = timedelta(minutes=15)
START_OVERDUE_AFTER = timedelta(minutes=60)
EXECUTION_WARNING_MULTIPLIER = 1.5
EXECUTION_OVERDUE_MULTIPLIER = 2
RESCHEDULE_WARNING_AFTER = timedelta(hours=4)
RESCHEDULE_OVERDUE_AFTER = timedelta(hours=12)
INSPECTION_WARNING_AFTER = timedelta(hours=24)
INSPECTION_OVERDUE_AFTER = timedelta(hours=48)
SERVICE_READY_WARNING_AFTER = timedelta(hours=24)
SERVICE_READY_OVERDUE_AFTER = timedelta(hours=48)

DEFAULT_RULE_MINUTES = {
    'approval_delay': (180, 480),
    'assignment_delay': (120, 360),
    'start_delay': (15, 60),
    'reschedule_delay': (240, 720),
    'inspection_delay': (1440, 2880),
    'service_ready_delay': (1440, 2880),
}


def _rule_durations(rule, warning_default, overdue_default):
    from django.core.cache import cache
    cache_key = f'sla_rule_{rule}'
    cached_val = cache.get(cache_key)
    if cached_val is not None:
        if cached_val == 'not_found':
            return warning_default, overdue_default
        return cached_val

    try:
        from services.models import SLARule
        configured = SLARule.objects.filter(key=rule, is_active=True).first()
    except Exception:
        configured = None

    if configured:
        val = (
            timedelta(minutes=configured.warning_minutes),
            timedelta(minutes=configured.overdue_minutes),
        )
        cache.set(cache_key, val, 300)
        return val

    cache.set(cache_key, 'not_found', 300)
    return warning_default, overdue_default


def _minutes_until(reference_time, target_time):
    if reference_time is None or target_time is None:
        return None

    seconds = (target_time - reference_time).total_seconds()
    if seconds <= 0:
        return 0
    return int(seconds // 60)


def _minutes_overdue(reference_time, target_time):
    if reference_time is None or target_time is None or reference_time <= target_time:
        return 0
    return int((reference_time - target_time).total_seconds() // 60)


def _build_result(
    *,
    state,
    label,
    rule=None,
    warning_at=None,
    due_at=None,
    action_required=None,
    now=None,
):
    if now is None:
        now = timezone.now()

    breached_at = due_at if state == SLA_STATE_OVERDUE and due_at else None
    return {
        'state': state,
        'rule': rule,
        'rule_label': SLA_RULE_LABELS.get(rule) if rule else None,
        'label': label,
        'warning_at': warning_at,
        'due_at': due_at,
        'breached_at': breached_at,
        'minutes_to_breach': _minutes_until(now, due_at),
        'minutes_overdue': _minutes_overdue(now, due_at),
        'action_required': action_required,
        'is_active': state not in {SLA_STATE_INACTIVE, SLA_STATE_PAUSED},
    }


def _build_timed_result(*, rule, label_prefix, warning_at, due_at, action_required, now=None):
    if now is None:
        now = timezone.now()

    if due_at and now >= due_at:
        state = SLA_STATE_OVERDUE
        label = f'{label_prefix} overdue'
    elif warning_at and now >= warning_at:
        state = SLA_STATE_WARNING
        label = f'{label_prefix} approaching SLA breach'
    else:
        state = SLA_STATE_HEALTHY
        label = f'{label_prefix} within SLA'

    return _build_result(
        state=state,
        rule=rule,
        label=label,
        warning_at=warning_at,
        due_at=due_at,
        action_required=action_required,
        now=now,
    )


def _serialize_datetime(value):
    return value.isoformat() if value else None


def _resolve_scheduled_start(ticket):
    if not getattr(ticket, 'scheduled_date', None):
        return None

    scheduled_time = getattr(ticket, 'scheduled_time', None)
    if scheduled_time is None:
        scheduled_time = TIME_SLOT_DEFAULTS.get(getattr(ticket, 'scheduled_time_slot', None))
    if scheduled_time is None:
        scheduled_time = TIME_SLOT_DEFAULTS['morning']

    naive_start = datetime.combine(ticket.scheduled_date, scheduled_time)
    current_timezone = timezone.get_current_timezone()
    if timezone.is_naive(naive_start):
        return timezone.make_aware(naive_start, current_timezone)
    return naive_start.astimezone(current_timezone)


def get_ticket_dispatch_state(ticket, *, now=None):
    if now is None:
        now = timezone.now()

    local_now = timezone.localtime(now)
    scheduled_start = _resolve_scheduled_start(ticket)
    closed_statuses = {'Completed', 'Cancelled'}

    if ticket.status in closed_statuses:
        return {
            'status': 'closed',
            'label': ticket.status,
            'action': 'No dispatch action needed',
            'is_missed_dispatch': False,
            'missed_dispatch_at': None,
            'overdue_days': 0,
        }

    if ticket.technician_id:
        return {
            'status': 'assigned',
            'label': 'Assigned',
            'action': 'Monitor technician progress',
            'is_missed_dispatch': False,
            'missed_dispatch_at': None,
            'overdue_days': 0,
        }

    missed = False
    overdue_days = 0
    missed_at = scheduled_start

    if getattr(ticket, 'scheduled_date', None):
        overdue_days = max((local_now.date() - ticket.scheduled_date).days, 0)
        missed = ticket.scheduled_date < local_now.date()
        has_explicit_start = bool(getattr(ticket, 'scheduled_time', None) or getattr(ticket, 'scheduled_time_slot', None))
        if has_explicit_start and scheduled_start and local_now >= scheduled_start:
            missed = True

    if missed and ticket.status == 'Not Started':
        return {
            'status': 'missed_dispatch',
            'label': 'Needs Reschedule',
            'action': 'Assign technician or reschedule',
            'is_missed_dispatch': True,
            'missed_dispatch_at': _serialize_datetime(missed_at),
            'overdue_days': overdue_days,
        }

    if ticket.status in {'Not Started', 'On Hold'}:
        return {
            'status': 'unassigned_scheduled',
            'label': 'Unassigned',
            'action': 'Assign technician',
            'is_missed_dispatch': False,
            'missed_dispatch_at': None,
            'overdue_days': overdue_days,
        }

    return {
        'status': 'unassigned',
        'label': 'Unassigned',
        'action': 'Review dispatch status',
        'is_missed_dispatch': False,
        'missed_dispatch_at': None,
        'overdue_days': overdue_days,
    }


def serialize_sla_evaluation(evaluation):
    return {
        **evaluation,
        'warning_at': _serialize_datetime(evaluation.get('warning_at')),
        'due_at': _serialize_datetime(evaluation.get('due_at')),
        'breached_at': _serialize_datetime(evaluation.get('breached_at')),
    }


def evaluate_service_request_sla(service_request, *, now=None):
    if now is None:
        now = timezone.now()

    if service_request.status in {'Completed', 'Cancelled'}:
        return _build_result(
            state=SLA_STATE_PAUSED,
            label='Request SLA paused',
            now=now,
        )

    if service_request.status != 'Pending':
        return _build_result(
            state=SLA_STATE_INACTIVE,
            label='No active request SLA',
            now=now,
        )

    request_time = service_request.request_date or now
    warning_after, overdue_after = _rule_durations(
        'approval_delay',
        APPROVAL_WARNING_AFTER,
        APPROVAL_OVERDUE_AFTER,
    )
    return _build_timed_result(
        rule='approval_delay',
        label_prefix='Approval',
        warning_at=request_time + warning_after,
        due_at=request_time + overdue_after,
        action_required='Review request',
        now=now,
    )


def evaluate_service_ticket_sla(service_ticket, *, now=None):
    if now is None:
        now = timezone.now()

    if service_ticket.status in {'Completed', 'Cancelled'}:
        return _build_result(
            state=SLA_STATE_PAUSED,
            label='Ticket SLA paused',
            now=now,
        )

    if service_ticket.reschedule_requested:
        reschedule_time = service_ticket.reschedule_requested_at or service_ticket.updated_at or now
        warning_after, overdue_after = _rule_durations(
            'reschedule_delay',
            RESCHEDULE_WARNING_AFTER,
            RESCHEDULE_OVERDUE_AFTER,
        )
        return _build_timed_result(
            rule='reschedule_delay',
            label_prefix='Reschedule response',
            warning_at=reschedule_time + warning_after,
            due_at=reschedule_time + overdue_after,
            action_required='Review reschedule request',
            now=now,
        )

    if service_ticket.status == 'Not Started' and not service_ticket.technician_id:
        scheduled_start = _resolve_scheduled_start(service_ticket)
        created_time = service_ticket.created_at or now
        warning_after, overdue_after = _rule_durations(
            'assignment_delay',
            ASSIGNMENT_WARNING_AFTER,
            ASSIGNMENT_OVERDUE_AFTER,
        )
        result = _build_timed_result(
            rule='assignment_delay',
            label_prefix='Assignment',
            warning_at=created_time + warning_after,
            due_at=created_time + overdue_after,
            action_required='Assign technician',
            now=now,
        )
        if scheduled_start and scheduled_start > now and result['state'] == SLA_STATE_OVERDUE:
            return _build_result(
                state=SLA_STATE_INACTIVE,
                rule='assignment_delay',
                label='Assignment SLA not due yet',
                warning_at=result.get('warning_at'),
                due_at=result.get('due_at'),
                action_required='Assign technician',
                now=now,
            )
        return result

    if service_ticket.status == 'Not Started' and service_ticket.technician_id:
        scheduled_start = _resolve_scheduled_start(service_ticket)
        warning_after, overdue_after = _rule_durations(
            'start_delay',
            START_WARNING_AFTER,
            START_OVERDUE_AFTER,
        )
        return _build_timed_result(
            rule='start_delay',
            label_prefix='Start time',
            warning_at=scheduled_start + warning_after if scheduled_start else None,
            due_at=scheduled_start + overdue_after if scheduled_start else None,
            action_required='Start work',
            now=now,
        )

    if service_ticket.status == 'In Progress':
        service_type = getattr(getattr(service_ticket, 'request', None), 'service_type', None)
        estimated_minutes = max(
            int(getattr(service_type, 'estimated_duration', 60) or 60),
            1,
        )
        execution_start = (
            service_ticket.start_time
            or service_ticket.updated_at
            or service_ticket.assigned_at
            or service_ticket.created_at
            or now
        )
        warning_after, overdue_after = _rule_durations(
            'execution_delay',
            timedelta(minutes=estimated_minutes * EXECUTION_WARNING_MULTIPLIER),
            timedelta(minutes=estimated_minutes * EXECUTION_OVERDUE_MULTIPLIER),
        )
        return _build_timed_result(
            rule='execution_delay',
            label_prefix='Execution',
            warning_at=execution_start + warning_after,
            due_at=execution_start + overdue_after,
            action_required='Complete work',
            now=now,
        )

    if service_ticket.status == 'For Inspection':
        inspection_start = service_ticket.updated_at or service_ticket.created_at or now
        warning_after, overdue_after = _rule_durations(
            'inspection_delay',
            INSPECTION_WARNING_AFTER,
            INSPECTION_OVERDUE_AFTER,
        )
        return _build_timed_result(
            rule='inspection_delay',
            label_prefix='Site inspection',
            warning_at=inspection_start + warning_after,
            due_at=inspection_start + overdue_after,
            action_required='Complete inspection',
            now=now,
        )

    if service_ticket.status == 'Ready for Service':
        ready_start = service_ticket.updated_at or service_ticket.created_at or now
        warning_after, overdue_after = _rule_durations(
            'service_ready_delay',
            SERVICE_READY_WARNING_AFTER,
            SERVICE_READY_OVERDUE_AFTER,
        )
        return _build_timed_result(
            rule='service_ready_delay',
            label_prefix='Ready for service',
            warning_at=ready_start + warning_after,
            due_at=ready_start + overdue_after,
            action_required='Schedule service',
            now=now,
        )

    return _build_result(
        state=SLA_STATE_INACTIVE,
        label='No active ticket SLA',
        now=now,
    )


# ============================================================================
# SLA ENFORCEMENT & NOTIFICATIONS
# ============================================================================

def check_and_escalate_sla_breaches(*, now=None):
    """
    Check all active tickets for SLA breaches and take corrective action.

    This function should be called periodically (e.g., via a management command
    or scheduled task) to identify and escalate SLA violations.

    Returns:
        dict with escalation counts by type
    """
    import logging
    from django.db.models import Q
    from services.models import ServiceTicket, ServiceRequest

    logger = logging.getLogger(__name__)

    if now is None:
        now = timezone.now()

    escalations = {
        'approval_overdue': 0,
        'assignment_overdue': 0,
        'start_overdue': 0,
        'execution_overdue': 0,
        'reschedule_overdue': 0,
        'inspection_overdue': 0,
        'service_ready_overdue': 0,
    }

    # Check pending requests against the original request time, not updated_at.
    pending_requests = ServiceRequest.objects.filter(status='Pending')

    for request in pending_requests:
        evaluation = evaluate_service_request_sla(request, now=now)
        if evaluation.get('state') == SLA_STATE_OVERDUE:
            logger.warning(
                f"Service request {request.id} approval SLA breached. "
                f"Overdue by {evaluation.get('minutes_overdue')} minutes"
            )
            escalations['approval_overdue'] += 1

            # Notify admins about overdue approval
            from notifications.sla_notifications import notify_admins_sla_breach
            notify_admins_sla_breach(
                'request_approval',
                request.id,
                evaluation,
            )

    # Check tickets
    active_tickets = ServiceTicket.objects.filter(
        status__in=['Not Started', 'In Progress', 'On Hold', 'For Inspection', 'Ready for Service'],
    )

    for ticket in active_tickets:
        evaluation = evaluate_service_ticket_sla(ticket, now=now)

        if evaluation.get('state') == SLA_STATE_OVERDUE:
            rule = evaluation.get('rule')
            logger.warning(
                f"Service ticket {ticket.id} {rule} SLA breached. "
                f"Overdue by {evaluation.get('minutes_overdue')} minutes. "
                f"Rule: {evaluation.get('rule_label')}"
            )

            # Escalation actions based on rule
            if rule == 'assignment_delay':
                escalations['assignment_overdue'] += 1
                _escalate_assignment_overdue(ticket, evaluation, logger)

            elif rule == 'start_delay':
                escalations['start_overdue'] += 1
                _escalate_start_overdue(ticket, evaluation, logger)

            elif rule == 'execution_delay':
                escalations['execution_overdue'] += 1
                _escalate_execution_overdue(ticket, evaluation, logger)

            elif rule == 'reschedule_delay':
                escalations['reschedule_overdue'] += 1
                _escalate_reschedule_overdue(ticket, evaluation, logger)

            elif rule == 'inspection_delay':
                escalations['inspection_overdue'] += 1
                _escalate_inspection_overdue(ticket, evaluation, logger)

            elif rule == 'service_ready_delay':
                escalations['service_ready_overdue'] += 1
                _escalate_service_ready_overdue(ticket, evaluation, logger)

    logger.info(f"SLA escalation summary: {escalations}")
    return escalations


def _escalate_assignment_overdue(ticket, evaluation, logger):
    """Handle escalation for overdue assignment SLA."""
    from notifications.sla_notifications import notify_supervisors_ticket_escalation
    from services.auto_dispatch import auto_assign_technician

    # If ticket still not assigned, attempt auto-dispatch
    if not ticket.technician:
        logger.info(f"Attempting auto-dispatch for overdue ticket {ticket.id}")
        if auto_assign_technician(ticket):
            logger.info(f"Successfully auto-assigned ticket {ticket.id} after SLA escalation")

    # Notify supervisors
    notify_supervisors_ticket_escalation(
        ticket,
        'assignment_overdue',
        evaluation,
    )


def _escalate_start_overdue(ticket, evaluation, logger):
    """Handle escalation for overdue start SLA."""
    from notifications.sla_notifications import notify_supervisors_ticket_escalation

    # Mark ticket as requiring urgent attention
    ticket.priority = 'Urgent'
    ticket.save(update_fields=['priority'])

    # Notify technician and supervisors
    notify_supervisors_ticket_escalation(
        ticket,
        'start_overdue',
        evaluation,
    )

    if ticket.technician:
        from notifications.notification_utils import send_user_notification
        send_user_notification(
            user=ticket.technician,
            title=f"URGENT: Ticket #{ticket.id} start time overdue",
            body=evaluation.get('action_required') or 'Start work immediately.',
            notification_type='warning',
            ticket=ticket,
            request=ticket.request,
            data={
                'ticket_id': ticket.id,
                'alert_type': 'start_overdue',
                'minutes_overdue': evaluation.get('minutes_overdue'),
            },
        )


def _escalate_execution_overdue(ticket, evaluation, logger):
    """Handle escalation for overdue execution SLA."""
    from notifications.sla_notifications import notify_supervisors_ticket_escalation

    # Escalate priority and notify
    if ticket.priority != 'Urgent':
        ticket.priority = 'Urgent'
        ticket.notes = (ticket.notes or '') + f"\n[AUTO] Priority escalated due to SLA breach at {timezone.now()}"
        ticket.save(update_fields=['priority', 'notes'])

    notify_supervisors_ticket_escalation(
        ticket,
        'execution_overdue',
        evaluation,
    )


def _escalate_reschedule_overdue(ticket, evaluation, logger):
    """Handle escalation for overdue reschedule response SLA."""
    from notifications.sla_notifications import notify_admins_ticket_escalation

    # Notify admins that reschedule request needs response
    notify_admins_ticket_escalation(
        ticket,
        'reschedule_overdue',
        evaluation,
    )


def _escalate_inspection_overdue(ticket, evaluation, logger):
    """Handle escalation for overdue inspection SLA."""
    from notifications.sla_notifications import notify_supervisors_ticket_escalation

    notify_supervisors_ticket_escalation(
        ticket,
        'inspection_overdue',
        evaluation,
    )


def _escalate_service_ready_overdue(ticket, evaluation, logger):
    """Handle escalation for overdue ready-for-service SLA."""
    from notifications.sla_notifications import notify_admins_ticket_escalation

    notify_admins_ticket_escalation(
        ticket,
        'service_ready_overdue',
        evaluation,
    )


def check_sla_warnings(*, now=None):
    """
    Check all active tickets for SLA warnings (approaching breach).

    Returns:
        dict with warning counts by type
    """
    import logging
    from services.models import ServiceTicket, ServiceRequest

    logger = logging.getLogger(__name__)

    if now is None:
        now = timezone.now()

    warnings = {
        'approval_warning': 0,
        'assignment_warning': 0,
        'start_warning': 0,
        'execution_warning': 0,
        'reschedule_warning': 0,
        'inspection_warning': 0,
        'service_ready_warning': 0,
    }

    # Check pending requests
    pending_requests = ServiceRequest.objects.filter(status='Pending')

    for request in pending_requests:
        evaluation = evaluate_service_request_sla(request, now=now)
        if evaluation.get('state') == SLA_STATE_WARNING:
            logger.info(
                f"Service request {request.id} approval SLA warning. "
                f"Minutes to breach: {evaluation.get('minutes_to_breach')}"
            )
            warnings['approval_warning'] += 1

    # Check tickets
    active_tickets = ServiceTicket.objects.filter(
        status__in=['Not Started', 'In Progress', 'On Hold', 'For Inspection', 'Ready for Service'],
    )

    for ticket in active_tickets:
        evaluation = evaluate_service_ticket_sla(ticket, now=now)

        if evaluation.get('state') == SLA_STATE_WARNING:
            rule = evaluation.get('rule')
            logger.debug(
                f"Service ticket {ticket.id} {rule} SLA warning. "
                f"Minutes to breach: {evaluation.get('minutes_to_breach')}"
            )

            warning_key = {
                'assignment_delay': 'assignment_warning',
                'start_delay': 'start_warning',
                'execution_delay': 'execution_warning',
                'reschedule_delay': 'reschedule_warning',
                'inspection_delay': 'inspection_warning',
                'service_ready_delay': 'service_ready_warning',
            }.get(rule)

            if warning_key:
                warnings[warning_key] += 1

    logger.debug(f"SLA warning summary: {warnings}")
    return warnings

