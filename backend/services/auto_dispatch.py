"""
Auto-dispatch system for automatically assigning technicians to service tickets.

This module handles the logic for finding and assigning the best-fit technician
to a service ticket based on skill, location, workload, and availability.
"""

import logging
from django.db import transaction
from django.utils import timezone
from typing import Optional, List, Dict, Any

from services.models import ServiceLocation, ServiceTicket
from services.views import (
    get_eligible_technician_ids_for_service,
    score_technician_fit,
    validate_technician_daily_capacity,
    validate_technician_schedule_overlap,
)
from users.models import User
from notifications.notification_utils import send_user_notification

logger = logging.getLogger(__name__)

MIN_SCORE_THRESHOLD = 30.0


def get_auto_dispatch_settings():
    from users.models import AdminSettings

    settings_obj = AdminSettings.objects.order_by('id').first()
    if not settings_obj:
        return {
            'enabled': False,
        }

    return {
        'enabled': settings_obj.auto_dispatch_enabled,
    }


def rank_technician_candidates(ticket: ServiceTicket) -> List[Dict[str, Any]]:
    """Return eligible technicians using the canonical smart-dispatch rules."""
    try:
        service_location = ticket.request.location
    except ServiceLocation.DoesNotExist:
        logger.warning(f"Ticket {ticket.id} has no service location - cannot auto-dispatch")
        return []

    if (
        not service_location
        or service_location.latitude is None
        or service_location.longitude is None
    ):
        logger.warning(f"Ticket {ticket.id} has no valid location - cannot auto-dispatch")
        return []

    eligible_technician_ids = get_eligible_technician_ids_for_service(ticket.request.service_type)
    skilled_technicians = User.objects.filter(
        id__in=eligible_technician_ids,
        role='technician',
        status='active',
        is_active=True,
        technician_profile__is_available=True,
    ).distinct()

    ranked_candidates = []
    for technician in skilled_technicians:
        try:
            validate_technician_schedule_overlap(
                technician,
                ticket.scheduled_date,
                ticket.scheduled_time,
                ticket,
            )
        except ValueError:
            continue

        fitness = score_technician_fit(
            ticket,
            technician,
            float(service_location.latitude),
            float(service_location.longitude),
        )
        if fitness is None or fitness['score'] <= MIN_SCORE_THRESHOLD:
            continue

        fitness['technician'] = technician
        ranked_candidates.append(fitness)

    ranked_candidates.sort(
        key=lambda item: (
            item.get('daily_assigned_minutes', 0),
            -item['score'],
            item['technician'].id,
        )
    )
    return ranked_candidates


def find_best_technician(ticket: ServiceTicket) -> Optional[Dict[str, Any]]:
    """
    Find the best technician to assign to a ticket.

    Evaluates all available technicians with matching skills and returns
    the one with the highest fitness score.

    Args:
        ticket: ServiceTicket to find technician for

    Returns:
        Dict with technician, score, and summary, or None if no qualified technician found
    """
    ranked_candidates = rank_technician_candidates(ticket)
    if ranked_candidates:
        best_match = ranked_candidates[0]
        logger.info(
            f"Found best technician for ticket {ticket.id}: "
            f"{best_match['technician'].username} (score: {best_match['score']})"
        )
        return best_match

    logger.info(f"No technician with sufficient score found for ticket {ticket.id}")
    return None


def auto_assign_technician(ticket: ServiceTicket) -> bool:
    """
    Automatically assign the best-fit technician to a ticket.

    Args:
        ticket: ServiceTicket to assign

    Returns:
        True if assignment was successful, False otherwise
    """
    if ticket.technician is not None:
        logger.debug(f"Ticket {ticket.id} already has a primary technician assigned")
        return False

    best_match = find_best_technician(ticket)
    if not best_match:
        logger.warning(f"Could not find suitable technician for ticket {ticket.id}")
        return False

    technician = best_match['technician']

    try:
        with transaction.atomic():
            ticket = ServiceTicket.objects.select_for_update().select_related(
                'request__service_type',
                'request__location',
                'assigned_admin',
            ).get(pk=ticket.pk)
            if ticket.technician_id is not None:
                logger.debug(f"Ticket {ticket.id} was assigned while auto-dispatch was evaluating candidates")
                return False

            technician = User.objects.select_for_update().get(pk=technician.pk, role='technician')
            if technician.status != 'active' or not technician.is_active or not technician.is_available:
                logger.info(f"Technician {technician.id} is no longer available for ticket {ticket.id}")
                return False
            try:
                validate_technician_daily_capacity(technician, ticket.scheduled_date, ticket)
                validate_technician_schedule_overlap(
                    technician,
                    ticket.scheduled_date,
                    ticket.scheduled_time,
                    ticket,
                )
            except ValueError as exc:
                logger.info(f"Technician {technician.id} capacity changed for ticket {ticket.id}: {exc}")
                return False

            location = ticket.request.location
            locked_fitness = score_technician_fit(
                ticket,
                technician,
                float(location.latitude),
                float(location.longitude),
            )
            if locked_fitness is None or locked_fitness['score'] <= MIN_SCORE_THRESHOLD:
                logger.info(f"Technician {technician.id} no longer meets the score threshold for ticket {ticket.id}")
                return False
            best_match = {**locked_fitness, 'technician': technician}

            # Assign as primary technician
            ticket.technician = technician
            ticket.auto_assigned = True
            ticket.assigned_at = timezone.now()
            ticket.smart_assignment_score = best_match['score']
            ticket.smart_assignment_summary = best_match['summary']
            ticket.save(
                update_fields=[
                    'technician',
                    'auto_assigned',
                    'assigned_at',
                    'smart_assignment_score',
                    'smart_assignment_summary',
                ]
            )

            logger.info(
                f"Auto-assigned ticket {ticket.id} to technician {technician.username} "
                f"with score {best_match['score']}"
            )

            # Notify technician
            send_user_notification(
                user=technician,
                title=f"New job assigned: {ticket.request.service_type.name}",
                body=(
                    f"Ticket #{ticket.id} was auto-assigned for "
                    f"{ticket.request.service_type.name}."
                ),
                notification_type='ticket_assigned',
                ticket=ticket,
                request=ticket.request,
                data={
                    'ticket_id': ticket.id,
                    'service_type': ticket.request.service_type.name,
                    'priority': ticket.priority,
                    'location': f"{ticket.request.location.address}, {ticket.request.location.city}",
                    'scheduled_date': str(ticket.scheduled_date),
                    'assignment_score': best_match['score'],
                },
            )

            # Notify the assigned admin if present.
            if ticket.assigned_admin:
                send_user_notification(
                    user=ticket.assigned_admin,
                    title=f"Ticket #{ticket.id} auto-assigned to {technician.username}",
                    body=(
                        f"Smart assignment selected {technician.username} "
                        f"for ticket #{ticket.id}."
                    ),
                    notification_type='info',
                    ticket=ticket,
                    request=ticket.request,
                    data={
                        'ticket_id': ticket.id,
                        'technician': technician.username,
                        'score': best_match['score'],
                    },
                )

            return True

    except Exception as e:
        logger.error(
            f"Error auto-assigning ticket {ticket.id} to {technician.username}: {e}"
        )
        return False


def reassign_if_needed(ticket: ServiceTicket) -> bool:
    """
    Attempt to reassign a ticket if current assignment is no longer suitable.

    This is useful when a technician becomes unavailable or their workload
    changes significantly.

    Args:
        ticket: ServiceTicket to potentially reassign

    Returns:
        True if reassignment occurred, False if no reassignment needed
    """
    if not ticket.auto_assigned:
        logger.debug(
            f"Ticket {ticket.id} was not auto-assigned, skipping reassignment check"
        )
        return False

    if ticket.status not in ['Not Started', 'On Hold']:
        logger.debug(
            f"Ticket {ticket.id} status is {ticket.status}, "
            f"skipping reassignment check"
        )
        return False

    current_tech = ticket.technician
    if not current_tech or not current_tech.is_available:
        logger.info(
            f"Current technician for ticket {ticket.id} is no longer available"
        )
        # Clear assignment and try to find new one
        ticket.technician = None
        ticket.save(update_fields=['technician'])
        return auto_assign_technician(ticket)

    # Check if adding this ticket would push the technician over the daily 8-hour capacity.
    from services.views import get_technician_daily_capacity

    capacity = get_technician_daily_capacity(current_tech, ticket.scheduled_date, ticket)
    if not capacity['fits']:
        logger.info(
            f"Technician {current_tech.username} would have "
            f"{capacity['projected_minutes'] / 60:g}/{capacity['limit_minutes'] / 60:g} "
            f"scheduled hours, reassigning ticket {ticket.id}"
        )
        ticket.technician = None
        ticket.save(update_fields=['technician'])
        return auto_assign_technician(ticket)

    return False


def should_attempt_auto_dispatch(ticket: ServiceTicket) -> bool:
    """
    Determine if auto-dispatch should be attempted for a ticket.

    Args:
        ticket: ServiceTicket to check

    Returns:
        True if auto-dispatch should be attempted
    """
    if not get_auto_dispatch_settings()['enabled']:
        return False

    # Don't auto-dispatch if already assigned
    if ticket.technician is not None:
        return False

    # Don't auto-dispatch if request location is missing
    try:
        service_location = ticket.request.location
    except ServiceLocation.DoesNotExist:
        return False

    if not service_location or not service_location.latitude:
        return False

    # Don't auto-dispatch if ticket is in terminal state
    if ticket.status in ['Completed', 'Cancelled']:
        return False

    return True
