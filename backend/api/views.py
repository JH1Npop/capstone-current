"""
Standalone tracking and checklist views.
Extracted from api/urls.py to keep URL configuration clean.
"""
import logging
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.core.cache import cache
from django.db import DatabaseError, connection, transaction
from django.db.models import OuterRef, Subquery
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework import permissions, status
from rest_framework.throttling import UserRateThrottle

from services.models import ServiceTicket, InspectionChecklist, TechnicianLocationHistory
from services.tracking_config import get_tracking_config
from services.views.helpers import (
    ACTIVE_TICKET_STATUSES,
    _display_name,
    get_visible_service_tickets_queryset,
    normalize_proof_media_payload,
    save_uploaded_proof_media,
    sync_ticket_maintenance_schedule,
)
from services.maintenance import MAINTENANCE_RULES, resolve_interval_days
from users.models import User, Management, Technician, Client, AdminSettings
from users.rbac import (
    SUPERVISOR_TRACKING_CAPABILITIES,
    is_admin_workspace_role,
    user_has_any_capability,
)

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def public_landing_page_settings_view(request):
    """Return only content that is safe to render on the public landing page."""
    settings_obj = AdminSettings.objects.order_by('id').first() or AdminSettings()
    today = timezone.localdate().isoformat()
    active_promotions = []
    for promotion in settings_obj.landing_page_promotions or []:
        if not isinstance(promotion, dict) or not promotion.get('active', True):
            continue
        start_date = str(promotion.get('startDate') or '')
        end_date = str(promotion.get('endDate') or '')
        if start_date and start_date > today:
            continue
        if end_date and end_date < today:
            continue
        active_promotions.append({key: value for key, value in promotion.items() if key != 'imageAssetId'})

    published_projects = []
    public_project_fields = ('id', 'title', 'serviceType', 'location', 'completedDate', 'description', 'imageUrl')
    for project in settings_obj.landing_page_projects or []:
        if not isinstance(project, dict):
            continue
        if not project.get('published') or not project.get('clientConsentConfirmed'):
            continue
        if not all(project.get(field) for field in ('title', 'serviceType', 'location', 'completedDate', 'description', 'imageUrl')):
            continue
        published_projects.append({field: project.get(field) for field in public_project_fields})

    return Response({
        'companyName': settings_obj.company_name,
        'landingPageContent': settings_obj.landing_page_content,
        'solarCalculatorSettings': settings_obj.solar_calculator_settings,
        'landingPagePromotions': active_promotions,
        'landingPageProjects': published_projects,
    })


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def database_health_view(request):
    """Report readiness only after Django can execute a database query."""
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except DatabaseError:
        logger.warning('Database readiness check failed.', exc_info=True)
        return Response({'status': 'unavailable'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return Response({'status': 'ready'})


class GeocodeThrottle(UserRateThrottle):
    rate = '30/min'

FOLLOW_UP_CASE_TYPES = {
    choice[0]
    for choice in InspectionChecklist.FOLLOW_UP_CASE_TYPE_CHOICES
}
AFTER_SALES_DECISIONS = {'none', 'warranty_only', 'create_case'}

NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org'
NOMINATIM_USER_AGENT = 'AFNServiceManagement/1.0'
CACHE_TTL_SECONDS = 60 * 60 * 24


def _fetch_nominatim(path, params):
    encoded_params = urlencode(params)
    cache_key = f'nominatim:{path}:{encoded_params}'
    cached_response = cache.get(cache_key)
    if cached_response is not None:
        return cached_response

    request = Request(
        f'{NOMINATIM_BASE_URL}/{path}?{encoded_params}',
        headers={'User-Agent': NOMINATIM_USER_AGENT},
    )
    with urlopen(request, timeout=8) as response:
        payload = json.loads(response.read().decode('utf-8'))

    cache.set(cache_key, payload, CACHE_TTL_SECONDS)
    return payload


def _clean_geocode_result(result):
    return {
        'lat': result.get('lat'),
        'lon': result.get('lon'),
        'display_name': result.get('display_name'),
        'address': result.get('address') or {},
        'name': result.get('name') or '',
        'type': result.get('type') or '',
        'importance': result.get('importance'),
    }


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes([GeocodeThrottle])
def geocode_search_view(request):
    query = str(request.query_params.get('q') or '').strip()
    if len(query) < 2:
        return Response({'results': []})

    try:
        limit = int(request.query_params.get('limit') or 5)
    except (TypeError, ValueError):
        return Response({'error': 'limit must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

    params = {
        'format': 'json',
        'q': query,
        'limit': max(1, min(limit, 10)),
        'addressdetails': 1,
    }
    viewbox = str(request.query_params.get('viewbox') or '').strip()
    if viewbox:
        params['viewbox'] = viewbox
        params['bounded'] = request.query_params.get('bounded') or '1'

    try:
        payload = _fetch_nominatim('search', params)
    except Exception as exc:
        logger.warning('Geocode search failed: %s', exc)
        return Response({'error': 'Location search is temporarily unavailable.'}, status=status.HTTP_502_BAD_GATEWAY)

    return Response({'results': [_clean_geocode_result(item) for item in payload]})


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes([GeocodeThrottle])
def geocode_reverse_view(request):
    lat = request.query_params.get('lat')
    lon = request.query_params.get('lon') or request.query_params.get('lng')
    if lat in [None, ''] or lon in [None, '']:
        return Response({'error': 'lat and lon are required.'}, status=status.HTTP_400_BAD_REQUEST)

    params = {
        'format': 'json',
        'lat': lat,
        'lon': lon,
        'addressdetails': 1,
    }

    try:
        payload = _fetch_nominatim('reverse', params)
    except Exception as exc:
        logger.warning('Reverse geocode failed: %s', exc)
        return Response({'error': 'Reverse geocoding is temporarily unavailable.'}, status=status.HTTP_502_BAD_GATEWAY)

    return Response(_clean_geocode_result(payload))


def _parse_json_field(value, default):
    if value in [None, '']:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _get_request_list(request, key):
    if hasattr(request.data, 'getlist'):
        values = [value for value in request.data.getlist(key) if value not in [None, '']]
        if values:
            return values
    value = request.data.get(key, [])
    if isinstance(value, list):
        return value
    parsed_value = _parse_json_field(value, None)
    if isinstance(parsed_value, list):
        return parsed_value
    return [value] if value not in [None, ''] else []


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def tracking_view(request):
    """Get technician and service request locations for tracking map"""
    if not is_admin_workspace_role(request.user.role):
        return Response({'error': 'You do not have access to tracking.'}, status=status.HTTP_403_FORBIDDEN)
    if not user_has_any_capability(request.user, SUPERVISOR_TRACKING_CAPABILITIES):
        return Response({'error': 'You do not have access to tracking.'}, status=status.HTTP_403_FORBIDDEN)

    generated_at = timezone.now()
    online_cutoff = generated_at - timezone.timedelta(minutes=5)

    latest_location = TechnicianLocationHistory.objects.filter(
        technician_id=OuterRef('pk')
    ).order_by('-timestamp', '-id')

    # Get technician markers
    technicians = User.objects.filter(
        role='technician',
        status='active',
    ).select_related('technician_profile').annotate(
        last_location_accuracy=Subquery(latest_location.values('accuracy')[:1]),
    )

    tech_markers = []
    for tech in technicians:
        last_location_update = tech.technician_profile.last_location_update
        has_recent_gps = bool(last_location_update and last_location_update >= online_cutoff)
        if not has_recent_gps:
            tracking_status = 'offline'
        else:
            tracking_status = 'available' if tech.technician_profile.is_available else 'on_job'

        lat = tech.technician_profile.current_latitude
        lng = tech.technician_profile.current_longitude
        has_coordinates = lat is not None and lng is not None
        gps_state = 'fresh' if has_recent_gps and has_coordinates else ('stale' if has_coordinates else 'missing')

        tech_markers.append({
            'id': tech.id,
            'name': _display_name(tech),
            'email': tech.email or '',
            'phone': tech.phone or '',
            'lat': float(lat) if lat is not None else None,
            'lng': float(lng) if lng is not None else None,
            'status': tracking_status,
            'gpsState': gps_state,
            'gpsAccuracy': tech.last_location_accuracy,
            'isAvailable': tech.technician_profile.is_available,
            'lastLocationUpdate': (
                last_location_update.isoformat() if last_location_update else None
            ),
            'activeJobs': [],
        })

    # Get ticket markers for pending/assigned tickets
    ticket_markers = []
    base_ticket_queryset = ServiceTicket.objects.filter(
        status__in=ACTIVE_TICKET_STATUSES
    ).select_related(
        'request__location',
        'request__service_type',
        'request__client',
        'technician',
    ).prefetch_related('crew_assignments__technician')
    tickets = base_ticket_queryset

    for ticket in tickets:
        try:
            loc = getattr(ticket.request, 'location', None)
            
            lat = float(loc.latitude) if loc and loc.latitude is not None else None
            lng = float(loc.longitude) if loc and loc.longitude is not None else None

            crew_members = []
            if ticket.technician_id:
                crew_members.append({
                    'id': ticket.technician_id,
                    'name': _display_name(ticket.technician),
                    'role': 'lead',
                })

            for assignment in ticket.crew_assignments.all():
                technician = assignment.technician
                if not technician or technician.id == ticket.technician_id:
                    continue
                crew_members.append({
                    'id': technician.id,
                    'name': _display_name(technician),
                    'role': 'crew',
                })

            ticket_markers.append({
                'id': ticket.id,
                'client': _display_name(ticket.request.client) if ticket.request.client else 'Unknown',
                'service': ticket.request.service_type.name if ticket.request.service_type else 'Service',
                'lat': lat,
                'lng': lng,
                'locationDesc': (loc.address if loc else None) or 'Service Location',
                'city': (loc.city if loc else '') or '',
                'province': (loc.province if loc else '') or '',
                'status': ticket.status.lower().replace(' ', '_'),
                'priority': ticket.priority,
                'scheduledDate': ticket.scheduled_date.isoformat() if ticket.scheduled_date else None,
                'scheduledTime': ticket.scheduled_time.isoformat() if ticket.scheduled_time else None,
                'technicianId': ticket.technician_id,
                'technicianName': _display_name(ticket.technician) if ticket.technician else '',
                'leadTechnician': _display_name(ticket.technician) if ticket.technician else '',
                'crewMembers': crew_members,
                'crewCount': len(crew_members),
                'routeGeometry': ticket.route_geometry,
                'routeDistance': ticket.route_distance,
                'routeDuration': ticket.route_duration,
            })
        except Exception as e:
            logger.debug('Skipping ticket %s in tracking: %s', ticket.id, e)

    technicians_by_id = {marker['id']: marker for marker in tech_markers}
    for ticket in ticket_markers:
        job_summary = {
            'id': ticket['id'],
            'service': ticket['service'],
            'client': ticket['client'],
            'status': ticket['status'],
            'priority': ticket['priority'],
            'scheduledDate': ticket['scheduledDate'],
            'scheduledTime': ticket['scheduledTime'],
            'locationDesc': ticket['locationDesc'],
        }
        for member in ticket['crewMembers']:
            technician_marker = technicians_by_id.get(member['id'])
            if technician_marker is not None:
                technician_marker['activeJobs'].append(job_summary)
                if technician_marker['gpsState'] == 'fresh':
                    technician_marker['status'] = 'on_job'

    return Response({
        'techMarkers': tech_markers,
        'ticketMarkers': ticket_markers,
        'generatedAt': generated_at.isoformat(),
        'onlineThresholdMinutes': 5,
        'trackingConfig': get_tracking_config(),
    })


@api_view(['POST'])
@permission_classes([permissions.IsAuthenticated])
@transaction.atomic
def checklist_view(request):
    """Compatibility endpoint for technician checklist submissions."""
    if request.user.role != 'technician':
        return Response({'error': 'Only technicians can submit checklists'}, status=403)

    ticket_id = request.data.get('jobId') or request.data.get('ticketId')
    if not ticket_id:
        return Response({'error': 'jobId is required'}, status=400)

    try:
        ticket = get_visible_service_tickets_queryset(
            request.user,
            base_queryset=ServiceTicket.objects.all(),
        ).select_for_update().get(id=ticket_id)
    except ServiceTicket.DoesNotExist:
        return Response({'error': 'Ticket not found'}, status=404)

    if ticket.status in {'Completed', 'Turned Over / Accepted', 'Cancelled'}:
        return Response(
            {'error': 'This job is already closed, so its checklist can no longer be edited.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    completed = _parse_json_field(request.data.get('completed', {}), {}) or {}
    if not isinstance(completed, dict):
        return Response({'completed': 'Checklist completion data must be a JSON object.'}, status=400)

    notes = request.data.get('notes', '')
    photos = _get_request_list(request, 'photos')
    videos = _get_request_list(request, 'videos')
    proof_media = _parse_json_field(request.data.get('proof_media', []), []) or []
    if not isinstance(proof_media, list):
        return Response({'proof_media': 'Proof media must be provided as a list.'}, status=400)
    checklist_items = _parse_json_field(request.data.get('checklist_items', []), []) or []
    if checklist_items and not isinstance(checklist_items, list):
        return Response({'checklist_items': 'Checklist items must be provided as a list.'}, status=400)
    required_equipment_snapshot = _parse_json_field(request.data.get('required_equipment_snapshot', []), []) or []
    if required_equipment_snapshot and not isinstance(required_equipment_snapshot, list):
        return Response({'required_equipment_snapshot': 'Required equipment must be provided as a list.'}, status=400)

    all_complete = all(bool(value) for value in completed.values()) if completed else False
    if not checklist_items and completed:
        checklist_items = [
            {
                'index': int(index) if str(index).isdigit() else index,
                'label': f'Checklist item {int(index) + 1}' if str(index).isdigit() else str(index),
                'completed': bool(value),
            }
            for index, value in sorted(completed.items(), key=lambda item: int(item[0]) if str(item[0]).isdigit() else str(item[0]))
        ]
    maintenance_required = str(request.data.get('maintenance_required', '')).lower() in {'true', '1', 'yes'} if isinstance(request.data.get('maintenance_required'), str) else bool(request.data.get('maintenance_required'))
    maintenance_profile = request.data.get('maintenance_profile') or None
    maintenance_interval_days = request.data.get('maintenance_interval_days') or None
    maintenance_notes = request.data.get('maintenance_notes', '')
    service_type_label = request.data.get('serviceType') or request.data.get('service_type_label') or None
    procedure_source = request.data.get('procedure_source') or None
    warranty_provided = str(request.data.get('warranty_provided', '')).lower() in {'true', '1', 'yes'} if isinstance(request.data.get('warranty_provided'), str) else bool(request.data.get('warranty_provided'))
    warranty_period_days = request.data.get('warranty_period_days') or None
    warranty_notes = request.data.get('warranty_notes', '')
    after_sales_decision = request.data.get('after_sales_decision') or None
    follow_up_required = str(request.data.get('follow_up_required', '')).lower() in {'true', '1', 'yes'} if isinstance(request.data.get('follow_up_required'), str) else bool(request.data.get('follow_up_required'))
    follow_up_case_type = request.data.get('follow_up_case_type') or None
    follow_up_due_date = request.data.get('follow_up_due_date') or None
    follow_up_summary = str(request.data.get('follow_up_summary', '')).strip() or None
    follow_up_details = str(request.data.get('follow_up_details', '')).strip() or None

    if maintenance_required and not maintenance_profile:
        return Response({'maintenance_profile': 'Maintenance profile is required.'}, status=400)
    if maintenance_profile and maintenance_profile not in MAINTENANCE_RULES:
        return Response({'maintenance_profile': 'Unsupported maintenance profile.'}, status=400)

    if maintenance_interval_days not in (None, ''):
        try:
            maintenance_interval_days = int(maintenance_interval_days)
        except (TypeError, ValueError):
            return Response({'maintenance_interval_days': 'Maintenance interval must be a number.'}, status=400)
        if maintenance_interval_days <= 0:
            return Response({'maintenance_interval_days': 'Maintenance interval must be greater than zero.'}, status=400)
    elif maintenance_required and maintenance_profile:
        maintenance_interval_days = resolve_interval_days(maintenance_profile)

    if warranty_period_days not in (None, ''):
        try:
            warranty_period_days = int(warranty_period_days)
        except (TypeError, ValueError):
            return Response({'warranty_period_days': 'Warranty period must be a number.'}, status=400)
        if warranty_period_days <= 0:
            return Response({'warranty_period_days': 'Warranty period must be greater than zero.'}, status=400)
    elif warranty_provided:
        return Response({'warranty_period_days': 'Warranty period is required.'}, status=400)

    if after_sales_decision and after_sales_decision not in AFTER_SALES_DECISIONS:
        return Response({'after_sales_decision': 'Unsupported after-sales result.'}, status=400)
    if after_sales_decision == 'none' and (warranty_provided or follow_up_required):
        return Response({'after_sales_decision': 'No after-sales action cannot include warranty or a handoff case.'}, status=400)
    if after_sales_decision == 'warranty_only' and (not warranty_provided or follow_up_required):
        return Response({'after_sales_decision': 'Warranty only must include warranty coverage without a handoff case.'}, status=400)
    if after_sales_decision == 'create_case' and not follow_up_required:
        return Response({'after_sales_decision': 'Create after-sales case requires handoff details.'}, status=400)

    if follow_up_case_type == 'maintenance':
        return Response({'follow_up_case_type': 'Use the maintenance section for maintenance reminders.'}, status=400)
    if follow_up_case_type and follow_up_case_type not in FOLLOW_UP_CASE_TYPES:
        return Response({'follow_up_case_type': 'Unsupported after-sales case type.'}, status=400)
    if follow_up_required and not follow_up_case_type:
        return Response({'follow_up_case_type': 'Follow-up case type is required.'}, status=400)
    if follow_up_required and not follow_up_summary:
        return Response({'follow_up_summary': 'Follow-up summary is required.'}, status=400)
    if follow_up_case_type == 'warranty' and not warranty_provided:
        return Response({'follow_up_case_type': 'Warranty follow-up requires warranty coverage.'}, status=400)
    if follow_up_due_date not in (None, ''):
        follow_up_due_date = parse_date(str(follow_up_due_date))
        if follow_up_due_date is None:
            return Response({'follow_up_due_date': 'Follow-up due date must be a valid date.'}, status=400)
        if follow_up_due_date < timezone.localdate():
            return Response({'follow_up_due_date': 'Follow-up due date cannot be in the past.'}, status=400)
    else:
        follow_up_due_date = None

    normalized_proof_media = normalize_proof_media_payload(
        photos=photos,
        videos=videos,
        media=proof_media,
    )

    uploaded_proof_media = []
    if hasattr(request.FILES, 'getlist'):
        uploaded_proof_media.extend(
            save_uploaded_proof_media(
                ticket=ticket,
                uploaded_files=request.FILES.getlist('photo_files'),
                request=request,
                media_type='photo',
            )
        )
        uploaded_proof_media.extend(
            save_uploaded_proof_media(
                ticket=ticket,
                uploaded_files=request.FILES.getlist('video_files'),
                request=request,
                media_type='video',
            )
        )

    normalized_proof_media += uploaded_proof_media

    checklist, _ = InspectionChecklist.objects.update_or_create(
        ticket=ticket,
        defaults={
            'is_completed': all_complete,
            'completed_at': timezone.now() if all_complete else None,
            'completed_by': request.user if all_complete else None,
            'submitted_by': request.user,
            'submitted_at': timezone.now(),
            'site_accessible': all_complete,
            'electrical_available': all_complete,
            'electrical_adequate': all_complete,
            'safety_equipment_present': all_complete,
            'recommendation': 'Approved' if all_complete else 'Pending',
            'additional_notes': notes,
            'maintenance_required': maintenance_required,
            'maintenance_profile': maintenance_profile,
            'maintenance_interval_days': maintenance_interval_days,
            'maintenance_notes': maintenance_notes,
            'service_type_label': service_type_label,
            'procedure_source': procedure_source,
            'checklist_items': checklist_items,
            'required_equipment_snapshot': required_equipment_snapshot,
            'proof_media': normalized_proof_media,
            'warranty_provided': warranty_provided,
            'warranty_period_days': warranty_period_days,
            'warranty_notes': warranty_notes,
            'follow_up_required': follow_up_required,
            'follow_up_case_type': follow_up_case_type,
            'follow_up_due_date': follow_up_due_date,
            'follow_up_summary': follow_up_summary,
            'follow_up_details': follow_up_details,
        }
    )
    sync_ticket_maintenance_schedule(ticket)
    return Response({
        'status': 'Checklist submitted',
        'checklist_id': checklist.id,
        'proof_media_count': len(normalized_proof_media),
    })
