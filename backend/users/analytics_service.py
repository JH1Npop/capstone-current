"""Live, read-only analytics for the Admin Analytics workspace."""

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.db.models import CharField, Count, F, FloatField, Q, Sum, Value
from django.db.models.functions import Cast, Coalesce, TruncDay, TruncMonth, TruncQuarter, TruncWeek, TruncYear
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

from inventory.models import InventoryItem
from services.models import (
    AfterSalesCase,
    MaintenanceSchedule,
    SalesRecord,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
)
from services.sla import evaluate_service_ticket_sla
from users.models import User


GROUPINGS = {
    'day': TruncDay,
    'week': TruncWeek,
    'month': TruncMonth,
    'quarter': TruncQuarter,
    'year': TruncYear,
}
COMPARISON_MODES = {'previous_period', 'previous_month', 'previous_quarter', 'previous_year', 'custom', 'none'}
WORKSPACES = {'overview', 'technicians', 'sales', 'inventory', 'after_sales', 'forecasting'}
ACTIVE_TICKET_STATUSES = [
    value for value, _label in ServiceTicket.STATUS_CHOICES
    if value not in {'Completed', 'Cancelled', 'Turned Over / Accepted'}
]


def _business_timezone():
    # Analytics has an explicit business-day contract; do not alter the global
    # display timezone used by other workspaces.
    name = 'Asia/Manila'
    try:
        return ZoneInfo(name)
    except Exception as exc:
        raise ValidationError({'timezone': f'Invalid BUSINESS_DISPLAY_TIMEZONE: {name}'}) from exc


def _date_range(params, business_tz):
    today = timezone.now().astimezone(business_tz).date()
    raw_start = str(params.get('start_date') or '').strip()
    raw_end = str(params.get('end_date') or '').strip()
    start = parse_date(raw_start) if raw_start else None
    end = parse_date(raw_end) if raw_end else today
    if raw_start and start is None:
        raise ValidationError({'start_date': 'Use YYYY-MM-DD.'})
    if raw_end and end is None:
        raise ValidationError({'end_date': 'Use YYYY-MM-DD.'})
    if start is None:
        try:
            days = max(1, min(1095, int(params.get('days') or 30)))
        except (TypeError, ValueError) as exc:
            raise ValidationError({'days': 'Use a whole number from 1 to 1095.'}) from exc
        start = end - timedelta(days=days - 1)
    if start > end:
        raise ValidationError({'date_range': 'Start date must be on or before end date.'})
    if (end - start).days >= 1095:
        raise ValidationError({'date_range': 'Date range cannot exceed 1095 days.'})
    return start, end


def _parse_choice(params, key, choices):
    value = str(params.get(key) or '').strip()
    if value and value not in choices:
        raise ValidationError({key: f'Unsupported value: {value}'})
    return value or None


def _parse_id(params, key):
    value = str(params.get(key) or '').strip()
    if not value:
        return None
    try:
        parsed = int(value)
    except ValueError as exc:
        raise ValidationError({key: 'Use a numeric identifier.'}) from exc
    if parsed < 1:
        raise ValidationError({key: 'Use a positive identifier.'})
    return parsed


def _normalise_filters(params):
    business_tz = _business_timezone()
    start, end = _date_range(params, business_tz)
    period_days = (end - start).days + 1
    comparison_mode = _parse_choice(params, 'comparison', COMPARISON_MODES) or 'previous_period'
    previous_start, previous_end = _comparison_range(start, end, comparison_mode, params)
    calculation_previous_start = previous_start or (start - timedelta(days=period_days))
    calculation_previous_end = previous_end or (start - timedelta(days=1))
    group_by = _parse_choice(params, 'group_by', GROUPINGS) or 'day'
    service_type_id = _parse_id(params, 'service_type_id')
    technician_id = _parse_id(params, 'technician_id')
    if service_type_id and not ServiceType.objects.filter(id=service_type_id, is_active=True).exists():
        raise ValidationError({'service_type_id': 'Unknown active service type.'})
    if technician_id and not User.objects.filter(
        id=technician_id, role='technician', status='active', is_active=True,
    ).exists():
        raise ValidationError({'technician_id': 'Unknown active technician.'})
    return {
        'timezone': business_tz,
        'start_date': start,
        'end_date': end,
        'start_at': datetime.combine(start, time.min, tzinfo=business_tz),
        'end_at': datetime.combine(end + timedelta(days=1), time.min, tzinfo=business_tz),
        'comparison_mode': comparison_mode,
        'comparison_enabled': comparison_mode != 'none',
        'previous_start_date': previous_start,
        'previous_end_date': previous_end,
        'previous_start_at': datetime.combine(calculation_previous_start, time.min, tzinfo=business_tz),
        'previous_end_at': datetime.combine(calculation_previous_end + timedelta(days=1), time.min, tzinfo=business_tz),
        'group_by': group_by,
        'service_type_id': service_type_id,
        'technician_id': technician_id,
        'status': _parse_choice(params, 'status', dict(ServiceTicket.STATUS_CHOICES)),
        'priority': _parse_choice(params, 'priority', dict(ServiceTicket.PRIORITY_CHOICES)),
        'city': str(params.get('city') or '').strip() or None,
        'province': str(params.get('province') or '').strip() or None,
        'assignment_state': _parse_choice(params, 'assignment_state', {'assigned', 'unassigned'}),
    }


def _comparison_range(start, end, mode, params=None):
    if mode == 'none':
        return None, None
    if mode == 'previous_period':
        days = (end - start).days + 1
        previous_end = start - timedelta(days=1)
        return previous_end - timedelta(days=days - 1), previous_end
    if mode == 'previous_month':
        previous_end = start.replace(day=1) - timedelta(days=1)
        return previous_end.replace(day=1), previous_end
    if mode == 'previous_quarter':
        current_quarter_month = ((start.month - 1) // 3) * 3 + 1
        current_quarter_start = date(start.year, current_quarter_month, 1)
        previous_end = current_quarter_start - timedelta(days=1)
        previous_quarter_month = ((previous_end.month - 1) // 3) * 3 + 1
        return date(previous_end.year, previous_quarter_month, 1), previous_end
    if mode == 'custom':
        raw_start = str((params or {}).get('comparison_start_date') or '').strip()
        raw_end = str((params or {}).get('comparison_end_date') or '').strip()
        custom_start = parse_date(raw_start) if raw_start else None
        custom_end = parse_date(raw_end) if raw_end else None
        if not custom_start or not custom_end:
            raise ValidationError({
                'comparison_date_range': 'Custom comparison start and end dates are required in YYYY-MM-DD format.',
            })
        if custom_start > custom_end:
            raise ValidationError({'comparison_date_range': 'Custom comparison start must be on or before its end.'})
        if custom_end >= start:
            raise ValidationError({'comparison_date_range': 'Custom comparison must end before the current period starts.'})
        if (custom_end - custom_start).days != (end - start).days:
            raise ValidationError({'comparison_date_range': 'Custom comparison must contain the same number of dates as the current period.'})
        return custom_start, custom_end
    if (end - start).days >= 366:
        raise ValidationError({'comparison': 'Previous-year comparison requires a range of at most 366 days.'})

    def previous_year_value(value):
        return value.replace(year=value.year - 1, day=min(value.day, monthrange(value.year - 1, value.month)[1]))

    previous_start = previous_year_value(start)
    previous_end = previous_year_value(end)
    if previous_end >= start:
        raise ValidationError({'comparison': 'Comparison ranges cannot overlap.'})
    return previous_start, previous_end


def _apply_ticket_dimensions(queryset, filters):
    if filters['service_type_id']:
        queryset = queryset.filter(request__service_type_id=filters['service_type_id'])
    if filters['technician_id']:
        queryset = queryset.filter(technician_id=filters['technician_id'])
    if filters['status']:
        queryset = queryset.filter(status=filters['status'])
    if filters['priority']:
        queryset = queryset.filter(priority=filters['priority'])
    if filters['city']:
        queryset = queryset.filter(request__location__city__iexact=filters['city'])
    if filters['province']:
        queryset = queryset.filter(request__location__province__iexact=filters['province'])
    if filters['assignment_state'] == 'assigned':
        queryset = queryset.filter(technician__isnull=False)
    elif filters['assignment_state'] == 'unassigned':
        queryset = queryset.filter(technician__isnull=True)
    return queryset


def _apply_request_dimensions(queryset, filters):
    if filters['service_type_id']:
        queryset = queryset.filter(service_type_id=filters['service_type_id'])
    if filters['priority']:
        queryset = queryset.filter(priority=filters['priority'])
    if filters['city']:
        queryset = queryset.filter(location__city__iexact=filters['city'])
    if filters['province']:
        queryset = queryset.filter(location__province__iexact=filters['province'])
    ticket_filters = Q()
    requires_ticket = False
    if filters['technician_id']:
        ticket_filters &= Q(serviceticket__technician_id=filters['technician_id'])
        requires_ticket = True
    if filters['status']:
        ticket_filters &= Q(serviceticket__status=filters['status'])
        requires_ticket = True
    if filters['assignment_state'] == 'assigned':
        ticket_filters &= Q(serviceticket__technician__isnull=False)
        requires_ticket = True
    elif filters['assignment_state'] == 'unassigned':
        ticket_filters &= Q(serviceticket__technician__isnull=True)
        requires_ticket = True
    return queryset.filter(ticket_filters).distinct() if requires_ticket else queryset


def _bucket_start(value, group_by):
    if isinstance(value, datetime):
        value = value.date()
    if group_by == 'week':
        return value - timedelta(days=value.weekday())
    if group_by == 'month':
        return value.replace(day=1)
    if group_by == 'quarter':
        return value.replace(month=((value.month - 1) // 3) * 3 + 1, day=1)
    if group_by == 'year':
        return value.replace(month=1, day=1)
    return value


def _next_bucket(value, group_by):
    if group_by == 'day':
        return value + timedelta(days=1)
    if group_by == 'week':
        return value + timedelta(days=7)
    if group_by == 'month':
        return (value.replace(day=28) + timedelta(days=4)).replace(day=1)
    if group_by == 'quarter':
        month = value.month + 3
        return date(value.year + (month - 1) // 12, (month - 1) % 12 + 1, 1)
    return value.replace(year=value.year + 1)


def _period_label(value, group_by):
    if group_by == 'day':
        return f'{value.strftime("%b")} {value.day}'
    if group_by == 'week':
        return f"Week of {value.strftime('%b %d')}"
    if group_by == 'month':
        return value.strftime('%b %Y')
    if group_by == 'quarter':
        return f'Q{((value.month - 1) // 3) + 1} {value.year}'
    return str(value.year)


def _percent_change(current, previous):
    if previous in (None, 0) or current is None:
        return None
    return round(((current - previous) / previous) * 100, 1)


def comparison_metric(current, previous, *, enabled=True, rate=False, precision=1):
    available = bool(enabled and previous is not None)
    absolute_change = round(current - previous, precision) if available and current is not None else None
    percentage_change = None if rate or not available else _percent_change(current, previous)
    result = {
        'current': current,
        'previous': previous if enabled else None,
        'absolute_change': absolute_change,
        'percentage_change': percentage_change,
        'comparison_available': available,
        'change_unit': 'percentage_points' if rate else 'percent',
    }
    # Transitional names preserve the already-rendered Overview while the
    # required deterministic comparison contract is adopted by all workspaces.
    result['delta'] = absolute_change
    result['delta_percent'] = percentage_change
    if rate:
        result['delta_points'] = absolute_change
    return result


def _series_map(queryset, field, filters):
    trunc = GROUPINGS[filters['group_by']](field, tzinfo=filters['timezone'])
    rows = queryset.annotate(period=trunc).values('period').annotate(count=Count('id')).order_by('period')
    return {_bucket_start(row['period'], filters['group_by']): row['count'] for row in rows}


def _filled_trend(requests, completed, filters):
    request_map = _series_map(requests, 'request_date', filters)
    completed_map = _series_map(completed, 'completed_date', filters)
    cursor = _bucket_start(filters['start_date'], filters['group_by'])
    end = _bucket_start(filters['end_date'], filters['group_by'])
    result = []
    while cursor <= end:
        result.append({
            'period': cursor.isoformat(),
            'label': _period_label(cursor, filters['group_by']),
            'requests': request_map.get(cursor, 0),
            'completions': completed_map.get(cursor, 0),
        })
        cursor = _next_bucket(cursor, filters['group_by'])
    return result


def _merge_locations(rows):
    merged = {}
    for row in rows:
        city = (row['location__city'] or 'Unknown').strip() or 'Unknown'
        province = (row['location__province'] or 'Unknown').strip() or 'Unknown'
        key = (city.casefold(), province.casefold())
        if key not in merged:
            merged[key] = {
                'city': city.title(), 'province': province.title(), 'requests': 0, 'previous_requests': 0,
            }
        merged[key]['requests'] += row['count']
        merged[key]['previous_requests'] += row.get('previous_count', 0)
    return sorted(
        merged.values(),
        key=lambda item: (-max(item['requests'], item['previous_requests']), item['city'], item['province']),
    )[:10]


def low_stock_queryset():
    """Canonical database equivalent of InventoryItem.is_low_stock."""
    return InventoryItem.objects.annotate(
        available_stock=F('quantity') - F('reserved_quantity'),
        threshold_stock=(
            Cast(F('minimum_stock'), FloatField()) *
            Cast(F('low_stock_threshold'), FloatField()) / 100.0
        ),
    ).filter(minimum_stock__gt=0, available_stock__lte=F('threshold_stock'))


def _cross_domain_attention_counts(today):
    """Fetch four independent current signals with one portable UNION query."""
    def counted(queryset, label):
        return queryset.order_by().annotate(
            signal=Value(label, output_field=CharField()),
        ).values('signal').annotate(total=Count('id')).values('signal', 'total')

    rows = counted(low_stock_queryset(), 'low_stock').union(
        counted(AfterSalesCase.objects.filter(status__in=['open', 'in_progress']), 'after_sales'),
        counted(SalesRecord.objects.filter(status='confirmed'), 'sales'),
        counted(
            MaintenanceSchedule.objects.filter(next_due_date__lt=today).exclude(
                status__in=['completed', 'dismissed'],
            ),
            'maintenance',
        ),
        all=True,
    )
    values = {'low_stock': 0, 'after_sales': 0, 'sales': 0, 'maintenance': 0}
    for row in rows:
        values[row['signal']] = row['total']
    return values


def _forecast_readiness(service_type_id=None):
    genuine = ServiceRequest.objects.exclude(description__startswith='[Historical Seed]')
    if service_type_id is not None:
        genuine = genuine.filter(service_type_id=service_type_id)
    # Min/Max are imported locally to keep the aggregate declaration readable.
    from django.db.models import Min, Max
    summary = genuine.aggregate(count=Count('id'), earliest=Min('request_date'), latest=Max('request_date'))
    count = summary['count'] or 0
    earliest = summary['earliest']
    latest = summary['latest']
    history_days = (latest.date() - earliest.date()).days + 1 if earliest and latest else 0
    history_months = round(history_days / 30.4375, 1)
    monthly_rows = []
    if earliest and latest:
        monthly_rows = list(
            genuine.annotate(month=TruncMonth('request_date', tzinfo=_business_timezone()))
            .values('month').annotate(count=Count('id')).order_by('month')
        )
    active_months = len(monthly_rows)
    expected_months = max(0, round(history_days / 30.4375))
    missing_months = max(0, expected_months - active_months)
    reasons = []
    if count < 100:
        reasons.append(f'{100 - count} more genuine requests are needed.')
    if history_months < 6:
        reasons.append(f'{round(6 - history_months, 1)} more months of history are needed.')
    if missing_months > 1:
        reasons.append(f'{missing_months} months in the historical range have no requests.')
    available = count >= 100 and history_months >= 6 and missing_months <= 1
    return {
        'available': available,
        'request_count': count,
        'required_request_count': 100,
        'history_months': history_months,
        'required_history_months': 6,
        'active_months': active_months,
        'missing_months': missing_months,
        'earliest_request_date': earliest.date().isoformat() if earliest else None,
        'latest_request_date': latest.date().isoformat() if latest else None,
        'reason': 'Forecasting requirements are met.' if available else ' '.join(reasons),
        'method': None if not available else 'Seasonal baseline with holdout validation (not yet trained).',
        'predictions': [],
    }


def build_admin_analytics(params):
    workspace = _parse_choice(params, 'workspace', WORKSPACES) or 'overview'
    filters = _normalise_filters(params)
    if workspace != 'overview':
        from users.analytics_workspaces import build_specialized_workspace
        return build_specialized_workspace(workspace, params, filters)
    tickets_all = _apply_ticket_dimensions(ServiceTicket.objects.all(), filters)
    ticket_cohort = tickets_all.filter(created_at__gte=filters['start_at'], created_at__lt=filters['end_at'])
    requests_all = _apply_request_dimensions(ServiceRequest.objects.all(), filters)
    request_cohort = requests_all.filter(request_date__gte=filters['start_at'], request_date__lt=filters['end_at'])
    completions = tickets_all.filter(
        status='Completed', completed_date__gte=filters['start_at'], completed_date__lt=filters['end_at']
    )

    ticket_summary = tickets_all.aggregate(
        total=Count('id', filter=Q(created_at__gte=filters['start_at'], created_at__lt=filters['end_at'])),
        completed=Count('id', filter=Q(
            created_at__gte=filters['start_at'], created_at__lt=filters['end_at'], status='Completed',
        )),
        previous_total=Count('id', filter=Q(
            created_at__gte=filters['previous_start_at'], created_at__lt=filters['previous_end_at'],
        )),
        previous_completed=Count('id', filter=Q(
            created_at__gte=filters['previous_start_at'], created_at__lt=filters['previous_end_at'], status='Completed',
        )),
    )
    duration_rows = tickets_all.filter(
        status='Completed', start_time__isnull=False, completed_date__isnull=False,
        completed_date__gte=F('start_time'),
    ).filter(
        Q(created_at__gte=filters['start_at'], created_at__lt=filters['end_at']) |
        Q(created_at__gte=filters['previous_start_at'], created_at__lt=filters['previous_end_at'])
    ).values_list('created_at', 'start_time', 'completed_date')
    durations = []
    previous_durations = []
    for created_at, started, finished in duration_rows:
        duration = (finished - started).total_seconds() / 3600
        if filters['start_at'] <= created_at < filters['end_at']:
            durations.append(duration)
        else:
            previous_durations.append(duration)
    total_tickets = ticket_summary['total'] or 0
    completed_tickets = ticket_summary['completed'] or 0
    previous_total_tickets = (ticket_summary['previous_total'] or 0) if filters['comparison_enabled'] else None
    previous_completed_tickets = (ticket_summary['previous_completed'] or 0) if filters['comparison_enabled'] else None
    completion_rate = round((completed_tickets / total_tickets) * 100, 1) if total_tickets else 0
    previous_completion_rate = (
        round((previous_completed_tickets / previous_total_tickets) * 100, 1)
        if previous_total_tickets not in (None, 0) else (0 if previous_total_tickets == 0 else None)
    )
    average_completion_hours = round(sum(durations) / len(durations), 2) if durations else None
    previous_average_completion_hours = (
        round(sum(previous_durations) / len(previous_durations), 2) if previous_durations else None
    ) if filters['comparison_enabled'] else None

    service_demand = list(
        requests_all.values('service_type_id', 'service_type__name').annotate(
            requests=Count('id', filter=Q(
                request_date__gte=filters['start_at'], request_date__lt=filters['end_at'],
            )),
            previous_requests=Count('id', filter=Q(
                request_date__gte=filters['previous_start_at'], request_date__lt=filters['previous_end_at'],
            )),
        ).filter(Q(requests__gt=0) | Q(previous_requests__gt=0)).order_by('-requests', '-previous_requests', 'service_type__name')
    )
    if not filters['comparison_enabled']:
        service_demand = [row for row in service_demand if row['requests'] > 0]
    status_rows = tickets_all.values('status').annotate(
        count=Count('id', filter=Q(created_at__gte=filters['start_at'], created_at__lt=filters['end_at'])),
        previous_count=Count('id', filter=Q(
            created_at__gte=filters['previous_start_at'], created_at__lt=filters['previous_end_at'],
        )),
    )
    status_counts = {row['status']: row['count'] for row in status_rows}
    previous_status_counts = {row['status']: row['previous_count'] for row in status_rows}
    status_breakdown = [
        {
            'status': value,
            'label': label,
            'count': status_counts.get(value, 0),
            'previous_count': previous_status_counts.get(value, 0) if filters['comparison_enabled'] else None,
        }
        for value, label in ServiceTicket.STATUS_CHOICES
    ]

    assignment_window = (
        Q(assigned_at__gte=filters['start_at'], assigned_at__lt=filters['end_at']) |
        Q(assigned_at__isnull=True, scheduled_date__gte=filters['start_date'], scheduled_date__lte=filters['end_date'])
    )
    previous_assignment_start = filters['previous_start_date'] or filters['previous_start_at'].date()
    previous_assignment_end = filters['previous_end_date'] or (
        filters['previous_end_at'] - timedelta(microseconds=1)
    ).date()
    previous_assignment_window = (
        Q(assigned_at__gte=filters['previous_start_at'], assigned_at__lt=filters['previous_end_at']) |
        Q(
            assigned_at__isnull=True,
            scheduled_date__gte=previous_assignment_start,
            scheduled_date__lte=previous_assignment_end,
        )
    )
    workload = list(
        tickets_all.filter(technician__isnull=False)
        .values('technician_id', 'technician__first_name', 'technician__last_name', 'technician__username')
        .annotate(
            assigned_jobs=Count('id', filter=assignment_window),
            completed_jobs=Count('id', filter=Q(status='Completed', completed_date__gte=filters['start_at'], completed_date__lt=filters['end_at'])),
            previous_assigned_jobs=Count('id', filter=previous_assignment_window),
            previous_completed_jobs=Count('id', filter=Q(
                status='Completed',
                completed_date__gte=filters['previous_start_at'],
                completed_date__lt=filters['previous_end_at'],
            )),
            scheduled_minutes=Coalesce(Sum(
                'request__service_type__estimated_duration',
                filter=Q(scheduled_date__gte=filters['start_date'], scheduled_date__lte=filters['end_date']) & ~Q(status='Cancelled'),
            ), 0),
        ).order_by('-assigned_jobs', 'technician__username')
    )
    for row in workload:
        full_name = f"{row.pop('technician__first_name')} {row.pop('technician__last_name')}".strip()
        row['technician'] = full_name or row.pop('technician__username')
        row.pop('technician__username', None)
        row['scheduled_hours'] = round(row.pop('scheduled_minutes') / 60, 1)
        if not filters['comparison_enabled']:
            row['previous_assigned_jobs'] = None
            row['previous_completed_jobs'] = None

    location_rows = requests_all.values('location__city', 'location__province').annotate(
        count=Count('id', filter=Q(request_date__gte=filters['start_at'], request_date__lt=filters['end_at'])),
        previous_count=Count('id', filter=Q(
            request_date__gte=filters['previous_start_at'], request_date__lt=filters['previous_end_at'],
        )),
    ).filter(Q(count__gt=0) | Q(previous_count__gt=0))
    location_demand = _merge_locations(location_rows)
    if not filters['comparison_enabled']:
        location_demand = [row for row in location_demand if row['requests'] > 0]
        for row in location_demand:
            row['previous_requests'] = None

    now = timezone.now()
    current_tickets = _apply_ticket_dimensions(
        ServiceTicket.objects.filter(status__in=ACTIVE_TICKET_STATUSES), filters
    ).select_related('request', 'request__service_type')
    overdue_count = sum(1 for ticket in current_tickets if evaluate_service_ticket_sla(ticket, now=now)['state'] == 'overdue')
    today = now.astimezone(filters['timezone']).date()
    current_ticket_counts = _apply_ticket_dimensions(ServiceTicket.objects.all(), filters).aggregate(
        unassigned=Count('id', filter=Q(status__in=ACTIVE_TICKET_STATUSES, technician__isnull=True)),
        upcoming=Count('id', filter=Q(status__in=ACTIVE_TICKET_STATUSES, scheduled_date__gte=today, scheduled_date__lte=today + timedelta(days=7))),
    )
    cross_domain_counts = _cross_domain_attention_counts(today)
    attention = {
        'confirmed_sales': cross_domain_counts['sales'],
        'unassigned_tickets': current_ticket_counts['unassigned'] or 0,
        'overdue_tickets': overdue_count,
        'low_stock_items': cross_domain_counts['low_stock'],
        'upcoming_scheduled_jobs': current_ticket_counts['upcoming'] or 0,
        'open_after_sales_cases': cross_domain_counts['after_sales'],
        'overdue_maintenance': cross_domain_counts['maintenance'],
    }

    services = list(ServiceType.objects.filter(is_active=True).values('id', 'name').order_by('display_order', 'name'))
    technicians = []
    for user in User.objects.filter(role='technician', status='active', is_active=True).only('id', 'first_name', 'last_name', 'username').order_by('first_name', 'last_name', 'username'):
        technicians.append({'id': user.id, 'name': user.get_full_name().strip() or user.username})
    locations = list(ServiceRequest.objects.values_list('location__city', 'location__province').distinct())

    trend = _filled_trend(request_cohort, completions, filters)
    forecast = _forecast_readiness()
    request_total = sum(row['requests'] for row in service_demand)
    completion_total = sum(row['completions'] for row in trend)
    payload = {
        'generated_at': now.isoformat(),
        'period': {
            'start_date': filters['start_date'].isoformat(),
            'end_date': filters['end_date'].isoformat(),
            'group_by': filters['group_by'],
            'timezone': str(filters['timezone']),
        },
        'workspace': 'overview',
        'metric_definitions': {
            'total_tickets': 'Tickets created during the selected date range after all filters.',
            'completed_tickets': 'Selected ticket cohort whose current canonical status is Completed.',
            'completion_rate': 'Completed tickets divided by total tickets in the selected cohort; cancelled tickets remain in the denominator.',
            'average_completion_hours': 'Mean completed_date minus start_time for completed cohort tickets with valid, non-negative timestamps.',
            'current_overdue': 'Current unresolved tickets whose live SLA evaluation is overdue; this ignores the selected historical date range.',
            'comparison': 'The selected non-overlapping comparison range uses the same inclusive duration and dimension filters.',
        },
        'kpis': {
            'total_tickets': total_tickets,
            'completed_tickets': completed_tickets,
            'completion_rate': completion_rate,
            'average_completion_hours': average_completion_hours,
            'average_completion_observations': len(durations),
            'current_overdue': overdue_count,
        },
        'comparison': {
            'mode': filters['comparison_mode'],
            'enabled': filters['comparison_enabled'],
            'period': {
                'start_date': filters['previous_start_date'].isoformat() if filters['previous_start_date'] else None,
                'end_date': filters['previous_end_date'].isoformat() if filters['previous_end_date'] else None,
            },
            'kpis': {
                'total_tickets': comparison_metric(
                    total_tickets, previous_total_tickets, enabled=filters['comparison_enabled'],
                ),
                'completed_tickets': comparison_metric(
                    completed_tickets, previous_completed_tickets, enabled=filters['comparison_enabled'],
                ),
                'completion_rate': comparison_metric(
                    completion_rate, previous_completion_rate, enabled=filters['comparison_enabled'], rate=True,
                ),
                'average_completion_hours': {
                    **comparison_metric(
                        average_completion_hours,
                        previous_average_completion_hours,
                        enabled=filters['comparison_enabled'],
                        precision=2,
                    ),
                    'delta_hours': (
                        round(average_completion_hours - previous_average_completion_hours, 2)
                        if average_completion_hours is not None and previous_average_completion_hours is not None
                        else None
                    ),
                    'observations': len(previous_durations) if filters['comparison_enabled'] else 0,
                },
            },
        },
        'charts': {
            'requests_vs_completions': trend,
            'service_demand': [
                {
                    'service_type_id': row['service_type_id'],
                    'service_type': row['service_type__name'],
                    'requests': row['requests'],
                    'previous_requests': row['previous_requests'] if filters['comparison_enabled'] else None,
                }
                for row in service_demand
            ],
            'ticket_statuses': status_breakdown,
            'technician_workload': workload,
            'locations': location_demand,
        },
        'attention': attention,
        'forecast': forecast,
        'filter_options': {
            'service_types': services,
            'technicians': technicians,
            'statuses': [{'value': value, 'label': label} for value, label in ServiceTicket.STATUS_CHOICES],
            'priorities': [{'value': value, 'label': label} for value, label in ServiceTicket.PRIORITY_CHOICES],
            'cities': sorted({(city or '').strip() for city, _province in locations if (city or '').strip()}, key=str.casefold),
            'provinces': sorted({(province or '').strip() for _city, province in locations if (province or '').strip()}, key=str.casefold),
        },
        'semantics': {
            'service_demand': 'Primary ServiceRequest.service_type only; add-on service items are excluded.',
            'technician_workload': 'Lead technician assignments only; crew membership is excluded.',
            'current_attention': 'A live operational snapshot. Ticket signals use non-date filters; inventory and after-sales signals remain global.',
        },
    }
    # Transitional aliases keep the existing shared Analytics assistant working
    # without retaining the old page's duplicate calculations or queries.
    payload.update({
        'totalRequests': request_total,
        'completedRequests': completion_total,
        'pendingRequests': status_counts.get('Not Started', 0),
        'overview': {
            'totalRequests': request_total,
            'completedRequests': completion_total,
            'pendingRequests': status_counts.get('Not Started', 0),
            'avgCompletionTimeHours': payload['kpis']['average_completion_hours'],
        },
        'topRequestedServiceTypes': [
            {'serviceType': row['service_type__name'], 'requestCount': row['requests']}
            for row in service_demand
        ],
        'predictiveSummary': {
            'available': forecast['available'],
            'totalPredictedRequests': None,
            'projectedGrowthRate': None,
            'staffingPressure': 'unavailable' if not forecast['available'] else 'not_generated',
            'reason': forecast['reason'],
        },
        'dailyForecast': [],
        'serviceForecasts': [],
    })
    return payload
