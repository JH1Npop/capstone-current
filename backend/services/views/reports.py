# Auto-split from services/views.py
from services.views.helpers import *  # noqa: F401,F403
from users.permissions import (
    CanViewAdminJobHistory,
    CanViewReports,
    CanViewSupervisorTracking,
)
from django.conf import settings
from django.db.models import Prefetch
from rest_framework.throttling import ScopedRateThrottle


def _bounded_days(request, default=30, minimum=1, maximum=365):
    try:
        days = int(request.query_params.get('days', default))
    except (TypeError, ValueError):
        days = default
    return max(minimum, min(maximum, days))


def _period_start(days):
    return timezone.now().date() - timezone.timedelta(days=days - 1)


def _format_person_name(user):
    if not user:
        return ''
    parts = [
        str(getattr(user, 'first_name', '') or '').strip(),
        str(getattr(user, 'middle_name', '') or '').strip(),
        str(getattr(user, 'last_name', '') or '').strip(),
    ]
    full_name = ' '.join(part for part in parts if part)
    return full_name or getattr(user, 'username', '')

class CoverageHeatmapViewSet(viewsets.ViewSet):
    """Coverage Heatmap - GIS-based visualization showing areas with high concentrations of service requests."""

    def get_permissions(self):
        if self.action == 'completed_jobs':
            return [CanViewAdminJobHistory()]
        return [CanViewSupervisorTracking()]

    @action(detail=False, methods=['get'])
    def service_density(self, request):
        """Get completed service density data for coverage heatmap visualization."""
        client_id = request.query_params.get('client')
        technician_id = request.query_params.get('technician')
        service_type_id = request.query_params.get('service_type')

        # Coverage heatmap is the completed service footprint grouped by location.
        service_requests = ServiceRequest.objects.filter(
            status='Completed'
        ).select_related(
            'client',
            'service_type',
            'location'
        ).prefetch_related(
            Prefetch(
                'serviceticket_set',
                queryset=ServiceTicket.objects.filter(technician__isnull=False).select_related('technician'),
                to_attr='heatmap_tickets'
            )
        )

        if client_id:
            service_requests = service_requests.filter(client_id=client_id)
        if technician_id:
            service_requests = service_requests.filter(serviceticket__technician_id=technician_id).distinct()

        service_options_queryset = ServiceType.objects.filter(
            servicerequest__in=service_requests
        ).distinct().order_by('name')

        if service_type_id:
            service_requests = service_requests.filter(service_type_id=service_type_id)

        # Group by location and count requests
        density_data = {}
        for req in service_requests:
            try:
                loc = req.location
                if loc.latitude and loc.longitude:
                    # Group by 2 decimal places (~1.1km grid) to create meaningful density clusters
                    lat_val = round(float(loc.latitude), 2)
                    lng_val = round(float(loc.longitude), 2)
                    key = f"{lat_val:.2f},{lng_val:.2f}"
                    if key not in density_data:
                        density_data[key] = {
                            'lat': lat_val,
                            'lng': lng_val,
                            'count': 0,
                            'service_breakdown': {},
                            'status_breakdown': {},
                            'clients': {},
                            'technicians': {},
                            'address': loc.address
                        }
                    service_name = req.service_type.name if req.service_type else 'Unknown Service'
                    density_data[key]['count'] += 1
                    density_data[key]['service_breakdown'][service_name] = (
                        density_data[key]['service_breakdown'].get(service_name, 0) + 1
                    )
                    density_data[key]['status_breakdown'][req.status] = (
                        density_data[key]['status_breakdown'].get(req.status, 0) + 1
                    )
                    density_data[key]['clients'][req.client_id] = req.client.get_full_name().strip() or req.client.username
                    for ticket in getattr(req, 'heatmap_tickets', []):
                        density_data[key]['technicians'][ticket.technician_id] = (
                            ticket.technician.get_full_name().strip() or ticket.technician.username
                        )
            except ServiceLocation.DoesNotExist:
                pass

        # Convert to list and add service type info
        heatmap_points = []
        client_options = {}
        technician_options = {}
        for point in density_data.values():
            sorted_services = sorted(
                point['service_breakdown'].items(),
                key=lambda item: (-item[1], item[0])
            )
            point['service_types'] = [service_name for service_name, _count in sorted_services]
            point['service_breakdown'] = [
                {'name': service_name, 'count': count}
                for service_name, count in sorted_services
            ]
            point['status_breakdown'] = [
                {'name': status_name, 'count': count}
                for status_name, count in sorted(
                    point['status_breakdown'].items(),
                    key=lambda item: (-item[1], item[0])
                )
            ]
            point['dominant_service'] = sorted_services[0][0] if sorted_services else 'Unknown Service'
            point['clients'] = [
                {'id': client_id, 'name': name}
                for client_id, name in sorted(point['clients'].items(), key=lambda item: item[1])
            ]
            point['technicians'] = [
                {'id': technician_id, 'name': name}
                for technician_id, name in sorted(point['technicians'].items(), key=lambda item: item[1])
            ]
            client_options.update({item['id']: item['name'] for item in point['clients']})
            technician_options.update({item['id']: item['name'] for item in point['technicians']})
            heatmap_points.append(point)

        return Response({
            'total_points': len(heatmap_points),
            'heatmap_data': heatmap_points,
            'max_density': max([p['count'] for p in heatmap_points]) if heatmap_points else 0,
            'client_options': [
                {'id': option_id, 'name': name}
                for option_id, name in sorted(client_options.items(), key=lambda item: item[1])
            ],
            'technician_options': [
                {'id': option_id, 'name': name}
                for option_id, name in sorted(technician_options.items(), key=lambda item: item[1])
            ],
            'service_options': [
                {'id': service.id, 'name': service.name}
                for service in service_options_queryset
            ],
        })

    @action(detail=False, methods=['get'])
    def technician_coverage(self, request):
        """Get technician coverage areas for overlay on heatmap."""
        technician_id = request.query_params.get('technician')
        technicians = User.objects.filter(
            role='technician',
            status='active',
            technician_profile__current_latitude__isnull=False,
            technician_profile__current_longitude__isnull=False,
        ).select_related('technician_profile')
        if technician_id:
            technicians = technicians.filter(id=technician_id)

        coverage_areas = []
        for tech in technicians:
            profile = tech.technician_profile
            coverage_areas.append({
                'technician_id': tech.id,
                'name': tech.get_full_name().strip() or tech.username,
                'center': [
                    float(profile.current_latitude),
                    float(profile.current_longitude),
                ],
                'is_available': profile.is_available,
                'radius_km': 10,
            })

        return Response({
            'coverage_areas': coverage_areas,
            'total_technicians': len(coverage_areas)
        })

    @action(detail=False, methods=['get'])
    def completed_jobs(self, request):
        """Return all completed jobs with location and checklist data for history/heatmap page."""
        def build_media_url(value):
            raw_value = str(value or '').strip()
            if not raw_value:
                return ''
            if raw_value.startswith(('http://', 'https://', 'data:', 'blob:')):
                return raw_value
            if raw_value.startswith('/'):
                return raw_value
            if raw_value.startswith('media/'):
                return f'/{raw_value}'
            if raw_value.startswith('checklists/'):
                return f'{settings.MEDIA_URL}{raw_value}'
            return raw_value

        def normalize_report_media(media_items):
            normalized = []
            for index, item in enumerate(media_items or []):
                if isinstance(item, dict):
                    url = build_media_url(item.get('url') or item.get('file') or item.get('src') or '')
                    if not url:
                        continue
                    media_type = str(item.get('type') or 'photo').strip().lower()
                    normalized.append({
                        'type': 'video' if media_type == 'video' else 'photo',
                        'name': str(item.get('name') or item.get('filename') or f'Proof {index + 1}').strip(),
                        'url': url,
                    })
                    continue

                url = build_media_url(item)
                if url:
                    normalized.append({
                        'type': 'photo',
                        'name': str(item).split('/')[-1] or f'Proof {index + 1}',
                        'url': url,
                    })
            return normalized

        # Build queryset
        tickets = ServiceTicket.objects.filter(
            status__in=['Completed', 'Turned Over / Accepted']
        ).select_related(
            'request__service_type',
            'request__client',
            'request__location',
            'technician',
            'inspection',
            'maintenance_schedule',
        ).prefetch_related(
            'installed_equipment',
            'field_service_reports',
            'crew_assignments__technician',
            'inventory_reservations__item',
            'inventory_reservations__technician',
            'after_sales_cases',
            'generated_documents',
            'status_history__changed_by',
        )

        # Filters
        days = request.query_params.get('days')
        if days:
            start_date = _period_start(_bounded_days(request))
            tickets = tickets.filter(
                Q(completed_date__date__gte=start_date) | Q(scheduled_date__gte=start_date)
            )

        service_type_id = request.query_params.get('service_type')
        if service_type_id:
            tickets = tickets.filter(request__service_type_id=service_type_id)

        search = request.query_params.get('search', '').strip()
        if search:
            tickets = tickets.filter(build_ticket_search_query(search))

        option_tickets = tickets.prefetch_related(None)

        client_id = request.query_params.get('client')
        if client_id:
            tickets = tickets.filter(request__client_id=client_id)

        technician_id = request.query_params.get('technician')
        if technician_id:
            tickets = tickets.filter(technician_id=technician_id)

        ordering_map = {
            'ticket_id': 'id',
            'client': 'request__client__last_name',
            'service_type': 'request__service_type__name',
            'technician': 'technician__last_name',
            'client_rating': 'client_rating',
            'completed_date': 'completed_date',
        }
        ordering_key = request.query_params.get('ordering', 'completed_date')
        ordering_field = ordering_map.get(ordering_key, 'completed_date')
        ordering_direction = request.query_params.get('direction', 'desc')
        if ordering_direction != 'asc':
            ordering_field = f'-{ordering_field}'

        filtered_tickets = tickets
        total_results = filtered_tickets.count()
        try:
            page_size = int(request.query_params.get('page_size', 10))
        except (TypeError, ValueError):
            page_size = 10
        page_size = max(1, min(page_size, 100))
        total_pages = max(1, (total_results + page_size - 1) // page_size)
        try:
            page = int(request.query_params.get('page', 1))
        except (TypeError, ValueError):
            page = 1
        page = max(1, min(page, total_pages))
        page_start = (page - 1) * page_size
        tickets = filtered_tickets.order_by(ordering_field, '-id')[page_start:page_start + page_size]

        # Build response
        results = []
        for ticket in tickets:
            req = ticket.request
            loc = getattr(req, 'location', None)
            tech = ticket.technician

            # Checklist / inspection data
            inspection = None
            try:
                insp = ticket.inspection
                proof_media = normalize_report_media(insp.proof_media)
                inspection = {
                    'is_completed': insp.is_completed,
                    'site_accessible': insp.site_accessible,
                    'electrical_available': insp.electrical_available,
                    'electrical_adequate': insp.electrical_adequate,
                    'safety_equipment_present': insp.safety_equipment_present,
                    'roof_condition': insp.roof_condition,
                    'recommendation': insp.recommendation,
                    'maintenance_required': insp.maintenance_required,
                    'maintenance_profile': insp.maintenance_profile,
                    'maintenance_interval_days': insp.maintenance_interval_days,
                    'maintenance_notes': insp.maintenance_notes,
                    'warranty_provided': insp.warranty_provided,
                    'warranty_period_days': insp.warranty_period_days,
                    'warranty_notes': insp.warranty_notes,
                    'follow_up_required': insp.follow_up_required,
                    'follow_up_case_type': insp.follow_up_case_type,
                    'follow_up_summary': insp.follow_up_summary,
                    'follow_up_due_date': str(insp.follow_up_due_date) if insp.follow_up_due_date else None,
                    'checklist_items': insp.checklist_items or [],
                    'proof_media': proof_media,
                    'proof_media_count': len(proof_media),
                    'additional_notes': insp.additional_notes,
                    'safety_hazards': insp.safety_hazards,
                    'structural_assessment': insp.structural_assessment,
                }
            except InspectionChecklist.DoesNotExist:
                pass

            installed_equipment = [
                {
                    'id': equipment.id,
                    'brand_model': equipment.brand_model,
                    'equipment_type': equipment.equipment_type,
                    'serial_number': equipment.serial_number,
                    'capacity': equipment.capacity,
                    'location': equipment.location,
                    'warranty_start': str(equipment.warranty_start) if equipment.warranty_start else None,
                    'warranty_end': str(equipment.warranty_end) if equipment.warranty_end else None,
                }
                for equipment in ticket.installed_equipment.all()
            ]
            field_service_reports = [
                {
                    'id': report.id,
                    'indoor_temp': report.indoor_temp,
                    'outdoor_temp': report.outdoor_temp,
                    'ampere_reading': report.ampere_reading,
                    'voltage_reading': report.voltage_reading,
                    'before_service_readings': report.before_service_readings,
                    'after_service_readings': report.after_service_readings,
                    'brand_model': report.brand_model,
                    'serial_number': report.serial_number,
                    'recommendation': report.recommendation,
                    'client_acknowledged': report.client_acknowledged,
                    'client_signature_date': str(report.client_signature_date) if report.client_signature_date else None,
                    'created_at': report.created_at,
                }
                for report in ticket.field_service_reports.all()
            ]

            try:
                maintenance = ticket.maintenance_schedule
                maintenance_schedule = {
                    'id': maintenance.id,
                    'maintenance_profile': maintenance.maintenance_profile,
                    'interval_days': maintenance.interval_days,
                    'next_due_date': maintenance.next_due_date,
                    'notify_on_date': maintenance.notify_on_date,
                    'status': maintenance.status,
                    'maintenance_notes': maintenance.maintenance_notes,
                    'risk_level': maintenance.risk_level,
                }
            except Exception:
                maintenance_schedule = None

            duration_minutes = None
            if ticket.start_time and ticket.end_time:
                duration_minutes = max(0, round((ticket.end_time - ticket.start_time).total_seconds() / 60))

            results.append({
                'id': ticket.id,
                'ticket_id': ticket.id,
                'client_id': req.client_id,
                'client': _format_person_name(req.client),
                'client_username': req.client.username,
                'technician_id': tech.id if tech else None,
                'technician': _format_person_name(tech) if tech else 'Unassigned',
                'technician_username': tech.username if tech else None,
                'service_type': req.service_type.name if req.service_type else 'Unknown',
                'service_type_id': req.service_type_id,
                'priority': ticket.priority,
                'status': ticket.status,
                'scheduled_date': str(ticket.scheduled_date) if ticket.scheduled_date else None,
                'scheduled_time': str(ticket.scheduled_time) if ticket.scheduled_time else None,
                'start_time': ticket.start_time,
                'end_time': ticket.end_time,
                'duration_minutes': duration_minutes,
                'completed_date': str(ticket.completed_date) if ticket.completed_date else None,
                'address': loc.address if loc else '',
                'city': loc.city if loc else '',
                'province': loc.province if loc else '',
                'latitude': float(loc.latitude) if loc and loc.latitude else None,
                'longitude': float(loc.longitude) if loc and loc.longitude else None,
                'client_rating': ticket.client_rating,
                'client_feedback': ticket.client_feedback,
                'warranty_status': ticket.warranty_status,
                'warranty_start_date': ticket.warranty_start_date,
                'warranty_end_date': ticket.warranty_end_date,
                'warranty_notes': ticket.warranty_notes,
                'completion_proof_images': normalize_report_media(ticket.completion_proof_images),
                'completion_notes': ticket.completion_notes,
                'crew_members': serialize_ticket_crew_members(ticket, use_prefetch=True),
                'inventory_reservations': serialize_ticket_inventory(ticket, use_prefetch=True),
                'installed_equipment': installed_equipment,
                'field_service_reports': field_service_reports,
                'inspection': inspection,
                'maintenance_schedule': maintenance_schedule,
                'after_sales_cases': [
                    {
                        'id': case.id,
                        'case_type': case.case_type,
                        'status': case.status,
                        'priority': case.priority,
                        'summary': case.summary,
                        'due_date': case.due_date,
                    }
                    for case in ticket.after_sales_cases.all()
                ],
                'generated_documents': [
                    {
                        'id': document.id,
                        'document_type': document.document_type,
                        'title': document.title or document.get_document_type_display(),
                        'status': document.status,
                        'updated_at': document.updated_at,
                    }
                    for document in ticket.generated_documents.all()
                ],
                'timeline': [
                    {
                        'id': event.id,
                        'status': event.status,
                        'changed_by': _format_person_name(event.changed_by) if event.changed_by else 'System',
                        'notes': event.notes or '',
                        'timestamp': event.timestamp,
                    }
                    for event in sorted(ticket.status_history.all(), key=lambda item: item.timestamp, reverse=True)
                ],
            })

        # Aggregate stats
        unique_locations = filtered_tickets.exclude(
            request__location__latitude__isnull=True
        ).exclude(
            request__location__longitude__isnull=True
        ).values(
            'request__location__latitude', 'request__location__longitude'
        ).distinct().count()
        service_types_served = filtered_tickets.values('request__service_type_id').distinct().count()
        jobs_with_checklist = filtered_tickets.filter(inspection__isnull=False).count()
        jobs_with_warranty = filtered_tickets.filter(inspection__warranty_provided=True).count()
        rated_jobs = filtered_tickets.filter(client_rating__isnull=False).count()
        client_options = {}
        technician_options = {}
        for ticket in option_tickets:
            req = ticket.request
            tech = ticket.technician
            client_options[req.client_id] = _format_person_name(req.client)
            if tech:
                technician_options[tech.id] = _format_person_name(tech)

        return Response({
            'total': total_results,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'unique_locations': unique_locations,
            'service_types_served': service_types_served,
            'jobs_with_checklist': jobs_with_checklist,
            'jobs_with_warranty': jobs_with_warranty,
            'rated_jobs': rated_jobs,
            'client_options': [
                {'id': option_id, 'name': name}
                for option_id, name in sorted(client_options.items(), key=lambda item: item[1])
            ],
            'technician_options': [
                {'id': option_id, 'name': name}
                for option_id, name in sorted(technician_options.items(), key=lambda item: item[1])
            ],
            'results': results,
        })


class ORSViewSet(viewsets.ViewSet):
    """ViewSet that proxies various OpenRouteService endpoints."""
    # Require authentication to prevent abuse of the server-side ORS API key.
    permission_classes = [permissions.IsAuthenticated]

    def get_throttles(self):
        self.throttle_scope = 'route_api'
        return [ScopedRateThrottle()]

    def _call_helper(self, helper_name, *args, **kwargs):
        """Convenience wrapper to import helpers dynamically."""
        from services import ors_utils
        helper = getattr(ors_utils, helper_name)
        return helper(*args, **kwargs)

    @action(detail=False, methods=['get'])
    def route(self, request):
        """Simple two-point routing via query parameters."""
        start = request.query_params.get('start')
        end = request.query_params.get('end')
        if not start or not end:
            return Response({'error': 'start and end parameters required'}, status=400)
        try:
            start_coords = tuple(map(float, start.split(',')))
            end_coords = tuple(map(float, end.split(',')))
        except ValueError:
            return Response({'error': 'invalid coordinate format'}, status=400)
        if len(start_coords) != 2 or len(end_coords) != 2:
            return Response({'error': 'coordinates must be lng,lat pairs'}, status=400)

        try:
            result = self._call_helper('get_route', start_coords, end_coords)
        except Exception as e:
            logger.error(f"ORS routing error for {start_coords} -> {end_coords}: {type(e).__name__}: {e}", exc_info=True)
            return Response({'error': 'routing request failed', 'details': str(e)}, status=502)
        return Response(result)

    @action(detail=False, methods=['post'])
    def directions(self, request):
        """POST wrapper for /directions endpoint.

        Expected JSON body includes:
          profile: str
          coordinates: [[lng,lat], ...]
          any other ORS options
        """
        data = request.data
        profile = data.get('profile')
        coords = data.get('coordinates')
        if not profile or not coords:
            return Response({'error': 'profile and coordinates required'}, status=400)
        try:
            result = self._call_helper('get_directions', coords, profile, **{k: v for k, v in data.items() if k not in ['profile', 'coordinates']})
        except Exception as e:
            return Response({'error': 'directions request failed', 'details': str(e)}, status=502)
        return Response(result)

    @action(detail=False, methods=['post'])
    def isochrones(self, request):
        data = request.data
        profile = data.get('profile')
        locations = data.get('locations')
        if not profile or not locations:
            return Response({'error': 'profile and locations required'}, status=400)
        try:
            result = self._call_helper('get_isochrones', locations, profile, **{k: v for k, v in data.items() if k not in ['profile', 'locations']})
        except Exception as e:
            return Response({'error': 'isochrones request failed', 'details': str(e)}, status=502)
        return Response(result)

    @action(detail=False, methods=['post'])
    def matrix(self, request):
        data = request.data
        profile = data.get('profile')
        locations = data.get('locations')
        if not profile or not locations:
            return Response({'error': 'profile and locations required'}, status=400)
        try:
            result = self._call_helper('get_matrix', locations, profile, **{k: v for k, v in data.items() if k not in ['profile', 'locations']})
        except Exception as e:
            return Response({'error': 'matrix request failed', 'details': str(e)}, status=502)
        return Response(result)

    @action(detail=False, methods=['post'])
    def snap(self, request):
        data = request.data
        profile = data.get('profile')
        coords = data.get('coordinates')
        if not profile or not coords:
            return Response({'error': 'profile and coordinates required'}, status=400)
        try:
            result = self._call_helper('snap_points', coords, profile, **{k: v for k, v in data.items() if k not in ['profile', 'coordinates']})
        except Exception as e:
            return Response({'error': 'snap request failed', 'details': str(e)}, status=502)
        return Response(result)
