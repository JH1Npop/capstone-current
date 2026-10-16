# Auto-split from users/views.py
import json
import os
from datetime import date, datetime, time, timedelta
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

from django.utils.dateparse import parse_date

from inventory.models import ServiceTypeInventoryRequirement
from users.analytics_service import _forecast_readiness, build_admin_analytics
from users.views.helpers import *  # noqa: F401,F403
from services.views.service_types import with_catalog_counts
from users.permissions import CanManageServiceCatalog, CanViewAnalytics, CanViewServiceCatalog


def _busiest_periods(trend, unit):
    """Roll the overview trend up to months or ISO weeks and rank by requests."""
    buckets = {}
    for row in trend:
        day = date.fromisoformat(row['period'])
        if unit == 'month':
            key, label = day.replace(day=1), day.strftime('%b %Y')
        else:
            key = day - timedelta(days=day.weekday())
            label = f"Week of {key.strftime('%b %d, %Y')}"
        bucket = buckets.setdefault(key, {'label': label, 'requestCount': 0, 'completedCount': 0})
        bucket['requestCount'] += row.get('requests', 0)
        bucket['completedCount'] += row.get('completions', 0)
    return sorted(
        (bucket for bucket in buckets.values() if bucket['requestCount'] or bucket['completedCount']),
        key=lambda bucket: (-bucket['requestCount'], -bucket['completedCount']),
    )

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

        serializer = ServiceTypeSerializer(with_catalog_counts(services), many=True)
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
            linked_count = service.request_items.count() + service.maintenance_schedules.count()
            if request_count or ticket_count or linked_count:
                return Response({
                    'error': 'This service is already used by requests or tickets. Deactivate it instead of deleting it.',
                    'request_count': request_count,
                    'ticket_count': ticket_count,
                    'usage_count': request_count + ticket_count + linked_count,
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
            requires_site_inspection=service.requires_site_inspection,
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
        analytics_summary = self._build_ai_analytics_summary(end_date, days, request.query_params)
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
            "For the Admin's selected filters and workspace, use selectedAnalytics and selectedWorkspace as the authoritative current data.\n"
            "Treat historical analytics and forecasting readiness as separate concepts.\n"
            "Never describe historical density or inventory usage as a prediction.\n"
            "When forecast.predictions_available is false, clearly say that no validated forecast, future quantity, confidence score, or forecast accuracy is available.\n"
            "When asked how future item demand will eventually be calculated, explain forecastMethod without claiming that the model already exists.\n"
            "When asked about sales or revenue, use confirmedSales (confirmed, non-voided Sales Records in the selected period). If its count is 0, say no confirmed sales were recorded; never estimate sales from service prices.\n"
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

    def _build_ai_analytics_summary(self, today, days, params=None):
        start_date = today - timezone.timedelta(days=days - 1)
        selected_params = {
            key: value
            for key, value in (params.items() if params is not None else [])
            if key != 'question'
        }
        selected_params.update({
            'start_date': start_date.isoformat(),
            'end_date': today.isoformat(),
        })
        selected_workspace = selected_params.get('workspace') or 'overview'
        overview_contract = build_admin_analytics({
            **selected_params,
            'workspace': 'overview',
        })
        forecasting_contract = build_admin_analytics({
            **selected_params,
            'workspace': 'forecasting',
        })
        selected_workspace_contract = build_admin_analytics({
            **selected_params,
            'workspace': selected_workspace,
        })
        sales_contract = build_admin_analytics({
            **selected_params,
            'workspace': 'sales',
        })
        # Shared figures come from the same contracts the Analytics page renders, so
        # the assistant can never contradict the page. Only extras with no page
        # equivalent keep their own small builders below.
        overview = overview_contract.get('overview', {})
        kpis = overview_contract.get('kpis', {})
        charts = overview_contract.get('charts', {})
        trend = charts.get('requests_vs_completions', [])
        technicians = User.objects.filter(role='technician', status='active', is_active=True)
        workload = charts.get('technician_workload', [])
        top_workload = max(workload, key=lambda row: (row.get('completed_jobs') or 0, row.get('assigned_jobs') or 0), default=None)
        sales_kpis = sales_contract.get('kpis', {})
        seasonal_inventory_demand = self._build_seasonal_inventory_demand(today, days)
        request_source_breakdown = self._build_request_source_breakdown(today, days)
        priority_distribution = self._build_priority_distribution(today, days)
        scheduling_insights = self._build_scheduling_insights(today, days)

        model_status = forecasting_contract.get('model_status', {})
        forecast_available = bool(model_status.get('predictions_available'))
        return {
            'periodDays': days,
            'generatedAt': timezone.now().isoformat(),
            'selectedAnalytics': overview_contract,
            'selectedWorkspace': selected_workspace_contract,
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
                'activeTechnicians': technicians.count(),
                'availableTechnicians': technicians.filter(technician_profile__is_available=True).count(),
                'avgResponseTimeHours': kpis.get('average_response_hours'),
                'avgCompletionTimeHours': kpis.get('average_completion_hours'),
                'completionRate': kpis.get('completion_rate'),
                'onScheduleRate': kpis.get('on_schedule_rate'),
                'averageClientRating': kpis.get('average_client_rating'),
                'cancellationRate': kpis.get('cancellation_rate'),
                'currentOverdue': kpis.get('current_overdue'),
            },
            'confirmedSales': {
                'count': (sales_kpis.get('confirmed_sales_count') or {}).get('current', 0),
                'amount': (sales_kpis.get('confirmed_sales_amount') or {}).get('current'),
                'currency': (sales_kpis.get('confirmed_sales_amount') or {}).get('currency'),
                'dataSource': 'Confirmed, non-voided Sales Records with a sale date in the selected period.',
            },
            'topServices': [
                {
                    'serviceType': row.get('service_type'),
                    'requests': row.get('requests', 0),
                    'previousRequests': row.get('previous_requests'),
                }
                for row in charts.get('service_demand', [])[:5]
            ],
            'topTechnician': {
                'name': top_workload.get('technician'),
                'completedJobs': top_workload.get('completed_jobs', 0),
                'assignedJobs': top_workload.get('assigned_jobs', 0),
            } if top_workload else None,
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
            'busiestMonths': _busiest_periods(trend, 'month')[:3],
            'busiestWeeks': _busiest_periods(trend, 'week')[:3],
            'locationDemand': [
                {
                    'city': row.get('city'),
                    'province': row.get('province'),
                    'requests': row.get('requests', 0),
                    'previousRequests': row.get('previous_requests'),
                }
                for row in charts.get('locations', [])[:5]
            ],
            'requestSources': request_source_breakdown[:5],
            'priorityDistribution': priority_distribution,
            'ticketStatusBreakdown': sorted(
                (
                    {'status': row['label'], 'count': row['count'], 'previousCount': row.get('previous_count')}
                    for row in charts.get('ticket_statuses', []) if row['count'] or row.get('previous_count')
                ),
                key=lambda row: -row['count'],
            )[:5],
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
        confirmed_sales = summary.get('confirmedSales', {})

        what = (
            f"Analytics show {total} request(s), {completed} completed, and {pending} pending "
            f"for the selected {summary.get('periodDays', 30)}-day period."
        )
        if forecast.get('predictions_available'):
            what += " A validated forecast is available."
        else:
            what += f" Forecasts are unavailable: {forecast.get('reason') or 'the evidence and model-validation gates are not met.'}"
        if top_service:
            what += f" Top service demand is {top_service.get('serviceType') or 'the leading service'}."
        if confirmed_sales.get('count'):
            amount = confirmed_sales.get('amount')
            what += (
                f" {confirmed_sales['count']} confirmed sale(s) were recorded"
                + (f" totalling {confirmed_sales.get('currency') or 'PHP'} {float(amount):,.2f}." if amount is not None else ' in more than one currency.')
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
