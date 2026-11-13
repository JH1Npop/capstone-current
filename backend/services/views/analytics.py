# Auto-split from services/views.py
from collections import defaultdict
from zoneinfo import ZoneInfo

from services.views.helpers import *  # noqa: F401,F403
from users.analytics_service import ACTIVE_TICKET_STATUSES, COMPLETED_TICKET_STATUSES


def _bounded_days(request, default=30, minimum=1, maximum=365):
    try:
        days = int(request.query_params.get('days', default))
    except (TypeError, ValueError):
        days = default
    return max(minimum, min(maximum, days))


def _period_start(today, days):
    return today - timezone.timedelta(days=days - 1)

class GISDashboardView(viewsets.ViewSet):
    """Geographic Information System (GIS) Dashboard - Mapping component for visualizing geographic service data."""
    permission_classes = [CanViewSupervisorTracking]

    @action(detail=False, methods=['get'])
    def dashboard_data(self, request):
        """Get all data for GIS dashboard"""
        # Get all technicians with locations
        technicians = User.objects.filter(
            role='technician',
            status='active',
            is_active=True,
            technician_profile__current_latitude__isnull=False,
            technician_profile__current_longitude__isnull=False,
        ).select_related('technician_profile')

        technicians_data = [
            {
                'id': technician.id,
                'username': technician.username,
                'current_latitude': technician.technician_profile.current_latitude,
                'current_longitude': technician.technician_profile.current_longitude,
                'is_available': technician.technician_profile.is_available,
            }
            for technician in technicians
        ]

        # Get all pending service requests with locations
        pending_requests = ServiceRequest.objects.filter(
            status__in=['Pending', 'Approved']
        ).select_related('client', 'service_type')

        requests_data = []
        for req in pending_requests:
            try:
                location = req.location
                requests_data.append({
                    'id': req.id,
                    'service_type': req.service_type.name,
                    'client': req.client.username,
                    'priority': req.priority,
                    'status': req.status,
                    'latitude': location.latitude,
                    'longitude': location.longitude,
                    'address': location.address
                })
            except ServiceLocation.DoesNotExist:
                pass

        # Get all active tickets
        active_tickets = ServiceTicket.objects.filter(
            status__in=ACTIVE_TICKET_STATUSES
        ).select_related('technician', 'request__service_type')

        tickets_data = []
        for ticket in active_tickets:
            try:
                location = ticket.request.location
                tickets_data.append({
                    'id': ticket.id,
                    'service_type': ticket.request.service_type.name,
                    'technician': ticket.technician.username if ticket.technician else None,
                    'status': ticket.status,
                    'latitude': location.latitude,
                    'longitude': location.longitude
                })
            except ServiceLocation.DoesNotExist:
                pass

        return Response({
            'technicians': technicians_data,
            'service_requests': requests_data,
            'active_tickets': tickets_data
        })

    @action(detail=False, methods=['get'])
    def heatmap_data(self, request):
        """Get data for Coverage Heatmap - GIS-based visualization of service request concentrations."""
        # Get completed requests grouped by location
        completed = ServiceRequest.objects.filter(
            status='Completed'
        ).select_related('service_type', 'location')

        heatmap_points = []
        for req in completed:
            try:
                if req.location and req.location.latitude:
                    heatmap_points.append({
                        'lat': float(req.location.latitude),
                        'lng': float(req.location.longitude),
                        'service_type': req.service_type.name,
                        'count': 1
                    })
            except ServiceLocation.DoesNotExist:
                pass

        return Response(heatmap_points)


# Analytics ViewSets
class ServiceAnalyticsViewSet(viewsets.ModelViewSet):
    """Descriptive Analytics - Summarization and analysis of historical service data for operational performance evaluation."""
    queryset = ServiceAnalytics.objects.all()
    serializer_class = ServiceAnalyticsSerializer
    permission_classes = [CanViewAnalytics]
    http_method_names = ['get', 'head', 'options']

    @action(detail=False, methods=['get'])
    def dashboard_metrics(self, request):
        """Get today's live metrics without mutating analytics snapshots."""
        today = timezone.now().astimezone(ZoneInfo('Asia/Manila')).date()
        analytics = ServiceAnalytics.objects.filter(date=today).first()
        if analytics:
            return Response(self.get_serializer(analytics).data)
        service_area, popular_locations = self._calculate_service_coverage(today)
        return Response({
            'id': None,
            'date': today,
            'service_type': None,
            'total_requests': ServiceRequest.objects.filter(request_date__date=today).count(),
            'completed_requests': ServiceRequest.objects.filter(status='Completed', updated_at__date=today).count(),
            'pending_requests': ServiceRequest.objects.filter(status__in=['Pending', 'Approved'], request_date__date=today).count(),
            'cancelled_requests': ServiceRequest.objects.filter(status='Cancelled', updated_at__date=today).count(),
            'avg_response_time_hours': self._calculate_avg_response_time(today),
            'avg_completion_time_hours': self._calculate_avg_completion_time(today),
            'technician_utilization_rate': self._calculate_technician_utilization(today),
            'service_area_coverage': service_area,
            'popular_locations': popular_locations,
            'satisfaction_score': self._calculate_satisfaction_score(today),
            'created_at': None,
            'source': 'live_read_only',
        })

    @action(detail=False, methods=['get'])
    def trends(self, request):
        """Get service trends over time with optional date range and service type filter."""
        # Accept flexible date range params
        start_date_param = request.query_params.get('start_date')
        end_date_param = request.query_params.get('end_date')
        period = request.query_params.get('period', 'monthly')  # weekly, monthly, yearly
        service_type_id = request.query_params.get('service_type')
        days = _bounded_days(request)

        today = timezone.now().date()

        if start_date_param:
            try:
                start_date = timezone.datetime.strptime(start_date_param, '%Y-%m-%d').date()
            except ValueError:
                start_date = _period_start(today, days)
        else:
            start_date = _period_start(today, days)

        if end_date_param:
            try:
                end_date = timezone.datetime.strptime(end_date_param, '%Y-%m-%d').date()
            except ValueError:
                end_date = today
        else:
            end_date = today

        trends_qs = ServiceAnalytics.objects.filter(
            date__gte=start_date, date__lte=end_date
        ).order_by('date')

        if service_type_id:
            trends_qs = trends_qs.filter(service_type_id=service_type_id)

        serializer = self.get_serializer(trends_qs, many=True)
        return Response({
            'start_date': start_date,
            'end_date': end_date,
            'period': period,
            'service_type_filter': service_type_id,
            'results': serializer.data,
        })

    @action(detail=False, methods=['get'])
    def service_type_summary(self, request):
        """Get analytics breakdown by service type for charts."""
        days = _bounded_days(request)
        start_date = _period_start(timezone.now().date(), days)

        summary = (
            ServiceTicket.objects
            .filter(created_at__date__gte=start_date)
            .values('request__service_type__name')
            .annotate(
                total=Count('id'),
                completed=Count('id', filter=Q(status__in=COMPLETED_TICKET_STATUSES)),
                avg_rating=Avg('client_rating'),
            )
            .order_by('-total')
        )

        return Response([
            {
                'service_type': item['request__service_type__name'] or 'Unknown',
                'total': item['total'],
                'completed': item['completed'],
                'avg_rating': round(item['avg_rating'] or 0, 1),
            }
            for item in summary
        ])

    def _generate_daily_analytics(self, date):
        """Generate analytics for a specific date with real calculations"""
        from django.db.models import Avg, Q, F
        from datetime import timedelta

        # Calculate metrics from actual data
        total_requests = ServiceRequest.objects.filter(
            request_date__date=date
        ).count()

        completed_requests = ServiceRequest.objects.filter(
            status='Completed',
            updated_at__date=date
        ).count()

        pending_requests = ServiceRequest.objects.filter(
            status__in=['Pending', 'Approved'],
            request_date__date=date
        ).count()

        cancelled_requests = ServiceRequest.objects.filter(
            status='Cancelled',
            updated_at__date=date
        ).count()

        # Calculate avg_response_time_hours (request created to technician assigned)
        avg_response_time = self._calculate_avg_response_time(date)

        # Calculate avg_completion_time_hours (assigned to completed)
        avg_completion_time = self._calculate_avg_completion_time(date)

        # Calculate technician_utilization_rate
        utilization_rate = self._calculate_technician_utilization(date)

        # Calculate service_area_coverage and popular_locations
        service_area, popular_locations = self._calculate_service_coverage(date)

        # Calculate satisfaction_score (avg client rating)
        satisfaction_score = self._calculate_satisfaction_score(date)

        # Check if analytics already exists for this date
        analytics, created = ServiceAnalytics.objects.get_or_create(
            date=date,
            service_type=None,  # Overall analytics
            defaults={
                'total_requests': total_requests,
                'completed_requests': completed_requests,
                'pending_requests': pending_requests,
                'cancelled_requests': cancelled_requests,
                'avg_response_time_hours': avg_response_time,
                'avg_completion_time_hours': avg_completion_time,
                'technician_utilization_rate': utilization_rate,
                'service_area_coverage': service_area,
                'popular_locations': popular_locations,
                'satisfaction_score': satisfaction_score,
            }
        )

        # If already exists, update it
        if not created:
            analytics.total_requests = total_requests
            analytics.completed_requests = completed_requests
            analytics.pending_requests = pending_requests
            analytics.cancelled_requests = cancelled_requests
            analytics.avg_response_time_hours = avg_response_time
            analytics.avg_completion_time_hours = avg_completion_time
            analytics.technician_utilization_rate = utilization_rate
            analytics.service_area_coverage = service_area
            analytics.popular_locations = popular_locations
            analytics.satisfaction_score = satisfaction_score
            analytics.save()

        return analytics

    def _calculate_avg_response_time(self, date):
        """Calculate average time from request creation to technician assignment"""
        tickets = ServiceTicket.objects.filter(
            request__request_date__date=date,
            assigned_at__isnull=False
        )

        response_times = []
        for ticket in tickets:
            if ticket.request.request_date and ticket.assigned_at:
                delta = ticket.assigned_at - ticket.request.request_date
                hours = delta.total_seconds() / 3600
                response_times.append(hours)

        return round(sum(response_times) / len(response_times), 2) if response_times else 0

    def _calculate_avg_completion_time(self, date):
        """Calculate average time from assignment to completion"""
        tickets = ServiceTicket.objects.filter(
            completed_date__date=date,
            status__in=COMPLETED_TICKET_STATUSES,
            assigned_at__isnull=False,
            completed_date__isnull=False
        )

        completion_times = []
        for ticket in tickets:
            if ticket.assigned_at and ticket.completed_date:
                delta = ticket.completed_date - ticket.assigned_at
                hours = delta.total_seconds() / 3600
                completion_times.append(hours)

        return round(sum(completion_times) / len(completion_times), 2) if completion_times else 0

    def _calculate_technician_utilization(self, date):
        """Calculate technician utilization rate (hours working / available hours)"""
        technicians = User.objects.filter(role='technician', status='active', is_active=True)

        total_hours_worked = 0
        total_available_hours = 0

        for technician in technicians:
            # Hours worked on this date
            tickets = ServiceTicket.objects.filter(
                technician=technician,
                completed_date__date=date,
                status__in=COMPLETED_TICKET_STATUSES,
                start_time__isnull=False,
                end_time__isnull=False
            )

            for ticket in tickets:
                delta = ticket.end_time - ticket.start_time
                hours = delta.total_seconds() / 3600
                total_hours_worked += hours

            # Available hours (assume 8 hours per day)
            total_available_hours += 8

        if total_available_hours > 0:
            return round(total_hours_worked / total_available_hours, 2)
        return 0

    def _calculate_service_coverage(self, date):
        """Calculate service area coverage and popular locations"""
        from django.contrib.gis.measure import D
        from django.db.models import Count

        # Get all service locations on this date
        locations = ServiceLocation.objects.filter(
            request__request_date__date=date
        )

        # Calculate approximate service area (bounding box)
        if locations.exists():
            lats = [loc.latitude for loc in locations if loc.latitude]
            lons = [loc.longitude for loc in locations if loc.longitude]

            if lats and lons:
                # Simple bounding box area calculation (approximate)
                lat_range = max(lats) - min(lats)
                lon_range = max(lons) - min(lons)
                # Rough calculation: 1 degree ≈ 111 km
                area = lat_range * 111 * lon_range * 111
                service_area = round(area, 1)
            else:
                service_area = 0
        else:
            service_area = 0

        # Get top 5 service locations
        popular = (
            locations.values('city')
            .annotate(count=Count('city'))
            .order_by('-count')[:5]
        )
        popular_locations = [{'city': loc['city'], 'requests': loc['count']} for loc in popular]

        return service_area, popular_locations

    def _calculate_satisfaction_score(self, date):
        """Calculate average customer satisfaction from ratings"""
        tickets = ServiceTicket.objects.filter(
            completed_date__date=date,
            client_rating__isnull=False
        )

        ratings = [ticket.client_rating for ticket in tickets if ticket.client_rating]

        if ratings:
            avg_rating = sum(ratings) / len(ratings)
            return round(avg_rating, 1)
        return 0


class TechnicianPerformanceViewSet(viewsets.ModelViewSet):
    queryset = TechnicianPerformance.objects.all()
    serializer_class = TechnicianPerformanceSerializer
    permission_classes = [CanAccessAnalytics]
    http_method_names = ['get', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        if user.role == 'technician':
            return TechnicianPerformance.objects.filter(technician=user)
        return TechnicianPerformance.objects.all()

    @action(detail=False, methods=['get'])
    def leaderboard(self, request):
        """Get technician performance leaderboard"""
        days = _bounded_days(request)
        start_date = _period_start(timezone.now().date(), days)

        # Aggregate performance over the period
        performances = TechnicianPerformance.objects.filter(
            date__gte=start_date
        )
        if request.user.role == 'technician':
            performances = performances.filter(technician=request.user)
        performances = performances.values('technician__username').annotate(
            total_completed=Sum('tickets_completed'),
            avg_satisfaction=Avg('customer_satisfaction'),
            total_hours=Sum('total_work_hours')
        ).order_by('-total_completed')

        return Response(list(performances))

    @action(detail=False, methods=['get'])
    def performance_breakdown(self, request):
        """Detailed per-technician performance breakdown for admin monitoring."""
        period = str(request.query_params.get('period') or '').strip().lower()
        use_all_time = period in {'all', 'all_time', 'lifetime'}
        days = None if use_all_time else _bounded_days(request)
        today = timezone.now().astimezone(ZoneInfo('Asia/Manila')).date()
        end_date = today
        if not use_all_time:
            start_param = str(request.query_params.get('start_date') or '').strip()
            end_param = str(request.query_params.get('end_date') or '').strip()
            try:
                parsed_end = timezone.datetime.strptime(end_param, '%Y-%m-%d').date() if end_param else None
            except ValueError:
                parsed_end = None
            if parsed_end:
                end_date = min(parsed_end, today)

            try:
                parsed_start = timezone.datetime.strptime(start_param, '%Y-%m-%d').date() if start_param else None
            except ValueError:
                parsed_start = None

            if parsed_start:
                if parsed_start > end_date:
                    parsed_start = end_date
                days = min(365, max(1, (end_date - parsed_start).days + 1))
                start_date = end_date - timezone.timedelta(days=days - 1)
            else:
                start_date = _period_start(end_date, days)
        else:
            start_date = today - timezone.timedelta(days=365)

        month_cursor = start_date.replace(day=1)
        month_buckets = []
        while month_cursor <= end_date:
            next_month = (month_cursor.replace(day=28) + timezone.timedelta(days=4)).replace(day=1)
            month_buckets.append({
                'start': month_cursor,
                'end': min(next_month - timezone.timedelta(days=1), end_date),
                'month': month_cursor.isoformat(),
                'label': month_cursor.strftime('%b %Y'),
            })
            month_cursor = next_month

        technicians = User.objects.filter(
            role='technician', status='active', is_active=True,
        ).select_related('technician_profile')
        if request.user.role == 'technician':
            technicians = technicians.filter(pk=request.user.pk)
        technicians = list(technicians)
        tech_ids = [tech.id for tech in technicians]

        # Each figure is read once for every technician, grouped by technician
        # (eight queries per technician, each reading their whole job history, took seconds).
        tickets = ServiceTicket.objects.filter(technician_id__in=tech_ids)
        done_q = Q(status__in=COMPLETED_TICKET_STATUSES)
        active_q = Q(status__in=ACTIVE_TICKET_STATUSES)
        timed_q = Q(start_time__isnull=False, end_time__isnull=False, end_time__gte=F('start_time'))
        if use_all_time:
            count_fields = {
                'total': Count('pk'),
                'completed': Count('pk', filter=done_q),
                'active': Count('pk', filter=active_q),
            }
            completed_tickets = tickets.filter(done_q, timed_q)
            assigned_tickets = tickets.filter(assigned_at__isnull=False)
        else:
            assignment_period = (
                Q(assigned_at__date__gte=start_date, assigned_at__date__lte=end_date) |
                Q(assigned_at__isnull=True, scheduled_date__gte=start_date, scheduled_date__lte=end_date)
            )
            completion_period = (
                Q(completed_date__date__gte=start_date, completed_date__date__lte=end_date) |
                Q(completed_date__isnull=True, end_time__date__gte=start_date, end_time__date__lte=end_date)
            )
            count_fields = {
                'total': Count('pk', filter=assignment_period),
                'completed': Count('pk', filter=done_q & completion_period),
                'active': Count('pk', filter=assignment_period & active_q),
            }
            completed_tickets = tickets.filter(completion_period, done_q, timed_q)
            assigned_tickets = tickets.filter(
                assigned_at__date__gte=start_date,
                assigned_at__date__lte=end_date,
            )
        counts = {
            row['technician_id']: row
            for row in tickets.order_by().values('technician_id').annotate(**count_fields)
        }

        # Avg completion duration (start_time to end_time) and avg client rating
        durations_by_tech = defaultdict(list)
        ratings_by_tech = defaultdict(list)
        for row in completed_tickets.values('technician_id', 'start_time', 'end_time', 'client_rating'):
            durations_by_tech[row['technician_id']].append((row['end_time'] - row['start_time']).total_seconds() / 3600)
            if row['client_rating']:
                ratings_by_tech[row['technician_id']].append(row['client_rating'])

        # Avg response time (request created to assigned_at)
        response_by_tech = defaultdict(list)
        for row in assigned_tickets.values('technician_id', 'assigned_at', 'request__request_date'):
            if row['request__request_date']:
                response_by_tech[row['technician_id']].append(
                    (row['assigned_at'] - row['request__request_date']).total_seconds() / 3600
                )

        skills_by_tech = defaultdict(list)
        for tech_id, skill_name in (
            TechnicianSkill.objects.filter(technician_id__in=tech_ids)
            .order_by('pk')
            .values_list('technician_id', 'service_type__name')
        ):
            skills_by_tech[tech_id].append(skill_name)

        monthly_by_tech = {
            tech_id: {
                b['month']: {
                    'month': b['month'],
                    'label': b['label'],
                    'total_jobs': 0,
                    'completed_jobs': 0,
                    'active_jobs': 0,
                } for b in month_buckets
            }
            for tech_id in tech_ids
        }
        for t in tickets.values('technician_id', 'assigned_at', 'scheduled_date', 'status', 'completed_date', 'end_time'):
            monthly_activity_map = monthly_by_tech[t['technician_id']]
            # Count assigned/scheduled jobs
            assigned_dt = t['assigned_at'] or t['scheduled_date']
            if assigned_dt:
                if isinstance(assigned_dt, timezone.datetime):
                    assigned_day = timezone.localtime(assigned_dt).date() if timezone.is_aware(assigned_dt) else assigned_dt.date()
                else:
                    assigned_day = assigned_dt
                month_key = assigned_day.replace(day=1).isoformat()
                if month_key in monthly_activity_map:
                    monthly_activity_map[month_key]['total_jobs'] += 1
                    if t['status'] in ACTIVE_TICKET_STATUSES:
                        monthly_activity_map[month_key]['active_jobs'] += 1

            # Count completed jobs
            if t['status'] in COMPLETED_TICKET_STATUSES:
                completed_dt = t['completed_date'] or t['end_time']
                if completed_dt:
                    completed_day = timezone.localtime(completed_dt).date() if timezone.is_aware(completed_dt) else completed_dt.date()
                    month_key = completed_day.replace(day=1).isoformat()
                    if month_key in monthly_activity_map:
                        monthly_activity_map[month_key]['completed_jobs'] += 1

        results = []
        for tech in technicians:
            tech_counts = counts.get(tech.id, {})
            durations = durations_by_tech[tech.id]
            response_times = response_by_tech[tech.id]
            ratings = ratings_by_tech[tech.id]
            results.append({
                'technician_id': tech.id,
                'username': tech.username,
                'display_name': tech.get_full_name() or tech.username,
                'is_available': tech.is_available,
                'total_jobs': tech_counts.get('total', 0),
                'completed_jobs': tech_counts.get('completed', 0),
                'active_jobs': tech_counts.get('active', 0),
                'avg_duration_hours': round(sum(durations) / len(durations), 2) if durations else 0,
                'avg_response_hours': round(sum(response_times) / len(response_times), 2) if response_times else 0,
                'avg_rating': round(sum(ratings) / len(ratings), 1) if ratings else None,
                'skills': skills_by_tech[tech.id],
                'monthly_activity': list(monthly_by_tech[tech.id].values()),
                'period': 'all_time' if use_all_time else f'last_{days}_days',
                'period_days': days,
            })

        results.sort(key=lambda x: (x['total_jobs'], x['completed_jobs']), reverse=True)
        return Response(results)


class DemandForecastViewSet(viewsets.ModelViewSet):
    """Demand Forecasting - Estimation of future service demand using AI and historical data analysis."""
    queryset = DemandForecast.objects.all()
    serializer_class = DemandForecastSerializer

    permission_classes = [CanViewAnalytics]
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed('POST')

    @action(detail=False, methods=['post'])
    def generate_forecast(self, request):
        """Backtest and publish a forecast only when every validation gate passes."""
        from users.forecasting_service import generate_service_forecast

        if request.user.role != 'superadmin':
            raise PermissionDenied(
                'Forecast generation is a controlled analytics write operation reserved for superadmins and the scheduled management command.'
            )

        service_type_id = request.data.get('service_type_id')
        try:
            horizon_months = int(request.data.get('horizon_months', 6))
        except (TypeError, ValueError):
            return Response({'error': 'horizon_months must be a whole number from 1 to 12.'}, status=400)
        if not 1 <= horizon_months <= 12:
            return Response({'error': 'horizon_months must be between 1 and 12.'}, status=400)

        if not service_type_id:
            return Response({'error': 'service_type_id required'}, status=400)

        try:
            service_type = ServiceType.objects.get(id=service_type_id)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service type not found'}, status=404)

        result = generate_service_forecast(
            service_type,
            horizon_months=horizon_months,
            persist=True,
        )
        if not result['published']:
            return Response({
                'error': 'Forecast withheld because the evidence or holdout-validation gates were not met.',
                'reason': result.get('reason'),
                'forecast': result.get('readiness'),
                'model': result.get('model'),
            }, status=409)
        return Response(result)

    @action(detail=False, methods=['get'])
    def accuracy_report(self, request):
        """Return stored actual-versus-predicted outcomes; GET performs no writes."""
        days = _bounded_days(request)
        start_date = _period_start(timezone.now().date(), days)

        forecasts = DemandForecast.objects.filter(
            forecast_date__lt=timezone.now().date(),
            forecast_date__gte=start_date
        ).exclude(actual_requests__isnull=True)

        accuracy_data = [{
            'service_type': forecast.service_type.name,
            'forecast_date': forecast.forecast_date,
            'predicted': forecast.predicted_requests,
            'actual': forecast.actual_requests,
            'accuracy': forecast.forecast_accuracy,
        } for forecast in forecasts.select_related('service_type')]

        return Response(accuracy_data)


class ServiceTrendViewSet(viewsets.ModelViewSet):
    queryset = ServiceTrend.objects.all()
    serializer_class = ServiceTrendSerializer
    permission_classes = [CanViewAnalytics]
    http_method_names = ['get', 'head', 'options']
