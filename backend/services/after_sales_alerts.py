"""Daily after-sales alerts: warranties about to end and follow-up cases past their due date.

Both run from the daily operational automations and are safe to run more than once a day: each alert
is sent once per warranty end date or per case due date. The marker lives in records users cannot
delete (the activity log and the case history), not in notifications, which users can clear.
"""
import logging
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail

from notifications.models import Notification
from notifications.notification_utils import email_notifications_enabled, in_app_notifications_enabled
from services.business_time import business_today

from .maintenance import evaluate_warranty_status
from .models import AfterSalesCase, AfterSalesCaseEvent, ServiceTicket

logger = logging.getLogger(__name__)

WARRANTY_REMINDER_DAYS = 30
OPEN_CASE_STATUSES = ('open', 'in_progress')


def _staff_recipients():
    User = get_user_model()
    return User.objects.filter(role__in=['admin', 'superadmin'], is_active=True)


def _client_label(user):
    full_name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return full_name or user.username


def warranty_reminder_marker(ticket):
    return f"Warranty ending reminder sent for ticket #{ticket.id} (ends {ticket.warranty_end_date})."


def _send_warranty_email(ticket, client, service_name, days_left):
    if not (email_notifications_enabled() and client.email):
        return False
    timing = 'today' if days_left == 0 else f"in {days_left} day(s)"
    body = (
        f"Hello {client.first_name or client.username},\n\n"
        f"The warranty for your {service_name} (ticket TKT-{ticket.id:04d}) ends {timing}, "
        f"on {ticket.warranty_end_date}.\n\n"
        "If you have noticed any problem with the work or equipment, please contact us before that date "
        "so we can check it under warranty.\n\n"
        "Best regards,\nAFN Service Management\n"
    )
    try:
        send_mail(
            f"Warranty Reminder - {service_name} warranty ends {ticket.warranty_end_date}",
            body,
            settings.DEFAULT_FROM_EMAIL,
            [client.email],
            fail_silently=False,
        )
        return True
    except Exception as exc:  # A failed email must not stop the other reminders.
        logger.error('Failed to send warranty reminder email for ticket %s: %s', ticket.id, exc)
        return False


def process_warranty_expiry_reminders(reference_date=None):
    """Remind the client and the office once when an active warranty is within 30 days of ending."""
    from users.models import ActivityLog
    from users.signals import log_activity

    today = reference_date or business_today()
    summary = {'warranty_reminders': 0, 'warranty_emails': 0}
    tickets = ServiceTicket.objects.select_related('request__client', 'request__service_type').filter(
        warranty_end_date__gte=today,
        warranty_end_date__lte=today + timedelta(days=WARRANTY_REMINDER_DAYS),
    ).exclude(warranty_status='void')

    for ticket in tickets:
        if evaluate_warranty_status(ticket, reference_date=today) != 'active':
            continue
        marker = warranty_reminder_marker(ticket)
        if ActivityLog.objects.filter(target_model='serviceticket', target_id=ticket.id, message=marker).exists():
            continue

        client = ticket.request.client
        service_name = ticket.request.service_type.name if ticket.request.service_type else 'service'
        days_left = (ticket.warranty_end_date - today).days
        when = 'today' if days_left == 0 else f"in {days_left} day{'' if days_left == 1 else 's'}"

        if _send_warranty_email(ticket, client, service_name, days_left):
            summary['warranty_emails'] += 1
        if in_app_notifications_enabled():
            Notification.objects.create(
                user=client,
                ticket=ticket,
                request=ticket.request,
                title='Warranty Ending Soon',
                message=f"Your {service_name} warranty ends {when}, on {ticket.warranty_end_date}. Contact us before then if anything needs checking.",
                type='reminder',
            )
            for staff in _staff_recipients():
                Notification.objects.create(
                    user=staff,
                    ticket=ticket,
                    request=ticket.request,
                    title='Warranty ending soon',
                    message=f"{_client_label(client)}'s {service_name} warranty (TKT-{ticket.id:04d}) ends {when}, on {ticket.warranty_end_date}.",
                    type='reminder',
                )
        log_activity(actor=None, category='system', action='system', target=ticket, message=marker)
        summary['warranty_reminders'] += 1
    return summary


def overdue_case_marker(case):
    return f"Overdue alert sent (due {case.due_date})."


def process_overdue_after_sales_cases(reference_date=None):
    """Alert once when an open after-sales case passes its due date (maintenance cases have their own
    reminders). The assigned staff member is told; with nobody assigned, every admin is."""
    today = reference_date or business_today()
    summary = {'overdue_cases': 0}
    cases = AfterSalesCase.objects.select_related('client', 'assigned_to', 'service_ticket__request').filter(
        status__in=OPEN_CASE_STATUSES,
        due_date__lt=today,
    ).exclude(case_type='maintenance')

    for case in cases:
        marker = overdue_case_marker(case)
        if AfterSalesCaseEvent.objects.filter(case=case, notes=marker).exists():
            continue

        if in_app_notifications_enabled():
            if case.assigned_to_id and case.assigned_to.is_active:
                recipients = [case.assigned_to]
            else:
                recipients = list(_staff_recipients())
            days_late = (today - case.due_date).days
            message = (
                f"ASC-{case.id:04d} ({case.get_case_type_display()}) for {_client_label(case.client)} was due on "
                f"{case.due_date} and is {days_late} day{'' if days_late == 1 else 's'} overdue: {case.summary}"
            )
            for user in recipients:
                Notification.objects.create(
                    user=user,
                    ticket=case.service_ticket,
                    request=case.service_ticket.request if case.service_ticket_id else None,
                    title='After-sales case overdue',
                    message=message[:2000],
                    type='warning',
                )
        AfterSalesCaseEvent.objects.create(
            case=case,
            actor=None,
            event_type='updated',
            from_status=case.status,
            to_status=case.status,
            notes=marker,
        )
        summary['overdue_cases'] += 1
    return summary
