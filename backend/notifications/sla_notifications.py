"""
Notification utilities for SLA escalations and alerts.
"""

import logging
from django.utils import timezone
from notifications.notification_utils import send_user_notification

logger = logging.getLogger(__name__)


def notify_admins_sla_breach(breach_type: str, object_id: int, evaluation: dict):
    """
    Notify all admins about an SLA breach.

    Args:
        breach_type: Type of breach ('request_approval', 'ticket_assignment', etc.)
        object_id: ID of the breached object
        evaluation: SLA evaluation dict with details
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    admins = User.objects.filter(role__in=['superadmin', 'admin'])

    message = f"SLA Breach Alert: {evaluation.get('rule_label')}"
    details = {
        'breach_type': breach_type,
        'object_id': object_id,
        'minutes_overdue': evaluation.get('minutes_overdue'),
        'rule': evaluation.get('rule'),
        'action_required': evaluation.get('action_required'),
    }

    for admin in admins:
        try:
            send_user_notification(
                user=admin,
                title=message,
                body=evaluation.get('action_required') or 'Review the affected request.',
                notification_type='warning',
                data=details,
            )
        except Exception as e:
            logger.error(f"Failed to notify admin {admin.username} about SLA breach: {e}")


def notify_supervisors_ticket_escalation(ticket, escalation_type: str, evaluation: dict):
    """
    Notify admin workspace users about ticket SLA escalation.

    Args:
        ticket: ServiceTicket object
        escalation_type: Type of escalation ('assignment_overdue', 'start_overdue', etc.)
        evaluation: SLA evaluation dict with details
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    supervisors = User.objects.filter(role__in=['admin', 'superadmin'])

    escalation_messages = {
        'assignment_overdue': f"Ticket #{ticket.id} assignment SLA breached",
        'start_overdue': f"Ticket #{ticket.id} start time SLA breached",
        'execution_overdue': f"Ticket #{ticket.id} execution SLA breached",
        'reschedule_overdue': f"Ticket #{ticket.id} reschedule response SLA breached",
    }

    message = escalation_messages.get(escalation_type, f"Ticket #{ticket.id} SLA escalation")

    details = {
        'ticket_id': ticket.id,
        'escalation_type': escalation_type,
        'minutes_overdue': evaluation.get('minutes_overdue'),
        'action_required': evaluation.get('action_required'),
        'priority': ticket.priority,
        'technician': ticket.technician.username if ticket.technician else 'Unassigned',
        'service_type': ticket.request.service_type.name,
    }

    for supervisor in supervisors:
        try:
            send_user_notification(
                user=supervisor,
                title=message,
                body=evaluation.get('action_required') or 'Review the escalated ticket.',
                notification_type='warning',
                ticket=ticket,
                request=ticket.request,
                data=details,
            )
        except Exception as e:
            logger.error(
                f"Failed to notify supervisor {supervisor.username} "
                f"about ticket {ticket.id} escalation: {e}"
            )


def notify_admins_ticket_escalation(ticket, escalation_type: str, evaluation: dict):
    """
    Notify admins about ticket SLA escalation (requires immediate attention).

    Args:
        ticket: ServiceTicket object
        escalation_type: Type of escalation
        evaluation: SLA evaluation dict with details
    """
    from django.contrib.auth import get_user_model

    User = get_user_model()
    admins = User.objects.filter(role__in=['superadmin', 'admin'])

    message = f"Ticket #{ticket.id} requires attention: {escalation_type}"
    details = {
        'ticket_id': ticket.id,
        'escalation_type': escalation_type,
        'minutes_overdue': evaluation.get('minutes_overdue'),
        'action_required': evaluation.get('action_required'),
    }

    for admin in admins:
        try:
            send_user_notification(
                user=admin,
                title=message,
                body=evaluation.get('action_required') or 'Review the escalated ticket.',
                notification_type='warning',
                ticket=ticket,
                request=ticket.request,
                data=details,
            )
        except Exception as e:
            logger.error(
                f"Failed to notify admin {admin.username} "
                f"about ticket {ticket.id} escalation: {e}"
            )
