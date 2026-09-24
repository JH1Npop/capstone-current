from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Count, Sum, Q, Avg, F
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta
import logging
import zoneinfo
from django.conf import settings as django_settings


def get_business_timezone():
    tz_name = getattr(django_settings, 'BUSINESS_DISPLAY_TIMEZONE', 'Asia/Singapore')
    try:
        return zoneinfo.ZoneInfo(tz_name)
    except Exception:
        return timezone.get_current_timezone()


def get_business_now():
    """Return timezone.now() converted to the business display timezone."""
    return timezone.now().astimezone(get_business_timezone())


def get_business_today():
    """Return today's date in the business display timezone."""
    return get_business_now().date()


from services.maintenance import process_maintenance_alerts
from services.job_progress import ACTIVE_TICKET_STATUSES, get_ticket_workflow_progress
from services.models import (
    AfterSalesCase as FollowUpCase,
    MaintenanceSchedule,
    ServiceLocation,
    ServiceRequest,
    ServiceTicket,
)
from services.sla import (
    evaluate_service_request_sla,
    evaluate_service_ticket_sla,
    get_ticket_dispatch_state,
    serialize_sla_evaluation,
)
from services.user_display import client_technician_label as _client_technician_label
from inventory.models import InventoryItem
from users.models import User
from users.rbac import (
    INVENTORY_VIEW_CAPABILITIES,
    SUPERVISOR_DASHBOARD_CAPABILITIES,
    SUPERVISOR_DISPATCH_CAPABILITIES,
    TECHNICIAN_DASHBOARD_CAPABILITIES,
    TECHNICIAN_INVENTORY_CAPABILITIES,
    is_admin_workspace_role,
    user_has_any_capability,
)

logger = logging.getLogger(__name__)

DASHBOARD_LIST_LIMIT = 5
ADMIN_RECENT_TICKET_LIMIT = 10


def _display_name(user):
    if not user:
        return None
    full_name = user.get_full_name().strip()
    return full_name or user.username


def _get_request_address(request):
    try:
        return request.location.address
    except ServiceLocation.DoesNotExist:
        return None


def _serialize_client_details(user, service_request=None):
    service_address = _get_request_address(service_request) if service_request else None
    return {
        'client_email': getattr(user, 'email', None) or None,
        'client_phone': getattr(user, 'phone', None) or None,
        'service_address': service_address or getattr(user, 'address', None) or None,
    }


def _serialize_active_technician_jobs(assigned_admin=None):
    """Get all active technician jobs."""
    active_jobs = ServiceTicket.objects.select_related(
        'technician', 'request__client', 'request__service_type', 'request__location'
    ).prefetch_related('status_history').filter(
        status__in=ACTIVE_TICKET_STATUSES,
        scheduled_date__isnull=False,
        technician__isnull=False
    ).order_by('scheduled_date', 'scheduled_time')

    # Admin ownership filtering is intentionally not applied here; this is a workspace-wide view.

    # Order by most recent start time
    active_jobs = active_jobs.order_by('-start_time', '-id')[:20]

    serialized_jobs = []
    for job in active_jobs:
        workflow_progress = get_ticket_workflow_progress(job)
        serialized_jobs.append({
            'id': job.id,
            'ticket_id': job.id,
            'technician': _display_name(job.technician),
            'technician_name': _display_name(job.technician),
            'client': _display_name(job.request.client),
            'service_type': job.request.service_type.name,
            'status': job.status,
            'priority': job.priority,
            'location': _get_request_address(job.request),
            'start_time': job.start_time.isoformat() if job.start_time else None,
            'progress': workflow_progress['percent'],
            'progress_label': workflow_progress['label'],
            'progress_basis': workflow_progress['basis'],
            'progress_paused': workflow_progress['is_paused'],
            'progress_track': workflow_progress['track'],
            'progress_track_label': workflow_progress['track_label'],
            'sla_minutes_remaining': _calculate_sla_minutes_remaining(job),
        })
    return serialized_jobs


def _calculate_sla_minutes_remaining(ticket):
    """Calculate SLA minutes remaining for a ticket"""
    if not ticket.request or not ticket.request.service_type:
        return None

    service_type = ticket.request.service_type
    sla_hours = service_type.sla_hours if hasattr(service_type, 'sla_hours') else None

    if not sla_hours:
        return None

    # Get the reference time (request creation time or ticket assignment time)
    reference_time = ticket.request.request_date if ticket.request.request_date else timezone.now()

    # Calculate when SLA expires
    sla_expiry = reference_time + timedelta(hours=sla_hours)

    # Calculate minutes remaining
    minutes_remaining = (sla_expiry - timezone.now()).total_seconds() / 60

    return max(int(minutes_remaining), 0)


def _serialize_maintenance_queue(queryset):
    queue = []
    for schedule in queryset:
        ticket = getattr(schedule, 'service_ticket', None)
        req = getattr(ticket, 'request', None) if ticket else None
        queue.append({
            'id': schedule.id,
            'ticket_id': schedule.service_ticket_id,
            'client': _display_name(schedule.client),
            'service_type': schedule.service_type.name if schedule.service_type_id else None,
            'maintenance_profile': schedule.maintenance_profile,
            'maintenance_profile_label': schedule.get_maintenance_profile_display(),
            'status': schedule.status,
            'next_due_date': str(schedule.next_due_date),
            'notify_on_date': str(schedule.notify_on_date),
            'risk_level': schedule.risk_level,
            'risk_score': schedule.risk_score,
            'prediction_notes': schedule.prediction_notes,
            'location': _get_request_address(req) if req else None,
            **_serialize_client_details(schedule.client, req),
        })
    return queue


def _serialize_after_sales_case_summary(case):
    """Safe row for dashboard; missing ticket/request links must not break the admin API."""
    try:
        service_type_name = case.service_ticket.request.service_type.name
    except Exception:
        service_type_name = None
    return {
        'id': case.id,
        'summary': case.summary,
        'status': case.status,
        'case_type': case.case_type,
        'creation_source': case.creation_source,
        'priority': case.priority,
        'client': _display_name(case.client),
        'service_type': service_type_name,
        'assigned_to': _display_name(case.assigned_to) if case.assigned_to else None,
        'created_by_name': _display_name(case.created_by) if case.created_by else None,
        'created_at': case.created_at.isoformat(),
        'due_date': case.due_date.isoformat() if case.due_date else None,
    }


def _low_stock_inventory_items():
    return InventoryItem.objects.annotate(
        available=F('quantity') - F('reserved_quantity'),
        threshold=F('minimum_stock') * F('low_stock_threshold') / 100.0
    ).filter(minimum_stock__gt=0, available__lte=F('threshold'))


def _build_sla_summary(*, service_requests=None, service_tickets=None, limit=8):
    now = timezone.now()
    summary = {
        'warning_count': 0,
        'overdue_count': 0,
        'approval_risk': 0,
        'assignment_risk': 0,
        'start_delay_risk': 0,
        'execution_risk': 0,
        'reschedule_risk': 0,
    }
    queue = []

    rule_to_summary_key = {
        'approval_delay': 'approval_risk',
        'assignment_delay': 'assignment_risk',
        'start_delay': 'start_delay_risk',
        'execution_delay': 'execution_risk',
        'reschedule_delay': 'reschedule_risk',
    }

    for service_request in service_requests or []:
        evaluation = evaluate_service_request_sla(service_request, now=now)
        if evaluation['state'] not in {'warning', 'overdue'}:
            continue

        summary_key = rule_to_summary_key.get(evaluation['rule'])
        if summary_key:
            summary[summary_key] += 1
        summary[f"{evaluation['state']}_count"] += 1
        queue.append({
            '_sort_state': 0 if evaluation['state'] == 'overdue' else 1,
            '_sort_due_at': evaluation.get('due_at') or now,
            'entity_type': 'request',
            'id': service_request.id,
            'client': _display_name(service_request.client),
            'service_type': service_request.service_type.name,
            'status': service_request.status,
            'requested_at': service_request.request_date.isoformat() if service_request.request_date else None,
            'sla': serialize_sla_evaluation(evaluation),
        })

    for ticket in service_tickets or []:
        evaluation = evaluate_service_ticket_sla(ticket, now=now)
        if evaluation['state'] not in {'warning', 'overdue'}:
            continue

        summary_key = rule_to_summary_key.get(evaluation['rule'])
        if summary_key:
            summary[summary_key] += 1
        summary[f"{evaluation['state']}_count"] += 1
        queue.append({
            '_sort_state': 0 if evaluation['state'] == 'overdue' else 1,
            '_sort_due_at': evaluation.get('due_at') or now,
            'entity_type': 'ticket',
            'id': ticket.id,
            'client': _display_name(ticket.request.client),
            'service_type': ticket.request.service_type.name,
            'status': ticket.status,
            'priority': ticket.priority,
            'assigned_technician': _display_name(ticket.technician) if ticket.technician else None,
            'scheduled_date': str(ticket.scheduled_date) if ticket.scheduled_date else None,
            'sla': serialize_sla_evaluation(evaluation),
        })

    queue.sort(key=lambda item: (item['_sort_state'], item['_sort_due_at']))
    for item in queue:
        item.pop('_sort_state', None)
        item.pop('_sort_due_at', None)

    return summary, queue[:limit]


class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    ADMIN_WORKSPACE_ALIASES = {
        '',
        'admin',
        'operations',
        'supervisor',
        'after_sales',
        'aftersales',
        'follow_up',
    }
    VALID_WORKSPACES = ADMIN_WORKSPACE_ALIASES | {'technician', 'client'}

    def get(self, request):
        try:
            user = request.user
            requested_workspace = str(request.query_params.get('role') or '').strip()
            try:
                role = user.role
            except AttributeError:
                logger.error(f"User {user} does not have role attribute")
                return Response({'error': 'Invalid user - role attribute missing'}, status=400)

            if requested_workspace not in self.VALID_WORKSPACES:
                return Response({'error': f'Unknown dashboard workspace: {requested_workspace}'}, status=400)

            if requested_workspace == 'technician':
                if role == 'technician' and user_has_any_capability(user, TECHNICIAN_DASHBOARD_CAPABILITIES):
                    return self.get_technician_dashboard()
                return Response({'error': 'You do not have access to the requested dashboard.'}, status=403)

            if requested_workspace == 'client' and role != 'client':
                return Response({'error': 'You do not have access to the requested dashboard.'}, status=403)

            admin_capabilities = SUPERVISOR_DASHBOARD_CAPABILITIES

            if requested_workspace in self.ADMIN_WORKSPACE_ALIASES:
                if is_admin_workspace_role(role) and user_has_any_capability(user, admin_capabilities):
                    return self.get_admin_dashboard()
                if requested_workspace:
                    return Response({'error': 'You do not have access to the requested dashboard.'}, status=403)

            if is_admin_workspace_role(role) and user_has_any_capability(user, admin_capabilities):
                return self.get_admin_dashboard()
            elif role == 'technician':
                if not user_has_any_capability(user, TECHNICIAN_DASHBOARD_CAPABILITIES):
                    return Response({'error': 'You do not have access to the requested dashboard.'}, status=403)
                return self.get_technician_dashboard()
            elif role == 'client':
                return self.get_client_dashboard()
            else:
                return Response({'error': f'Invalid role: {role}'}, status=400)
        except Exception as e:
            logger.exception(f"Error in DashboardView.get: {str(e)}")
            return Response({'error': f'Dashboard error: {str(e)}'}, status=500)

    def get_admin_dashboard(self):
        """Admin dashboard with full system overview"""

        # Service statistics
        total_tickets = ServiceTicket.objects.count()
        active_tickets = ServiceTicket.objects.filter(status__in=ACTIVE_TICKET_STATUSES).count()
        # completed_date is a DateTimeField, so use date range to compare dates
        today_start = get_business_now().replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        completed_today = ServiceTicket.objects.filter(
            completed_date__gte=today_start,
            completed_date__lt=today_end
        ).count()

        # Inventory statistics
        total_inventory = InventoryItem.objects.count()
        low_stock_items = _low_stock_inventory_items().count()
        out_of_stock = InventoryItem.objects.filter(quantity=0).count()

        # User statistics
        total_users = User.objects.count()
        active_technicians = User.objects.filter(role='technician', status='active').count()

        # Recent activity - use select_related to avoid N+1 queries
        # ServiceTicket has no created_at field, so use the request date or ticket id
        recent_tickets = ServiceTicket.objects.select_related(
            'request', 'request__client', 'request__service_type', 'technician'
        ).order_by('-id')[:5]
        # ServiceRequest uses request_date for creation
        recent_requests = ServiceRequest.objects.select_related(
            'client', 'service_type'
        ).order_by('-request_date')[:5]

        # Client schedule for upcoming assignment tasks - load all relationships
        client_schedule_queryset = ServiceTicket.objects.select_related(
            'request', 'request__client', 'request__service_type', 'technician'
        ).filter(
            status__in=ACTIVE_TICKET_STATUSES,
            scheduled_date__isnull=False
        )
        client_schedule_count = client_schedule_queryset.count()
        unassigned_scheduled_jobs = client_schedule_queryset.filter(technician__isnull=True).count()
        client_schedule_tickets = client_schedule_queryset.order_by('scheduled_date', 'scheduled_time')[:20]
        sla_service_tickets = ServiceTicket.objects.select_related(
            'request', 'request__client', 'request__service_type', 'technician'
        ).filter(status__in=ACTIVE_TICKET_STATUSES)

        # Pending requests from clients (new)
        pending_requests_queryset = ServiceRequest.objects.select_related(
            'client', 'service_type'
        ).filter(status='Pending')
        pending_requests_count = pending_requests_queryset.count()
        pending_requests = pending_requests_queryset.order_by('request_date')[:10]
        sla_service_requests = ServiceRequest.objects.select_related(
            'client', 'service_type'
        ).filter(status='Pending')
        maintenance_schedules = MaintenanceSchedule.objects.select_related(
            'client',
            'service_type',
            'service_ticket__request__location',
        )
        active_maintenance = maintenance_schedules.exclude(status__in=['completed', 'dismissed'])

        # After-sales functionality for the admin dashboard
        today = get_business_today()
        week_ago = today - timezone.timedelta(days=7)
        cases = FollowUpCase.objects.select_related(
            'client', 'service_ticket', 'assigned_to', 'created_by'
        ).order_by('-created_at')
        unresolved_cases = cases.filter(status__in=['open', 'in_progress'])

        # Operations functionality for the admin dashboard
        thirty_days_ago = timezone.now() - timedelta(days=30)
        team_tickets = ServiceTicket.objects.select_related(
            'request', 'request__client', 'request__service_type', 'technician'
        )
        team_ticket_count = team_tickets.count()
        active_team_tickets = team_tickets.filter(status__in=ACTIVE_TICKET_STATUSES).count()

        technician_stats = list(
            User.objects.filter(role='technician')
            .annotate(
                tickets_completed=Count(
                    'assigned_tickets',
                    filter=Q(
                        assigned_tickets__status='Completed',
                        assigned_tickets__completed_date__gte=thirty_days_ago
                    )
                )
            )
            .values('id', 'username', 'first_name', 'last_name', 'status', 'tickets_completed')
            .order_by('-tickets_completed')
        )
        sla_overview, sla_queue = _build_sla_summary(
            service_requests=sla_service_requests,
            service_tickets=sla_service_tickets,
        )

        return Response({
            'role': 'admin',
            'pending_requests': [
                {
                    'id': req.id,
                    'client': _display_name(req.client),
                    'service_type': req.service_type.name,
                    'status': req.status,
                    'request_date': req.request_date
                }
                for req in pending_requests
            ],
            'overview': {
                'total_tickets': total_tickets,
                'active_tickets': active_tickets,
                'completed_today': completed_today,
                'total_inventory': total_inventory,
                'low_stock_items': low_stock_items,
                'out_of_stock': out_of_stock,
                'total_users': total_users,
                'active_technicians': active_technicians,
                'due_soon_maintenance': active_maintenance.filter(status='due_soon').count(),
                'due_maintenance': active_maintenance.filter(status='due').count(),
                'pending_approvals': pending_requests_count,
                'scheduled_jobs': client_schedule_count,
                'unassigned_scheduled_jobs': unassigned_scheduled_jobs,
                # After-sales metrics
                'total_cases': cases.count(),
                'open_cases': unresolved_cases.count(),
                'overdue_cases': unresolved_cases.filter(due_date__lt=today).count(),
                'resolved_this_week': cases.filter(resolved_at__date__gte=week_ago).count(),
                # Supervisor metrics
                'team_tickets': team_ticket_count,
                'active_team_tickets': active_team_tickets,
                'total_technicians': len(technician_stats),
                'available_technicians': sum(1 for technician in technician_stats if technician.get('status') == 'active'),
            },
            'list_counts': {
                'pending_requests': pending_requests_count,
                'client_schedule': client_schedule_count,
                'sla_queue': len(sla_queue),
            },
            'sla_overview': sla_overview,
            'sla_queue': sla_queue,
            'maintenance_queue': _serialize_maintenance_queue(
                active_maintenance.filter(status__in=['due_soon', 'due']).order_by('next_due_date')[:6]
            ),
            'client_schedule': [
                {
                    'id': ticket.id,
                    'client': _display_name(ticket.request.client),
                    'service_type': ticket.request.service_type.name,
                    'scheduled_date': ticket.scheduled_date,
                    'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
                    'status': ticket.status,
                    'assigned_technician': _display_name(ticket.technician) if ticket.technician else None,
                    'location': _get_request_address(ticket.request)
                }
                for ticket in client_schedule_tickets
            ],
            'recent_activity': {
                'tickets': [
                    {
                        'id': ticket.id,
                        'client': _display_name(ticket.request.client),
                        'service_type': ticket.request.service_type.name,
                        'status': ticket.status,
                        'technician': _display_name(ticket.technician) if ticket.technician else None,
                        'created_date': ticket.request.request_date
                    }
                    for ticket in recent_tickets
                ],
                'requests': [
                    {
                        'id': req.id,
                        'client': _display_name(req.client),
                        'service_type': req.service_type.name,
                        'status': req.status,
                        'request_date': req.request_date
                    }
                    for req in recent_requests
                ]
            },
            'after_sales': {
                'recent_cases': [_serialize_after_sales_case_summary(case) for case in cases[:5]],
                'case_breakdown': [
                    {'status': status, 'count': cases.filter(status=status).count()}
                    for status in ['open', 'in_progress', 'resolved', 'closed']
                ]
            },
            'operations': {
                'technician_performance': technician_stats,
                'recent_tickets': [
                    {
                        'id': ticket.id,
                        'technician': _display_name(ticket.technician) if ticket.technician else None,
                        'client': _display_name(ticket.request.client),
                        'service_type': ticket.request.service_type.name,
                        'status': ticket.status,
                        'priority': ticket.priority,
                        'created_at': ticket.created_at.isoformat() if ticket.created_at else None,
                    }
                    for ticket in team_tickets.order_by('-id')[:10]
                ],
                'active_technician_jobs': _serialize_active_technician_jobs()
            },
            # Compatibility alias for older frontend code. This is operations data,
            # not a standalone supervisor role dashboard.
            'supervisor': {
                'technician_performance': technician_stats,
                'recent_tickets': [
                    {
                        'id': ticket.id,
                        'technician': _display_name(ticket.technician) if ticket.technician else None,
                        'client': _display_name(ticket.request.client),
                        'service_type': ticket.request.service_type.name,
                        'status': ticket.status,
                        'priority': ticket.priority,
                        'created_at': ticket.created_at.isoformat() if ticket.created_at else None,
                    }
                    for ticket in team_tickets.order_by('-id')[:10]
                ],
                'active_technician_jobs': _serialize_active_technician_jobs()
            },
        })

    def get_technician_dashboard(self):
        """Technician dashboard with assigned work focus"""
        user = self.request.user
        month_start = get_business_now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # My tickets - load all relationships upfront to avoid N+1
        my_tickets = ServiceTicket.objects.select_related(
            'request', 'request__client', 'request__service_type', 'request__location'
        ).filter(
            Q(technician=user) | Q(crew_assignments__technician=user)
        ).distinct()
        active_tickets = my_tickets.filter(
            Q(status__in=ACTIVE_TICKET_STATUSES)
        )
        completed_this_month = my_tickets.filter(
            status='Completed',
            completed_date__gte=month_start
        ).count()

        # Today's schedule
        today = get_business_today()
        todays_tickets = my_tickets.filter(scheduled_date=today)

        # Inventory access (read-only for technicians)
        can_view_inventory = user_has_any_capability(
            user,
            set(TECHNICIAN_INVENTORY_CAPABILITIES) | set(INVENTORY_VIEW_CAPABILITIES),
        )
        low_stock_items_qs = _low_stock_inventory_items()[:5] if can_view_inventory else []
        low_stock_alerts = [
            {
                'id': item.id,
                'name': item.name,
                'available_quantity': item.available_quantity if hasattr(item, 'available_quantity') else item.quantity,
                'minimum_stock': item.minimum_stock
            } for item in low_stock_items_qs
        ]

        return Response({
            'role': 'technician',
            'overview': {
                'total_assigned': my_tickets.count(),
                'active_tickets': active_tickets.count(),
                'completed_this_month': completed_this_month,
                'todays_schedule': todays_tickets.count(),
            },
            'active_work': [
                {
                    'id': ticket.id,
                    'client': _display_name(ticket.request.client),
                    'service_type': ticket.request.service_type.name,
                    'status': ticket.status,
                    'scheduled_date': str(ticket.scheduled_date) if ticket.scheduled_date else None,
                    'priority': ticket.priority
                } for ticket in active_tickets.order_by('scheduled_date')[:5]
            ],
            'todays_schedule': [
                {
                    'id': ticket.id,
                    'client': _display_name(ticket.request.client),
                    'service_type': ticket.request.service_type.name,
                    'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
                    'location': _get_request_address(ticket.request),
                } for ticket in todays_tickets.order_by('scheduled_time')
            ],
            'low_stock_alerts': low_stock_alerts
        })

    def get_client_dashboard(self):
        """Client dashboard with service request focus"""
        try:
            user = self.request.user

            # My service requests with safe access
            try:
                my_requests = ServiceRequest.objects.select_related(
                    'client', 'service_type'
                ).filter(client=user)
                active_requests = my_requests.filter(Q(status__in=['Pending', 'Approved']))
                pending_requests = my_requests.filter(status='Pending')
                requests_count = my_requests.count()
                active_req_count = active_requests.count()
            except Exception as e:
                logger.warning(f"Error fetching requests for {user}: {str(e)}")
                requests_count = 0
                active_req_count = 0
                active_requests = []
                pending_requests = []

            # My tickets with safe access
            try:
                my_tickets = ServiceTicket.objects.filter(request__client=user).select_related(
                    'request', 'request__service_type', 'technician'
                )
                active_tickets = my_tickets.filter(Q(status__in=ACTIVE_TICKET_STATUSES))
                on_hold_tickets = my_tickets.filter(status='On Hold')
                completed_tickets_qs = my_tickets.filter(status='Completed').order_by('-completed_date')[:5]
                tickets_count = my_tickets.count()
                active_tickets_count = active_tickets.count()
            except Exception as e:
                logger.warning(f"Error fetching tickets for {user}: {str(e)}")
                tickets_count = 0
                active_tickets_count = 0
                active_tickets = []
                on_hold_tickets = []
                completed_tickets_qs = []

            # Status breakdown with safe counts
            status_stats = {}
            try:
                status_stats['pending'] = my_requests.filter(status='Pending').count()
                status_stats['approved'] = my_requests.filter(status='Approved').count()
                status_stats['in_progress'] = my_tickets.filter(status='In Progress').count()
                status_stats['completed'] = my_tickets.filter(status='Completed').count()
                status_stats['on_hold'] = on_hold_tickets.count() if 'on_hold_tickets' in locals() else 0
            except Exception as e:
                logger.warning(f"Error counting statuses: {str(e)}")
                status_stats = {'pending': 0, 'approved': 0, 'in_progress': 0, 'completed': 0, 'on_hold': 0}

            # Calculate rating safely
            avg_rating = None
            total_rated = 0
            try:
                completed_with_rating = my_tickets.filter(status='Completed', client_rating__isnull=False)
                total_rated = completed_with_rating.count()
                if total_rated > 0:
                    rating_agg = completed_with_rating.aggregate(avg=Avg('client_rating'))
                    avg_rating = round(rating_agg['avg'], 1) if rating_agg['avg'] else None
            except Exception as e:
                logger.warning(f"Error calculating rating: {str(e)}")

            # Build active requests list
            active_requests_list = []
            try:
                for req in active_requests.order_by('-request_date')[:3]:
                    try:
                        active_requests_list.append({
                            'id': req.id,
                            'service_type': req.service_type.name if req.service_type else 'Unknown',
                            'status': req.status,
                            'created_at': str(req.request_date.isoformat()) if req.request_date else None,
                            'description': (req.description[:100] + '...') if len(req.description) > 100 else req.description
                        })
                    except AttributeError:
                        logger.warning(f"Missing service_type for request {req.id}")
            except Exception as e:
                logger.warning(f"Error building active requests list: {str(e)}")

            # Build active tickets list
            active_tickets_list = []
            try:
                for ticket in active_tickets.order_by('scheduled_date')[:3]:
                    try:
                        tech_label = 'Not assigned'
                        if ticket.technician:
                            tech_label = _client_technician_label(ticket.technician) or 'Technician'
                        service_name = 'Unknown'
                        if ticket.request and ticket.request.service_type:
                            service_name = ticket.request.service_type.name

                        active_tickets_list.append({
                            'id': ticket.id,
                            'service_type': service_name,
                            'technician': tech_label,
                            'technician_full_name': tech_label,
                            'status': ticket.status,
                            'scheduled_date': str(ticket.scheduled_date) if ticket.scheduled_date else None,
                            'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
                            'scheduled_time_slot': ticket.scheduled_time_slot,
                            'location': _get_request_address(ticket.request) if ticket.request else '',
                            'priority': ticket.priority
                        })
                    except Exception as inner_e:
                        logger.warning(f"Error processing ticket {ticket.id}: {str(inner_e)}")
            except Exception as e:
                logger.warning(f"Error building active tickets list: {str(e)}")

            # Build history list
            recent_history_list = []
            try:
                for ticket in completed_tickets_qs:
                    try:
                        tech_label = _client_technician_label(ticket.technician) if ticket.technician else None
                        if not tech_label:
                            tech_label = '-'
                        service_name = 'Unknown'
                        if ticket.request and ticket.request.service_type:
                            service_name = ticket.request.service_type.name

                        recent_history_list.append({
                            'id': ticket.id,
                            'service_type': service_name,
                            'completed_date': str(ticket.completed_date.isoformat()) if ticket.completed_date else None,
                            'technician': tech_label,
                            'technician_full_name': tech_label,
                            'rating': ticket.client_rating
                        })
                    except Exception as inner_e:
                        logger.warning(f"Error processing history ticket {ticket.id}: {str(inner_e)}")
            except Exception as e:
                logger.warning(f"Error building history list: {str(e)}")

            # Alerts and recommendations
            alerts = []
            recommendations = []

            try:
                if pending_requests.count() > 0:
                    alerts.append({
                        'type': 'warning',
                        'message': f'You have {pending_requests.count()} request(s) waiting for approval'
                    })
                if on_hold_tickets.count() > 0:
                    alerts.append({
                        'type': 'alert',
                        'message': f'{on_hold_tickets.count()} service(s) are on hold - check for details'
                    })
                if active_tickets_count == 0 and active_req_count == 0:
                    recommendations.append({
                        'message': 'No active services - Schedule maintenance or request evaluation',
                        'action': 'Create Request'
                    })
                if requests_count > 10:
                    recommendations.append({
                        'message': 'Consider a service plan for better coverage',
                        'action': 'Learn More'
                    })
            except Exception as e:
                logger.warning(f"Error building alerts: {str(e)}")

            return Response({
                'role': 'client',
                'overview': {
                    'total_requests': requests_count,
                    'active_requests': active_req_count,
                    'active_tickets': active_tickets_count,
                    'completed_services': my_tickets.filter(status='Completed').count() if 'my_tickets' in locals() else 0,
                },
                'status_breakdown': status_stats,
                'performance': {
                    'avg_rating': avg_rating,
                    'total_rated': total_rated
                },
                'active_requests': active_requests_list,
                'active_tickets': active_tickets_list,
                'recent_history': recent_history_list,
                'alerts': alerts,
                'recommendations': recommendations
            })
        except Exception as e:
            logger.exception(f"Critical error in get_client_dashboard: {str(e)}")
            return Response({
                'error': f'Error fetching client dashboard: {str(e)}',
                'role': 'client',
                'overview': {'total_requests': 0, 'active_requests': 0, 'active_tickets': 0, 'completed_services': 0},
                'status_breakdown': {},
                'performance': {'avg_rating': None, 'total_rated': 0},
                'active_requests': [],
                'active_tickets': [],
                'recent_history': [],
                'alerts': [],
                'recommendations': []
            }, status=200)  # Return 200 not 500 to show partial data is better than nothing


class AdminCalendarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_admin_workspace_role(getattr(request.user, 'role', None)):
            return Response({'error': 'You do not have access to the admin calendar.'}, status=status.HTTP_403_FORBIDDEN)
        if not user_has_any_capability(request.user, SUPERVISOR_DISPATCH_CAPABILITIES):
            return Response({'error': 'You do not have access to the admin calendar.'}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.localdate()
        start_date = parse_date(str(request.query_params.get('start') or '')) or today.replace(day=1)
        end_date = parse_date(str(request.query_params.get('end') or '')) or (start_date + timedelta(days=62))
        if end_date < start_date:
            return Response({'error': 'end must be on or after start.'}, status=status.HTTP_400_BAD_REQUEST)

        show_completed = str(request.query_params.get('show_completed') or '').lower() in {'1', 'true', 'yes', 'all'}
        completed_cutoff = today - timedelta(days=30)
        tickets = ServiceTicket.objects.select_related(
            'request',
            'request__client',
            'request__service_type',
            'request__location',
            'technician',
            'assigned_admin',
        ).prefetch_related(
            'crew_assignments__technician',
        ).filter(
            scheduled_date__gte=start_date,
            scheduled_date__lte=end_date,
        ).exclude(
            status='Cancelled',
        ).order_by('scheduled_date', 'scheduled_time', 'id')
        if not show_completed:
            # Keep recent completions visible in the operational calendar while
            # moving older records to the opt-in history view.
            tickets = tickets.exclude(
                status__in=['Completed', 'Turned Over / Accepted'],
                completed_date__date__lt=completed_cutoff,
            )

        ticket_request_ids = set(ServiceTicket.objects.values_list('request_id', flat=True))
        request_fallbacks = ServiceRequest.objects.select_related(
            'client',
            'service_type',
            'location',
        ).filter(
            preferred_date__gte=start_date,
            preferred_date__lte=end_date,
        ).exclude(
            id__in=ticket_request_ids,
        ).order_by('preferred_date', 'id')

        events = [self._serialize_ticket_event(ticket) for ticket in tickets]
        events.extend(self._serialize_request_event(service_request) for service_request in request_fallbacks)
        events.sort(key=lambda event: (event['date'] or '', event.get('time') or '', event['id']))

        return Response({
            'start': start_date.isoformat(),
            'end': end_date.isoformat(),
            'events': events,
        })

    def _calendar_status_for_ticket(self, ticket):
        if ticket.status == 'Cancelled' or ticket.request.status == 'Cancelled':
            return 'cancelled'
        if ticket.status == 'Completed':
            return 'completed'
        if ticket.request.status == 'Pending':
            return 'pending_approval'
        if ticket.status == 'In Progress':
            return 'in_progress'
        if ticket.status == 'For Inspection':
            return 'for_inspection'
        if ticket.status == 'Inspection Completed':
            return 'inspection_completed'
        if get_ticket_dispatch_state(ticket)['is_missed_dispatch']:
            return 'missed_dispatch'
        if ticket.technician_id is None:
            return 'unassigned'
        return 'scheduled'

    def _serialize_ticket_event(self, ticket):
        calendar_status = self._calendar_status_for_ticket(ticket)
        dispatch_state = get_ticket_dispatch_state(ticket)
        assignment_status = 'assigned' if ticket.technician_id else 'unassigned'
        latest_reschedule = (
            ticket.status_history
            .filter(notes__icontains='Schedule confirmed')
            .order_by('-timestamp')
            .first()
        )
        return {
            'id': f'ticket-{ticket.id}',
            'entity_type': 'ticket',
            'ticket_id': ticket.id,
            'request_id': ticket.request_id,
            'client': _display_name(ticket.request.client),
            'client_email': ticket.request.client.email or None,
            'client_phone': ticket.request.client.phone or None,
            'service_type': ticket.request.service_type.name,
            'service_type_color': ticket.request.service_type.color or '#2563eb',
            'estimated_duration': ticket.request.service_type.estimated_duration,
            'date': ticket.scheduled_date.isoformat() if ticket.scheduled_date else None,
            'time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
            'time_slot': ticket.scheduled_time_slot,
            'status': ticket.status,
            'request_status': ticket.request.status,
            'calendar_status': calendar_status,
            'assignment_status': assignment_status,
            'dispatch_status': dispatch_state['status'],
            'dispatch_label': dispatch_state['label'],
            'dispatch_action': dispatch_state['action'],
            'is_missed_dispatch': dispatch_state['is_missed_dispatch'],
            'missed_dispatch_at': dispatch_state['missed_dispatch_at'],
            'priority': ticket.priority or ticket.request.priority,
            'workflow_type': ticket.ticket_type,
            'technician': _display_name(ticket.technician) if ticket.technician else None,
            'assigned_technician': _display_name(ticket.technician) if ticket.technician else None,
            'crew_members': [
                _display_name(assignment.technician)
                for assignment in ticket.crew_assignments.select_related('technician').order_by('created_at', 'id')
            ],
            'assigned_admin': _display_name(ticket.assigned_admin) if ticket.assigned_admin else None,
            'location': _get_request_address(ticket.request),
            'description': ticket.request.description,
            'reschedule_requested': ticket.reschedule_requested,
            'is_rescheduled': latest_reschedule is not None,
            'rescheduled_at': latest_reschedule.timestamp.isoformat() if latest_reschedule else None,
            'scheduling_notes': ticket.request.scheduling_notes,
        }

    def _serialize_request_event(self, service_request):
        return {
            'id': f'request-{service_request.id}',
            'entity_type': 'request',
            'ticket_id': None,
            'request_id': service_request.id,
            'client': _display_name(service_request.client),
            'client_email': service_request.client.email or None,
            'client_phone': service_request.client.phone or None,
            'service_type': service_request.service_type.name,
            'service_type_color': service_request.service_type.color or '#2563eb',
            'estimated_duration': service_request.service_type.estimated_duration,
            'date': service_request.preferred_date.isoformat() if service_request.preferred_date else None,
            'time': None,
            'time_slot': service_request.preferred_time_slot,
            'status': service_request.status,
            'request_status': service_request.status,
            'calendar_status': 'pending_approval' if service_request.status == 'Pending' else 'requested',
            'assignment_status': 'unassigned',
            'priority': service_request.priority,
            'workflow_type': 'request',
            'technician': None,
            'assigned_technician': None,
            'crew_members': [],
            'assigned_admin': None,
            'location': _get_request_address(service_request),
            'description': service_request.description,
            'scheduling_notes': service_request.scheduling_notes,
            'reschedule_requested': False,
        }
