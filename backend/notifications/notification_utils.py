import logging

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import QuerySet

logger = logging.getLogger(__name__)


def _normalize_notification_data(data=None):
    normalized = {}
    for key, value in (data or {}).items():
        if value is None:
            continue
        normalized[str(key)] = str(value)
    return normalized


def notifications_enabled():
    try:
        from users.models import AdminSettings

        settings_obj = AdminSettings.objects.order_by('id').first()
        return settings_obj.enable_notifications if settings_obj else True
    except Exception as exc:
        logger.warning("Could not read notification settings: %s", exc)
        return True


def notification_channels():
    try:
        from users.models import AdminSettings

        settings_obj = AdminSettings.objects.order_by('id').first()
        if not settings_obj:
            return True, True
        if not settings_obj.enable_notifications:
            return False, False
        return settings_obj.enable_in_app_notifications, settings_obj.enable_email_notifications
    except Exception as exc:
        logger.warning("Could not read notification channel settings: %s", exc)
        return True, True


def create_in_app_notification(*, user, title, body, notification_type='info', ticket=None, request=None):
    from .models import Notification

    in_app_enabled, _ = notification_channels()
    if not in_app_enabled:
        return None

    return Notification.objects.create(
        user=user,
        ticket=ticket,
        request=request,
        title=title,
        message=body,
        type=notification_type,
    )


def _recipient_email(recipient):
    if isinstance(recipient, str):
        return recipient.strip()
    return str(getattr(recipient, 'email', '') or '').strip()


def _resolve_users(*, users=None, role=None, assigned_admin=None, user_ids=None):
    from users.models import User

    if users is None and role is None and assigned_admin is None and user_ids is None:
        raise ValueError("At least one recipient selector is required")

    recipients = users if users is not None else User.objects.filter(is_active=True)
    if isinstance(recipients, (list, tuple, set)):
        user_ids_from_list = [getattr(user, 'id', user) for user in recipients]
        recipients = User.objects.filter(id__in=user_ids_from_list, is_active=True)

    if role is not None:
        recipients = recipients.filter(role=role)

    if user_ids is not None:
        recipients = recipients.filter(id__in=user_ids)

    if assigned_admin is not None:
        from services.models import ServiceTicket

        assigned_admin_id = getattr(assigned_admin, 'id', assigned_admin)
        technician_ids = (
            ServiceTicket.objects.filter(
                assigned_admin_id=assigned_admin_id,
                technician__isnull=False,
            )
            .values_list('technician_id', flat=True)
            .distinct()
        )
        recipients = recipients.filter(id__in=technician_ids)

    return list(recipients.distinct() if isinstance(recipients, QuerySet) else recipients)


def send_system_email(*, subject, body, recipients, html_message=None):
    """
    Send a plain system email through the configured Django email backend.

    Recipients may be email strings or user objects. Invalid/blank addresses are
    ignored so callers can safely pass optional users.
    """
    _, email_enabled = notification_channels()
    if not email_enabled:
        return {
            'success': False, 'sent_count': 0, 'recipients': [],
            'error': 'Email notifications are disabled in Admin Settings.',
        }

    recipient_list = []
    seen = set()
    for recipient in recipients or []:
        email = _recipient_email(recipient)
        if email and email.lower() not in seen:
            seen.add(email.lower())
            recipient_list.append(email)

    if not recipient_list:
        return {
            'success': False,
            'sent_count': 0,
            'recipients': [],
            'error': 'No recipient email addresses were provided.',
        }

    try:
        sent_count = send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            recipient_list,
            fail_silently=False,
            html_message=html_message,
        )
        return {
            'success': sent_count > 0,
            'sent_count': sent_count,
            'recipients': recipient_list,
            'error': '',
        }
    except Exception as exc:
        logger.warning("System email failed for %s: %s", recipient_list, exc)
        return {
            'success': False,
            'sent_count': 0,
            'recipients': recipient_list,
            'error': str(exc),
        }


def send_user_email(*, user, subject, body, html_message=None):
    """Send a direct email to one user without creating an in-app notification."""
    return send_system_email(
        subject=subject,
        body=body,
        recipients=[user],
        html_message=html_message,
    )


def send_team_email(
    subject,
    body,
    *,
    users=None,
    role=None,
    assigned_admin=None,
    user_ids=None,
    html_message=None,
):
    """Send a direct email to a selected group without creating notifications."""
    recipients = _resolve_users(
        users=users,
        role=role,
        assigned_admin=assigned_admin,
        user_ids=user_ids,
    )
    result = send_system_email(
        subject=subject,
        body=body,
        recipients=recipients,
        html_message=html_message,
    )
    result['recipient_count'] = len(recipients)
    result['user_ids'] = [user.id for user in recipients]
    return result


def send_notification_email(*, user, title, body):
    result = send_user_email(user=user, subject=title, body=body)
    return result['success']


def send_user_notification(
    *,
    user,
    title,
    body,
    notification_type='info',
    data=None,
    ticket=None,
    request=None,
    send_email=True,
    **_unused,
):
    """
    Create an in-app notification and optionally send the same alert through
    Django email. Extra keyword arguments are ignored so older call sites that
    passed push-specific options remain harmless.
    """
    _normalize_notification_data(data)
    in_app_enabled, email_enabled = notification_channels()
    if not in_app_enabled and not (send_email and email_enabled):
        return None

    notification = create_in_app_notification(
        user=user,
        title=title,
        body=body,
        notification_type=notification_type,
        ticket=ticket,
        request=request,
    )

    if notification and send_email and email_enabled:
        notification.email_sent = send_notification_email(user=user, title=title, body=body)
        notification.save(update_fields=['email_sent'])

    if notification:
        return notification
    if send_email and email_enabled:
        send_notification_email(user=user, title=title, body=body)
    return None


def send_team_notification(
    title,
    body,
    *,
    users=None,
    role=None,
    assigned_admin=None,
    user_ids=None,
    notification_type='info',
    data=None,
    ticket=None,
    request=None,
    send_email=True,
    **_unused,
):
    """
    Broadcast a notification to a selected group of users.

    At least one selector must be provided so we do not accidentally notify
    every active account in the system.
    """
    try:
        recipients = _resolve_users(
            users=users,
            role=role,
            assigned_admin=assigned_admin,
            user_ids=user_ids,
        )
    except ValueError as exc:
        raise ValueError("send_team_notification requires users, role, assigned_admin, or user_ids") from exc

    notifications = []
    for user in recipients:
        notification = send_user_notification(
            user=user,
            title=title,
            body=body,
            notification_type=notification_type,
            data=data,
            ticket=ticket,
            request=request,
            send_email=send_email,
        )
        if notification:
            notifications.append(notification)

    return {
        'success': notifications_enabled(),
        'recipient_count': len(recipients),
        'user_ids': [user.id for user in recipients],
        'notifications': notifications,
    }


def send_low_stock_notification(inventory_item):
    from users.models import User

    title = f"Low stock alert for {inventory_item.name}"
    body = f"Current: {inventory_item.available_quantity}, Threshold: {inventory_item.minimum_stock}"
    admin_users = User.objects.filter(role__in=['superadmin', 'admin'], is_active=True)

    return send_team_notification(
        title,
        body,
        users=admin_users,
        notification_type='warning',
        data={
            'type': 'low_stock_alert',
            'inventory_item_id': str(inventory_item.id),
            'action': 'view_inventory',
        },
    )


def send_service_ticket_notification(service_ticket, recipient_user):
    title = f"Service Ticket #{service_ticket.id} Update"
    body = str(service_ticket.status or 'Updated')

    return send_user_notification(
        user=recipient_user,
        title=title,
        body=body,
        notification_type='status_update',
        ticket=service_ticket,
        request=service_ticket.request,
        data={
            'type': 'service_ticket_update',
            'ticket_id': str(service_ticket.id),
            'status': service_ticket.status,
            'action': 'view_ticket',
        },
    )
