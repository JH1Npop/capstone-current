"""Validated, read-mostly demand forecasting for Admin Analytics.

The Analytics GET endpoint only reads forecast runs produced by the explicit
generation command/action.  A run is publishable only after a rolling holdout
backtest passes the documented evidence and error gates below.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
import math
import statistics

from django.db import transaction
from django.db.models import Count, Max, Min, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from inventory.models import InventoryItem, InventoryTransaction, ServiceTypeInventoryRequirement
from services.models import DemandForecast, ServiceRequest, ServiceTrend, ServiceType


MODEL_KEY = 'monthly_seasonal_linear_trend_v1'
MODEL_LABEL = 'Monthly seasonal baseline with a damped 12-month linear trend'
FORECAST_MONTHS = 6
MIN_MODEL_MONTHS = 12
MIN_SERVICE_REQUESTS = 24
MIN_BACKTEST_MONTHS = 3
MAX_BACKTEST_MONTHS = 6
MIN_BACKTEST_REQUESTS = 10
MAX_WAPE_PERCENT = 60.0
BASELINE_TOLERANCE_POINTS = 5.0
MAX_RUN_AGE_DAYS = 7


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _add_months(value: date, months: int) -> date:
    month_index = value.year * 12 + value.month - 1 + months
    return date(month_index // 12, month_index % 12 + 1, 1)


def _genuine_requests(service_type_id=None):
    queryset = ServiceRequest.objects.exclude(description__startswith='[Historical Seed]')
    if service_type_id is not None:
        queryset = queryset.filter(service_type_id=service_type_id)
    return queryset


def _complete_month_series(service_type_id: int, through_month: date):
    rows = list(
        _genuine_requests(service_type_id)
        .filter(request_date__date__lt=_add_months(through_month, 1))
        .annotate(month=TruncMonth('request_date', tzinfo=timezone.get_current_timezone()))
        .values('month')
        .annotate(requests=Count('id'))
        .order_by('month')
    )
    if not rows:
        return []
    counts = {row['month'].date().replace(day=1): int(row['requests']) for row in rows if row['month']}
    cursor = min(counts)
    result = []
    while cursor <= through_month:
        result.append((cursor, counts.get(cursor, 0)))
        cursor = _add_months(cursor, 1)
    return result


def service_model_readiness(service_type_id: int):
    """Apply the 100-request system gate plus a transparent per-service gate."""
    from users.analytics_service import _forecast_readiness

    global_readiness = _forecast_readiness()
    summary = _genuine_requests(service_type_id).aggregate(
        count=Count('id'), earliest=Min('request_date'), latest=Max('request_date'),
    )
    request_count = summary['count'] or 0
    earliest = summary['earliest']
    latest = summary['latest']
    history_days = (latest.date() - earliest.date()).days + 1 if earliest and latest else 0
    history_months = round(history_days / 30.4375, 1)
    active_months = (
        _genuine_requests(service_type_id)
        .annotate(month=TruncMonth('request_date', tzinfo=timezone.get_current_timezone()))
        .values('month').distinct().count()
        if earliest and latest else 0
    )
    expected_months = max(0, round(history_days / 30.4375))
    reasons = []
    if not global_readiness['available']:
        reasons.append(f"System history is not ready: {global_readiness['reason']}")
    if request_count < MIN_SERVICE_REQUESTS:
        reasons.append(f'{MIN_SERVICE_REQUESTS - request_count} more genuine requests are needed for this service.')
    if history_months < MIN_MODEL_MONTHS:
        reasons.append(f'{round(MIN_MODEL_MONTHS - history_months, 1)} more months of this service history are needed for model backtesting.')
    return {
        'available': not reasons,
        'request_count': request_count,
        'required_request_count': MIN_SERVICE_REQUESTS,
        'history_months': history_months,
        'required_history_months': MIN_MODEL_MONTHS,
        'active_months': active_months,
        'missing_months': max(0, expected_months - active_months),
        'earliest_request_date': earliest.date().isoformat() if earliest else None,
        'latest_request_date': latest.date().isoformat() if latest else None,
        'global_request_count': global_readiness['request_count'],
        'global_required_request_count': global_readiness['required_request_count'],
        'global_history_ready': global_readiness['available'],
        'reason': 'System and per-service evidence gates are met.' if not reasons else ' '.join(reasons),
    }


def _linear_projection(values):
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    x_mean = (len(values) - 1) / 2
    y_mean = sum(values) / len(values)
    denominator = sum((index - x_mean) ** 2 for index in range(len(values)))
    slope = (
        sum((index - x_mean) * (value - y_mean) for index, value in enumerate(values)) / denominator
        if denominator else 0.0
    )
    return max(0.0, y_mean + slope * (len(values) - x_mean))


def _predict_next_month(history, target_month):
    """Return an explainable one-step estimate from data available at that point."""
    if not history:
        return 0.0
    recent_values = [float(value) for _month, value in history[-12:]]
    trend_projection = _linear_projection(recent_values)
    same_calendar_month = [
        float(value) for month, value in history if month.month == target_month.month
    ]
    if len(same_calendar_month) >= 2:
        seasonal_baseline = sum(same_calendar_month[-3:]) / len(same_calendar_month[-3:])
    else:
        fallback = recent_values[-6:]
        seasonal_baseline = sum(fallback) / len(fallback)
    # Seasonality remains primary; the linear component adds a deliberately
    # damped trend so a short spike cannot dominate the six-month outlook.
    return max(0.0, (0.6 * seasonal_baseline) + (0.4 * trend_projection))


def _baseline_next_month(history, target_month):
    same_month = [float(value) for month, value in history if month.month == target_month.month]
    if same_month:
        return same_month[-1]
    recent = [float(value) for _month, value in history[-6:]]
    return sum(recent) / len(recent) if recent else 0.0


def _error_metrics(points):
    if not points:
        return None
    absolute_errors = [abs(point['actual'] - point['predicted']) for point in points]
    actual_total = sum(point['actual'] for point in points)
    predicted_total = sum(point['predicted'] for point in points)
    mae = sum(absolute_errors) / len(absolute_errors)
    wape = (sum(absolute_errors) / actual_total * 100) if actual_total else None
    bias = ((predicted_total - actual_total) / actual_total * 100) if actual_total else None
    ordered_errors = sorted(absolute_errors)
    p90_index = max(0, math.ceil(len(ordered_errors) * 0.9) - 1)
    return {
        'mae': round(mae, 3),
        'wape_percent': round(wape, 2) if wape is not None else None,
        'bias_percent': round(bias, 2) if bias is not None else None,
        'actual_requests': round(actual_total, 3),
        'predicted_requests': round(predicted_total, 3),
        'absolute_error_p90': round(ordered_errors[p90_index], 3),
    }


def train_and_backtest(service_type_id: int, as_of: date | None = None):
    """Train in memory and return validation evidence without writing anything."""
    as_of = as_of or timezone.localdate()
    last_complete_month = _add_months(_month_start(as_of), -1)
    series = _complete_month_series(service_type_id, last_complete_month)
    if len(series) < MIN_MODEL_MONTHS:
        return {
            'validated': False,
            'backtested': False,
            'reason': f'{MIN_MODEL_MONTHS - len(series)} more complete monthly observations are needed before model validation.',
            'series': series,
            'validation_points': [],
        }

    holdout_size = min(MAX_BACKTEST_MONTHS, max(MIN_BACKTEST_MONTHS, len(series) // 4))
    holdout_size = min(holdout_size, len(series) - 6)
    validation_points = []
    baseline_points = []
    validation_start_index = len(series) - holdout_size
    for index in range(validation_start_index, len(series)):
        history = series[:index]
        target_month, actual = series[index]
        validation_points.append({
            'month': target_month.isoformat(),
            'label': target_month.strftime('%b %Y'),
            'actual': float(actual),
            'predicted': round(_predict_next_month(history, target_month), 3),
        })
        baseline_points.append({
            'actual': float(actual),
            'predicted': round(_baseline_next_month(history, target_month), 3),
        })

    metrics = _error_metrics(validation_points)
    baseline_metrics = _error_metrics(baseline_points)
    reasons = []
    if not metrics or metrics['actual_requests'] < MIN_BACKTEST_REQUESTS:
        reasons.append(
            f'The holdout period needs at least {MIN_BACKTEST_REQUESTS} actual requests; '
            f"it contains {int(metrics['actual_requests']) if metrics else 0}."
        )
    if not metrics or metrics['wape_percent'] is None:
        reasons.append('WAPE cannot be calculated because the holdout period has no actual demand.')
    elif metrics['wape_percent'] > MAX_WAPE_PERCENT:
        reasons.append(
            f"Holdout WAPE is {metrics['wape_percent']}%, above the {MAX_WAPE_PERCENT:.0f}% publication limit."
        )
    if (
        metrics and baseline_metrics
        and metrics['wape_percent'] is not None
        and baseline_metrics['wape_percent'] is not None
        and metrics['wape_percent'] > baseline_metrics['wape_percent'] + BASELINE_TOLERANCE_POINTS
    ):
        reasons.append(
            'The seasonal-trend model does not perform at least as well as the seasonal-naive baseline within the allowed tolerance.'
        )

    validated = not reasons
    return {
        'validated': validated,
        'backtested': True,
        'reason': 'Holdout validation passed.' if validated else ' '.join(reasons),
        'series': series,
        'validation_points': validation_points,
        'metrics': metrics,
        'baseline_metrics': baseline_metrics,
        'training_start': series[0][0],
        'training_end': series[-1][0],
        'validation_start': series[validation_start_index][0],
        'validation_end': series[-1][0],
        'holdout_months': holdout_size,
    }


def _forecast_months(series, start_month, horizon_months):
    working = [(month, float(value)) for month, value in series]
    forecasts = []
    for offset in range(horizon_months):
        target = _add_months(start_month, offset)
        predicted = _predict_next_month(working, target)
        forecasts.append((target, predicted))
        working.append((target, predicted))
    return forecasts


def _trend_metadata(service_type, result, generated_at):
    metrics = result.get('metrics') or {}
    baseline = result.get('baseline_metrics') or {}
    return {
        'schema_version': 1,
        'model_key': MODEL_KEY,
        'model_label': MODEL_LABEL,
        'service_type_id': service_type.id,
        'service_type': service_type.name,
        'generated_at': generated_at.isoformat(),
        'validated': bool(result.get('validated')),
        'backtested': bool(result.get('backtested')),
        'error_metrics_stored': bool(metrics),
        'reason': result.get('reason'),
        'training_start': result.get('training_start').isoformat() if result.get('training_start') else None,
        'training_end': result.get('training_end').isoformat() if result.get('training_end') else None,
        'validation_start': result.get('validation_start').isoformat() if result.get('validation_start') else None,
        'validation_end': result.get('validation_end').isoformat() if result.get('validation_end') else None,
        'holdout_months': result.get('holdout_months', 0),
        'metrics': metrics,
        'baseline_metrics': baseline,
        'validation_points': result.get('validation_points', []),
        'publication_rules': {
            'minimum_complete_months': MIN_MODEL_MONTHS,
            'minimum_holdout_requests': MIN_BACKTEST_REQUESTS,
            'maximum_wape_percent': MAX_WAPE_PERCENT,
            'baseline_tolerance_points': BASELINE_TOLERANCE_POINTS,
        },
    }


def generate_service_forecast(service_type, horizon_months=FORECAST_MONTHS, as_of=None, persist=True):
    """Validate and optionally persist one service forecast run."""
    as_of = as_of or timezone.localdate()
    readiness = service_model_readiness(service_type.id)
    if not readiness['available']:
        return {
            'service_type_id': service_type.id,
            'service_type': service_type.name,
            'published': False,
            'readiness': readiness,
            'reason': readiness['reason'],
            'predictions': [],
        }

    result = train_and_backtest(service_type.id, as_of=as_of)
    generated_at = timezone.now()
    metadata = _trend_metadata(service_type, result, generated_at)
    predictions = []
    if result.get('validated'):
        predictions = _forecast_months(result['series'], _month_start(as_of), horizon_months)

    if persist:
        with transaction.atomic():
            if result.get('series'):
                series_values = [float(value) for _month, value in result['series']]
                recent = series_values[-6:]
                previous = series_values[-12:-6]
                recent_average = sum(recent) / len(recent)
                previous_average = sum(previous) / len(previous) if previous else recent_average
                growth_rate = (
                    ((recent_average - previous_average) / previous_average) * 100
                    if previous_average else 0.0
                )
                direction = 'increasing' if growth_rate > 5 else 'decreasing' if growth_rate < -5 else 'stable'
                month_totals = defaultdict(list)
                for month, value in result['series']:
                    month_totals[month.month].append(float(value))
                peak_month_number = max(month_totals, key=lambda key: sum(month_totals[key]) / len(month_totals[key]))
                peak_day = date(2000, peak_month_number, 1).strftime('%B')
                ServiceTrend.objects.create(
                    service_type=service_type,
                    trend_type='monthly',
                    period_start=result['series'][0][0],
                    period_end=result['series'][-1][0],
                    average_requests=round(sum(series_values) / len(series_values), 3),
                    peak_day=peak_day,
                    growth_rate=round(growth_rate, 2),
                    trend_direction=direction,
                    standard_deviation=round(statistics.pstdev(series_values), 3) if len(series_values) > 1 else 0,
                    confidence_interval=metadata,
                )

            if result.get('validated'):
                validation_score = max(0.0, 1 - ((result['metrics']['wape_percent'] or 100) / 100))
                historical_average = round(sum(value for _month, value in result['series'][-6:]) / 6)
                for forecast_month, predicted in predictions:
                    DemandForecast.objects.update_or_create(
                        service_type=service_type,
                        forecast_date=forecast_month,
                        forecast_period='monthly',
                        defaults={
                            'predicted_requests': max(0, round(predicted)),
                            'confidence_level': round(validation_score, 4),
                            'weather_impact': 0.0,
                            'seasonal_trend': round(predicted / historical_average, 4) if historical_average else 0,
                            'historical_average': historical_average,
                            'actual_requests': None,
                            'forecast_accuracy': None,
                            'generated_at': generated_at,
                        },
                    )

    return {
        'service_type_id': service_type.id,
        'service_type': service_type.name,
        'published': bool(result.get('validated')),
        'readiness': readiness,
        'model': metadata,
        'reason': result.get('reason'),
        'predictions': [
            {'month': month.isoformat(), 'label': month.strftime('%b %Y'), 'predicted_requests': max(0, round(value))}
            for month, value in predictions
        ],
    }


def reconcile_forecast_actuals(as_of=None):
    """Attach actual outcomes to completed monthly forecasts."""
    as_of = as_of or timezone.localdate()
    current_month = _month_start(as_of)
    rows = list(
        DemandForecast.objects.filter(
            forecast_period='monthly', forecast_date__lt=current_month,
        ).select_related('service_type')
    )
    if not rows:
        return 0
    service_ids = {row.service_type_id for row in rows}
    actual_rows = (
        _genuine_requests()
        .filter(service_type_id__in=service_ids)
        .annotate(month=TruncMonth('request_date', tzinfo=timezone.get_current_timezone()))
        .values('service_type_id', 'month')
        .annotate(requests=Count('id'))
    )
    actuals = {
        (row['service_type_id'], row['month'].date().replace(day=1)): int(row['requests'])
        for row in actual_rows if row['month']
    }
    changed = []
    for row in rows:
        actual = actuals.get((row.service_type_id, row.forecast_date), 0)
        denominator = max(actual, row.predicted_requests, 1)
        accuracy = max(0.0, 1 - abs(actual - row.predicted_requests) / denominator) * 100
        if row.actual_requests != actual or row.forecast_accuracy != round(accuracy, 2):
            row.actual_requests = actual
            row.forecast_accuracy = round(accuracy, 2)
            changed.append(row)
    if changed:
        DemandForecast.objects.bulk_update(changed, ['actual_requests', 'forecast_accuracy'])
    return len(changed)


def _latest_model_runs(service_type_id=None):
    queryset = ServiceTrend.objects.filter(trend_type='monthly').select_related('service_type').order_by('-created_at')
    if service_type_id:
        queryset = queryset.filter(service_type_id=service_type_id)
    latest = {}
    for trend in queryset:
        metadata = trend.confidence_interval or {}
        if metadata.get('model_key') != MODEL_KEY or trend.service_type_id in latest:
            continue
        latest[trend.service_type_id] = (trend, metadata)
    return latest


def _daily_outlook(service_type_id, monthly_rows, today, horizon_days, p90_error):
    if not monthly_rows:
        return []
    request_dates = list(
        _genuine_requests(service_type_id)
        .filter(request_date__date__gte=today - timedelta(days=365), request_date__date__lt=today)
        .values_list('request_date', flat=True)
    )
    weekday_counts = defaultdict(int)
    for request_date in request_dates:
        weekday_counts[timezone.localtime(request_date).date().weekday()] += 1
    weekday_weights = {weekday: max(weekday_counts.get(weekday, 0), 1) for weekday in range(7)}
    monthly_map = {row.forecast_date: float(row.predicted_requests) for row in monthly_rows}
    current_month_actual = _genuine_requests(service_type_id).filter(
        request_date__date__gte=_month_start(today), request_date__date__lt=today,
    ).count()
    days = [today + timedelta(days=offset) for offset in range(horizon_days)]
    grouped = defaultdict(list)
    for day in days:
        grouped[_month_start(day)].append(day)
    results = []
    for month, month_days in grouped.items():
        monthly_prediction = monthly_map.get(month)
        if monthly_prediction is None:
            continue
        next_month = _add_months(month, 1)
        allocation_start = today if month == _month_start(today) else month
        allocation_days = []
        cursor = allocation_start
        while cursor < next_month:
            allocation_days.append(cursor)
            cursor += timedelta(days=1)
        remaining_prediction = max(0.0, monthly_prediction - current_month_actual) if month == _month_start(today) else monthly_prediction
        denominator = sum(weekday_weights[day.weekday()] for day in allocation_days)
        for day in month_days:
            expected = remaining_prediction * weekday_weights[day.weekday()] / denominator if denominator else 0.0
            daily_error = p90_error / max(len(allocation_days), 1)
            results.append({
                'date': day.isoformat(),
                'label': day.strftime('%d %b'),
                'expected_requests': round(expected, 2),
                'lower_bound': round(max(0.0, expected - daily_error), 2),
                'upper_bound': round(expected + daily_error, 2),
            })
        current_month_actual = 0
    return results


def load_forecast_contract(service_type_id=None, today=None):
    """Read the latest stored, validated run for the Analytics GET response."""
    today = today or timezone.localdate()
    current_month = _month_start(today)
    runs = _latest_model_runs(service_type_id)
    service_models = []
    valid_service_ids = []
    validation_points = []
    run_generated_times = []
    for service_id, (trend, metadata) in runs.items():
        generated_at_raw = metadata.get('generated_at')
        try:
            generated_at = datetime.fromisoformat(generated_at_raw) if generated_at_raw else trend.created_at
            if timezone.is_naive(generated_at):
                generated_at = timezone.make_aware(generated_at)
        except (TypeError, ValueError):
            generated_at = trend.created_at
        fresh = generated_at >= timezone.now() - timedelta(days=MAX_RUN_AGE_DAYS)
        published = bool(metadata.get('validated') and metadata.get('backtested') and metadata.get('error_metrics_stored') and fresh)
        service_models.append({
            'service_type_id': service_id,
            'service_type': trend.service_type.name,
            'published': published,
            'fresh': fresh,
            **metadata,
        })
        if published:
            valid_service_ids.append(service_id)
            run_generated_times.append(generated_at)
            for point in metadata.get('validation_points') or []:
                validation_points.append({**point, 'service_type': trend.service_type.name})

    forecast_rows = list(
        DemandForecast.objects.filter(
            service_type_id__in=valid_service_ids,
            forecast_period='monthly',
            forecast_date__gte=current_month,
            forecast_date__lt=_add_months(current_month, FORECAST_MONTHS),
        ).select_related('service_type').order_by('forecast_date', 'service_type__name')
    )
    latest_by_service = {row['service_type_id']: row for row in service_models if row['published']}
    filtered_rows = []
    for row in forecast_rows:
        model = latest_by_service.get(row.service_type_id)
        generated_at_raw = model.get('generated_at') if model else None
        try:
            model_generated = datetime.fromisoformat(generated_at_raw) if generated_at_raw else None
            if model_generated and timezone.is_naive(model_generated):
                model_generated = timezone.make_aware(model_generated)
        except (TypeError, ValueError):
            model_generated = None
        if model_generated and row.generated_at >= model_generated - timedelta(seconds=5):
            filtered_rows.append(row)

    monthly_totals = defaultdict(int)
    by_service = defaultdict(lambda: {'months': [], 'next_7_days': 0.0, 'next_30_days': 0.0})
    daily_total = defaultdict(lambda: {'expected_requests': 0.0, 'lower_bound': 0.0, 'upper_bound': 0.0})
    for service_id in valid_service_ids:
        rows = [row for row in filtered_rows if row.service_type_id == service_id]
        model = latest_by_service[service_id]
        p90_error = float((model.get('metrics') or {}).get('absolute_error_p90') or 0)
        daily = _daily_outlook(service_id, rows, today, 30, p90_error)
        for point in daily:
            values = daily_total[point['date']]
            values['expected_requests'] += point['expected_requests']
            values['lower_bound'] += point['lower_bound']
            values['upper_bound'] += point['upper_bound']
            if date.fromisoformat(point['date']) < today + timedelta(days=7):
                by_service[service_id]['next_7_days'] += point['expected_requests']
            by_service[service_id]['next_30_days'] += point['expected_requests']
        for row in rows:
            monthly_totals[row.forecast_date] += row.predicted_requests
            by_service[service_id]['months'].append({
                'month': row.forecast_date.isoformat(),
                'label': row.forecast_date.strftime('%b %Y'),
                'predicted_requests': row.predicted_requests,
            })

    daily = [
        {'date': day, 'label': date.fromisoformat(day).strftime('%d %b'), **{key: round(value, 2) for key, value in values.items()}}
        for day, values in sorted(daily_total.items())
    ]
    service_outlook = []
    for service_id, values in by_service.items():
        model = latest_by_service[service_id]
        service_outlook.append({
            'service_type_id': service_id,
            'service_type': model['service_type'],
            'next_7_days': round(values['next_7_days'], 1),
            'next_30_days': round(values['next_30_days'], 1),
            'wape_percent': (model.get('metrics') or {}).get('wape_percent'),
            'months': values['months'],
        })
    service_outlook.sort(key=lambda row: row['next_30_days'], reverse=True)
    available = bool(filtered_rows and valid_service_ids)
    return {
        'available': available,
        'method': MODEL_LABEL,
        'generated_at': max(run_generated_times).isoformat() if run_generated_times else None,
        'forecast_horizon_months': FORECAST_MONTHS,
        'monthly': [
            {'month': month.isoformat(), 'label': month.strftime('%b %Y'), 'predicted_requests': total}
            for month, total in sorted(monthly_totals.items())
        ],
        'daily': daily,
        'next_7_days': round(sum(row['expected_requests'] for row in daily[:7]), 1),
        'next_30_days': round(sum(row['expected_requests'] for row in daily), 1),
        'by_service': service_outlook,
        'validation_points': validation_points,
        'service_models': service_models,
        'model_status': {
            'exists': bool(runs),
            'validated': available,
            'backtested': available,
            'error_metrics_stored': available,
            'predictions_available': available,
            'model_key': MODEL_KEY if runs else None,
            'model_label': MODEL_LABEL if runs else None,
            'generated_at': max(run_generated_times).isoformat() if run_generated_times else None,
            'published_service_count': len(valid_service_ids),
            'evaluated_service_count': len(runs),
            'stale_after_days': MAX_RUN_AGE_DAYS,
        },
    }


def build_item_demand_predictions(forecast_contract, horizon_days, service_type_id=None):
    """Translate validated service demand through real ticket-linked usage."""
    service_outlook = {row['service_type_id']: row for row in forecast_contract.get('by_service') or []}
    if service_type_id:
        service_outlook = {key: value for key, value in service_outlook.items() if key == service_type_id}
    if not service_outlook:
        return []
    issues = InventoryTransaction.objects.filter(
        transaction_type='issue',
        service_ticket__isnull=False,
        service_ticket__request__service_type_id__in=service_outlook,
    )
    # The startswith condition is negated explicitly so synthetic demonstration
    # records never influence projected stock demand.
    issues = issues.exclude(service_ticket__request__description__startswith='[Historical Seed]')
    usage = list(
        issues.values('service_ticket__request__service_type_id', 'item_id')
        .annotate(quantity=Sum('quantity'), tickets=Count('service_ticket_id', distinct=True))
    )
    requirements = {
        (row.service_type_id, row.item_id): row
        for row in ServiceTypeInventoryRequirement.objects.filter(
            service_type_id__in=service_outlook,
        ).select_related('item', 'service_type')
    }
    projected = defaultdict(lambda: {'quantity': 0.0, 'service_types': set(), 'observations': 0})
    for row in usage:
        key = (row['service_ticket__request__service_type_id'], row['item_id'])
        requirement = requirements.get(key)
        if not requirement or not row['tickets']:
            continue
        service_prediction = service_outlook[key[0]][f'next_{horizon_days}_days']
        average_usage = float(row['quantity']) / row['tickets']
        item_row = projected[key[1]]
        item_row['quantity'] += service_prediction * average_usage
        item_row['service_types'].add(requirement.service_type.name)
        item_row['observations'] += row['tickets']
    items = {
        item.id: item for item in InventoryItem.objects.filter(id__in=projected).select_related('category')
    }
    result = []
    for item_id, values in projected.items():
        item = items[item_id]
        expected = round(values['quantity'], 1)
        available = item.available_quantity
        result.append({
            'item_id': item.id,
            'item': item.name,
            'sku': item.sku,
            'unit': item.unit_of_measurement,
            'horizon_days': horizon_days,
            'expected_quantity': expected,
            'planning_quantity': math.ceil(expected),
            'available_quantity': available,
            'projected_shortage': max(0, math.ceil(expected) - available),
            'service_types': sorted(values['service_types']),
            'usage_ticket_observations': values['observations'],
        })
    result.sort(key=lambda row: (row['projected_shortage'], row['expected_quantity']), reverse=True)
    return result


def build_location_outlook(forecast_contract, service_type_id=None, today=None):
    """Allocate the 30-day service outlook using recent historical location shares.

    This is deliberately labelled an allocation, not a separately validated
    geographic forecasting model.
    """
    today = today or timezone.localdate()
    service_outlook = {row['service_type_id']: row for row in forecast_contract.get('by_service') or []}
    if service_type_id:
        service_outlook = {key: value for key, value in service_outlook.items() if key == service_type_id}
    if not service_outlook:
        return []
    rows = list(
        _genuine_requests()
        .filter(
            service_type_id__in=service_outlook,
            request_date__date__gte=today - timedelta(days=365),
            request_date__date__lt=today,
        )
        .exclude(location__city='')
        .values('service_type_id', 'service_type__name', 'location__city', 'location__province')
        .annotate(requests=Count('id'))
        .order_by()
    )
    totals = defaultdict(int)
    for row in rows:
        totals[row['service_type_id']] += row['requests']
    outlook = []
    for row in rows:
        denominator = totals[row['service_type_id']]
        if not denominator:
            continue
        share = row['requests'] / denominator
        outlook.append({
            'service_type_id': row['service_type_id'],
            'service_type': row['service_type__name'],
            'city': row['location__city'],
            'province': row['location__province'],
            'historical_requests': row['requests'],
            'historical_share_percent': round(share * 100, 1),
            'allocated_30_day_requests': round(service_outlook[row['service_type_id']]['next_30_days'] * share, 1),
        })
    outlook.sort(key=lambda row: row['allocated_30_day_requests'], reverse=True)
    return outlook[:12]
