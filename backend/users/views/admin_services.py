# Auto-split from users/views.py
import json
import os
from datetime import datetime, time
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from django.utils.dateparse import parse_date

from inventory.models import ServiceTypeInventoryRequirement
from users.analytics_service import _forecast_readiness, build_admin_analytics
from users.views.helpers import *  # noqa: F401,F403
from users.permissions import CanManageServiceCatalog, CanViewAnalytics, CanViewServiceCatalog

class AdminServicesViewSet(viewsets.ViewSet):
    """ViewSet for admin service management"""
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [CanViewServiceCatalog()]
        return [CanManageServiceCatalog()]

    def list(self, request):
        """Get all service types"""
        services = ServiceType.objects.all()
        search = request.query_params.get('search') or request.query_params.get('q')
        active = request.query_params.get('active')

        if search:
            services = services.filter(
                Q(name__icontains=search) |
                Q(description__icontains=search)
            )
        if active in ['true', 'false']:
            services = services.filter(is_active=(active == 'true'))

        serializer = ServiceTypeSerializer(services, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new service type"""
        serializer = ServiceTypeSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        """Get a specific service type"""
        try:
            service = ServiceType.objects.get(id=pk)
            serializer = ServiceTypeSerializer(service)
            return Response(serializer.data)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        """Update a service type"""
        try:
            service = ServiceType.objects.get(id=pk)
            serializer = ServiceTypeSerializer(service, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        """Delete a service type"""
        try:
            service = ServiceType.objects.get(id=pk)
            request_count = ServiceRequest.objects.filter(service_type=service).count()
            ticket_count = ServiceTicket.objects.filter(request__service_type=service).count()
            if request_count or ticket_count:
                return Response({
                    'error': 'This service is already used by requests or tickets. Deactivate it instead of deleting it.',
                    'request_count': request_count,
                    'ticket_count': ticket_count,
                    'usage_count': request_count + ticket_count,
                }, status=status.HTTP_400_BAD_REQUEST)
            service.delete()
            return Response({'message': 'Service deleted'}, status=status.HTTP_204_NO_CONTENT)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Create a copy of a service type and its inventory template."""
        try:
            service = ServiceType.objects.get(id=pk)
        except ServiceType.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

        base_name = request.data.get('name') or f'{service.name} Copy'
        copy_name = base_name
        suffix = 2
        while ServiceType.objects.filter(name__iexact=copy_name).exists():
            copy_name = f'{base_name} {suffix}'
            suffix += 1

        duplicated_service = ServiceType.objects.create(
            name=copy_name,
            description=service.description,
            category=service.category,
            color=service.color,
            icon=service.icon,
            display_order=service.display_order,
            estimated_duration=service.estimated_duration,
            estimated_cost=service.estimated_cost,
            max_daily_assignments=service.max_daily_assignments,
            procedures=service.procedures,
            required_equipment=service.required_equipment,
            is_active=service.is_active,
        )

        requirements = [
            ServiceTypeInventoryRequirement(
                service_type=duplicated_service,
                item=requirement.item,
                quantity=requirement.quantity,
                auto_reserve=requirement.auto_reserve,
                notes=requirement.notes,
            )
            for requirement in service.inventory_requirements.all()
        ]
        ServiceTypeInventoryRequirement.objects.bulk_create(requirements)

        serializer = ServiceTypeSerializer(duplicated_service)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AdminAnalyticsViewSet(viewsets.ViewSet):
    """ViewSet for admin analytics"""
    permission_classes = [permissions.IsAuthenticated, CanViewAnalytics]
    FORECAST_WINDOW_DAYS = 7
    HISTORY_WINDOW_DAYS = 42
    RECENT_WINDOW_DAYS = 14
    FORECAST_JOBS_PER_TECHNICIAN = 5
    BUSIEST_MONTHS_WINDOW = 12
    BUSIEST_WEEKS_WINDOW = 12
    LOCATION_TREND_WINDOW_DAYS = 30
    ANALYTICS_LIST_LIMIT = 6

    def _resolve_analytics_period(self, request, today):
        try:
            days = int(request.query_params.get('days', 30))
        except (TypeError, ValueError):
            days = 30
        days = max(1, min(1095, days))

        start_date = parse_date(str(request.query_params.get('start_date') or '').strip())
        end_date = parse_date(str(request.query_params.get('end_date') or '').strip())
        if end_date is None:
            end_date = today
        if end_date > today:
            end_date = today

        if start_date is not None:
            if start_date > end_date:
                start_date = end_date
            days = (end_date - start_date).days + 1
            if days > 1095:
                days = 1095
                start_date = end_date - timezone.timedelta(days=days - 1)
        else:
            start_date = end_date - timezone.timedelta(days=days - 1)

        return start_date, end_date, max(1, min(1095, days))

    @action(detail=False, methods=['get'], url_path='date-records')
    def date_records(self, request):
        """Return defense-safe customer/service records for a specific date."""
        target_date = parse_date(str(request.query_params.get('date') or '').strip())
        if target_date is None:
            return Response(
                {'error': 'date query parameter is required in YYYY-MM-DD format.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request_rows = (
            ServiceRequest.objects
            .select_related('client', 'service_type')
            .filter(request_date__date=target_date)
            .order_by('request_date', 'id')[:20]
        )
        ticket_rows = (
            ServiceTicket.objects
            .select_related('request__client', 'request__service_type', 'technician')
            .filter(
                Q(scheduled_date=target_date) |
                Q(completed_date__date=target_date) |
                Q(start_time__date=target_date)
            )
            .order_by('scheduled_date', 'scheduled_time', 'id')[:20]
        )

        def display_name(user):
            if not user:
                return 'Unknown customer'
            return user.get_full_name().strip() or user.username

        return Response({
            'date': target_date.isoformat(),
            'requests': [
                {
                    'id': service_request.id,
                    'customer': display_name(service_request.client),
                    'service': service_request.service_type.name if service_request.service_type_id else 'Service not set',
                    'status': service_request.status,
                    'priority': service_request.priority,
                    'requestedAt': service_request.request_date.isoformat() if service_request.request_date else None,
                }
                for service_request in request_rows
            ],
            'tickets': [
                {
                    'id': ticket.id,
                    'customer': display_name(ticket.request.client) if ticket.request_id else 'Unknown customer',
                    'service': ticket.request.service_type.name if ticket.request_id and ticket.request.service_type_id else 'Service not set',
                    'status': ticket.status,
                    'priority': ticket.priority,
                    'technician': display_name(ticket.technician) if ticket.technician_id else None,
                    'scheduledDate': ticket.scheduled_date.isoformat() if ticket.scheduled_date else None,
                    'completedDate': ticket.completed_date.isoformat() if ticket.completed_date else None,
                }
                for ticket in ticket_rows
            ],
        })

    def list(self, request):
        """Return the unified, live, read-only Analytics workspace contract."""
        return Response(build_admin_analytics(request.query_params))

    @action(detail=False, methods=['get'], url_path='ai-summary')
    def ai_summary(self, request):
        """Explain summarized AFN analytics without exposing raw records."""
        today = timezone.localdate()
        start_date, end_date, days = self._resolve_analytics_period(request, today)
        question = str(request.query_params.get('question') or '').strip()
        analytics_summary = self._build_ai_analytics_summary(end_date, days)
        analytics_summary['periodStartDate'] = start_date.isoformat()
        analytics_summary['periodEndDate'] = end_date.isoformat()
        local_summary = self._build_local_ai_style_summary(analytics_summary)

        configured_api_key = getattr(django_settings, 'GEMINI_API_KEY', None)
        api_key = configured_api_key if configured_api_key is not None else os.getenv('GEMINI_API_KEY', '')
        if not api_key:
            return Response({
                'summary': local_summary,
                'source': 'local',
                'configured': False,
                'analytics': analytics_summary,
                'message': 'GEMINI_API_KEY is not configured; returned local analytics explanation.',
            })

        model = (
            getattr(django_settings, 'GEMINI_ANALYTICS_MODEL', None)
            or os.getenv('GEMINI_ANALYTICS_MODEL', '')
            or 'gemini-3.5-flash'
        )
        prompt = (
            "You are the Analytics Assistant for AFN Solar Power Engineering Services.\n"
            "Use ONLY the JSON summary below. Do not invent numbers, names, or records.\n"
            "Treat historical analytics and forecasting readiness as separate concepts.\n"
            "Never describe historical density or inventory usage as a prediction.\n"
            "When forecast.predictions_available is false, clearly say that no validated forecast, future quantity, confidence score, or forecast accuracy is available.\n"
            "When asked how future item demand will eventually be calculated, explain forecastMethod without claiming that the model already exists.\n"
            "When asked about sales or revenue, use completedServiceValue and call it estimated completed service value. Clearly state that it is based on configured service prices and is not collected revenue or payment received.\n"
            "If a list is empty, say no matching records were found for the selected period. "
            "Do not say the system is not capturing data unless the JSON explicitly says dataSourceUnavailable is true.\n"
            "Answer the Admin's specific question directly, concisely, and naturally based on the JSON data. If the user asks for a general summary without a specific question, then provide a short summary of the current state, a possible reason, and what the admin should do next.\n"
            "Keep it practical and suitable for a service operations dashboard. "
            "Finish every sentence and do not stop mid-answer.\n\n"
            f"Admin question: {question or 'Give a concise analytics summary.'}\n\n"
            f"JSON summary:\n{json.dumps(analytics_summary, default=str)}"
        )

        try:
            ai_text = self._call_gemini_generate_content(
                api_key=api_key,
                model=model,
                prompt=prompt,
            )
            if not ai_text:
                ai_text = local_summary
            return Response({
                'summary': ai_text,
                'source': 'gemini',
                'configured': True,
                'model': model,
                'analytics': analytics_summary,
            })
        except (HTTPError, URLError, TimeoutError, ValueError, KeyError) as exc:
            logger.warning('Gemini analytics summary failed: %s', exc)
            return Response({
                'summary': local_summary,
                'source': 'local',
                'configured': False,
                'analytics': analytics_summary,
                'message': 'AI summary failed; returned local analytics explanation.',
            })

    def _call_gemini_generate_content(self, *, api_key, model, prompt):
        payload = {
            'contents': [
                {
                    'parts': [
                        {'text': prompt}
                    ]
                }
            ],
            'generationConfig': {
                'maxOutputTokens': 1500,
                'temperature': 0.3,
            },
        }
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
        encoded_payload = json.dumps(payload).encode('utf-8')
        request_obj = urlrequest.Request(
            url,
            data=encoded_payload,
            method='POST',
            headers={
                'Content-Type': 'application/json',
                'x-goog-api-key': api_key,
            },
        )
        with urlrequest.urlopen(request_obj, timeout=20) as response:
            response_data = json.loads(response.read().decode('utf-8'))

        candidate = response_data.get('candidates', [{}])[0]
        finish_reason = str(candidate.get('finishReason') or '').upper()
        if finish_reason and finish_reason != 'STOP':
            raise ValueError(f'Gemini response was incomplete ({finish_reason}).')
        parts = candidate.get('content', {}).get('parts', [])
        text_parts = [part.get('text', '') for part in parts if part.get('text')]
        return '\n'.join(text_parts).strip()

    def _build_ai_analytics_summary(self, today, days):
        start_date = today - timezone.timedelta(days=days - 1)
        overview_contract = build_admin_analytics({
            'start_date': start_date.isoformat(),
            'end_date': today.isoformat(),
            'workspace': 'overview',
        })
        forecasting_contract = build_admin_analytics({
            'start_date': start_date.isoformat(),
            'end_date': today.isoformat(),
            'workspace': 'forecasting',
        })
        overview = overview_contract.get('overview', {})
        service_breakdown = self._build_service_breakdown(today, days)
        top_technician = self._build_top_technician(today, days)
        seasonal_inventory_demand = self._build_seasonal_inventory_demand(today, days)
        completed_service_value = self._build_completed_service_value(today, days)
        
        busiest_months = self._build_busiest_months(today, days)
        busiest_weeks = self._build_busiest_weeks(today, days)
        top_requested_service_types = self._build_top_requested_service_types(service_breakdown)
        city_completion_trends, province_completion_trends = self._build_location_completion_trends(today, days)
        request_source_breakdown = self._build_request_source_breakdown(today, days)
        priority_distribution = self._build_priority_distribution(today, days)
        ticket_status_breakdown = self._build_ticket_status_breakdown(today, days)
        scheduling_insights = self._build_scheduling_insights(today, days)

        model_status = forecasting_contract.get('model_status', {})
        forecast_available = bool(model_status.get('predictions_available'))
        return {
            'periodDays': days,
            'generatedAt': timezone.now().isoformat(),
            'forecastMethod': {
                'type': 'Readiness-gated service and inventory demand forecasting',
                'model': (
                    model_status.get('model_label')
                    if forecast_available
                    else 'No current model has passed every evidence, freshness, and holdout-validation gate.'
                ),
                'plannedMethod': forecasting_contract.get('item_demand_readiness', {}).get('method'),
                'horizonsDays': forecasting_contract.get('item_demand_readiness', {}).get('forecast_horizons_days', []),
                'accuracyExplanation': (
                    'Published models expose stored holdout MAE, WAPE, bias, and actual-versus-predicted evidence.'
                    if forecast_available
                    else 'Forecast accuracy is unavailable until a model is trained, backtested, and compared with held-out actual results.'
                ),
            },
            'overview': {
                'totalRequests': overview.get('totalRequests', 0),
                'completedRequests': overview.get('completedRequests', 0),
                'pendingRequests': overview.get('pendingRequests', 0),
                'activeTechnicians': overview.get('activeTechnicians', 0),
                'availableTechnicians': overview.get('availableTechnicians', 0),
                'avgResponseTimeHours': overview.get('avgResponseTimeHours', 0),
                'avgCompletionTimeHours': overview.get('avgCompletionTimeHours', 0),
            },
            'completedServiceValue': completed_service_value,
            'topServices': service_breakdown[:5],
            'topTechnician': top_technician,
            'forecast': {
                **forecasting_contract.get('forecast', {}),
            },
            'demandForecast': forecasting_contract.get('demand_forecast', {}),
            'forecastHistorySummary': forecasting_contract.get('history_summary', {}),
            'historicalForecastEvidence': forecasting_contract.get('historical_charts', {}),
            'itemDemandReadiness': forecasting_contract.get('item_demand_readiness', {}),
            'modelStatus': forecasting_contract.get('model_status', {}),
            'inventoryDemand': {
                'topItems': seasonal_inventory_demand.get('topItems', [])[:5],
                'topCategories': seasonal_inventory_demand.get('categoryDemand', [])[:5],
                'totalTransactions': seasonal_inventory_demand.get('totalTransactions', 0),
                'totalQuantityConsumed': seasonal_inventory_demand.get('totalQuantityConsumed', 0),
                'dataSource': 'Historical inventory issue transactions linked to service tickets in the selected period.',
                'emptyMeaning': 'No ticket-linked issued inventory usage was recorded in the selected period.',
            },
            'busiestMonths': busiest_months[:3],
            'busiestWeeks': busiest_weeks[:3],
            'topRequestedServiceTypes': top_requested_service_types[:5],
            'cityCompletionTrends': city_completion_trends[:5],
            'provinceCompletionTrends': province_completion_trends[:5],
            'requestSources': request_source_breakdown[:5],
            'priorityDistribution': priority_distribution,
            'ticketStatusBreakdown': ticket_status_breakdown[:5],
            'schedulingInsights': scheduling_insights,
        }

    def _build_local_ai_style_summary(self, summary):
        overview = summary.get('overview', {})
        forecast = summary.get('forecast', {})
        top_services = summary.get('topServices') or []
        top_service = top_services[0] if top_services else {}
        inventory_items = summary.get('inventoryDemand', {}).get('topItems') or []
        top_item = inventory_items[0] if inventory_items else {}

        total = overview.get('totalRequests', 0)
        completed = overview.get('completedRequests', 0)
        pending = overview.get('pendingRequests', 0)
        completed_value = summary.get('completedServiceValue', {})

        what = (
            f"Analytics show {total} request(s), {completed} completed, and {pending} pending "
            f"for the selected {summary.get('periodDays', 30)}-day period."
        )
        if forecast.get('predictions_available'):
            what += " A validated forecast is available."
        else:
            what += f" Forecasts are unavailable: {forecast.get('reason') or 'the evidence and model-validation gates are not met.'}"
        if top_service:
            what += f" Top service demand is {top_service.get('name') or top_service.get('serviceType') or 'the leading service'}."
        if completed_value.get('completedTickets'):
            what += (
                f" Estimated completed service value is PHP {completed_value.get('totalEstimatedValue', 0):,.2f}, "
                "based on configured service prices; this is not collected revenue."
            )

        reason = "Possible reason: demand is being driven by recent service trends and recorded completion/request patterns."
        if top_item:
            reason += f" Historical ticket-linked usage is highest for {top_item.get('item') or top_item.get('name') or 'a recurring item'}."

        if forecast.get('predictions_available'):
            demand_forecast = summary.get('demandForecast', {})
            method = (
                f"Forecast method: {demand_forecast.get('method')}. "
                f"The current validated outlook estimates {demand_forecast.get('next_7_days', 0)} requests in 7 days "
                f"and {demand_forecast.get('next_30_days', 0)} requests in 30 days."
            )
        else:
            method = (
                "Forecast method: no future quantities or confidence scores are generated yet. "
                "When evidence is sufficient, the planned method forecasts service demand by service and city/province, "
                "then translates it through validated ticket-linked item usage and service-item requirements."
            )
        action = "Next action: review pending approvals, dispatch capacity, SLA risk, and inventory stock before confirming more schedules."
        return f"{what}\n\n{reason}\n\n{method}\n\n{action}"

    def _build_overview(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)
        
        # Requests in period
        period_requests_count = ServiceRequest.objects.filter(
            request_date__date__gte=period_start,
            request_date__date__lte=today
        ).count()
        
        pending_requests_count = ServiceRequest.objects.filter(
            request_date__date__gte=period_start,
            request_date__date__lte=today,
            status='Pending'
        ).count()

        # Tickets in period
        completed_requests_count = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__date__gte=period_start,
            completed_date__date__lte=today,
            request__isnull=False
        ).values('request_id').distinct().count()

        active_tickets_count = ServiceTicket.objects.filter(
            status__in=['Not Started', 'In Progress', 'On Hold']
        ).count()
        
        available_technicians = User.objects.filter(
            role='technician',
            status='active',
            is_active=True,
            technician_profile__is_available=True,
        ).count()
        
        active_technician_accounts = User.objects.filter(
            role='technician',
            status='active',
            is_active=True,
        ).count()

        # Average Response Time
        avg_response = ServiceTicket.objects.filter(
            assigned_at__date__gte=period_start,
            assigned_at__date__lte=today,
            request__request_date__isnull=False
        ).aggregate(
            avg_time=Avg(F('assigned_at') - F('request__request_date'))
        )['avg_time']
        
        avg_response_hours = 0
        if avg_response:
            avg_response_hours = round(avg_response.total_seconds() / 3600, 1)

        # Average Completion Time
        avg_completion = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__isnull=False,
            start_time__isnull=False,
            completed_date__date__gte=period_start,
            completed_date__date__lte=today,
        ).aggregate(
            avg_time=Avg(F('completed_date') - F('start_time'))
        )['avg_time']
        
        avg_completion_hours = 0
        if avg_completion:
            avg_completion_hours = round(avg_completion.total_seconds() / 3600, 1)

        return {
            'totalRequests': period_requests_count,
            'completedRequests': completed_requests_count,
            'pendingRequests': pending_requests_count,
            'activeTickets': active_tickets_count,
            'activeUsers': User.objects.filter(status='active', is_active=True).count(),
            'activeTechnicians': available_technicians,
            'availableTechnicians': available_technicians,
            'activeTechnicianAccounts': active_technician_accounts,
            'avgResponseTimeHours': max(0, avg_response_hours),
            'avgCompletionTimeHours': max(0, avg_completion_hours),
        }

    def _average_response_time_hours(self, tickets):
        durations = []
        for ticket in tickets:
            if ticket.assigned_at and ticket.request and ticket.request.request_date:
                duration_hours = (
                    ticket.assigned_at - ticket.request.request_date
                ).total_seconds() / 3600
                if duration_hours >= 0:
                    durations.append(duration_hours)
        if not durations:
            return 0
        return round(sum(durations) / len(durations), 1)

    def _average_completion_time_hours(self, tickets):
        durations = []
        for ticket in tickets:
            if not ticket.completed_date or not ticket.start_time:
                continue
            duration_hours = (ticket.completed_date - ticket.start_time).total_seconds() / 3600
            if duration_hours >= 0:
                durations.append(duration_hours)
        if not durations:
            return 0
        return round(sum(durations) / len(durations), 1)

    def _build_service_breakdown(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)
        
        services_map = {}
        
        # Count requests
        request_counts = ServiceRequest.objects.filter(
            request_date__date__gte=period_start,
            request_date__date__lte=today
        ).values('service_type_id', 'service_type__name').annotate(count=Count('id'))
        
        for item in request_counts:
            s_id = item['service_type_id']
            services_map[s_id] = {
                'id': s_id,
                'name': item['service_type__name'] or 'Unknown Service',
                'count': item['count'],
                'completedRequests': 0
            }

        # Count completions
        completed_counts = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__date__gte=period_start,
            completed_date__date__lte=today,
            request__isnull=False
        ).values('request__service_type_id', 'request__service_type__name').annotate(count=Count('id'))

        for item in completed_counts:
            s_id = item['request__service_type_id']
            if s_id not in services_map:
                services_map[s_id] = {
                    'id': s_id,
                    'name': item['request__service_type__name'] or 'Unknown Service',
                    'count': 0,
                    'completedRequests': 0
                }
            services_map[s_id]['completedRequests'] += item['count']

        breakdown = list(services_map.values())
        breakdown.sort(key=lambda x: (-x['count'], x['name']))

        return [
            {
                'id': row['id'],
                'name': row['name'],
                'count': row['count'],
                'recentRequests': row['count'],
                'completedRequests': row['completedRequests'],
            }
            for row in breakdown
        ]

    def _build_top_technician(self, today, days=30):
        recent_start = today - timezone.timedelta(days=days - 1)
        leaderboard = (
            ServiceTicket.objects.filter(
                status='Completed',
                technician__isnull=False,
                completed_date__date__gte=recent_start,
                completed_date__date__lte=today,
            )
            .values('technician__username')
            .annotate(
                total_completed=Count('id'),
                avg_rating=Avg('client_rating')
            )
            .order_by('-total_completed', 'technician__username')
            .first()
        )

        if not leaderboard:
            return None

        return {
            'techName': leaderboard['technician__username'],
            'totalCompleted': leaderboard['total_completed'],
            'avgRating': round(leaderboard['avg_rating'], 1)
            if leaderboard['avg_rating'] is not None else None,
        }

    def _build_completion_trend(self, today, days=30):
        trend_days = min(90, days)
        start_date = today - timezone.timedelta(days=trend_days - 1)
        
        # Get counts from DB
        completed_counts_qs = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__date__gte=start_date,
            completed_date__date__lte=today
        ).values('completed_date__date').annotate(count=Count('id'))
        
        completed_counts = {
            item['completed_date__date']: item['count']
            for item in completed_counts_qs
        }

        trend = []
        for offset in range(trend_days - 1, -1, -1):
            date = today - timezone.timedelta(days=offset)
            trend.append({
                'date': date.isoformat(),
                'label': date.strftime('%a'),
                'completedCount': completed_counts.get(date, 0),
            })
        return trend

    def _build_monthly_service_trend(self, today, days=30):
        def shift_month(month_start, offset):
            month_index = (month_start.month - 1) + offset
            year = month_start.year + (month_index // 12)
            month = (month_index % 12) + 1
            return month_start.replace(year=year, month=month, day=1)

        current_month_start = today.replace(day=1)
        months_back = max(1, min(36, days // 30))
        first_month_start = shift_month(current_month_start, -months_back)

        buckets = {}
        for offset in range(months_back + 1):
            month_start = shift_month(first_month_start, offset)
            if month_start > today:
                break
            buckets[month_start] = {
                'monthStart': month_start.isoformat(),
                'label': month_start.strftime('%b %Y'),
                'requestCount': 0,
                'completedCount': 0,
            }

        # Count created requests per month
        request_dates = ServiceRequest.objects.filter(
            request_date__date__gte=first_month_start,
            request_date__date__lte=today,
        ).values_list('request_date__date', flat=True)
        
        for request_day in request_dates:
            if not request_day:
                continue
            month_start = request_day.replace(day=1)
            if month_start in buckets:
                buckets[month_start]['requestCount'] += 1

        # Count completed tickets per month
        completed_dates = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__date__gte=first_month_start,
            completed_date__date__lte=today
        ).values_list('completed_date__date', flat=True)

        for completed_day in completed_dates:
            if not completed_day:
                continue
            month_start = completed_day.replace(day=1)
            if month_start in buckets:
                buckets[month_start]['completedCount'] += 1

        monthly_service_trend = []
        for month_start in sorted(buckets.keys()):
            bucket = buckets[month_start]
            completion_rate = (
                (bucket['completedCount'] / bucket['requestCount']) * 100
                if bucket['requestCount'] else 0
            )
            monthly_service_trend.append({
                **bucket,
                'completionRate': round(completion_rate, 1),
            })

        return monthly_service_trend

    def _build_completed_service_value(self, today, days=30):
        """Estimate delivered service value from completed tickets and service prices."""
        from django.db.models import Count, Sum
        from django.db.models.functions import TruncMonth

        period_start = today - timezone.timedelta(days=max(1, days) - 1)
        completed_tickets = ServiceTicket.objects.filter(
            status='Completed',
            completed_date__date__gte=period_start,
            completed_date__date__lte=today,
            request__service_type__isnull=False,
        )

        monthly_rows = (
            completed_tickets
            .annotate(period=TruncMonth('completed_date'))
            .values('period')
            .annotate(
                completedTickets=Count('id'),
                estimatedValue=Sum('request__service_type__estimated_cost'),
            )
            .order_by('period')
        )
        service_rows = (
            completed_tickets
            .values('request__service_type_id', 'request__service_type__name')
            .annotate(
                completedTickets=Count('id'),
                estimatedValue=Sum('request__service_type__estimated_cost'),
            )
            .order_by('-estimatedValue', 'request__service_type__name')
        )

        monthly_trend = []
        for row in monthly_rows:
            period = row['period']
            monthly_trend.append({
                'period': period.date().isoformat() if period else None,
                'label': period.strftime('%b %Y') if period else 'Unknown period',
                'completedTickets': row['completedTickets'],
                'estimatedValue': float(row['estimatedValue'] or 0),
            })

        by_service = [
            {
                'serviceTypeId': row['request__service_type_id'],
                'serviceType': row['request__service_type__name'] or 'Unknown service',
                'completedTickets': row['completedTickets'],
                'estimatedUnitPrice': (
                    round(float(row['estimatedValue'] or 0) / row['completedTickets'], 2)
                    if row['completedTickets'] else 0
                ),
                'estimatedValue': float(row['estimatedValue'] or 0),
            }
            for row in service_rows[:self.ANALYTICS_LIST_LIMIT]
        ]
        total_value = float(
            completed_tickets.aggregate(total=Sum('request__service_type__estimated_cost'))['total'] or 0
        )
        total_completed = completed_tickets.count()

        return {
            'label': 'Estimated Completed Service Value',
            'definition': 'Sum of each completed ticket service type estimated cost. This is not collected revenue or payment received.',
            'currency': 'PHP',
            'periodStartDate': period_start.isoformat(),
            'periodEndDate': today.isoformat(),
            'totalEstimatedValue': round(total_value, 2),
            'completedTickets': total_completed,
            'averageValuePerCompletedTicket': round(total_value / total_completed, 2) if total_completed else 0,
            'monthlyTrend': monthly_trend,
            'byService': by_service,
        }

    def _build_monthly_service_breakdown(self, today, days=30):
        def shift_month(month_start, offset):
            month_index = (month_start.month - 1) + offset
            year = month_start.year + (month_index // 12)
            month = (month_index % 12) + 1
            return month_start.replace(year=year, month=month, day=1)

        current_month_start = today.replace(day=1)
        months_back = max(1, min(36, days // 30))
        first_month_start = shift_month(current_month_start, -months_back)

        buckets = {}
        for offset in range(months_back + 1):
            month_start = shift_month(first_month_start, offset)
            buckets[month_start] = {
                'monthStart': month_start.isoformat(),
                'label': month_start.strftime('%B %Y'),
                'services': {},
            }

        requests = ServiceRequest.objects.filter(
            request_date__date__gte=first_month_start
        ).values('request_date__date', 'service_type__name', 'status').annotate(count=Count('id'))

        for item in requests:
            request_day = item['request_date__date']
            if not request_day:
                continue
            month_start = request_day.replace(day=1)
            if month_start not in buckets:
                continue

            service_name = item['service_type__name'] or 'Unknown Service'
            service_bucket = buckets[month_start]['services'].setdefault(service_name, {
                'serviceType': service_name,
                'requestCount': 0,
                'completedCount': 0,
            })
            service_bucket['requestCount'] += item['count']
            if item['status'] == 'Completed':
                service_bucket['completedCount'] += item['count']

        breakdown = []
        for month_start in sorted(buckets.keys()):
            service_rows = sorted(
                buckets[month_start]['services'].values(),
                key=lambda item: (-item['requestCount'], item['serviceType'])
            )
            top_service = service_rows[0] if service_rows else None
            breakdown.append({
                'monthStart': buckets[month_start]['monthStart'],
                'label': buckets[month_start]['label'],
                'services': service_rows[:self.ANALYTICS_LIST_LIMIT],
                'topService': top_service,
            })

        return breakdown

    def _build_busiest_months(self, today, days=30):
        # Calculate based on days
        months_back = max(3, min(36, days // 30))
        window_start = (today.replace(day=1) - timezone.timedelta(days=months_back * 31)).replace(day=1)
        buckets = defaultdict(lambda: {
            'monthStart': None,
            'label': '',
            'requestCount': 0,
            'completedCount': 0,
        })

        requests = ServiceRequest.objects.filter(
            request_date__date__gte=window_start
        ).values('request_date__date', 'status').annotate(count=Count('id'))

        for item in requests:
            request_day = item['request_date__date']
            if not request_day:
                continue
            month_start = request_day.replace(day=1)
            bucket = buckets[month_start]
            bucket['monthStart'] = month_start.isoformat()
            bucket['label'] = month_start.strftime('%b %Y')
            bucket['requestCount'] += item['count']
            if item['status'] == 'Completed':
                bucket['completedCount'] += item['count']

        busiest_months = []
        for month_start, bucket in buckets.items():
            completion_rate = (
                (bucket['completedCount'] / bucket['requestCount']) * 100
                if bucket['requestCount'] else 0
            )
            busiest_months.append({
                **bucket,
                'completionRate': round(completion_rate, 1),
                '_sort_month': month_start,
            })

        busiest_months.sort(
            key=lambda item: (-item['requestCount'], -item['_sort_month'].toordinal())
        )

        return [
            {key: value for key, value in item.items() if key != '_sort_month'}
            for item in busiest_months[:self.ANALYTICS_LIST_LIMIT]
        ]

    def _build_busiest_weeks(self, today, days=30):
        # Calculate based on days
        weeks_back = max(4, min(156, days // 7))
        window_start = today - timezone.timedelta(days=(weeks_back * 7) - 1)
        buckets = defaultdict(lambda: {
            'weekStart': None,
            'weekEnd': None,
            'label': '',
            'requestCount': 0,
            'completedCount': 0,
        })

        requests = ServiceRequest.objects.filter(
            request_date__date__gte=window_start
        ).values('request_date__date', 'status').annotate(count=Count('id'))

        for item in requests:
            request_day = item['request_date__date']
            if not request_day:
                continue
            week_start = request_day - timezone.timedelta(days=request_day.weekday())
            week_end = week_start + timezone.timedelta(days=6)
            bucket = buckets[week_start]
            bucket['weekStart'] = week_start.isoformat()
            bucket['weekEnd'] = week_end.isoformat()
            bucket['label'] = f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d')}"
            bucket['requestCount'] += item['count']
            if item['status'] == 'Completed':
                bucket['completedCount'] += item['count']

        busiest_weeks = []
        for week_start, bucket in buckets.items():
            completion_rate = (
                (bucket['completedCount'] / bucket['requestCount']) * 100
                if bucket['requestCount'] else 0
            )
            busiest_weeks.append({
                **bucket,
                'completionRate': round(completion_rate, 1),
                '_sort_week': week_start,
            })

        busiest_weeks.sort(
            key=lambda item: (-item['requestCount'], -item['_sort_week'].toordinal())
        )

        return [
            {key: value for key, value in item.items() if key != '_sort_week'}
            for item in busiest_weeks[:self.ANALYTICS_LIST_LIMIT]
        ]

    def _build_top_requested_service_types(self, service_breakdown):
        top_services = []
        for service in service_breakdown[:self.ANALYTICS_LIST_LIMIT]:
            completion_rate = (
                (service['completedRequests'] / service['count']) * 100
                if service['count'] else 0
            )
            top_services.append({
                'serviceTypeId': service['id'],
                'serviceType': service['name'],
                'requestCount': service['count'],
                'recentRequests': service['recentRequests'],
                'completedCount': service['completedRequests'],
                'completionRate': round(completion_rate, 1),
            })
        return top_services

    def _build_request_source_breakdown(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)
        rows = list(
            ServiceRequest.objects.filter(
                request_date__date__gte=period_start,
                request_date__date__lte=today,
            )
            .values('request_source')
            .annotate(count=Count('id'))
            .order_by('-count', 'request_source')
        )
        total = sum(item['count'] for item in rows) or 1
        source_labels = dict(ServiceRequest.REQUEST_SOURCE_CHOICES)

        return [
            {
                'source': item['request_source'] or 'unknown',
                'label': source_labels.get(item['request_source'], (item['request_source'] or 'Unknown').replace('_', ' ').title()),
                'count': item['count'],
                'percentage': round((item['count'] / total) * 100, 1),
            }
            for item in rows[:self.ANALYTICS_LIST_LIMIT]
        ]

    def _build_priority_distribution(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)

        def serialize_counts(rows, label_map):
            total = sum(item['count'] for item in rows) or 1
            return [
                {
                    'priority': item['priority'] or 'unknown',
                    'label': label_map.get(item['priority'], item['priority'] or 'Unknown'),
                    'count': item['count'],
                    'percentage': round((item['count'] / total) * 100, 1),
                }
                for item in rows
            ]

        request_rows = list(
            ServiceRequest.objects.filter(
                request_date__date__gte=period_start,
                request_date__date__lte=today,
            )
            .values('priority')
            .annotate(count=Count('id'))
            .order_by('-count', 'priority')
        )
        ticket_rows = list(
            ServiceTicket.objects.filter(
                Q(created_at__date__gte=period_start, created_at__date__lte=today) |
                Q(scheduled_date__gte=period_start, scheduled_date__lte=today) |
                Q(completed_date__date__gte=period_start, completed_date__date__lte=today)
            )
            .values('priority')
            .annotate(count=Count('id'))
            .order_by('-count', 'priority')
        )

        priority_labels = dict(ServiceRequest.PRIORITY_CHOICES)
        return {
            'requests': serialize_counts(request_rows, priority_labels),
            'tickets': serialize_counts(ticket_rows, priority_labels),
        }

    def _build_ticket_status_breakdown(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)
        rows = list(
            ServiceTicket.objects.filter(
                Q(created_at__date__gte=period_start, created_at__date__lte=today) |
                Q(scheduled_date__gte=period_start, scheduled_date__lte=today) |
                Q(completed_date__date__gte=period_start, completed_date__date__lte=today)
            )
            .values('status')
            .annotate(count=Count('id'))
            .order_by('-count', 'status')
        )
        total = sum(item['count'] for item in rows) or 1

        return [
            {
                'status': item['status'] or 'Unknown',
                'count': item['count'],
                'percentage': round((item['count'] / total) * 100, 1),
            }
            for item in rows[:self.ANALYTICS_LIST_LIMIT]
        ]

    def _build_scheduling_insights(self, today, days=30):
        period_start = today - timezone.timedelta(days=days - 1)

        def count_rows(queryset, field_name, label_map=None):
            rows = list(
                queryset.values(field_name)
                .annotate(count=Count('id'))
                .order_by('-count', field_name)
            )
            total = sum(item['count'] for item in rows) or 1
            serialized = []
            for item in rows[:self.ANALYTICS_LIST_LIMIT]:
                value = item[field_name] or 'unspecified'
                serialized.append({
                    'value': value,
                    'label': (label_map or {}).get(item[field_name], str(value).replace('_', ' ').title()),
                    'count': item['count'],
                    'percentage': round((item['count'] / total) * 100, 1),
                })
            return serialized

        period_requests = ServiceRequest.objects.filter(
            request_date__date__gte=period_start,
            request_date__date__lte=today,
        )
        period_tickets = ServiceTicket.objects.filter(
            Q(created_at__date__gte=period_start, created_at__date__lte=today) |
            Q(scheduled_date__gte=period_start, scheduled_date__lte=today) |
            Q(completed_date__date__gte=period_start, completed_date__date__lte=today)
        )

        slot_labels = dict(ServiceRequest._meta.get_field('preferred_time_slot').choices)
        ticket_type_labels = dict(ServiceTicket.TICKET_TYPE_CHOICES)
        warranty_labels = dict(ServiceTicket.WARRANTY_STATUS_CHOICES)

        return {
            'preferredRequestSlots': count_rows(
                period_requests.exclude(preferred_time_slot__isnull=True).exclude(preferred_time_slot=''),
                'preferred_time_slot',
                slot_labels,
            ),
            'scheduledTicketSlots': count_rows(
                period_tickets.exclude(scheduled_time_slot__isnull=True).exclude(scheduled_time_slot=''),
                'scheduled_time_slot',
                slot_labels,
            ),
            'ticketTypes': count_rows(period_tickets, 'ticket_type', ticket_type_labels),
            'warrantyStatuses': count_rows(period_tickets, 'warranty_status', warranty_labels),
            'rescheduleRequests': {
                'count': period_tickets.filter(reschedule_requested=True).count(),
                'totalTickets': period_tickets.count(),
            },
        }

    def _build_location_completion_trends(self, today, days=30):
        # Use 30 days for location trends or full period if shorter
        trend_window = min(30, days)
        recent_start = today - timezone.timedelta(days=trend_window - 1)
        previous_start = recent_start - timezone.timedelta(days=trend_window)

        tickets = ServiceTicket.objects.filter(
            request__location__isnull=False
        ).values(
            'request__location__city',
            'request__location__province',
            'status',
            'completed_date'
        )

        city_buckets = defaultdict(lambda: {
            'city': '',
            'totalTickets': 0,
            'completedCount': 0,
            'recentCompleted': 0,
            'previousCompleted': 0,
            'latestCompletedDate': None,
        })
        province_buckets = defaultdict(lambda: {
            'province': '',
            'totalTickets': 0,
            'completedCount': 0,
            'recentCompleted': 0,
            'previousCompleted': 0,
            'latestCompletedDate': None,
        })

        for ticket in tickets:
            city = (ticket['request__location__city'] or '').strip()
            province = (ticket['request__location__province'] or '').strip()
            bucket_targets = []

            if city and city.lower() != 'unspecified':
                bucket_targets.append((city_buckets, city, 'city'))
            if province and province.lower() != 'unspecified':
                bucket_targets.append((province_buckets, province, 'province'))

            for bucket_map, label, field_name in bucket_targets:
                bucket = bucket_map[label]
                bucket[field_name] = label
                bucket['totalTickets'] += 1

                if ticket['status'] != 'Completed' or not ticket['completed_date']:
                    continue

                bucket['completedCount'] += 1
                dt = ticket['completed_date']
                completed_day = (
                    timezone.localtime(dt).date()
                    if timezone.is_aware(dt) else dt.date()
                )
                if completed_day >= recent_start:
                    bucket['recentCompleted'] += 1
                elif previous_start <= completed_day < recent_start:
                    bucket['previousCompleted'] += 1

                latest_completed = bucket['latestCompletedDate']
                if latest_completed is None or completed_day > latest_completed:
                    bucket['latestCompletedDate'] = completed_day

        def serialize_location_buckets(bucket_map, field_name):
            serialized = []
            for bucket in bucket_map.values():
                trend_delta = bucket['recentCompleted'] - bucket['previousCompleted']
                if trend_delta > 0:
                    trend_direction = 'up'
                elif trend_delta < 0:
                    trend_direction = 'down'
                else:
                    trend_direction = 'flat'

                completion_rate = (
                    (bucket['completedCount'] / bucket['totalTickets']) * 100
                    if bucket['totalTickets'] else 0
                )

                serialized.append({
                    field_name: bucket[field_name],
                    'totalTickets': bucket['totalTickets'],
                    'completedCount': bucket['completedCount'],
                    'completionRate': round(completion_rate, 1),
                    'recentCompleted': bucket['recentCompleted'],
                    'previousCompleted': bucket['previousCompleted'],
                    'trendDelta': trend_delta,
                    'trendDirection': trend_direction,
                    'latestCompletedDate': bucket['latestCompletedDate'].isoformat()
                    if bucket['latestCompletedDate'] else None,
                })

            serialized.sort(
                key=lambda item: (
                    -item['completedCount'],
                    -item['recentCompleted'],
                    item[field_name].lower(),
                )
            )
            return serialized[:self.ANALYTICS_LIST_LIMIT]

        return (
            serialize_location_buckets(city_buckets, 'city'),
            serialize_location_buckets(province_buckets, 'province'),
        )

    def _build_location_demand_forecast(self, today, days, service_forecasts, predictive_summary):
        """Project near-future demand into heatmap locations using recent demand and service mix."""
        history_days = min(max(days, 30), 90)
        recent_days = min(max(14, days // 2), 30)
        history_start = today - timezone.timedelta(days=history_days - 1)
        recent_start = today - timezone.timedelta(days=recent_days - 1)
        previous_start = recent_start - timezone.timedelta(days=recent_days)

        service_projection = {
            item['serviceType']: {
                'predicted': int(item.get('predictedNext7Days') or 0),
                'riskLevel': item.get('riskLevel') or 'low',
                'confidence': item.get('confidence') or 0,
            }
            for item in service_forecasts
        }
        total_predicted = int(predictive_summary.get('totalPredictedRequests') or 0)

        location_buckets = defaultdict(lambda: {
            'city': '',
            'province': '',
            'address': '',
            'lat_sum': 0.0,
            'lng_sum': 0.0,
            'point_count': 0,
            'historicalRequests': 0,
            'recentRequests': 0,
            'previousRequests': 0,
            'completedHeatmapCount': 0,
            'serviceBreakdown': defaultdict(int),
        })

        requests = (
            ServiceRequest.objects
            .filter(
                request_date__date__gte=previous_start,
                request_date__date__lte=today,
                location__isnull=False,
            )
            .select_related('service_type', 'location')
        )

        completed_request_ids = set(
            ServiceTicket.objects
            .filter(
                status='Completed',
                completed_date__date__gte=history_start,
                completed_date__date__lte=today,
                request__location__isnull=False,
            )
            .values_list('request_id', flat=True)
        )

        for service_request in requests:
            try:
                location = service_request.location
            except Exception:
                continue

            city = (location.city or '').strip()
            province = (location.province or '').strip()
            if not city and not province:
                continue

            key = f"{city.lower()}|{province.lower()}"
            bucket = location_buckets[key]
            bucket['city'] = city or 'Unspecified city'
            bucket['province'] = province or 'Unspecified province'
            bucket['address'] = location.address or bucket['address']

            if location.latitude is not None and location.longitude is not None:
                bucket['lat_sum'] += float(location.latitude)
                bucket['lng_sum'] += float(location.longitude)
                bucket['point_count'] += 1

            request_dt = service_request.request_date
            request_day = (
                timezone.localtime(request_dt).date()
                if timezone.is_aware(request_dt) else request_dt.date()
            )
            bucket['historicalRequests'] += 1
            if request_day >= recent_start:
                bucket['recentRequests'] += 1
            elif previous_start <= request_day < recent_start:
                bucket['previousRequests'] += 1

            service_name = service_request.service_type.name if service_request.service_type_id else 'Unknown Service'
            bucket['serviceBreakdown'][service_name] += 1
            if service_request.id in completed_request_ids:
                bucket['completedHeatmapCount'] += 1

        scored_locations = []
        total_score = 0.0
        for bucket in location_buckets.values():
            service_rows = sorted(
                [
                    {
                        'serviceType': service_name,
                        'requestCount': count,
                        'projectedServiceDemand': service_projection.get(service_name, {}).get('predicted', 0),
                        'riskLevel': service_projection.get(service_name, {}).get('riskLevel', 'low'),
                    }
                    for service_name, count in bucket['serviceBreakdown'].items()
                ],
                key=lambda item: (-item['requestCount'], item['serviceType'])
            )
            top_service = service_rows[0] if service_rows else None
            trend_delta = bucket['recentRequests'] - bucket['previousRequests']
            heatmap_weight = bucket['completedHeatmapCount'] * 0.8
            recent_weight = bucket['recentRequests'] * 1.6
            history_weight = bucket['historicalRequests'] * 0.6
            service_weight = (top_service['projectedServiceDemand'] * 0.5) if top_service else 0
            score = max(0.1, recent_weight + history_weight + heatmap_weight + service_weight + max(0, trend_delta * 0.7))
            total_score += score

            if trend_delta > 0:
                trend_direction = 'up'
            elif trend_delta < 0:
                trend_direction = 'down'
            else:
                trend_direction = 'flat'

            scored_locations.append({
                'city': bucket['city'],
                'province': bucket['province'],
                'label': ', '.join(part for part in [bucket['city'], bucket['province']] if part),
                'representativeAddress': bucket['address'],
                'lat': round(bucket['lat_sum'] / bucket['point_count'], 6) if bucket['point_count'] else None,
                'lng': round(bucket['lng_sum'] / bucket['point_count'], 6) if bucket['point_count'] else None,
                'historicalRequests': bucket['historicalRequests'],
                'recentRequests': bucket['recentRequests'],
                'previousRequests': bucket['previousRequests'],
                'trendDelta': trend_delta,
                'trendDirection': trend_direction,
                'completedHeatmapCount': bucket['completedHeatmapCount'],
                'topServiceType': top_service['serviceType'] if top_service else None,
                'serviceBreakdown': service_rows[:self.ANALYTICS_LIST_LIMIT],
                '_score': score,
            })

        for location in scored_locations:
            share = (location['_score'] / total_score) if total_score else 0
            projected = int(round(total_predicted * share)) if total_predicted else 0
            if total_predicted and projected == 0 and location['recentRequests']:
                projected = 1

            confidence = 40
            confidence += min(25, location['historicalRequests'] * 3)
            confidence += min(20, location['completedHeatmapCount'] * 4)
            if location['recentRequests'] and location['previousRequests']:
                confidence += 10
            confidence = min(90, confidence)

            if projected >= 3 or location['trendDelta'] >= 2:
                risk_level = 'high'
            elif projected >= 1 or location['trendDirection'] == 'up':
                risk_level = 'medium'
            else:
                risk_level = 'low'

            location['projectedNext7Days'] = projected
            location['demandSharePercent'] = round(share * 100, 1)
            location['confidence'] = confidence
            location['riskLevel'] = risk_level
            del location['_score']

        scored_locations.sort(
            key=lambda item: (
                -item['projectedNext7Days'],
                -item['recentRequests'],
                -item['completedHeatmapCount'],
                item['label'].lower(),
            )
        )

        return {
            'forecastWindowDays': self.FORECAST_WINDOW_DAYS,
            'historyWindowDays': history_days,
            'recentWindowDays': recent_days,
            'totalProjectedRequests': total_predicted,
            'method': 'Weighted forecast using service demand projections, recent location requests, previous-period trend, and completed-service heatmap density.',
            'hotspots': scored_locations[:self.ANALYTICS_LIST_LIMIT],
        }

    def _build_seasonal_inventory_demand(self, today, days=30):
        """Analyze historical inventory demand by category for the current season."""
        from inventory.models import InventoryTransaction

        # Analyze the selected period for seasonal analysis
        season_start = today - timezone.timedelta(days=days - 1)
        current_timezone = timezone.get_current_timezone()
        period_start = timezone.make_aware(
            datetime.combine(season_start, time.min),
            current_timezone,
        )
        period_end = timezone.make_aware(
            datetime.combine(today + timezone.timedelta(days=1), time.min),
            current_timezone,
        )

        try:
            # Get issued inventory transactions from the selected period.
            transactions = InventoryTransaction.objects.filter(
                transaction_date__gte=period_start,
                transaction_date__lt=period_end,
                transaction_type='issue',
                service_ticket__isnull=False,
            ).exclude(
                service_ticket__request__description__startswith='[Historical Seed]'
            ).select_related('item', 'item__category')

            # Group by category and sum quantities
            category_demand = {}
            item_demand = {}

            for transaction in transactions:
                quantity = abs(transaction.quantity)  # Make positive

                # By category
                cat_name = transaction.item.category.name if transaction.item.category else 'Uncategorized'
                if cat_name not in category_demand:
                    category_demand[cat_name] = {'quantity': 0, 'transactions': 0, 'items': set()}
                category_demand[cat_name]['quantity'] += quantity
                category_demand[cat_name]['transactions'] += 1
                category_demand[cat_name]['items'].add(transaction.item.name)

                # By item
                item_key = transaction.item.name
                if item_key not in item_demand:
                    item_demand[item_key] = {'quantity': 0, 'transactions': 0, 'category': cat_name}
                item_demand[item_key]['quantity'] += quantity
                item_demand[item_key]['transactions'] += 1

            # Sort categories by demand
            sorted_categories = sorted(
                [
                    {
                        'category': cat,
                        'quantity': stats['quantity'],
                        'transactions': stats['transactions'],
                        'itemCount': len(stats['items']),
                        'demand': 'High' if stats['quantity'] > 50 else 'Medium' if stats['quantity'] > 10 else 'Low'
                    }
                    for cat, stats in category_demand.items()
                ],
                key=lambda x: x['quantity'],
                reverse=True
            )

            # Sort items by demand (top 10)
            sorted_items = sorted(
                [
                    {
                        'item': item,
                        'category': stats['category'],
                        'quantity': stats['quantity'],
                        'transactions': stats['transactions'],
                        'demand': 'High' if stats['quantity'] > 20 else 'Medium' if stats['quantity'] > 5 else 'Low'
                    }
                    for item, stats in item_demand.items()
                ],
                key=lambda x: x['quantity'],
                reverse=True
            )[:10]

            return {
                'period': f'Past {days} days',
                'categoryDemand': sorted_categories,
                'topItems': sorted_items,
                'totalTransactions': len(transactions),
                'totalQuantityConsumed': sum(category_demand[cat]['quantity'] for cat in category_demand),
                'analysisDate': today.isoformat(),
            }
        except Exception as e:
            # Return empty if inventory app not available
            return {
                'period': f'Past {days} days',
                'categoryDemand': [],
                'topItems': [],
                'totalTransactions': 0,
                'totalQuantityConsumed': 0,
                'analysisDate': today.isoformat(),
                'error': str(e)
            }

    def _build_predictive_analytics(self, today, days=30):
        readiness = _forecast_readiness()
        return ({
                'available': False,
                'forecastWindowDays': self.FORECAST_WINDOW_DAYS,
                'historyWindowDays': self.HISTORY_WINDOW_DAYS,
                'totalPredictedRequests': None,
                'projectedGrowthRate': None,
                'activeTechnicians': User.objects.filter(role='technician', status='active', is_active=True).count(),
                'recommendedTechnicians': None,
                'staffingPressure': 'unavailable',
                'busiestDay': None,
                'topRiskService': None,
                'reason': readiness['reason'] if not readiness['available'] else 'The legacy forecast is disabled; no validated forecast model has been trained.',
                'requestCount': readiness['request_count'],
                'historyMonths': readiness['history_months'],
            }, [], [])

        # Retained below only as historical implementation reference. This
        # path is intentionally unreachable until a validated model replaces it.
        history_days = min(days, 42)  # Max 42 days for history
        recent_days = min(max(14, days // 2), 30)  # 50% of period or 14-30 days

        history_start = today - timezone.timedelta(days=history_days - 1)
        recent_start = today - timezone.timedelta(days=recent_days - 1)
        previous_start = recent_start - timezone.timedelta(days=recent_days)

        active_technicians = User.objects.filter(
            role='technician',
            status='active',
            is_active=True
        ).count()

        weekday_slots = {index: 0 for index in range(7)}
        current_date = history_start
        while current_date <= today:
            weekday_slots[current_date.weekday()] += 1
            current_date += timezone.timedelta(days=1)

        daily_forecast_map = {}
        for offset in range(1, self.FORECAST_WINDOW_DAYS + 1):
            forecast_date = today + timezone.timedelta(days=offset)
            daily_forecast_map[forecast_date] = {
                'date': forecast_date.isoformat(),
                'label': forecast_date.strftime('%a %d %b'),
                'predictedRequests': 0,
            }

        service_forecasts = []
        weighted_growth_total = 0
        weighted_growth_volume = 0

        for service_type in ServiceType.objects.order_by('name'):
            request_days = []
            history_requests = ServiceRequest.objects.filter(
                service_type=service_type,
                request_date__date__gte=previous_start,
                request_date__date__lte=today
            ).values_list('request_date', flat=True)

            for request_date in history_requests:
                localized = timezone.localtime(request_date) if timezone.is_aware(request_date) else request_date
                request_days.append(localized.date())

            weekday_counts = {index: 0 for index in range(7)}
            history_count = 0
            recent_count = 0
            previous_count = 0

            for request_day in request_days:
                if request_day >= history_start:
                    history_count += 1
                    weekday_counts[request_day.weekday()] += 1
                if request_day >= recent_start:
                    recent_count += 1
                elif request_day >= previous_start:
                    previous_count += 1

            history_daily_average = (
                history_count / self.HISTORY_WINDOW_DAYS if history_count else 0
            )
            recent_daily_average = (
                recent_count / self.RECENT_WINDOW_DAYS if recent_count else history_daily_average
            )
            previous_daily_average = (
                previous_count / self.RECENT_WINDOW_DAYS if previous_count else 0
            )

            if previous_daily_average > 0:
                growth_rate = (recent_daily_average - previous_daily_average) / previous_daily_average
            elif recent_daily_average > 0 and history_daily_average > 0:
                growth_rate = (recent_daily_average - history_daily_average) / history_daily_average
            elif recent_daily_average > 0:
                growth_rate = 0.25
            else:
                growth_rate = 0

            trend_factor = max(0.8, min(1.5, 1 + (growth_rate * 0.35)))
            per_day_predictions = []

            for offset in range(1, self.FORECAST_WINDOW_DAYS + 1):
                forecast_date = today + timezone.timedelta(days=offset)
                weekday = forecast_date.weekday()
                weekday_average = weekday_counts[weekday] / max(1, weekday_slots[weekday])

                if history_daily_average > 0 and weekday_average > 0:
                    weekday_factor = weekday_average / history_daily_average
                else:
                    weekday_factor = 1.12 if weekday == 0 else 0.9 if weekday >= 5 else 1.0

                raw_prediction = recent_daily_average * weekday_factor * trend_factor
                if history_count == 0 and recent_count == 0:
                    predicted_requests = 0
                elif raw_prediction < 1:
                    predicted_requests = 1
                else:
                    predicted_requests = int(round(raw_prediction))

                per_day_predictions.append(predicted_requests)
                daily_forecast_map[forecast_date]['predictedRequests'] += predicted_requests

            predicted_next_7_days = sum(per_day_predictions)
            available_technicians = (
                TechnicianSkill.objects.filter(
                    service_type=service_type,
                    technician__role='technician',
                    technician__status='active',
                    technician__is_active=True
                )
                .values('technician_id')
                .distinct()
                .count()
            )
            if available_technicians == 0:
                available_technicians = active_technicians

            recommended_technicians = (
                (predicted_next_7_days + self.FORECAST_JOBS_PER_TECHNICIAN - 1)
                // self.FORECAST_JOBS_PER_TECHNICIAN
                if predicted_next_7_days > 0 else 0
            )
            capacity_gap = max(0, recommended_technicians - available_technicians)

            if capacity_gap > 0:
                risk_level = 'high'
            elif growth_rate > 0.2 or (
                available_technicians > 0 and
                predicted_next_7_days > available_technicians * self.FORECAST_JOBS_PER_TECHNICIAN
            ):
                risk_level = 'medium'
            else:
                risk_level = 'low'

            confidence = 45
            if history_count:
                confidence += min(35, history_count)
            if previous_count and recent_count:
                confidence += 10
            confidence = min(92, confidence)

            service_forecasts.append({
                'serviceTypeId': service_type.id,
                'serviceType': service_type.name,
                'recentRequests': recent_count,
                'previousRequests': previous_count,
                'historyRequests': history_count,
                'averageDailyDemand': round(recent_daily_average, 2),
                'projectedGrowthRate': round(growth_rate * 100, 1),
                'predictedNext7Days': predicted_next_7_days,
                'availableTechnicians': available_technicians,
                'recommendedTechnicians': recommended_technicians,
                'capacityGap': capacity_gap,
                'confidence': confidence,
                'riskLevel': risk_level,
            })

            weighted_growth_total += growth_rate * predicted_next_7_days
            weighted_growth_volume += predicted_next_7_days

        risk_priority = {'high': 0, 'medium': 1, 'low': 2}
        service_forecasts.sort(
            key=lambda item: (
                risk_priority.get(item['riskLevel'], 3),
                -item['predictedNext7Days'],
                item['serviceType']
            )
        )

        daily_forecast = []
        for forecast_date in sorted(daily_forecast_map.keys()):
            entry = daily_forecast_map[forecast_date]
            predicted_requests = entry['predictedRequests']
            capacity_gap = max(0, predicted_requests - active_technicians)

            if capacity_gap > 0:
                demand_level = 'high'
            elif predicted_requests >= max(3, active_technicians):
                demand_level = 'medium'
            else:
                demand_level = 'low'

            daily_forecast.append({
                **entry,
                'capacityGap': capacity_gap,
                'demandLevel': demand_level,
            })

        total_predicted_requests = sum(item['predictedRequests'] for item in daily_forecast)
        recommended_technicians = (
            (total_predicted_requests + self.FORECAST_JOBS_PER_TECHNICIAN - 1)
            // self.FORECAST_JOBS_PER_TECHNICIAN
            if total_predicted_requests > 0 else 0
        )
        projected_growth_rate = (
            round((weighted_growth_total / weighted_growth_volume) * 100, 1)
            if weighted_growth_volume else 0
        )

        if recommended_technicians > active_technicians:
            staffing_pressure = 'high'
        elif recommended_technicians == active_technicians and recommended_technicians > 0:
            staffing_pressure = 'medium'
        else:
            staffing_pressure = 'low'

        busiest_day = max(
            daily_forecast,
            key=lambda item: item['predictedRequests'],
            default=None
        )
        top_risk_service = next(
            (item for item in service_forecasts if item['riskLevel'] == 'high'),
            service_forecasts[0] if service_forecasts else None
        )

        predictive_summary = {
            'forecastWindowDays': self.FORECAST_WINDOW_DAYS,
            'historyWindowDays': self.HISTORY_WINDOW_DAYS,
            'totalPredictedRequests': total_predicted_requests,
            'projectedGrowthRate': projected_growth_rate,
            'activeTechnicians': active_technicians,
            'recommendedTechnicians': recommended_technicians,
            'staffingPressure': staffing_pressure,
            'busiestDay': busiest_day,
            'topRiskService': {
                'serviceType': top_risk_service['serviceType'],
                'predictedNext7Days': top_risk_service['predictedNext7Days'],
                'capacityGap': top_risk_service['capacityGap'],
                'riskLevel': top_risk_service['riskLevel'],
            } if top_risk_service else None,
        }

        return predictive_summary, service_forecasts, daily_forecast
