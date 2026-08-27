from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.decorators import api_view
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied, ValidationError
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_time
from django.utils.text import slugify
from django.db import transaction
from django.db.models import Q, Count, Sum, Avg, F
from django.core.mail import send_mail
from django.conf import settings
from datetime import time, timedelta
import math
import logging
from pathlib import Path
import uuid
from threading import Thread
from typing import Optional, Dict, Any, List
from services.sla import get_ticket_dispatch_state

logger = logging.getLogger(__name__)

# Explicit __all__ so that `from helpers import *` includes underscore-prefixed
# helper functions that sub-modules depend on.
__all__ = ['record_arrival_validation_log', 'compute_arrival_validation_result', 'get_location_validation_settings', 
    # Private helpers used across sub-modules
    '_calculate_route_async',
    '_display_name',
    '_get_request_address',
    '_resolve_assignment_admin',
    '_notify_admin_superadmin',
    '_notify_ticket_assignment_recipients',
    '_notify_ticket_completion_recipients',
    '_default_ticket_admin_for_actor',
    # Constants
    'ACTIVE_TICKET_STATUSES',
    'TICKET_REQUEST_STATUS_MAP',
    'ALLOWED_TICKET_TRANSITIONS',
    'ASSIGNABLE_TICKET_STATUSES',
    'CLIENT_RESCHEDULABLE_TICKET_STATUSES',
    'CONTACTABLE_TICKET_STATUSES',
    'PARTS_REQUEST_TICKET_STATUSES',
    'TIME_SLOT_TO_TIME',
    'DAILY_TECHNICIAN_CAPACITY_MINUTES',
    'SKILL_LEVEL_WEIGHTS',
    # Public helpers
    'send_notification_email',
    'create_notification',
    'sync_ticket_maintenance_schedule',
    'user_can_manage_service_requests',
    'parse_technician_id_list',
    'get_technician_ticket_queryset',
    'ticket_has_technician_access',
    'serialize_ticket_crew_members',
    'get_assigned_admin_visible_ticket_queryset',
    'get_assigned_admin_tracking_ticket_queryset',
    'get_ticket_team_member_ids',
    'get_ticket_team_members',
    'sync_ticket_team_availability',
    'sync_ticket_crew_assignments',
    'build_ticket_daily_duration_allocations',
    'get_technician_scheduled_minutes_by_date',
    'get_technician_daily_scheduled_minutes',
    'get_technician_daily_capacity',
    'validate_technician_daily_capacity',
    'get_general_service_type',
    'get_technician_service_skill',
    'get_eligible_technician_ids_for_service',
    'calculate_distance',
    'normalize_time_slot',
    'get_default_time_for_slot',
    'apply_schedule_fields',
    'build_initial_ticket_payload',
    'normalize_proof_media_payload',
    'save_uploaded_proof_media',
    'score_technician_fit',
    'get_visible_service_requests_queryset',
    'get_visible_service_tickets_queryset',
    'sync_technician_availability',
    'normalize_ticket_status',
    'clear_reschedule_request',
    'sync_request_status_from_ticket',
    'validate_ticket_transition',
    'ensure_ticket_checklist_completed',
    'apply_ticket_status_change',
    # Re-exported imports (models, serializers, permissions, etc.)
    'viewsets', 'permissions', 'status', 'action', 'Response', 'api_view',
    'MethodNotAllowed', 'PermissionDenied',
    'default_storage', 'timezone', 'parse_date', 'parse_time', 'slugify',
    'transaction', 'Q', 'Count', 'Sum', 'Avg', 'F',
    'send_mail', 'settings', 'time', 'math', 'logging', 'Path', 'uuid', 'Thread',
    'logger',
    # Models
    'ServiceType', 'SLARule', 'ServiceRequest', 'ServiceLocation', 'ServiceTicket',
    'TechnicianSkill', 'ServiceStatusHistory', 'InspectionChecklist',
    'TechnicianLocationHistory', 'ServiceAnalytics', 'TechnicianPerformance',
    'DemandForecast', 'ServiceTrend', 'TicketCrewAssignment',
    # Maintenance
    'sync_completion_follow_up_case', 'sync_completion_warranty_case',
    # Search
    'build_ticket_search_query',
    'sync_maintenance_schedule', 'sync_ticket_warranty',
    # Serializers
    'ServiceTypeSerializer', 'SLARuleSerializer', 'ServiceRequestSerializer', 'ServiceLocationSerializer',
    'ServiceTicketSerializer', 'TechnicianSkillSerializer',
    'ServiceStatusHistorySerializer', 'InspectionChecklistSerializer',
    'TechnicianLocationHistorySerializer', 'AutoAssignSerializer',
    'ServiceAnalyticsSerializer', 'TechnicianPerformanceSerializer',
    'DemandForecastSerializer', 'ServiceTrendSerializer',
    # User models & utils
    'User', 'SelfUserUpdateSerializer',
    'IsAdmin', 'IsSupervisor', 'IsTechnician', 'IsClient',
    'IsAdminOrSupervisor', 'IsAdminOrSupervisorOrTechnician',
    'CanViewService', 'CanManageInventory', 'CanManageServiceRequests',
    'CanAccessServiceRequests', 'CanAccessServiceTickets', 'CanManageServiceTickets',
    'CanAccessDocuments', 'CanViewDocuments', 'CanManageDocuments',
    'CanAccessAnalytics', 'CanViewAnalytics', 'CanViewReports', 'CanExportReports',
    'CanViewSupervisorTracking', 'CanViewSupervisorDispatch', 'CanViewSupervisorTickets',
    'CanViewTechnicianChecklist', 'CanViewTechnicianDashboard',
    'CanViewTechnicianHistory', 'CanViewTechnicianJobDetails',
    'CanViewTechnicianJobs', 'CanViewTechnicianProfile', 'CanViewTechnicianSchedule',
    # RBAC
    'AFTER_SALES_VIEW_CAPABILITIES', 'SUPERVISOR_TICKETS_VIEW',
    'SERVICE_REQUEST_REVIEW_CAPABILITIES',
    'SUPERVISOR_TICKET_CAPABILITIES',
    'is_admin_workspace_role', 'user_has_capability', 'user_has_any_capability',
    # Inventory
    'issue_ticket_inventory_usage', 'issue_ticket_reservations', 'release_ticket_reservations',
    'serialize_ticket_inventory', 'sync_ticket_reservations',
    # Notifications
    'send_team_notification', 'send_user_notification',
]


def _calculate_route_async(ticket_id, start_coords, end_coords):
    """Calculate route in background without blocking response."""
    from django.conf import settings
    if getattr(settings, 'IS_TEST', False):
        return
    try:
        from services.ors_utils import get_route
        route = get_route(start_coords, end_coords)

        if route and 'features' in route and route['features']:
            # Re-fetch ticket to avoid stale objects
            ticket = ServiceTicket.objects.get(id=ticket_id)
            geom = route['features'][0].get('geometry')
            props = route['features'][0].get('properties', {}).get('segments', [{}])[0]
            ticket.route_geometry = geom
            ticket.route_distance = props.get('distance')
            ticket.route_duration = props.get('duration')
            ticket.save()
            logger.info(f"Route for ticket {ticket_id}: {ticket.route_distance}m, {ticket.route_duration}s")
    except Exception as e:
        logger.warning(f"Async route calculation failed for ticket {ticket_id}: {e}")

from services.models import (
    ServiceType, SLARule, ServiceRequest, ServiceLocation, ServiceTicket,
    TechnicianSkill, ServiceStatusHistory, InspectionChecklist,
    TechnicianLocationHistory, ServiceAnalytics, TechnicianPerformance,
    DemandForecast, ServiceTrend, TicketCrewAssignment
)
from services.maintenance import (
    sync_completion_follow_up_case,
    sync_completion_warranty_case,
    sync_maintenance_schedule,
    sync_ticket_warranty,
)
from services.serializers import (
    ServiceTypeSerializer, SLARuleSerializer, ServiceRequestSerializer, ServiceLocationSerializer,
    ServiceTicketSerializer, TechnicianSkillSerializer,
    ServiceStatusHistorySerializer, InspectionChecklistSerializer,
    TechnicianLocationHistorySerializer, AutoAssignSerializer,
    ServiceAnalyticsSerializer, TechnicianPerformanceSerializer,
    DemandForecastSerializer, ServiceTrendSerializer
)
from users.models import User, Management, Technician, Client
from users.serializers import SelfUserUpdateSerializer
from users.permissions import (
    IsAdmin, IsSupervisor, IsTechnician, IsClient,
    IsAdminOrSupervisor, IsAdminOrSupervisorOrTechnician,
    CanViewService, CanManageInventory,
    CanManageServiceRequests, CanAccessServiceRequests, CanAccessServiceTickets,
    CanManageServiceTickets,
    CanAccessDocuments, CanViewDocuments, CanManageDocuments,
    CanAccessAnalytics, CanViewAnalytics, CanViewReports, CanExportReports,
    CanViewSupervisorTracking,
    CanViewSupervisorDispatch, CanViewSupervisorTickets,
    CanViewTechnicianChecklist, CanViewTechnicianDashboard,
    CanViewTechnicianHistory, CanViewTechnicianJobDetails,
    CanViewTechnicianJobs, CanViewTechnicianProfile,
    CanViewTechnicianSchedule,
)
from users.rbac import (
    AFTER_SALES_VIEW_CAPABILITIES,
    SUPERVISOR_TICKETS_VIEW,
    SUPERVISOR_TICKET_CAPABILITIES,
    SERVICE_REQUEST_REVIEW_CAPABILITIES,
    is_admin_workspace_role,
    user_has_capability,
    user_has_any_capability,
)
from inventory.automation import (
    issue_ticket_inventory_usage,
    issue_ticket_reservations,
    release_ticket_reservations,
    serialize_ticket_inventory,
    sync_ticket_reservations,
)
from notifications.notification_utils import send_team_notification, send_user_notification

ACTIVE_TICKET_STATUSES = [
    'Not Started',
    'For Inspection',
    'Inspection Completed',
    'Ready for Service',
    'Awaiting Materials',
    'Navigating',
    'Arrived on Site',
    'In Progress',
    'On Hold',
]
TICKET_REQUEST_STATUS_MAP = {
    'Not Started': 'Approved',
    'For Inspection': 'Approved',
    'Inspection Completed': 'In Progress',
    'Ready for Service': 'Approved',
    'Awaiting Materials': 'In Progress',
    'Navigating': 'In Progress',
    'Arrived on Site': 'In Progress',
    'In Progress': 'In Progress',
    'On Hold': 'In Progress',
    'Completed': 'Completed',
    'Cancelled': 'Cancelled',
}
ALLOWED_TICKET_TRANSITIONS = {
    'Not Started': {'For Inspection', 'Ready for Service', 'Navigating', 'Cancelled'},
    'For Inspection': {'Navigating', 'Inspection Completed', 'Cancelled'},
    'Inspection Completed': {'Ready for Service', 'Awaiting Materials', 'Navigating', 'Completed', 'Cancelled'},
    'Ready for Service': {'Navigating', 'For Inspection', 'Cancelled'},
    'Awaiting Materials': {'Ready for Service', 'Navigating', 'Cancelled'},
    'Navigating': {'Arrived on Site', 'On Hold', 'Cancelled'},
    'Arrived on Site': {'In Progress', 'On Hold', 'Cancelled'},
    'In Progress': {'Inspection Completed', 'Awaiting Materials', 'On Hold', 'Completed', 'Cancelled'},
    'On Hold': {'Ready for Service', 'In Progress', 'Cancelled'},
    'Completed': set(),
    'Cancelled': set(),
}
ASSIGNABLE_TICKET_STATUSES = {'Not Started', 'For Inspection', 'Ready for Service', 'Awaiting Materials', 'Navigating', 'On Hold'}
CLIENT_RESCHEDULABLE_TICKET_STATUSES = {'Not Started', 'For Inspection', 'Ready for Service'}
CONTACTABLE_TICKET_STATUSES = {
    'Not Started',
    'For Inspection',
    'Inspection Completed',
    'Ready for Service',
    'Awaiting Materials',
    'Navigating',
    'Arrived on Site',
    'In Progress',
    'On Hold',
}
PARTS_REQUEST_TICKET_STATUSES = {'For Inspection', 'Inspection Completed', 'Ready for Service', 'Awaiting Materials', 'Navigating', 'Arrived on Site', 'In Progress', 'On Hold'}
TIME_SLOT_TO_TIME = {
    'morning': time(hour=9, minute=0),
    'midday': time(hour=12, minute=0),
    'afternoon': time(hour=15, minute=0),
    'evening': time(hour=18, minute=0),
}
DAILY_TECHNICIAN_CAPACITY_MINUTES = 8 * 60
DEFAULT_OVERTIME_CAPACITY_MINUTES = 10 * 60
SKILL_LEVEL_WEIGHTS = {
    'expert': 1.0,
    'intermediate': 0.75,
    'beginner': 0.5,
}
GENERAL_SERVICE_NAME = 'General Services'


def send_notification_email(user, subject, message):
    """Helper function to send email notifications"""
    from notifications.notification_utils import notifications_enabled

    if not notifications_enabled():
        return

    if user.email:
        try:
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=False,
            )
        except Exception as e:
            logger.warning(f"Email notification failed for user {user.id} ({user.email}): {e}")


def create_notification(user, message, notification_type='info'):
    """Helper to create in-app notifications"""
    from notifications.notification_utils import notifications_enabled
    from notifications.models import Notification

    if not notifications_enabled():
        return None

    return Notification.objects.create(
        user=user,
        message=message,
        type=notification_type
    )


def _notify_admin_superadmin(*, message, notification_type='info', include_user=None, exclude_user=None):
    recipients = User.objects.filter(role__in=['admin', 'superadmin'], is_active=True)
    if include_user is not None:
        recipients = recipients | User.objects.filter(pk=include_user.pk)
    if exclude_user is not None:
        recipients = recipients.exclude(pk=exclude_user.pk)

    for recipient in recipients.distinct():
        create_notification(recipient, message, notification_type)


def _notify_ticket_completion_recipients(*, ticket, technician):
    technician_name = _display_name(technician) if technician else 'Technician'
    service_name = (
        ticket.request.service_type.name
        if ticket.request and ticket.request.service_type
        else 'service'
    )
    client_name = _display_name(ticket.request.client) if ticket.request else 'the client'
    message = (
        f"{technician_name} completed ticket #{ticket.id} "
        f"for {service_name} requested by {client_name}."
    )

    _notify_admin_superadmin(
        message=message,
        notification_type='success',
        include_user=ticket.assigned_admin if ticket.assigned_admin_id else None,
    )


def sync_ticket_maintenance_schedule(ticket):
    """Refresh post-service lifecycle data without blocking ticket flow."""
    try:
        sync_ticket_warranty(ticket)
        if ticket.status in {'Completed', 'Turned Over / Accepted'}:
            sync_maintenance_schedule(ticket)
            sync_completion_follow_up_case(ticket)
            try:
                inspection = ticket.inspection
            except InspectionChecklist.DoesNotExist:
                inspection = None
            if not (
                inspection and
                inspection.follow_up_required and
                inspection.follow_up_case_type == 'warranty'
            ):
                sync_completion_warranty_case(ticket)
    except Exception as exc:
        logger.warning(
            "Post-service lifecycle sync failed for ticket %s: %s",
            getattr(ticket, 'id', 'unknown'),
            exc,
        )


def _display_name(user):
    if not user:
        return None
    full_name = user.get_full_name().strip()
    return full_name or user.username


def _get_request_address(service_request):
    try:
        return service_request.location.address
    except ServiceLocation.DoesNotExist:
        return None


def _resolve_assignment_admin(ticket, acting_user):
    if ticket.assigned_admin_id:
        return ticket.assigned_admin
    if acting_user and is_admin_workspace_role(getattr(acting_user, 'role', None)):
        return acting_user
    return None


def user_can_manage_service_requests(user):
    return bool(
        user and
        getattr(user, 'is_authenticated', False) and
        (
            is_admin_workspace_role(user.role) and
            user_has_any_capability(user, SERVICE_REQUEST_REVIEW_CAPABILITIES)
        )
    )


def parse_technician_id_list(raw_value):
    if raw_value in [None, '']:
        return []

    if isinstance(raw_value, (list, tuple, set)):
        raw_values = list(raw_value)
    else:
        raw_values = [raw_value]

    resolved_ids = []
    for raw_item in raw_values:
        if raw_item in [None, '']:
            continue

        parts = raw_item.split(',') if isinstance(raw_item, str) else [raw_item]
        for part in parts:
            if part in [None, '']:
                continue

            try:
                technician_id = int(str(part).strip())
            except (TypeError, ValueError) as exc:
                raise ValueError('crew_ids must contain valid technician ids.') from exc

            if technician_id not in resolved_ids:
                resolved_ids.append(technician_id)

    return resolved_ids


def get_technician_ticket_queryset(technician, base_queryset=None):
    if base_queryset is None:
        base_queryset = ServiceTicket.objects.all()

    return base_queryset.filter(
        Q(technician=technician) | Q(crew_assignments__technician=technician)
    ).distinct()


def ticket_has_technician_access(ticket, technician):
    if not technician or getattr(technician, 'role', None) != 'technician':
        return False
    if ticket.technician_id == technician.id:
        return True
    return ticket.crew_assignments.filter(technician_id=technician.id).exists()


def serialize_ticket_crew_members(ticket):
    return [
        {
            'id': assignment.technician_id,
            'username': assignment.technician.username,
            'name': _display_name(assignment.technician),
        }
        for assignment in ticket.crew_assignments.select_related('technician').order_by('created_at', 'id')
    ]


def get_assigned_admin_visible_ticket_queryset(assigned_admin, base_queryset=None):
    if base_queryset is None:
        base_queryset = ServiceTicket.objects.all()

    return base_queryset.filter(
        Q(assigned_admin=assigned_admin) | Q(assigned_admin__isnull=True)
    )


def get_assigned_admin_tracking_ticket_queryset(assigned_admin, base_queryset=None):
    if base_queryset is None:
        base_queryset = ServiceTicket.objects.all()

    return base_queryset.filter(assigned_admin=assigned_admin)


def get_ticket_team_member_ids(ticket, *, extra_technicians=None):
    technician_ids = set()
    if ticket.technician_id:
        technician_ids.add(ticket.technician_id)

    technician_ids.update(ticket.crew_assignments.values_list('technician_id', flat=True))

    for technician in extra_technicians or []:
        technician_id = getattr(technician, 'id', technician)
        if technician_id in [None, '']:
            continue
        try:
            technician_ids.add(int(technician_id))
        except (TypeError, ValueError):
            continue

    return technician_ids


def get_ticket_team_members(ticket, *, extra_technicians=None):
    technician_ids = get_ticket_team_member_ids(ticket, extra_technicians=extra_technicians)
    if not technician_ids:
        return Management.objects.none()

    return Technician.objects.filter(id__in=technician_ids)


def sync_ticket_team_availability(ticket, *, extra_technicians=None):
    for technician in get_ticket_team_members(ticket, extra_technicians=extra_technicians):
        sync_technician_availability(technician)


def sync_ticket_crew_assignments(ticket, crew_members):
    desired_ids = [
        technician.id
        for technician in crew_members
        if technician and technician.id and technician.id != ticket.technician_id
    ]
    existing_assignments = {
        assignment.technician_id: assignment
        for assignment in ticket.crew_assignments.all()
    }

    for technician_id, assignment in existing_assignments.items():
        if technician_id not in desired_ids:
            assignment.delete()

    for technician_id in desired_ids:
        if technician_id not in existing_assignments:
            TicketCrewAssignment.objects.create(ticket=ticket, technician_id=technician_id)


def _notify_ticket_assignment_recipients(*, ticket, technician, acting_user, crew_members=None, auto_assigned=False):
    crew_members = [
        member for member in (crew_members or [])
        if member and member.id != technician.id
    ]
    service_type_name = ticket.request.service_type.name
    technician_name = _display_name(technician)
    crew_member_names = [_display_name(member) for member in crew_members]
    assigned_phrase = 'auto-assigned' if auto_assigned else 'assigned'
    assignee_title = 'New Auto-Assigned Ticket' if auto_assigned else 'New Ticket Assignment'
    assignee_message = (
        f"You have been {assigned_phrase} to ticket #{ticket.id} for {service_type_name}."
    )
    notification_payload = {
        'type': 'ticket_assigned',
        'action': 'view_job',
        'job_id': ticket.id,
        'ticket_id': ticket.id,
        'service_type': service_type_name,
        'assigned_technician_id': technician.id,
        'assigned_technician_name': technician_name,
        'crew_member_ids': [member.id for member in crew_members],
        'crew_member_names': crew_member_names,
    }

    send_user_notification(
        user=technician,
        title=assignee_title,
        body=assignee_message,
        notification_type='ticket_assigned',
        ticket=ticket,
        request=ticket.request,
        data=notification_payload,
    )

    for crew_member in crew_members:
        crew_title = 'Added to Auto-Assigned Ticket Crew' if auto_assigned else 'Added to Ticket Crew'
        crew_message = (
            f"You were added to the crew for ticket #{ticket.id} for {service_type_name} "
            f"with lead technician {technician_name}."
        )
        send_user_notification(
            user=crew_member,
            title=crew_title,
            body=crew_message,
            notification_type='ticket_assigned',
            ticket=ticket,
            request=ticket.request,
            data={
                **notification_payload,
                'assignment_role': 'crew',
            },
        )

    assigned_admin = _resolve_assignment_admin(ticket, acting_user)
    if not assigned_admin:
        return

    team_member_ids = (
        ServiceTicket.objects.filter(
            assigned_admin_id=assigned_admin.id,
            technician__isnull=False,
        )
        .values_list('technician_id', flat=True)
        .distinct()
    )
    team_members = Technician.objects.filter(
        id__in=team_member_ids,
        is_active=True,
    ).exclude(id__in=[technician.id, *[member.id for member in crew_members]])

    if not team_members.exists():
        return

    team_message = f"Ticket #{ticket.id} was {assigned_phrase} to {technician_name}"
    if crew_member_names:
        team_message += f" with crew support from {', '.join(crew_member_names)}"
    team_message += f" for {service_type_name}."

    send_team_notification(
        'New Team Task',
        team_message,
        users=team_members,
        notification_type='ticket_assigned',
        ticket=ticket,
        request=ticket.request,
        data=notification_payload,
    )


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in kilometers using Haversine formula"""
    R = 6371  # Earth's radius in kilometers

    lat1_rad = math.radians(float(lat1))
    lat2_rad = math.radians(float(lat2))
    delta_lat = math.radians(float(lat2) - float(lat1))
    delta_lon = math.radians(float(lon2) - float(lon1))

    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    return R * c


def normalize_time_slot(value):
    if value in [None, '']:
        return None
    value = str(value).strip().lower()
    if value in TIME_SLOT_TO_TIME:
        return value
    return None


def get_default_time_for_slot(time_slot):
    return TIME_SLOT_TO_TIME.get(normalize_time_slot(time_slot))


def apply_schedule_fields(ticket, *, scheduled_date=None, scheduled_time=None, scheduled_time_slot=None):
    if scheduled_date is not None:
        ticket.scheduled_date = scheduled_date

    if scheduled_time_slot is not None:
        ticket.scheduled_time_slot = normalize_time_slot(scheduled_time_slot)

    if scheduled_time is not None:
        ticket.scheduled_time = scheduled_time
    elif scheduled_time_slot is not None:
        ticket.scheduled_time = get_default_time_for_slot(scheduled_time_slot)

    return ticket


def build_initial_ticket_payload(request_obj):
    preferred_time_slot = normalize_time_slot(request_obj.preferred_time_slot)
    return {
        'scheduled_date': request_obj.preferred_date or timezone.localdate(),
        'scheduled_time_slot': preferred_time_slot,
        'scheduled_time': get_default_time_for_slot(preferred_time_slot),
        'status': 'Not Started',
        'notes': request_obj.scheduling_notes or None,
    }


def _default_ticket_admin_for_actor(actor):
    if actor and is_admin_workspace_role(getattr(actor, 'role', None)):
        return actor
    return None


def normalize_proof_media_payload(*, photos=None, videos=None, media=None):
    normalized_media = []

    for item in media or []:
        if isinstance(item, dict):
            media_type = str(item.get('type') or 'photo').strip().lower()
            normalized_media.append({
                'type': 'video' if media_type == 'video' else 'photo',
                'name': str(item.get('name') or item.get('url') or f'{media_type}-proof').strip(),
                'url': str(item.get('url') or item.get('name') or '').strip(),
            })
        else:
            value = str(item).strip()
            if value:
                normalized_media.append({'type': 'photo', 'name': value, 'url': value})

    for entry in photos or []:
        value = str(entry).strip()
        if value:
            normalized_media.append({'type': 'photo', 'name': value, 'url': value})

    for entry in videos or []:
        value = str(entry).strip()
        if value:
            normalized_media.append({'type': 'video', 'name': value, 'url': value})

    return normalized_media


def save_uploaded_proof_media(*, ticket, uploaded_files, request=None, media_type='photo'):
    normalized_media = []
    upload_directory = f'checklists/ticket-{ticket.id}'

    allowed_content_types = {
        'photo': {'image/jpeg', 'image/png', 'image/webp'},
        'video': {'video/mp4', 'video/webm', 'video/quicktime'},
    }
    max_sizes = {
        'photo': 10 * 1024 * 1024,
        'video': 50 * 1024 * 1024,
    }

    for uploaded_file in uploaded_files or []:
        content_type = str(getattr(uploaded_file, 'content_type', '') or '').lower()
        if content_type not in allowed_content_types.get(media_type, set()):
            allowed_label = 'JPG, PNG, or WebP' if media_type == 'photo' else 'MP4, WebM, or MOV'
            raise ValidationError({
                f'{media_type}_files': f'Unsupported {media_type} file. Upload {allowed_label} files only.'
            })
        if getattr(uploaded_file, 'size', 0) > max_sizes[media_type]:
            max_label = '10 MB' if media_type == 'photo' else '50 MB'
            raise ValidationError({
                f'{media_type}_files': f'Each {media_type} file must be {max_label} or smaller.'
            })

        original_name = Path(getattr(uploaded_file, 'name', '') or f'{media_type}-proof').name
        suffix = Path(original_name).suffix
        stem = slugify(Path(original_name).stem) or f'{media_type}-proof'
        stored_name = default_storage.save(
            f'{upload_directory}/{uuid.uuid4().hex}-{stem}{suffix}',
            uploaded_file,
        )
        file_url = default_storage.url(stored_name)
        if request is not None:
            file_url = request.build_absolute_uri(file_url)

        normalized_media.append({
            'type': media_type,
            'name': original_name,
            'url': file_url,
        })

    return normalized_media


def build_ticket_daily_duration_allocations(ticket, *, limit_minutes=None):
    if not ticket or not getattr(ticket, 'scheduled_date', None):
        return {}

    daily_limit = int(limit_minutes or get_daily_capacity_limit_minutes())
    daily_limit = max(1, daily_limit)
    remaining_minutes = max(0, int(ticket.request.service_type.estimated_duration or 0))
    current_date = ticket.scheduled_date
    allocations = {}

    while remaining_minutes > 0:
        day_minutes = min(remaining_minutes, daily_limit)
        allocations[current_date] = day_minutes
        remaining_minutes -= day_minutes
        current_date += timedelta(days=1)

    return allocations


def get_technician_scheduled_minutes_by_date(technician, start_date, end_date, *, exclude_ticket=None):
    if not technician or not start_date or not end_date:
        return {}

    limit_minutes = get_daily_capacity_limit_minutes()
    totals = {}
    queryset = get_technician_ticket_queryset(technician).filter(
        scheduled_date__lte=end_date,
    ).exclude(status='Cancelled')
    if exclude_ticket is not None:
        queryset = queryset.exclude(pk=exclude_ticket.pk)

    for existing_ticket in queryset.select_related('request__service_type'):
        allocations = build_ticket_daily_duration_allocations(existing_ticket, limit_minutes=limit_minutes)
        for allocated_date, allocated_minutes in allocations.items():
            if start_date <= allocated_date <= end_date:
                totals[allocated_date] = totals.get(allocated_date, 0) + allocated_minutes

    return totals


def get_technician_daily_scheduled_minutes(technician, scheduled_date, *, exclude_ticket=None):
    if not technician or not scheduled_date:
        return 0

    totals = get_technician_scheduled_minutes_by_date(
        technician,
        scheduled_date,
        scheduled_date,
        exclude_ticket=exclude_ticket,
    )
    return totals.get(scheduled_date, 0)


def get_daily_capacity_limit_minutes():
    from users.models import AdminSettings

    settings_obj = AdminSettings.objects.order_by('id').first()
    if not settings_obj or not settings_obj.allow_overtime_dispatch:
        return DAILY_TECHNICIAN_CAPACITY_MINUTES

    overtime_minutes = int(settings_obj.overtime_daily_capacity_minutes or DEFAULT_OVERTIME_CAPACITY_MINUTES)
    return max(DAILY_TECHNICIAN_CAPACITY_MINUTES, overtime_minutes)


def get_technician_daily_capacity(technician, scheduled_date, ticket):
    limit_minutes = get_daily_capacity_limit_minutes()
    candidate_allocations = build_ticket_daily_duration_allocations(ticket, limit_minutes=limit_minutes)
    if not candidate_allocations:
        return {
            'assigned_minutes': 0,
            'ticket_minutes': 0,
            'projected_minutes': 0,
            'normal_limit_minutes': DAILY_TECHNICIAN_CAPACITY_MINUTES,
            'limit_minutes': limit_minutes,
            'remaining_minutes': limit_minutes,
            'uses_overtime': limit_minutes > DAILY_TECHNICIAN_CAPACITY_MINUTES,
            'days_required': 0,
            'schedule': [],
            'fits': True,
        }

    start_date = min(candidate_allocations)
    end_date = max(candidate_allocations)
    assigned_by_date = get_technician_scheduled_minutes_by_date(
        technician,
        start_date,
        end_date,
        exclude_ticket=ticket,
    )
    schedule = []
    for allocated_date in sorted(candidate_allocations):
        assigned_minutes = assigned_by_date.get(allocated_date, 0)
        ticket_day_minutes = candidate_allocations[allocated_date]
        projected_minutes = assigned_minutes + ticket_day_minutes
        schedule.append({
            'date': allocated_date,
            'assigned_minutes': assigned_minutes,
            'ticket_minutes': ticket_day_minutes,
            'projected_minutes': projected_minutes,
            'remaining_minutes': limit_minutes - assigned_minutes,
            'fits': projected_minutes <= limit_minutes,
        })

    assigned_minutes = max((day['assigned_minutes'] for day in schedule), default=0)
    projected_minutes = max((day['projected_minutes'] for day in schedule), default=0)
    remaining_minutes = min((day['remaining_minutes'] for day in schedule), default=limit_minutes)
    return {
        'assigned_minutes': assigned_minutes,
        'ticket_minutes': sum(candidate_allocations.values()),
        'projected_minutes': projected_minutes,
        'normal_limit_minutes': DAILY_TECHNICIAN_CAPACITY_MINUTES,
        'limit_minutes': limit_minutes,
        'remaining_minutes': remaining_minutes,
        'uses_overtime': limit_minutes > DAILY_TECHNICIAN_CAPACITY_MINUTES,
        'days_required': len(candidate_allocations),
        'schedule': schedule,
        'fits': all(day['fits'] for day in schedule),
    }


def validate_technician_daily_capacity(technician, scheduled_date, ticket):
    capacity = get_technician_daily_capacity(technician, scheduled_date, ticket)
    if capacity['fits']:
        return capacity

    overloaded_day = next((day for day in capacity.get('schedule', []) if not day['fits']), None)
    assigned_hours = (overloaded_day or capacity)['assigned_minutes'] / 60
    ticket_hours = (overloaded_day or capacity)['ticket_minutes'] / 60
    limit_hours = capacity['limit_minutes'] / 60
    date_label = f" on {overloaded_day['date']}" if overloaded_day else f" on {scheduled_date}"
    raise ValueError(
        f'{technician.username} already has {assigned_hours:g} scheduled hour(s){date_label}. '
        f'Adding this {ticket_hours:g}-hour job would exceed the {limit_hours:g}-hour daily limit.'
    )


def get_general_service_type():
    return ServiceType.objects.filter(name__iexact=GENERAL_SERVICE_NAME).first()


def get_technician_service_skill(technician, service_type):
    if not technician or not service_type:
        return None

    exact_skill = TechnicianSkill.objects.filter(
        technician=technician,
        service_type=service_type,
    ).first()
    if exact_skill:
        return exact_skill

    if str(service_type.name or '').casefold() == GENERAL_SERVICE_NAME.casefold():
        return None

    general_service = get_general_service_type()
    if not general_service:
        return None

    return TechnicianSkill.objects.filter(
        technician=technician,
        service_type=general_service,
    ).first()


def get_eligible_technician_ids_for_service(service_type):
    if not service_type:
        return TechnicianSkill.objects.none().values_list('technician_id', flat=True)

    service_ids = [service_type.id]
    general_service = get_general_service_type()
    if (
        general_service and
        general_service.id != service_type.id and
        str(service_type.name or '').casefold() != GENERAL_SERVICE_NAME.casefold()
    ):
        service_ids.append(general_service.id)

    return TechnicianSkill.objects.filter(
        service_type_id__in=service_ids,
    ).values_list('technician_id', flat=True)


def score_technician_fit(
    ticket: ServiceTicket,
    technician: User,
    request_lat: float,
    request_lon: float
) -> Optional[Dict[str, Any]]:
    """
    Score a technician's fitness for a ticket based on proximity (primary),
    skill, and workload.

    Returns:
        Dict with score, distance_km, skill_level, service_counts, summary,
        or None if not qualified or over daily limit.
    """
    if technician.current_latitude is None or technician.current_longitude is None:
        return None

    skill = get_technician_service_skill(technician, ticket.request.service_type)
    if not skill:
        return None

    distance_km = calculate_distance(
        request_lat,
        request_lon,
        technician.current_latitude,
        technician.current_longitude,
    )
    estimated_minutes = (distance_km * 1.3) / (35 / 60)  # ~2.2 minutes per km

    technician_tickets = get_technician_ticket_queryset(technician)
    active_load = technician_tickets.filter(
        status__in=ACTIVE_TICKET_STATUSES,
    ).exclude(pk=ticket.pk).count()
    same_day_load = technician_tickets.filter(
        scheduled_date=ticket.scheduled_date,
        status__in=['Not Started', 'In Progress', 'On Hold', 'Completed'],
    ).exclude(pk=ticket.pk).count()

    capacity = get_technician_daily_capacity(technician, ticket.scheduled_date, ticket)
    if not capacity['fits']:
        return None

    # Enforce daily limit per service type
    service_type = ticket.request.service_type
    same_day_same_service = technician_tickets.filter(
        scheduled_date=ticket.scheduled_date,
        request__service_type=service_type,
    ).exclude(pk=ticket.pk).exclude(status='Cancelled').count()
    if same_day_same_service >= service_type.max_daily_assignments:
        return None  # Over daily limit, skip this technician

    # Service counts: (active, completed, total)
    completed_count = technician_tickets.filter(status='Completed').count()
    total_count = technician_tickets.count()

    # Scoring — proximity is PRIMARY factor (50 points max)
    score = 0.0
    score += max(0, 50 - (estimated_minutes * 1.0))  # 1 point per minute, proximity dominant
    score += SKILL_LEVEL_WEIGHTS.get(skill.skill_level, 0.4) * 25
    score += max(0, 15 - (active_load * 5))
    score += max(0, 10 - (same_day_load * 3))
    if technician.is_available:
        score += 5

    days_text = (
        f"{capacity['days_required']} scheduled day(s), "
        if capacity.get('days_required', 1) > 1
        else ""
    )
    summary = (
        f"{skill.get_skill_level_display()} skill, {distance_km:.1f} km away (~{estimated_minutes:.0f} min), "
        f"{active_load} active job(s), {same_day_load} job(s) on this date, {days_text}"
        f"{capacity['projected_minutes'] / 60:g}/{capacity['limit_minutes'] / 60:g} scheduled hour(s)."
    )
    return {
        'score': round(score, 2),
        'distance_km': round(distance_km, 2),
        'skill_level': skill.skill_level,
        'daily_assigned_minutes': capacity['assigned_minutes'],
        'daily_projected_minutes': capacity['projected_minutes'],
        'daily_limit_minutes': capacity['limit_minutes'],
        'scheduled_days_required': capacity['days_required'],
        'service_counts': {
            'active': active_load,
            'completed': completed_count,
            'total': total_count,
        },
        'summary': summary,
    }


def get_visible_service_requests_queryset(user, base_queryset=None, include_follow_up=False):
    if base_queryset is None:
        base_queryset = ServiceRequest.objects.select_related('client', 'location', 'service_type')
    # Keep approval queues oldest-first so the most time-sensitive requests surface first.
    base_queryset = base_queryset.order_by('request_date', 'id')

    if is_admin_workspace_role(user.role):
        return base_queryset
    if user.role == 'client':
        return base_queryset.filter(client=user)
    if user.role == 'technician':
        assigned_request_ids = get_technician_ticket_queryset(user).values_list('request_id', flat=True)
        return base_queryset.filter(id__in=assigned_request_ids)
    return base_queryset.none()


def get_visible_service_tickets_queryset(user, base_queryset=None):
    if base_queryset is None:
        base_queryset = ServiceTicket.objects.select_related(
            'technician', 'request__service_type', 'request__client', 'request__location'
        ).prefetch_related('crew_assignments__technician')
    if not base_queryset.ordered:
        base_queryset = base_queryset.order_by('-created_at', '-id')

    if is_admin_workspace_role(user.role):
        return base_queryset
    if user.role == 'technician':
        return get_technician_ticket_queryset(user, base_queryset=base_queryset)
    if user.role == 'client':
        return base_queryset.filter(request__client=user)
    return base_queryset.none()


def sync_technician_availability(technician, *, force_available=False):
    if not technician or technician.role != 'technician':
        return

    if force_available:
        desired_availability = True
    else:
        has_active_tickets = get_technician_ticket_queryset(
            technician,
        ).filter(
            status__in=ACTIVE_TICKET_STATUSES,
        ).exists()
        desired_availability = not has_active_tickets

    if technician.is_available != desired_availability:
        technician.is_available = desired_availability
        technician.save(update_fields=['is_available'])


def normalize_ticket_status(value):
    if value in [None, '']:
        return None

    aliases = {}
    for status_value, _label in ServiceTicket.STATUS_CHOICES:
        aliases[status_value.lower()] = status_value
        aliases[status_value.lower().replace(' ', '_')] = status_value

    return aliases.get(str(value).strip().lower())


def clear_reschedule_request(ticket):
    ticket.reschedule_requested = False
    ticket.reschedule_reason = None
    ticket.reschedule_requested_at = None


def sync_request_status_from_ticket(ticket):
    mapped_status = TICKET_REQUEST_STATUS_MAP.get(ticket.status)
    request_obj = ticket.request
    if mapped_status and request_obj.status != mapped_status:
        request_obj.status = mapped_status
        request_obj.save(update_fields=['status', 'updated_at'])


def validate_ticket_transition(ticket, new_status, *, allow_same=False):
    normalized_status = normalize_ticket_status(new_status)
    if not normalized_status:
        raise ValueError('Unsupported ticket status.')

    if normalized_status == ticket.status:
        if allow_same:
            return normalized_status
        raise ValueError(f'Ticket is already {normalized_status}.')

    allowed_statuses = ALLOWED_TICKET_TRANSITIONS.get(ticket.status, set())
    if normalized_status not in allowed_statuses:
        raise ValueError(f'Cannot move ticket from {ticket.status} to {normalized_status}.')

    return normalized_status


def ensure_ticket_checklist_completed(ticket):
    try:
        checklist = ticket.inspection
    except InspectionChecklist.DoesNotExist:
        raise ValueError('Complete the job checklist before closing this job.')

    if not checklist.is_completed:
        raise ValueError('Complete the job checklist before closing this job.')

    return checklist


def apply_ticket_status_change(ticket, new_status, *, changed_by, notes='', extra_update_fields=None, inventory_usage=None):
    normalized_status = validate_ticket_transition(ticket, new_status)
    now = timezone.now()
    update_fields = ['status', 'updated_at']

    ticket.status = normalized_status

    if normalized_status == 'In Progress':
        if not ticket.start_time:
            ticket.start_time = now
            update_fields.append('start_time')
        clear_reschedule_request(ticket)
        update_fields.extend(['reschedule_requested', 'reschedule_reason', 'reschedule_requested_at'])
    elif normalized_status == 'Completed':
        if not ticket.start_time:
            ticket.start_time = now
            update_fields.append('start_time')
        ticket.end_time = now
        ticket.completed_date = now
        clear_reschedule_request(ticket)
        update_fields.extend([
            'end_time',
            'completed_date',
            'reschedule_requested',
            'reschedule_reason',
            'reschedule_requested_at',
        ])
    elif normalized_status == 'Cancelled':
        clear_reschedule_request(ticket)
        update_fields.extend(['reschedule_requested', 'reschedule_reason', 'reschedule_requested_at'])

    if extra_update_fields:
        update_fields.extend(extra_update_fields)

    if notes:
        ticket._activity_reason = notes

    ticket.save(update_fields=list(dict.fromkeys(update_fields)))
    sync_request_status_from_ticket(ticket)
    sync_ticket_team_availability(ticket)

    if normalized_status == 'Completed':
        if inventory_usage is None:
            issue_ticket_reservations(
                ticket,
                performed_by=changed_by,
                reason=f'Issued automatically when ticket #{ticket.id} was completed.',
            )
        else:
            issue_ticket_inventory_usage(
                ticket,
                usage=inventory_usage,
                performed_by=changed_by,
                reason=f'Issued confirmed stock usage when ticket #{ticket.id} was completed.',
            )
        sync_ticket_maintenance_schedule(ticket)
    elif normalized_status == 'Cancelled':
        release_ticket_reservations(
            ticket,
            performed_by=changed_by,
            reason=f'Released automatically when ticket #{ticket.id} was cancelled.',
        )

    ServiceStatusHistory.objects.create(
        ticket=ticket,
        status=normalized_status,
        changed_by=changed_by,
        notes=notes,
    )

    return normalized_status


from services.models import ArrivalValidationLog
from users.models import AdminSettings

def get_location_validation_settings():
    settings_obj = AdminSettings.objects.order_by('id').first()
    return {
        'settings': settings_obj,
        'enabled': True if settings_obj is None else bool(settings_obj.location_validation_enabled),
        'radius_meters': 30 if settings_obj is None else int(settings_obj.arrival_radius_meters or 30),
        'disabled_reason': '' if settings_obj is None else (settings_obj.location_validation_disabled_reason or ''),
        'updated_by': None if settings_obj is None else settings_obj.location_validation_updated_by,
        'updated_at': None if settings_obj is None else settings_obj.location_validation_updated_at,
    }


def record_arrival_validation_log(
    *,
    ticket,
    technician=None,
    performed_by=None,
    action,
    validation_result='not_required',
    technician_latitude=None,
    technician_longitude=None,
    service_latitude=None,
    service_longitude=None,
    distance_meters=None,
    validation_enabled=True,
    radius_meters=30,
    remarks='',
):
    return ArrivalValidationLog.objects.create(
        ticket=ticket,
        technician=technician or ticket.technician,
        performed_by=performed_by or technician or ticket.technician,
        action=action,
        validation_result=validation_result,
        technician_latitude=technician_latitude,
        technician_longitude=technician_longitude,
        service_latitude=service_latitude,
        service_longitude=service_longitude,
        distance_meters=distance_meters,
        validation_enabled=validation_enabled,
        radius_meters=radius_meters,
        remarks=remarks or '',
    )


def compute_arrival_validation_result(ticket, technician_latitude, technician_longitude):
    validation_settings = get_location_validation_settings()
    validation_enabled = validation_settings['enabled']
    radius_meters = validation_settings['radius_meters']

    try:
        location = ticket.request.location
    except Exception as exc:
        raise ValueError('This ticket does not have a service location.') from exc

    if location.latitude is None or location.longitude is None:
        raise ValueError('This ticket does not have valid service coordinates yet.')

    if technician_latitude is None or technician_longitude is None:
        raise ValueError('Technician location is required to validate arrival.')

    distance_km = calculate_distance(
        technician_latitude,
        technician_longitude,
        float(location.latitude),
        float(location.longitude),
    )
    distance_meters = distance_km * 1000

    if not validation_enabled:
        return {
            'validation_enabled': False,
            'radius_meters': radius_meters,
            'validation_result': 'bypassed',
            'distance_meters': distance_meters,
            'service_latitude': float(location.latitude),
            'service_longitude': float(location.longitude),
            'service_location': location,
            'blocked': False,
        }

    if distance_meters <= radius_meters:
        return {
            'validation_enabled': True,
            'radius_meters': radius_meters,
            'validation_result': 'passed',
            'distance_meters': distance_meters,
            'service_latitude': float(location.latitude),
            'service_longitude': float(location.longitude),
            'service_location': location,
            'blocked': False,
        }

    return {
        'validation_enabled': True,
        'radius_meters': radius_meters,
        'validation_result': 'failed',
        'distance_meters': distance_meters,
        'service_latitude': float(location.latitude),
        'service_longitude': float(location.longitude),
        'service_location': location,
        'blocked': True,
    }


def build_ticket_search_query(search_string):
    """
    Builds a robust multi-field search Q object for ServiceTickets based on tokenized input.
    """
    from django.db.models import Q
    search_query = str(search_string or '').strip()
    if not search_query:
        return Q()

    tokens = search_query.split()
    base_q = Q()
    
    for token in tokens:
        token_q = (
            Q(request__client__username__icontains=token) |
            Q(request__client__first_name__icontains=token) |
            Q(request__client__last_name__icontains=token) |
            Q(request__client__client_profile__company_name__icontains=token) |
            Q(request__service_type__name__icontains=token)
        )
        if not base_q:
            base_q = token_q
        else:
            base_q &= token_q

    search_id = None
    if search_query.lower().startswith('tkt-'):
        digits = search_query[4:]
        if digits.isdigit():
            search_id = int(digits)
    elif search_query.isdigit():
        search_id = int(search_query)

    if search_id is not None:
        return base_q | Q(id=search_id)
    
    return base_q
