"""Read-only aggregation for specialized Admin Analytics workspaces."""

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Max, Min, Q, Sum
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from inventory.models import (
    EquipmentReturnRequest,
    InventoryCategory,
    InventoryItem,
    InventoryReservation,
    InventoryTransaction,
    ServiceTypeInventoryRequirement,
)
from services.models import (
    AfterSalesCase,
    ArrivalValidationLog,
    InspectionChecklist,
    MaintenanceSchedule,
    QuotationRecord,
    SalesRecord,
    SalesRecordLine,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
    TechnicianSkill,
    TicketCrewAssignment,
)
from users.analytics_service import (
    _apply_ticket_dimensions,
    _forecast_readiness,
    _parse_choice,
    _parse_id,
    comparison_metric,
    low_stock_queryset,
)
from users.forecasting_service import (
    build_item_demand_predictions,
    build_location_outlook,
    load_forecast_contract,
    service_model_readiness,
)
from users.models import ClientProfile, User


def _range_q(field, filters, previous=False):
    start = filters['previous_start_at'] if previous else filters['start_at']
    end = filters['previous_end_at'] if previous else filters['end_at']
    return Q(**{f'{field}__gte': start, f'{field}__lt': end})


def _date_range_q(field, filters, previous=False):
    start = filters['previous_start_date'] if previous else filters['start_date']
    end = filters['previous_end_date'] if previous else filters['end_date']
    if start is None or end is None:
        # The no-comparison mode still has internal fallback datetime bounds;
        # specialized previous values are hidden by the response contract.
        start = filters['previous_start_at'].date()
        end = (filters['previous_end_at'] - timedelta(microseconds=1)).date()
    return Q(**{f'{field}__gte': start, f'{field}__lte': end})


def _base_payload(workspace, filters):
    return {
        'workspace': workspace,
        'generated_at': timezone.now().isoformat(),
        'period': {
            'start_date': filters['start_date'].isoformat(),
            'end_date': filters['end_date'].isoformat(),
            'group_by': filters['group_by'],
            'timezone': str(filters['timezone']),
        },
        'comparison': {
            'mode': filters['comparison_mode'],
            'enabled': filters['comparison_enabled'],
            'period': {
                'start_date': filters['previous_start_date'].isoformat() if filters['previous_start_date'] else None,
                'end_date': filters['previous_end_date'].isoformat() if filters['previous_end_date'] else None,
            },
        },
    }


def _choice(params, key, choices):
    return _parse_choice(params, key, dict(choices))


def _bool_choice(params, key):
    raw = str(params.get(key) or '').strip().lower()
    if not raw:
        return None
    if raw not in {'true', 'false'}:
        raise ValidationError({key: 'Use true or false.'})
    return raw == 'true'


def _display_name(row, prefix='technician__'):
    full_name = f"{row.get(prefix + 'first_name') or ''} {row.get(prefix + 'last_name') or ''}".strip()
    return full_name or row.get(prefix + 'username') or 'Unknown technician'


def _comparison(current, previous, filters, *, rate=False, precision=1):
    return comparison_metric(
        current,
        previous if filters['comparison_enabled'] else None,
        enabled=filters['comparison_enabled'],
        rate=rate,
        precision=precision,
    )


def _technician_workspace(params, filters):
    tickets = _apply_ticket_dimensions(ServiceTicket.objects.all(), filters)
    current_q = _range_q('created_at', filters)
    previous_q = _range_q('created_at', filters, previous=True)
    valid_duration = Q(status='Completed', start_time__isnull=False, completed_date__isnull=False) & Q(
        completed_date__gte=F('start_time')
    )
    duration_expression = ExpressionWrapper(F('completed_date') - F('start_time'), output_field=DurationField())

    rows = list(
        tickets.filter(technician__isnull=False)
        .values(
            'technician_id', 'technician__first_name', 'technician__last_name', 'technician__username',
        )
        .annotate(
            assigned=Count('id', filter=current_q),
            previous_assigned=Count('id', filter=previous_q),
            completed=Count('id', filter=current_q & Q(status='Completed')),
            previous_completed=Count('id', filter=previous_q & Q(status='Completed')),
            pending=Count('id', filter=current_q & ~Q(status__in=['Completed', 'Cancelled', 'Turned Over / Accepted'])),
            duration=Avg(duration_expression, filter=current_q & valid_duration),
            previous_duration=Avg(duration_expression, filter=previous_q & valid_duration),
            ratings=Count('id', filter=current_q & Q(client_rating__isnull=False)),
            rating_average=Avg('client_rating', filter=current_q & Q(client_rating__isnull=False)),
            scheduled_minutes=Coalesce(Sum(
                'request__service_type__estimated_duration',
                filter=_date_range_q('scheduled_date', filters) & ~Q(status='Cancelled'),
            ), 0),
        )
        .order_by('-assigned', 'technician__username')
    )

    checklist = {
        row['ticket__technician_id']: row
        for row in InspectionChecklist.objects.filter(ticket__in=tickets, ticket__technician__isnull=False)
        .filter(_range_q('ticket__created_at', filters))
        .values('ticket__technician_id')
        .annotate(applicable=Count('id'), completed=Count('id', filter=Q(is_completed=True)))
    }
    arrival = {
        row['technician_id']: row
        for row in ArrivalValidationLog.objects.filter(
            ticket__in=tickets,
            technician__isnull=False,
            action__in=['arrival_attempt', 'arrival_success', 'arrival_blocked', 'arrival_bypassed'],
        ).filter(_range_q('created_at', filters)).values('technician_id').annotate(
            applicable=Count('id'), passed=Count('id', filter=Q(validation_result='passed')),
        )
    }
    crew = dict(
        TicketCrewAssignment.objects.filter(_range_q('created_at', filters))
        .values('technician_id').annotate(count=Count('id')).values_list('technician_id', 'count')
    )

    leaderboard = []
    for row in rows:
        assigned = row['assigned'] or 0
        completed = row['completed'] or 0
        checklist_row = checklist.get(row['technician_id'], {})
        arrival_row = arrival.get(row['technician_id'], {})
        duration_hours = round(row['duration'].total_seconds() / 3600, 2) if row['duration'] else None
        previous_duration_hours = round(row['previous_duration'].total_seconds() / 3600, 2) if row['previous_duration'] else None
        checklist_total = checklist_row.get('applicable', 0)
        arrival_total = arrival_row.get('applicable', 0)
        leaderboard.append({
            'technician_id': row['technician_id'],
            'technician': _display_name(row),
            'assigned_lead_jobs': assigned,
            'previous_assigned_lead_jobs': row['previous_assigned'] if filters['comparison_enabled'] else None,
            'completed_lead_jobs': completed,
            'previous_completed_lead_jobs': row['previous_completed'] if filters['comparison_enabled'] else None,
            'pending_lead_jobs': row['pending'] or 0,
            'completion_rate': round((completed / assigned) * 100, 1) if assigned else 0,
            'previous_completion_rate': (
                round((row['previous_completed'] / row['previous_assigned']) * 100, 1)
                if filters['comparison_enabled'] and row['previous_assigned'] else (0 if filters['comparison_enabled'] else None)
            ),
            'average_completion_hours': duration_hours,
            'previous_average_completion_hours': previous_duration_hours if filters['comparison_enabled'] else None,
            'actual_valid_work_hours': None,
            'estimated_scheduled_hours': round((row['scheduled_minutes'] or 0) / 60, 1),
            'client_rating': round(row['rating_average'], 2) if row['rating_average'] is not None else None,
            'rating_count': row['ratings'] or 0,
            'checklist_compliance': round((checklist_row.get('completed', 0) / checklist_total) * 100, 1) if checklist_total else None,
            'checklist_observations': checklist_total,
            'arrival_validation_success': round((arrival_row.get('passed', 0) / arrival_total) * 100, 1) if arrival_total else None,
            'arrival_observations': arrival_total,
            'crew_participation': crew.get(row['technician_id'], 0),
        })

    daily_rows = list(
        tickets.filter(technician__isnull=False, scheduled_date__range=(filters['start_date'], filters['end_date']))
        .exclude(status='Cancelled')
        .values('technician_id', 'technician__first_name', 'technician__last_name', 'technician__username', 'scheduled_date')
        .annotate(minutes=Coalesce(Sum('request__service_type__estimated_duration'), 0))
        .order_by('scheduled_date', 'technician__username')
    )
    capacity = [{
        'technician_id': row['technician_id'],
        'technician': _display_name(row),
        'date': row['scheduled_date'].isoformat(),
        'hours': round((row['minutes'] or 0) / 60, 1),
        'capacity_hours': 8,
        'over_capacity': (row['minutes'] or 0) > 480,
    } for row in daily_rows]

    def ranking(key, minimum_key, minimum, highest=True, label=''):
        qualified = [row for row in leaderboard if row[minimum_key] >= minimum and row[key] is not None]
        qualified.sort(key=lambda item: item[key], reverse=highest)
        if not qualified:
            return {
                'category': label, 'available': False,
                'reason': 'Not enough qualifying technician data for this ranking.',
                'qualified_technicians': 0, 'minimum_observations': minimum,
            }
        winner = qualified[0]
        return {
            'category': label, 'available': True, 'technician': winner['technician'],
            'technician_id': winner['technician_id'], 'value': winner[key],
            'observations': winner[minimum_key], 'qualified_technicians': len(qualified),
            'minimum_observations': minimum,
        }

    rankings = [
        ranking('completed_lead_jobs', 'assigned_lead_jobs', 1, True, 'Most Completed Jobs'),
        ranking('completion_rate', 'assigned_lead_jobs', 5, True, 'Highest Completion Rate'),
        ranking('average_completion_hours', 'completed_lead_jobs', 3, False, 'Fastest Average Completion'),
        ranking('client_rating', 'rating_count', 3, True, 'Highest Client Rating'),
        ranking('checklist_compliance', 'checklist_observations', 3, True, 'Highest Checklist Compliance'),
        ranking('arrival_validation_success', 'arrival_observations', 3, True, 'Highest Arrival-Validation Rate'),
    ]

    active = User.objects.filter(role='technician', status='active', is_active=True)
    active_count = active.count()
    available_count = active.filter(technician_profile__is_available=True).count()
    current_job_count = active.filter(assigned_tickets__status__in=['Navigating', 'Arrived on Site', 'In Progress']).distinct().count()
    total_hours = round(sum(row['estimated_scheduled_hours'] for row in leaderboard), 1)
    skills = list(
        ServiceType.objects.filter(is_active=True).values('id', 'name').annotate(
            technician_count=Count('technicianskill', filter=Q(technicianskill__technician__status='active'), distinct=True),
        ).order_by('name')
    )

    payload = _base_payload('technicians', filters)
    payload.update({
        'summary': {
            'active_technicians': active_count,
            'available_technicians': available_count,
            'technicians_on_jobs': current_job_count,
            'estimated_scheduled_hours': total_hours,
            'technicians_over_capacity': len({row['technician_id'] for row in capacity if row['over_capacity']}),
        },
        'leaderboard': leaderboard,
        'rankings': rankings,
        'daily_capacity': capacity,
        'skills_coverage': skills,
        'filter_options': {
            'service_types': list(ServiceType.objects.filter(is_active=True).values('id', 'name').order_by('name')),
            'technicians': [
                {
                    'id': technician.id,
                    'name': technician.get_full_name().strip() or technician.username,
                }
                for technician in active.order_by('first_name', 'last_name', 'username')
            ],
            'priorities': [{'value': value, 'label': label} for value, label in ServiceTicket.PRIORITY_CHOICES],
            'cities': list(
                ServiceTicket.objects.exclude(request__location__city='')
                .values_list('request__location__city', flat=True).distinct().order_by('request__location__city')
            ),
            'provinces': list(
                ServiceTicket.objects.exclude(request__location__province='')
                .values_list('request__location__province', flat=True).distinct().order_by('request__location__province')
            ),
        },
        'semantics': {
            'population': 'Lead-technician tickets are primary; crew participation is separate.',
            'actual_work_hours': 'Unavailable: persisted timestamps do not prove continuous attended labor time.',
            'capacity': 'Estimated primary-service duration compared with an eight-hour daily reference.',
        },
    })
    return payload


def _sales_workspace(params, filters):
    status_filter = _choice(params, 'sales_status', SalesRecord.STATUS_CHOICES)
    client_type = _choice(params, 'client_type', ClientProfile._meta.get_field('client_type').choices)
    currency = str(params.get('currency') or '').strip().upper() or None
    if currency and (len(currency) != 3 or not currency.isalpha()):
        raise ValidationError({'currency': 'Use a three-letter currency code.'})

    records = SalesRecord.objects.all()
    if status_filter:
        records = records.filter(status=status_filter)
    if client_type:
        records = records.filter(client__client_profile__client_type=client_type)
    if currency:
        records = records.filter(currency_code=currency)
    current = records.filter(_date_range_q('sale_date', filters))
    previous = records.filter(_date_range_q('sale_date', filters, previous=True))
    official = current.filter(status='confirmed', agreed_total__isnull=False)
    previous_official = previous.filter(status='confirmed', agreed_total__isnull=False)
    currencies = list(official.values_list('currency_code', flat=True).distinct())
    previous_currencies = list(previous_official.values_list('currency_code', flat=True).distinct())

    current_summary = official.aggregate(count=Count('id'), total=Sum('agreed_total'), average=Avg('agreed_total'))
    previous_summary = previous_official.aggregate(count=Count('id'), total=Sum('agreed_total'), average=Avg('agreed_total'))
    single_currency = len(currencies) <= 1
    comparable_currency = single_currency and len(previous_currencies) <= 1 and (
        not currencies or not previous_currencies or currencies[0] == previous_currencies[0]
    )
    total = current_summary['total'] if single_currency else None
    previous_total = previous_summary['total'] if comparable_currency else None
    average = current_summary['average'] if single_currency else None
    previous_average = previous_summary['average'] if comparable_currency else None

    quotation_current = QuotationRecord.objects.filter(_range_q('created_at', filters))
    quotation_previous = QuotationRecord.objects.filter(_range_q('created_at', filters, previous=True))
    quotation_counts = quotation_current.aggregate(
        eligible=Count('id', filter=Q(status__in=['Accepted', 'Rejected'])),
        accepted=Count('id', filter=Q(status='Accepted')),
    )
    previous_quotation_counts = quotation_previous.aggregate(
        eligible=Count('id', filter=Q(status__in=['Accepted', 'Rejected'])),
        accepted=Count('id', filter=Q(status='Accepted')),
    )
    conversion = round((quotation_counts['accepted'] / quotation_counts['eligible']) * 100, 1) if quotation_counts['eligible'] else 0
    previous_conversion = round((previous_quotation_counts['accepted'] / previous_quotation_counts['eligible']) * 100, 1) if previous_quotation_counts['eligible'] else 0

    voided = records.filter(status='voided', voided_at__isnull=False).filter(_range_q('voided_at', filters))
    voided_summary = voided.aggregate(count=Count('id'), total=Sum('agreed_total'))
    voided_currencies = list(voided.values_list('currency_code', flat=True).distinct())
    voided_total = voided_summary['total'] if len(voided_currencies) <= 1 else None
    by_currency = list(official.values('currency_code').annotate(amount=Sum('agreed_total'), count=Count('id')).order_by('currency_code'))
    previous_by_currency = {
        row['currency_code']: row for row in previous_official.values('currency_code').annotate(amount=Sum('agreed_total'), count=Count('id'))
    }
    for row in by_currency:
        prior = previous_by_currency.get(row['currency_code'], {})
        row['previous_amount'] = prior.get('amount', Decimal('0')) if filters['comparison_enabled'] else None
        row['previous_count'] = prior.get('count', 0) if filters['comparison_enabled'] else None

    by_service = list(official.values('ticket__request__service_type__name').annotate(
        amount=Sum('agreed_total'), count=Count('id'),
    ).order_by('-amount'))
    by_client_type = list(official.values('client__client_profile__client_type').annotate(
        amount=Sum('agreed_total'), count=Count('id'),
    ).order_by('-amount'))
    by_location = list(official.values('ticket__request__location__city', 'ticket__request__location__province').annotate(
        amount=Sum('agreed_total'), count=Count('id'),
    ).order_by('-amount')[:10])
    composition = list(
        SalesRecordLine.objects.filter(sales_record__in=official, line_total__isnull=False)
        .values('line_type').annotate(amount=Sum('line_total')).order_by('-amount')
    )

    payload = _base_payload('sales', filters)
    payload.update({
        'kpis': {
            'confirmed_sales_amount': {**_comparison(total, previous_total, filters, precision=2), 'currency': currencies[0] if len(currencies) == 1 else None},
            'confirmed_sales_count': _comparison(current_summary['count'] or 0, previous_summary['count'] or 0, filters),
            'average_sale_value': {**_comparison(average, previous_average, filters, precision=2), 'currency': currencies[0] if len(currencies) == 1 else None},
            'quotation_conversion_rate': _comparison(conversion, previous_conversion, filters, rate=True),
            'voided_sales_amount': {
                'current': voided_total,
                'count': voided_summary['count'] or 0,
                'currency': voided_currencies[0] if len(voided_currencies) == 1 else None,
            },
        },
        'charts': {
            'sales_by_currency': by_currency,
            'sales_by_service': by_service,
            'sales_by_client_type': by_client_type,
            'sales_by_location': by_location,
            'line_composition': composition,
            'quotation_funnel': [
                {'status': status, 'count': quotation_current.filter(status=status).count()}
                for status in ['Draft', 'Sent', 'Accepted', 'Rejected']
            ],
        },
        'data_quality': {
            'multiple_currencies': len(currencies) > 1,
            'currencies': currencies,
            'voided_multiple_currencies': len(voided_currencies) > 1,
            'confirmed_missing_total': current.filter(status='confirmed', agreed_total__isnull=True).count(),
            'confirmed_missing_sale_date': records.filter(status='confirmed', sale_date__isnull=True).count(),
            'quotation_money_supported': False,
            'quotation_money_reason': 'Quotation monetary fields are text and are not aggregated.',
        },
        'filter_options': {
            'sales_statuses': [{'value': value, 'label': label} for value, label in SalesRecord.STATUS_CHOICES],
            'client_types': [{'value': value, 'label': label} for value, label in ClientProfile._meta.get_field('client_type').choices],
            'currencies': sorted(set(SalesRecord.objects.values_list('currency_code', flat=True))),
        },
    })
    return payload


def _inventory_workspace(params, filters):
    category_id = _parse_id(params, 'category_id')
    item_id = _parse_id(params, 'item_id')
    if category_id and not InventoryCategory.objects.filter(id=category_id).exists():
        raise ValidationError({'category_id': 'Unknown inventory category.'})
    if item_id and not InventoryItem.objects.filter(id=item_id).exists():
        raise ValidationError({'item_id': 'Unknown inventory item.'})
    transaction_type = _choice(params, 'transaction_type', InventoryTransaction.TRANSACTION_TYPES)
    stock_status = _parse_choice(params, 'stock_status', {'in_stock', 'low_stock', 'out_of_stock'})

    items = InventoryItem.objects.select_related('category')
    if category_id:
        items = items.filter(category_id=category_id)
    if item_id:
        items = items.filter(id=item_id)
    if stock_status == 'out_of_stock':
        items = items.filter(quantity__lte=F('reserved_quantity'))
    elif stock_status == 'low_stock':
        items = items.filter(pk__in=low_stock_queryset().values('pk')).exclude(quantity__lte=F('reserved_quantity'))
    elif stock_status == 'in_stock':
        items = items.exclude(pk__in=low_stock_queryset().values('pk'))

    item_summary = items.aggregate(
        total_value=Sum('total_value'), total_quantity=Sum('quantity'), reserved=Sum('reserved_quantity'),
        out_of_stock=Count('id', filter=Q(quantity__lte=F('reserved_quantity'))),
    )
    low_stock = items.filter(pk__in=low_stock_queryset().values('pk')).count()
    transactions = InventoryTransaction.objects.filter(item__in=items)
    if transaction_type:
        transactions = transactions.filter(transaction_type=transaction_type)
    current_transactions = transactions.filter(_range_q('transaction_date', filters))
    previous_transactions = transactions.filter(_range_q('transaction_date', filters, previous=True))
    movement = []
    for value, label in InventoryTransaction.TRANSACTION_TYPES:
        current_quantity = current_transactions.filter(transaction_type=value).aggregate(total=Sum('quantity'))['total'] or 0
        previous_quantity = previous_transactions.filter(transaction_type=value).aggregate(total=Sum('quantity'))['total'] or 0
        if current_quantity or previous_quantity:
            movement.append({
                'transaction_type': value, 'label': label, 'quantity': current_quantity,
                'previous_quantity': previous_quantity if filters['comparison_enabled'] else None,
            })

    issued = list(
        current_transactions.filter(transaction_type='issue').values('item_id', 'item__name', 'item__sku')
        .annotate(quantity=Sum('quantity')).order_by('-quantity')[:10]
    )
    categories = list(items.values('category_id', 'category__name').annotate(
        total_value=Sum('total_value'), available=Sum(F('quantity') - F('reserved_quantity')), reserved=Sum('reserved_quantity'),
    ).order_by('-total_value'))
    reservations = list(
        InventoryReservation.objects.filter(item__in=items, required_date__range=(filters['start_date'], filters['end_date']))
        .values('technician_id', 'technician__first_name', 'technician__last_name', 'technician__username')
        .annotate(quantity=Sum('quantity'), count=Count('id')).order_by('-quantity')
    )
    for row in reservations:
        row['technician'] = _display_name(row)

    issue_total = transactions.filter(transaction_type='issue').count()
    linked_issue_total = transactions.filter(transaction_type='issue', service_ticket__isnull=False).count()
    by_service = list(
        current_transactions.filter(transaction_type='issue', service_ticket__isnull=False)
        .values('service_ticket__request__service_type__name')
        .annotate(quantity=Sum('quantity'), transactions=Count('id')).order_by('-quantity')
    )

    requirement_rows = list(
        ServiceTypeInventoryRequirement.objects.filter(item__in=items)
        .values(
            'item_id', 'item__name', 'item__sku', 'item__quantity', 'item__reserved_quantity',
            'service_type_id', 'service_type__name', 'quantity',
        )
        .annotate(affected_tickets=Count(
            'service_type__servicerequest__serviceticket',
            filter=Q(
                service_type__servicerequest__serviceticket__scheduled_date__range=(filters['start_date'], filters['end_date']),
            ) & ~Q(service_type__servicerequest__serviceticket__status__in=['Completed', 'Cancelled', 'Turned Over / Accepted']),
            distinct=True,
        ), earliest_required=Min('service_type__servicerequest__serviceticket__scheduled_date'))
    )
    shortages = []
    for row in requirement_rows:
        if not row['affected_tickets']:
            continue
        expected = row['quantity'] * row['affected_tickets']
        available = row['item__quantity'] - row['item__reserved_quantity']
        uncovered = max(expected - row['item__reserved_quantity'], 0)
        shortages.append({
            'item_id': row['item_id'], 'item': row['item__name'], 'sku': row['item__sku'],
            'service_type_id': row['service_type_id'], 'service_type': row['service_type__name'],
            'available_quantity': available, 'reserved_quantity': row['item__reserved_quantity'],
            'expected_required_quantity': expected, 'projected_shortage': max(uncovered - available, 0),
            'required_date': row['earliest_required'].isoformat() if row['earliest_required'] else None,
            'affected_ticket_count': row['affected_tickets'],
        })
    shortages.sort(key=lambda row: (-row['projected_shortage'], row['item']))
    returns = list(
        EquipmentReturnRequest.objects.values('status', 'condition').annotate(count=Count('id')).order_by('status', 'condition')
    )

    payload = _base_payload('inventory', filters)
    payload.update({
        'summary': {
            'total_inventory_value': item_summary['total_value'] or Decimal('0'),
            'available_quantity': (item_summary['total_quantity'] or 0) - (item_summary['reserved'] or 0),
            'reserved_quantity': item_summary['reserved'] or 0,
            'low_stock_items': low_stock,
            'out_of_stock_items': item_summary['out_of_stock'] or 0,
            'pending_equipment_returns': EquipmentReturnRequest.objects.filter(status='pending').count(),
        },
        'charts': {
            'movement_summary': movement,
            'most_issued_items': issued,
            'stock_by_category': categories,
            'reservations_by_technician': reservations,
            'usage_by_service_type': by_service,
            'equipment_returns': returns,
        },
        'shortage_risk': shortages,
        'data_quality': {
            'issue_transactions': issue_total,
            'ticket_linked_issue_transactions': linked_issue_total,
            'ticket_linkage_rate': round((linked_issue_total / issue_total) * 100, 1) if issue_total else None,
            'low_stock_history_available': False,
        },
        'filter_options': {
            'categories': list(InventoryCategory.objects.values('id', 'name').order_by('name')),
            'items': list(InventoryItem.objects.values('id', 'name', 'sku').order_by('name')),
            'transaction_types': [{'value': value, 'label': label} for value, label in InventoryTransaction.TRANSACTION_TYPES],
            'stock_statuses': [
                {'value': 'in_stock', 'label': 'In stock'},
                {'value': 'low_stock', 'label': 'Low stock'},
                {'value': 'out_of_stock', 'label': 'Out of stock'},
            ],
        },
    })
    return payload


def _after_sales_workspace(params, filters):
    case_type = _choice(params, 'case_type', AfterSalesCase.CASE_TYPE_CHOICES)
    case_status = _choice(params, 'case_status', AfterSalesCase.STATUS_CHOICES)
    case_priority = _choice(params, 'case_priority', AfterSalesCase.PRIORITY_CHOICES)
    creation_source = _choice(params, 'creation_source', AfterSalesCase.CREATION_SOURCE_CHOICES)
    requires_revisit = _bool_choice(params, 'requires_revisit')
    maintenance_status = _choice(params, 'maintenance_status', MaintenanceSchedule.STATUS_CHOICES)
    risk_level = str(params.get('risk_level') or '').strip() or None
    if risk_level and risk_level not in set(MaintenanceSchedule.objects.values_list('risk_level', flat=True).distinct()) | {'low', 'normal', 'high'}:
        raise ValidationError({'risk_level': f'Unsupported value: {risk_level}'})
    maintenance_service_id = _parse_id(params, 'maintenance_service_type_id')
    if maintenance_service_id and not ServiceType.objects.filter(id=maintenance_service_id, is_active=True).exists():
        raise ValidationError({'maintenance_service_type_id': 'Unknown active service type.'})

    cases = AfterSalesCase.objects.all()
    if case_type:
        cases = cases.filter(case_type=case_type)
    if case_status:
        cases = cases.filter(status=case_status)
    if case_priority:
        cases = cases.filter(priority=case_priority)
    if creation_source:
        cases = cases.filter(creation_source=creation_source)
    if requires_revisit is not None:
        cases = cases.filter(requires_revisit=requires_revisit)
    current = cases.filter(_range_q('created_at', filters))
    previous = cases.filter(_range_q('created_at', filters, previous=True))
    now = timezone.now()
    today = now.astimezone(filters['timezone']).date()
    valid_resolved = current.filter(resolved_at__isnull=False, resolved_at__gte=F('created_at'))
    previous_valid_resolved = previous.filter(resolved_at__isnull=False, resolved_at__gte=F('created_at'))
    current_duration = valid_resolved.aggregate(avg=Avg(ExpressionWrapper(F('resolved_at') - F('created_at'), output_field=DurationField())))['avg']
    previous_duration = previous_valid_resolved.aggregate(avg=Avg(ExpressionWrapper(F('resolved_at') - F('created_at'), output_field=DurationField())))['avg']
    current_hours = round(current_duration.total_seconds() / 3600, 2) if current_duration else None
    previous_hours = round(previous_duration.total_seconds() / 3600, 2) if previous_duration else None
    current_count = current.count()
    previous_count = previous.count()
    resolved_count = current.filter(status__in=['resolved', 'closed']).count()
    previous_resolved_count = previous.filter(status__in=['resolved', 'closed']).count()

    def case_breakdown(field):
        current_rows = {row[field]: row['count'] for row in current.values(field).annotate(count=Count('id'))}
        previous_rows = {row[field]: row['count'] for row in previous.values(field).annotate(count=Count('id'))}
        return [
            {'value': value, 'count': current_rows.get(value, 0), 'previous_count': previous_rows.get(value, 0) if filters['comparison_enabled'] else None}
            for value in sorted(set(current_rows) | set(previous_rows))
        ]

    maintenance = MaintenanceSchedule.objects.all()
    if maintenance_status:
        maintenance = maintenance.filter(status=maintenance_status)
    if risk_level:
        maintenance = maintenance.filter(risk_level=risk_level)
    if maintenance_service_id:
        maintenance = maintenance.filter(service_type_id=maintenance_service_id)
    active_maintenance = maintenance.exclude(status__in=['completed', 'dismissed'])
    due_soon_end = today + timedelta(days=7)
    maintenance_summary = {
        'active_schedules': active_maintenance.count(),
        'due_soon': active_maintenance.filter(next_due_date__gt=today, next_due_date__lte=due_soon_end).count(),
        'due_today': active_maintenance.filter(next_due_date=today).count(),
        'overdue': active_maintenance.filter(next_due_date__lt=today).count(),
        'high_risk': active_maintenance.filter(risk_level='high').count(),
    }

    payload = _base_payload('after_sales', filters)
    payload.update({
        'case_kpis': {
            'new_cases': _comparison(current_count, previous_count, filters),
            'open_cases': {'current': cases.filter(status__in=['open', 'in_progress']).count(), 'scope': 'current'},
            'overdue_cases': {'current': cases.filter(status__in=['open', 'in_progress'], due_date__lt=today).count(), 'scope': 'current'},
            'resolved_cases': _comparison(resolved_count, previous_resolved_count, filters),
            'average_resolution_hours': _comparison(current_hours, previous_hours, filters, precision=2),
            'cases_requiring_revisit': _comparison(current.filter(requires_revisit=True).count(), previous.filter(requires_revisit=True).count(), filters),
        },
        'case_charts': {
            'by_type': case_breakdown('case_type'),
            'by_status': case_breakdown('status'),
            'by_priority': case_breakdown('priority'),
            'by_creation_source': case_breakdown('creation_source'),
            'by_service_type': list(current.values('service_ticket__request__service_type__name').annotate(count=Count('id')).order_by('-count')),
            'by_assigned_staff': list(current.values('assigned_to__first_name', 'assigned_to__last_name', 'assigned_to__username').annotate(count=Count('id')).order_by('-count')),
        },
        'maintenance_summary': maintenance_summary,
        'maintenance_charts': {
            'by_service_type': list(maintenance.values('service_type__name').annotate(count=Count('id')).order_by('-count')),
            'by_status': list(maintenance.values('status').annotate(count=Count('id')).order_by('-count')),
            'by_risk_level': list(maintenance.values('risk_level').annotate(count=Count('id')).order_by('-count')),
            'upcoming': list(active_maintenance.values('next_due_date').annotate(count=Count('id')).order_by('next_due_date')[:12]),
        },
        'data_quality': {
            'resolution_observations': valid_resolved.count(),
            'invalid_or_missing_resolution_timestamps': current.filter(status__in=['resolved', 'closed']).exclude(
                resolved_at__isnull=False, resolved_at__gte=F('created_at'),
            ).count(),
            'satisfaction_responses': current.filter(customer_satisfaction__isnull=False).count(),
            'satisfaction_population': current_count,
            'revisit_is_rework': False,
            'maintenance_risk_semantics': 'Stored operational risk level; not described as AI prediction.',
            'maintenance_technician_metric': 'not_applicable',
        },
        'filter_options': {
            'case_types': [{'value': value, 'label': label} for value, label in AfterSalesCase.CASE_TYPE_CHOICES],
            'case_statuses': [{'value': value, 'label': label} for value, label in AfterSalesCase.STATUS_CHOICES],
            'case_priorities': [{'value': value, 'label': label} for value, label in AfterSalesCase.PRIORITY_CHOICES],
            'creation_sources': [{'value': value, 'label': label} for value, label in AfterSalesCase.CREATION_SOURCE_CHOICES],
            'maintenance_statuses': [{'value': value, 'label': label} for value, label in MaintenanceSchedule.STATUS_CHOICES],
            'risk_levels': sorted(set(MaintenanceSchedule.objects.values_list('risk_level', flat=True))),
            'service_types': list(ServiceType.objects.filter(is_active=True).values('id', 'name').order_by('name')),
        },
    })
    return payload


def _forecasting_workspace(params, filters):
    service_type_id = _parse_id(params, 'service_type_id')
    genuine = ServiceRequest.objects.exclude(description__startswith='[Historical Seed]')
    if service_type_id:
        genuine = genuine.filter(service_type_id=service_type_id)

    active_months = list(
        genuine.annotate(month=TruncMonth('request_date', tzinfo=filters['timezone']))
        .values('month').annotate(requests=Count('id')).order_by('month')
    )
    month_counts = {
        row['month'].date().replace(day=1): row['requests']
        for row in active_months if row['month']
    }
    monthly_demand = []
    if month_counts:
        cursor = min(month_counts)
        last_month = max(month_counts)
        while cursor <= last_month:
            monthly_demand.append({
                'month': cursor.isoformat(),
                'label': cursor.strftime('%b %Y'),
                'requests': month_counts.get(cursor, 0),
                'has_data': cursor in month_counts,
            })
            cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)

    service_mix = list(
        genuine.values('service_type_id', 'service_type__name')
        .annotate(requests=Count('id')).order_by('-requests', 'service_type__name')
    )
    peak = max(monthly_demand, key=lambda row: row['requests'], default=None)
    request_count = sum(row['requests'] for row in monthly_demand)

    location_density = list(
        genuine.exclude(location__city='').values(
            'service_type_id', 'service_type__name', 'location__city', 'location__province',
        ).annotate(requests=Count('id')).order_by('-requests', 'location__city')[:12]
    )

    issues = InventoryTransaction.objects.filter(transaction_type='issue').exclude(
        service_ticket__request__description__startswith='[Historical Seed]',
    )
    issue_evidence = issues.aggregate(
        issue_transactions=Count('id'),
        linked_issue_transactions=Count('id', filter=Q(service_ticket__isnull=False)),
        earliest_linked_issue=Min('transaction_date', filter=Q(service_ticket__isnull=False)),
        latest_linked_issue=Max('transaction_date', filter=Q(service_ticket__isnull=False)),
    )
    linked_issues = issues.filter(service_ticket__isnull=False)
    linked_issue_months = linked_issues.annotate(
        month=TruncMonth('transaction_date', tzinfo=filters['timezone']),
    ).values('month').distinct().count()
    historical_item_usage = list(
        linked_issues.values('item_id', 'item__name', 'item__sku')
        .annotate(quantity=Sum('quantity'), transactions=Count('id'))
        .order_by('-quantity', 'item__name')[:10]
    )
    requirements = ServiceTypeInventoryRequirement.objects.all()
    if service_type_id:
        requirements = requirements.filter(service_type_id=service_type_id)
    requirement_evidence = requirements.aggregate(
        mappings=Count('id'), service_types=Count('service_type_id', distinct=True),
    )
    linked_count = issue_evidence['linked_issue_transactions'] or 0
    issue_count = issue_evidence['issue_transactions'] or 0
    linkage_rate = round((linked_count / issue_count) * 100, 1) if issue_count else None
    required_linked_issues = 50
    required_linkage_rate = 60
    required_issue_months = 6
    evidence_ready = (
        linked_count >= required_linked_issues
        and linkage_rate is not None and linkage_rate >= required_linkage_rate
        and linked_issue_months >= required_issue_months
        and (requirement_evidence['mappings'] or 0) > 0
    )
    item_readiness_reasons = []
    if linked_count < required_linked_issues:
        item_readiness_reasons.append(f'{required_linked_issues - linked_count} more ticket-linked issue records are needed.')
    if linkage_rate is None or linkage_rate < required_linkage_rate:
        item_readiness_reasons.append(f'At least {required_linkage_rate}% of issue transactions must be linked to tickets.')
    if linked_issue_months < required_issue_months:
        item_readiness_reasons.append(f'{required_issue_months - linked_issue_months} more active months of linked item usage are needed.')
    if not (requirement_evidence['mappings'] or 0):
        item_readiness_reasons.append('Service-to-item requirement mappings are required.')
    forecast_contract = load_forecast_contract(service_type_id=service_type_id)
    model_ready = forecast_contract['available']
    if not model_ready:
        item_readiness_reasons.append('A service-demand model must be validated, backtested, and refreshed.')
    item_predictions_7 = (
        build_item_demand_predictions(forecast_contract, 7, service_type_id)
        if evidence_ready and model_ready else []
    )
    item_predictions_30 = (
        build_item_demand_predictions(forecast_contract, 30, service_type_id)
        if evidence_ready and model_ready else []
    )
    item_predictions_available = bool(item_predictions_7 or item_predictions_30)
    location_outlook = build_location_outlook(forecast_contract, service_type_id)
    forecast_readiness = (
        service_model_readiness(service_type_id)
        if service_type_id else _forecast_readiness()
    )
    forecast_readiness.update({
        'history_threshold_met': forecast_readiness['available'],
        'predictions_available': forecast_contract['available'],
        'predictions': forecast_contract['monthly'] if forecast_contract['available'] else [],
        'method': forecast_contract['method'] if forecast_contract['available'] else forecast_readiness.get('method'),
    })
    payload = _base_payload('forecasting', filters)
    payload.update({
        'forecast': forecast_readiness,
        'history_summary': {
            'average_requests_per_active_month': (
                round(request_count / len(active_months), 1) if active_months else None
            ),
            'peak_month': peak['label'] if peak else None,
            'peak_month_requests': peak['requests'] if peak else None,
            'latest_month_requests': monthly_demand[-1]['requests'] if monthly_demand else None,
        },
        'historical_charts': {
            'monthly_demand': monthly_demand,
            'service_mix': service_mix,
            'service_location_density': location_density,
            'historical_item_usage': historical_item_usage,
        },
        'demand_forecast': {
            **forecast_contract,
            'location_outlook': location_outlook,
            'location_method': (
                'The validated 30-day service forecast is allocated by each city/province share '
                'of genuine requests recorded during the latest 365 days. This is not a separately '
                'validated geographic model.'
            ),
        },
        'item_demand_readiness': {
            'available': item_predictions_available,
            'evidence_threshold_met': evidence_ready,
            'model_validated': model_ready,
            'forecast_horizons_days': [7, 30],
            'issue_transactions': issue_count,
            'ticket_linked_issue_transactions': linked_count,
            'ticket_linkage_rate': linkage_rate,
            'required_linked_issue_transactions': required_linked_issues,
            'required_ticket_linkage_rate': required_linkage_rate,
            'linked_issue_active_months': linked_issue_months,
            'required_issue_history_months': required_issue_months,
            'earliest_linked_issue': issue_evidence['earliest_linked_issue'].date().isoformat() if issue_evidence['earliest_linked_issue'] else None,
            'latest_linked_issue': issue_evidence['latest_linked_issue'].date().isoformat() if issue_evidence['latest_linked_issue'] else None,
            'requirement_mappings': requirement_evidence['mappings'] or 0,
            'mapped_service_types': requirement_evidence['service_types'] or 0,
            'reason': (
                'Projected item demand is available from validated service forecasts and genuine '
                'ticket-linked usage.' if item_predictions_available else ' '.join(item_readiness_reasons)
            ),
            'method': (
                'Multiply each validated service-demand outlook by average genuine issued quantity '
                'per linked ticket, limited to configured service-item mappings.'
            ),
            'predictions': {
                'next_7_days': item_predictions_7,
                'next_30_days': item_predictions_30,
            } if item_predictions_available else [],
        },
        'filter_options': {
            'service_types': list(ServiceType.objects.filter(is_active=True).values('id', 'name').order_by('name')),
        },
        'model_status': forecast_contract['model_status'],
    })
    return payload


def build_specialized_workspace(workspace, params, filters):
    if workspace == 'technicians':
        return _technician_workspace(params, filters)
    if workspace == 'sales':
        return _sales_workspace(params, filters)
    if workspace == 'inventory':
        return _inventory_workspace(params, filters)
    if workspace == 'after_sales':
        return _after_sales_workspace(params, filters)
    if workspace == 'forecasting':
        return _forecasting_workspace(params, filters)
    raise ValidationError({'workspace': f'Unsupported value: {workspace}'})
