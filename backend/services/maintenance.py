from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone

from notifications.models import Notification
from notifications.notification_utils import email_notifications_enabled, in_app_notifications_enabled
from services.business_time import business_today

from .models import AfterSalesCase as FollowUpCase, AfterSalesCaseEvent
from .models import InspectionChecklist, MaintenanceSchedule, ServiceRequest, ServiceTicket
from services.ticket_status import COMPLETED_TICKET_STATUSES


DEFAULT_FOLLOW_UP_WINDOW_DAYS = 7
COMPLETION_FOLLOW_UP_DEFAULT_OFFSETS = {
    'complaint': 1,
    'revisit': 2,
    'warranty': 3,
    'feedback': 3,
    'follow_up': 2,
}


def _record_automated_case_event(case, *, created, notes):
    return AfterSalesCaseEvent.objects.create(
        case=case,
        actor=None,
        event_type='created' if created else 'updated',
        to_status=case.status,
        notes=notes,
        metadata={'creation_source': case.creation_source},
    )


def _apply_case_defaults(case, defaults):
    changed_fields = []
    for field, value in defaults.items():
        if getattr(case, field) != value:
            setattr(case, field, value)
            changed_fields.append(field)
    if changed_fields:
        case.save(update_fields=[*changed_fields, 'updated_at'])
    return changed_fields

MAINTENANCE_RULES = {
    'commercial_area': {
        'label': 'Commercial Area',
        'interval_days': 90,
    },
    'dust_free_area': {
        'label': 'Dust-Free Area',
        'interval_days': 180,
    },
    'standard_area': {
        'label': 'Standard Area',
        'interval_days': 120,
    },
}


def maintenance_reminder_days():
    """The Maintenance Reminder setting (3-30 days before the due date; 7 when unset)."""
    try:
        from users.models import AdminSettings
        settings_obj = AdminSettings.objects.order_by('id').first()
        if settings_obj:
            return max(3, min(30, int(settings_obj.maintenance_reminder_days)))
    except Exception:
        pass
    return DEFAULT_FOLLOW_UP_WINDOW_DAYS


def apply_reminder_window(schedule, reminder_days=None):
    """Reminders and the "Due soon" status start the setting's number of days before the due date."""
    window = min(reminder_days or maintenance_reminder_days(), schedule.interval_days)
    schedule.follow_up_window_days = window
    schedule.notify_on_date = schedule.next_due_date - timedelta(days=window)
    return schedule


def get_maintenance_rule(profile):
    return MAINTENANCE_RULES.get(profile, MAINTENANCE_RULES['standard_area'])


def resolve_interval_days(profile, override_days=None):
    if override_days:
        return int(override_days)
    return get_maintenance_rule(profile)['interval_days']


def evaluate_schedule_status(schedule, reference_date=None):
    reference_date = reference_date or business_today()

    if schedule.status in {'completed', 'dismissed'}:
        return schedule.status
    if reference_date >= schedule.next_due_date:
        return 'due'
    if reference_date >= schedule.notify_on_date:
        return 'due_soon'
    return 'scheduled'


def calculate_maintenance_risk(ticket, inspection=None, reference_date=None):
    reference_date = reference_date or business_today()
    if inspection is None:
        try:
            inspection = ticket.inspection
        except InspectionChecklist.DoesNotExist:
            inspection = None
    service_type = ticket.request.service_type
    client = ticket.request.client

    base_scores = {
        'commercial_area': 65,
        'standard_area': 50,
        'dust_free_area': 35,
    }
    base_score = base_scores.get(getattr(inspection, 'maintenance_profile', None), 45)

    one_year_ago = reference_date - timedelta(days=365)
    related_cases = FollowUpCase.objects.filter(
        client=client,
        service_ticket__request__service_type=service_type,
        created_at__date__gte=one_year_ago,
    ).exclude(service_ticket=ticket)

    complaint_cases = related_cases.filter(case_type='complaint').count()
    revisit_cases = related_cases.filter(case_type='revisit').count()
    warranty_cases = related_cases.filter(case_type='warranty').count()
    prior_completed = ServiceTicket.objects.filter(
        request__client=client,
        request__service_type=service_type,
        status='Completed',
        completed_date__date__gte=one_year_ago,
    ).exclude(pk=ticket.pk).count()
    overdue_schedules = MaintenanceSchedule.objects.filter(
        client=client,
        service_type=service_type,
        next_due_date__lt=reference_date,
        status__in=['due', 'due_soon'],
    ).exclude(service_ticket=ticket).count()

    score = base_score
    if service_type.estimated_duration >= 120:
        score += 8
    score += min(prior_completed * 4, 12)
    score += complaint_cases * 8
    score += revisit_cases * 6
    score += warranty_cases * 5
    score += overdue_schedules * 10
    score = float(min(score, 100))

    if score >= 70:
        risk_level = 'high'
    elif score >= 45:
        risk_level = 'normal'
    else:
        risk_level = 'low'

    signals = []
    if complaint_cases:
        signals.append(f"{complaint_cases} complaint case(s)")
    if revisit_cases:
        signals.append(f"{revisit_cases} revisit case(s)")
    if warranty_cases:
        signals.append(f"{warranty_cases} warranty case(s)")
    if overdue_schedules:
        signals.append(f"{overdue_schedules} overdue maintenance cycle(s)")
    if not signals:
        signals.append('stable service history')

    notes = (
        f"Predicted {risk_level} maintenance risk based on "
        f"{service_type.name.lower()} service history, a {service_type.estimated_duration}-minute service baseline, "
        f"and {', '.join(signals)} in the last 12 months."
    )
    return {
        'risk_level': risk_level,
        'risk_score': score,
        'prediction_notes': notes,
    }


def evaluate_warranty_status(ticket, reference_date=None):
    reference_date = reference_date or business_today()

    if ticket.warranty_status == 'void':
        return 'void'
    if not ticket.warranty_period_days or not ticket.warranty_end_date:
        return 'not_applicable'
    if reference_date <= ticket.warranty_end_date:
        return 'active'
    return 'expired'


def _normalize_to_date(val):
    if not val:
        return business_today()
    if isinstance(val, str):
        from django.utils.dateparse import parse_date
        parsed = parse_date(val)
        return parsed if parsed else business_today()
    if hasattr(val, 'date') and callable(val.date):
        # A moment (completion time) counts on the business's day (UTC+8), not the server's UTC date.
        if getattr(val, 'tzinfo', None) is not None:
            from services.business_time import business_timezone

            return val.astimezone(business_timezone()).date()
        return val.date()
    return val


def sync_ticket_warranty(ticket, reference_date=None):
    reference_date = _normalize_to_date(reference_date or business_today())
    try:
        inspection = ticket.inspection
    except InspectionChecklist.DoesNotExist:
        inspection = None

    desired_values = {
        'warranty_status': 'not_applicable',
        'warranty_period_days': None,
        'warranty_start_date': None,
        'warranty_end_date': None,
        'warranty_notes': None,
    }

    turnover = getattr(ticket, 'turnover_acceptance', None)
    turnover_active = ticket.status == 'Turned Over / Accepted' or (turnover and turnover.status in {'finalized', 'accepted'})
    has_inspection_warranty = inspection and inspection.warranty_provided and inspection.warranty_period_days

    warranty_was_created = False
    if ticket.status in COMPLETED_TICKET_STATUSES and (has_inspection_warranty or turnover_active or ticket.warranty_start_date):
        if turnover and turnover.warranty_start_date:
            start_date = turnover.warranty_start_date
        elif turnover and turnover.turnover_date:
            start_date = turnover.turnover_date
        elif ticket.warranty_start_date:
            start_date = ticket.warranty_start_date
        else:
            start_date = ticket.completed_date or ticket.end_time or timezone.now()
        start_date = _normalize_to_date(start_date)

        if ticket.warranty_period_days:
            period_days = int(ticket.warranty_period_days)
        elif has_inspection_warranty:
            period_days = int(inspection.warranty_period_days)
        elif turnover_active:
            try:
                from users.models import AdminSettings
                settings_obj = AdminSettings.objects.first()
                period_days = int(settings_obj.default_warranty_days) if settings_obj and settings_obj.default_warranty_days else 365
            except Exception:
                period_days = 365
        else:
            period_days = None

        if period_days is not None:
            end_date = start_date + timedelta(days=period_days)
            notes = (inspection.warranty_notes or inspection.additional_notes) if inspection else ticket.warranty_notes
            desired_values.update({
                'warranty_period_days': period_days,
                'warranty_start_date': start_date,
                'warranty_end_date': end_date,
                'warranty_notes': notes,
                'warranty_status': 'active' if reference_date <= end_date else 'expired',
            })
            warranty_was_created = ticket.warranty_status == 'not_applicable'
            if turnover and not turnover.warranty_start_date:
                turnover.warranty_start_date = start_date
                turnover.save(update_fields=['warranty_start_date', 'updated_at'])

    update_fields = []
    for field_name, value in desired_values.items():
        if getattr(ticket, field_name) != value:
            setattr(ticket, field_name, value)
            update_fields.append(field_name)

    if update_fields:
        update_fields.append('updated_at')
        ticket.save(update_fields=update_fields)

    # Notify client about warranty
    if warranty_was_created and ticket.warranty_status == 'active' and in_app_notifications_enabled():
        client = ticket.request.client
        warranty_message = f"Warranty activated for ticket #{ticket.id}: Valid until {ticket.warranty_end_date}"
        Notification.objects.create(
            user=client,
            ticket=ticket,
            request=ticket.request,
            title='Warranty Activated',
            message=warranty_message,
            type='info',
        )

    return ticket


def sync_completion_warranty_case(ticket, reference_date=None):
    if ticket.status not in COMPLETED_TICKET_STATUSES or ticket.warranty_status != 'active':
        return None

    try:
        inspection = ticket.inspection
    except InspectionChecklist.DoesNotExist:
        return None

    if not inspection.warranty_provided:
        return None

    reference_date = reference_date or business_today()
    # A case response deadline is different from the warranty coverage expiry.
    # Keep the expiry on the ticket and give the after-sales team a short,
    # actionable response target.
    due_date = reference_date + timedelta(days=COMPLETION_FOLLOW_UP_DEFAULT_OFFSETS['warranty'])
    summary = inspection.follow_up_summary or _build_completion_follow_up_summary(ticket, 'warranty')
    details = _build_completion_follow_up_details(ticket, inspection, 'warranty')

    defaults = {
        'client': ticket.request.client,
        'created_by': ticket.technician,
        'priority': 'high',
        'summary': summary,
        'details': details,
        'due_date': due_date,
        'requires_revisit': False,
        'creation_source': 'completion_flow',
    }

    existing_case = FollowUpCase.objects.filter(
        service_ticket=ticket,
        case_type='warranty',
        creation_source='completion_flow',
    ).exclude(status__in=['resolved', 'closed']).first()

    if existing_case:
        changed_fields = _apply_case_defaults(existing_case, defaults)
        if changed_fields:
            _record_automated_case_event(
                existing_case,
                created=False,
                notes='Warranty handoff synchronized from the completed ticket.',
            )
            _notify_completion_follow_up_case(existing_case, created=False)
        return existing_case

    case = FollowUpCase.objects.create(
        service_ticket=ticket,
        case_type='warranty',
        status='open',
        assigned_to=None,
        **defaults,
    )
    _record_automated_case_event(
        case,
        created=True,
        notes='Warranty handoff created from the completed ticket.',
    )
    _notify_completion_follow_up_case(case, created=True)
    return case


MAINTENANCE_REMINDER_FIELDS = (
    'due_soon_notified_at', 'three_day_notified_at', 'due_notified_at',
    'client_notified_at', 'client_three_day_notified_at', 'client_due_notified_at',
)


def start_next_maintenance_cycle(schedule, performed_on=None):
    """Maintenance was done: the plan continues. The next due date counts from the day the work was
    performed, and every reminder stage starts over for the new cycle. Stopping reminders is the only
    way to end a plan."""
    performed_on = _normalize_to_date(performed_on or business_today())
    schedule.last_service_date = performed_on
    schedule.next_due_date = performed_on + timedelta(days=schedule.interval_days)
    apply_reminder_window(schedule)
    for field_name in MAINTENANCE_REMINDER_FIELDS:
        setattr(schedule, field_name, None)
    schedule.status = 'scheduled'
    schedule.status = evaluate_schedule_status(schedule, reference_date=business_today())
    schedule.save(update_fields=[
        'last_service_date', 'next_due_date', 'notify_on_date', 'follow_up_window_days', 'status',
        *MAINTENANCE_REMINDER_FIELDS, 'updated_at',
    ])

    if in_app_notifications_enabled():
        service_name = schedule.service_type.name if schedule.service_type else 'service'
        Notification.objects.create(
            user=schedule.client,
            ticket=schedule.service_ticket,
            request=schedule.service_ticket.request,
            title='Next Maintenance Scheduled',
            message=(
                f"Thank you, your {service_name} maintenance on {performed_on} is recorded. "
                f"Next maintenance is due on {schedule.next_due_date} ({schedule.interval_days}-day interval)."
            ),
            type='info',
        )
    return schedule


def _schedule_has_moved_on(schedule, job_service_date):
    """True when the plan's dates no longer come from the original job: a later cycle was recorded
    or an admin rescheduled it. Re-saving the job's inspection or turnover must not undo that."""
    if schedule.last_service_date > job_service_date:
        return True
    return schedule.next_due_date != schedule.last_service_date + timedelta(days=schedule.interval_days)


OPEN_VISIT_REQUEST_STATUSES = ('Pending', 'Approved', 'In Progress')
ACTIVE_PLAN_EXCLUDED_STATUSES = ('completed', 'dismissed')


def visit_service_type_for(schedule):
    """The service a maintenance visit is booked as: the plan service's "maintenance visit service"
    when set in the catalog and still active, otherwise the plan's own service."""
    service = schedule.service_type
    target = service.maintenance_service if service.maintenance_service_id else None
    return target if target is not None and target.is_active else service


def open_maintenance_visit(schedule):
    """The plan's booked visit that is not finished yet (a request still pending, approved or in
    progress), or None. Uses the list view's prefetch when present, so lists stay one query."""
    prefetched = getattr(schedule, 'open_visits', None)
    if prefetched is not None:
        return prefetched[0] if prefetched else None
    return schedule.maintenance_visits.filter(status__in=OPEN_VISIT_REQUEST_STATUSES).order_by('-id').first()


def _resolve_open_maintenance_cases(schedule, notes):
    now = timezone.now()
    for case in FollowUpCase.objects.filter(
        service_ticket=schedule.service_ticket,
        case_type='maintenance',
        status__in=['open', 'in_progress'],
    ):
        previous_status = case.status
        case.status = 'resolved'
        case.resolution_notes = notes
        case.resolved_at = now
        case.save(update_fields=['status', 'resolution_notes', 'resolved_at', 'updated_at'])
        AfterSalesCaseEvent.objects.create(
            case=case, actor=None, event_type='status_changed',
            from_status=previous_status, to_status='resolved', notes=notes,
        )


def continue_plan_from_visit(ticket):
    """A booked maintenance visit was finished: its plan starts the next cycle from the visit date and
    the plan's open maintenance case is resolved. Runs once per visit date (later re-saves of the
    visit's inspection or turnover do nothing). The visit never gets a plan of its own."""
    plan = ticket.request.maintenance_plan
    if plan is None or plan.status in ACTIVE_PLAN_EXCLUDED_STATUSES:
        return plan
    performed_on = _normalize_to_date(ticket.completed_date or ticket.end_time or business_today())
    if plan.last_service_date >= performed_on:
        return plan

    # The visit's checklist may set a new plan type or interval for the site.
    try:
        inspection = ticket.inspection
    except InspectionChecklist.DoesNotExist:
        inspection = None
    if inspection and inspection.maintenance_required and inspection.maintenance_profile:
        plan.maintenance_profile = inspection.maintenance_profile
        plan.interval_days = resolve_interval_days(inspection.maintenance_profile, inspection.maintenance_interval_days)
        if inspection.maintenance_notes:
            plan.maintenance_notes = inspection.maintenance_notes
        plan.save(update_fields=['maintenance_profile', 'interval_days', 'maintenance_notes', 'updated_at'])

    _resolve_open_maintenance_cases(plan, f"Maintenance visit TKT-{ticket.id:04d} completed on {performed_on}.")
    plan._activity_reason = f"Maintenance visit TKT-{ticket.id:04d} completed."
    return start_next_maintenance_cycle(plan, performed_on=performed_on)


def _matching_active_plan(ticket):
    """An active plan for the same client, service and site address from an earlier job. A repeat job
    there continues that plan instead of starting a second one (which would double the reminders)."""
    try:
        address = (ticket.request.location.address or '').strip()
    except Exception:
        address = ''
    if not address:
        return None
    return MaintenanceSchedule.objects.filter(
        client_id=ticket.request.client_id,
        service_type_id=ticket.request.service_type_id,
        service_ticket__request__location__address__iexact=address,
    ).exclude(status__in=ACTIVE_PLAN_EXCLUDED_STATUSES).exclude(service_ticket=ticket).order_by('-last_service_date').first()


def sync_maintenance_schedule(ticket, reference_date=None):
    if ticket.request.maintenance_plan_id:
        return continue_plan_from_visit(ticket)

    try:
        inspection = ticket.inspection
    except InspectionChecklist.DoesNotExist:
        return None

    if not inspection.maintenance_required or not inspection.maintenance_profile:
        return None

    if not MaintenanceSchedule.objects.filter(service_ticket=ticket).exists():
        earlier_plan = _matching_active_plan(ticket)
        if earlier_plan is not None:
            # The completion date (not a later turnover date) so later re-saves do not roll it again.
            service_date = _normalize_to_date(ticket.completed_date or ticket.end_time or business_today())
            if earlier_plan.last_service_date < service_date:
                earlier_plan._activity_reason = f"Repeat job TKT-{ticket.id:04d} at the same site."
                start_next_maintenance_cycle(earlier_plan, performed_on=service_date)
            return earlier_plan

    reference_date = _normalize_to_date(reference_date or business_today())
    turnover = getattr(ticket, 'turnover_acceptance', None)
    if turnover and turnover.turnover_date:
        last_service_date = turnover.turnover_date
    elif ticket.completed_date:
        last_service_date = ticket.completed_date
    elif ticket.end_time:
        last_service_date = ticket.end_time
    else:
        last_service_date = business_today()
    last_service_date = _normalize_to_date(last_service_date)
    interval_days = resolve_interval_days(
        inspection.maintenance_profile,
        inspection.maintenance_interval_days,
    )
    follow_up_window_days = min(maintenance_reminder_days(), interval_days)
    next_due_date = last_service_date + timedelta(days=interval_days)
    notify_on_date = next_due_date - timedelta(days=follow_up_window_days)
    risk_data = calculate_maintenance_risk(
        ticket,
        inspection=inspection,
        reference_date=reference_date,
    )

    defaults = {
        'client': ticket.request.client,
        'service_type': ticket.request.service_type,
        'maintenance_profile': inspection.maintenance_profile,
        'interval_days': interval_days,
        'follow_up_window_days': follow_up_window_days,
        'last_service_date': last_service_date,
        'next_due_date': next_due_date,
        'notify_on_date': notify_on_date,
        'maintenance_notes': inspection.maintenance_notes or inspection.additional_notes,
        'risk_level': risk_data['risk_level'],
        'risk_score': risk_data['risk_score'],
        'prediction_notes': risk_data['prediction_notes'],
    }
    existing = MaintenanceSchedule.objects.filter(service_ticket=ticket).first()
    if existing and _schedule_has_moved_on(existing, last_service_date):
        # Keep the current cycle's dates (and the interval they were built from).
        for field_name in ('interval_days', 'follow_up_window_days', 'last_service_date', 'next_due_date', 'notify_on_date'):
            defaults.pop(field_name)

    schedule, created = MaintenanceSchedule.objects.update_or_create(
        service_ticket=ticket,
        defaults=defaults,
    )

    schedule.status = evaluate_schedule_status(schedule, reference_date=reference_date)
    schedule.save(update_fields=['status', 'updated_at'])

    # Notify client about maintenance schedule (only when first created)
    if created and in_app_notifications_enabled():
        client = ticket.request.client
        profile_label = schedule.get_maintenance_profile_display()
        maint_message = f"Maintenance scheduled for ticket #{ticket.id}: Next service due on {next_due_date} ({interval_days}-day interval)"
        Notification.objects.create(
            user=client,
            ticket=ticket,
            request=ticket.request,
            title='Maintenance Scheduled',
            message=maint_message,
            type='info',
        )

    return schedule


def _build_completion_follow_up_summary(ticket, case_type):
    service_name = ticket.request.service_type.name if ticket.request.service_type else 'service'
    summary_map = {
        'follow_up': f'Post-service follow-up for ticket #{ticket.id}',
        'complaint': f'Complaint review needed for ticket #{ticket.id}',
        'warranty': f'Warranty handoff needed for ticket #{ticket.id}',
        'revisit': f'Revisit needed for ticket #{ticket.id}',
        'feedback': f'Capture customer feedback for ticket #{ticket.id}',
    }
    return summary_map.get(case_type, f'After-sales handoff for {service_name} ticket #{ticket.id}')


def _build_completion_follow_up_details(ticket, inspection, case_type):
    details = []

    if inspection.follow_up_details:
        details.append(str(inspection.follow_up_details).strip())
    if inspection.additional_notes:
        details.append(f"Technician notes: {str(inspection.additional_notes).strip()}")
    if case_type == 'warranty' and inspection.warranty_notes:
        details.append(f"Warranty notes: {str(inspection.warranty_notes).strip()}")
    if inspection.maintenance_required and inspection.maintenance_notes:
        details.append(f"Maintenance context: {str(inspection.maintenance_notes).strip()}")

    return "\n\n".join(item for item in details if item)


def _default_completion_follow_up_due_date(ticket, case_type, reference_date):
    if case_type == 'warranty' and ticket.warranty_end_date:
        return ticket.warranty_end_date

    offset_days = COMPLETION_FOLLOW_UP_DEFAULT_OFFSETS.get(case_type, 2)
    return reference_date + timedelta(days=offset_days)


def _notify_completion_follow_up_case(case, *, created):
    if not in_app_notifications_enabled():
        return
    User = get_user_model()
    recipients = User.objects.filter(role__in=['superadmin', 'admin'], status='active').order_by('id')
    action = 'New' if created else 'Updated'
    message = f"{action} after-sales handoff for ticket #{case.service_ticket_id}: {case.summary}"

    # Notify admin workspace users who handle after-sales work
    for recipient in recipients:
        Notification.objects.create(
            user=recipient,
            ticket=case.service_ticket,
            request=case.service_ticket.request,
            message=message,
            type='info',
        )

    # Notify CLIENT about their case
    client_message = f"{action} after-sales case: {case.summary}"
    client_type_map = {
        'warranty': 'warning',
        'complaint': 'urgent',
        'revisit': 'urgent',
        'feedback': 'info',
        'follow_up': 'info',
    }
    notification_type = client_type_map.get(case.case_type, 'info')

    Notification.objects.create(
        user=case.client,
        ticket=case.service_ticket,
        request=case.service_ticket.request,
        title=f"{action} after-sales case",
        message=client_message,
        type=notification_type,
    )


def sync_completion_follow_up_case(ticket, reference_date=None):
    if ticket.status not in COMPLETED_TICKET_STATUSES:
        return None

    try:
        inspection = ticket.inspection
    except InspectionChecklist.DoesNotExist:
        return None

    if not inspection.follow_up_required:
        return None

    reference_date = reference_date or business_today()
    case_type = inspection.follow_up_case_type or 'follow_up'
    if case_type == 'maintenance':
        return None

    if case_type == 'warranty':
        return sync_completion_warranty_case(ticket, reference_date=reference_date)

    due_date = inspection.follow_up_due_date or _default_completion_follow_up_due_date(
        ticket,
        case_type,
        reference_date,
    )
    priority = 'urgent' if case_type in {'complaint', 'revisit'} else 'high' if case_type == 'warranty' else 'normal'
    requires_revisit = case_type == 'revisit'

    defaults = {
        'client': ticket.request.client,
        'created_by': ticket.technician,
        'priority': priority,
        'summary': inspection.follow_up_summary or _build_completion_follow_up_summary(ticket, case_type),
        'details': _build_completion_follow_up_details(ticket, inspection, case_type),
        'due_date': due_date,
        'requires_revisit': requires_revisit,
        'creation_source': 'completion_flow',
    }

    existing_case = FollowUpCase.objects.filter(
        service_ticket=ticket,
        case_type=case_type,
        creation_source='completion_flow',
    ).exclude(status__in=['resolved', 'closed']).first()

    if existing_case:
        changed_fields = _apply_case_defaults(existing_case, defaults)
        if changed_fields:
            _record_automated_case_event(
                existing_case,
                created=False,
                notes='Checklist follow-up handoff synchronized from the completed ticket.',
            )
            _notify_completion_follow_up_case(existing_case, created=False)
        return existing_case

    case = FollowUpCase.objects.create(
        service_ticket=ticket,
        case_type=case_type,
        status='open',
        assigned_to=None,
        **defaults,
    )
    _record_automated_case_event(
        case,
        created=True,
        notes='Follow-up handoff created from the completed ticket checklist.',
    )
    _notify_completion_follow_up_case(case, created=True)
    return case


def ensure_maintenance_follow_up_case(schedule):
    case = FollowUpCase.objects.filter(
        service_ticket=schedule.service_ticket,
        case_type='maintenance',
        status__in=['open', 'in_progress'],
    ).first()

    rule = get_maintenance_rule(schedule.maintenance_profile)
    service_name = schedule.service_type.name if schedule.service_type else 'Service'
    summary = f"{service_name} maintenance due"
    details = (
        f"{rule['label']} maintenance plan. "
        f"Last service date: {schedule.last_service_date}. "
        f"Next due date: {schedule.next_due_date}. "
        f"Interval: {schedule.interval_days} days."
    )
    priority = 'high' if schedule.status == 'due' else 'normal'

    if case:
        changed_fields = _apply_case_defaults(case, {
            'summary': summary,
            'details': details,
            'priority': priority,
            'due_date': schedule.next_due_date,
            'creation_source': 'maintenance_alert',
        })
        if changed_fields:
            _record_automated_case_event(
                case,
                created=False,
                notes='Maintenance alert details synchronized from the maintenance schedule.',
            )
        return case

    case = FollowUpCase.objects.create(
        service_ticket=schedule.service_ticket,
        client=schedule.client,
        created_by=None,
        case_type='maintenance',
        status='open',
        priority=priority,
        creation_source='maintenance_alert',
        summary=summary,
        details=details,
        due_date=schedule.next_due_date,
    )
    _record_automated_case_event(
        case,
        created=True,
        notes='Maintenance follow-up created when the maintenance reminder became due.',
    )
    return case


def _notify_recipients(schedule, stage, reference_date=None):
    if not in_app_notifications_enabled():
        return
    User = get_user_model()
    recipients = User.objects.filter(role__in=['superadmin', 'admin'], is_active=True).distinct()
    # The real number of days: the first reminder follows the Maintenance Reminder setting (3-30
    # days), so it is not always "7 days".
    days_until_due = (schedule.next_due_date - (reference_date or business_today())).days
    if stage == 'due' or days_until_due <= 0:
        stage_label = 'due now'
    else:
        stage_label = f"due in {days_until_due} day{'' if days_until_due == 1 else 's'}"
    title = 'Maintenance alert'
    message = (
        f"{schedule.client.username} is {stage_label} for scheduled maintenance on "
        f"{schedule.next_due_date} ({schedule.get_maintenance_profile_display()})."
    )

    for user in recipients:
        Notification.objects.create(
            user=user,
            ticket=schedule.service_ticket,
            request=schedule.service_ticket.request,
            title=title,
            message=message,
            type='reminder',
        )


def _send_client_maintenance_email(schedule, reference_date=None):
    """Remind the client before maintenance is due: by email (Email Alerts on and an address on file)
    and in the app (In-app Alerts on). True when at least one reminder went out."""
    try:
        client = schedule.client
        send_email = email_notifications_enabled() and bool(client.email)
        send_in_app = in_app_notifications_enabled()
        if not send_email and not send_in_app:
            return False

        rule = schedule.get_maintenance_profile_display()
        service_name = schedule.service_type.name if schedule.service_type else 'service'
        reference_date = reference_date or business_today()
        days_until_due = (schedule.next_due_date - reference_date).days

        if days_until_due == 0:
            due_timing = 'due today'
            subject = f"Maintenance Reminder - {service_name} Due Today"
        elif days_until_due < 0:
            overdue_days = abs(days_until_due)
            due_timing = f"overdue by {overdue_days} day(s)"
            subject = f"Maintenance Reminder - {service_name} Overdue"
        else:
            due_timing = f"due in {days_until_due} day(s)"
            subject = f"Maintenance Reminder - {service_name} Due in {days_until_due} Day(s)"

        message_body = f"""
Hello {client.first_name or client.username},

This is a friendly reminder that your scheduled maintenance for {service_name} is coming up!

Maintenance Details:
- Service Type: {service_name}
- Maintenance Profile: {rule}
- Due Date: {schedule.next_due_date}
- Timing: {due_timing}
- Last Service Date: {schedule.last_service_date}
- Interval: {schedule.interval_days} days

Risk Assessment: {str(schedule.risk_level or 'normal').title()} (Score: {schedule.risk_score}/100)

Please schedule your maintenance appointment at your earliest convenience to ensure your equipment continues to operate optimally. Our team is ready to assist you!

{schedule.maintenance_notes and f"Additional Notes from Technician: {schedule.maintenance_notes}" or ""}

If you have any questions or need to reschedule, please contact our support team.

Best regards,
AFN Service Management
"""

        email_sent = False
        if send_email:
            try:
                from notifications.notification_utils import with_support_line

                send_mail(
                    subject,
                    with_support_line(message_body),
                    settings.DEFAULT_FROM_EMAIL,
                    [client.email],
                    fail_silently=False,
                )
                email_sent = True
            except Exception as exc:
                # A failed email must not also cost the client the in-app reminder.
                import logging
                logging.getLogger(__name__).error('Failed to send maintenance email to client %s: %s', client.id, exc)

        if send_in_app:
            in_app_message = f"Maintenance reminder: {service_name} is due on {schedule.next_due_date} ({due_timing})"
            Notification.objects.create(
                user=client,
                ticket=schedule.service_ticket,
                request=schedule.service_ticket.request,
                title='Maintenance Reminder',
                message=in_app_message,
                type='reminder',
            )

        return email_sent or send_in_app
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send maintenance email to client {schedule.client.id}: {e}")
        return False


def process_maintenance_alerts(reference_date=None):
    # The business (UTC+8) day: the daily run near midnight must not use yesterday's UTC date.
    reference_date = reference_date or business_today()
    now = timezone.now()
    summary = {'seven_day': 0, 'three_day': 0, 'due': 0, 'client_notified': 0, 'client_due': 0}
    reminder_days = maintenance_reminder_days()

    schedules = MaintenanceSchedule.objects.select_related(
        'service_ticket__request',
        'client',
        'service_type',
    ).exclude(status__in=['completed', 'dismissed'])

    # A plan with a visit already booked is being handled: keep its status current, send no reminders.
    booked_plan_ids = set(
        ServiceRequest.objects.filter(
            maintenance_plan__isnull=False, status__in=OPEN_VISIT_REQUEST_STATUSES,
        ).values_list('maintenance_plan_id', flat=True)
    )

    for schedule in schedules:
        # Keep "Reminder starts" and "Due soon" in step with the current setting.
        apply_reminder_window(schedule, reminder_days)
        schedule.status = evaluate_schedule_status(schedule, reference_date=reference_date)
        if schedule.id in booked_plan_ids:
            schedule.save()
            summary['visit_booked'] = summary.get('visit_booked', 0) + 1
            continue
        stage = None
        days_until_due = (schedule.next_due_date - reference_date).days

        if schedule.status == 'due' and schedule.due_notified_at is None:
            stage = 'due'
            schedule.due_notified_at = now
        elif days_until_due <= 3 and schedule.three_day_notified_at is None:
            stage = 'three_day'
            schedule.three_day_notified_at = now
        elif days_until_due <= reminder_days and schedule.due_soon_notified_at is None:
            stage = 'seven_day'
            schedule.due_soon_notified_at = now

        if days_until_due <= 0 and schedule.client_due_notified_at is None:
            if _send_client_maintenance_email(schedule, reference_date=reference_date):
                schedule.client_due_notified_at = now
                summary['client_notified'] += 1
                summary['client_due'] += 1
        elif days_until_due <= 3 and schedule.client_three_day_notified_at is None:
            if _send_client_maintenance_email(schedule, reference_date=reference_date):
                schedule.client_three_day_notified_at = now
                summary['client_notified'] += 1
        elif days_until_due <= reminder_days and schedule.client_notified_at is None:
            if _send_client_maintenance_email(schedule, reference_date=reference_date):
                schedule.client_notified_at = now
                summary['client_notified'] += 1

        schedule.save()

        if stage:
            ensure_maintenance_follow_up_case(schedule)
            _notify_recipients(schedule, stage, reference_date)
            summary[stage] += 1

    return summary
