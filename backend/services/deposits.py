"""Deposit policy calculations shared by quotations, dispatch, and payments."""

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


MONEY_QUANTUM = Decimal('0.01')


def decimal_from_money(value):
    if value in (None, ''):
        return None
    cleaned = re.sub(r'[^0-9.\-]', '', str(value))
    if not cleaned:
        return None
    try:
        parsed = Decimal(cleaned)
    except InvalidOperation:
        return None
    if parsed < 0:
        return None
    return parsed.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def calculate_required_deposit(policy, value, total):
    policy = str(policy or 'none').lower()
    value = Decimal(value or 0)
    if policy == 'none':
        return Decimal('0.00')
    if total is None or total <= 0:
        raise ValueError('Enter a valid quotation total before sending a deposit-required quotation.')
    if policy == 'percentage':
        if value <= 0 or value > 100:
            raise ValueError('Deposit percentage must be greater than 0 and no more than 100.')
        return (total * value / Decimal('100')).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    if policy == 'fixed':
        if value <= 0:
            raise ValueError('Fixed deposit amount must be greater than zero.')
        if value > total:
            raise ValueError('Fixed deposit amount cannot exceed the quotation total.')
        return value.quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
    raise ValueError('Unsupported deposit policy.')


def request_deposit_services(service_request):
    """Return each distinct catalog service selected for a request."""
    services = []
    seen_ids = set()
    primary = getattr(service_request, 'service_type', None)
    if primary is not None:
        services.append(primary)
        seen_ids.add(primary.pk)
    for item in service_request.service_items.select_related('service_type').order_by('sort_order', 'id'):
        if item.service_type_id not in seen_ids:
            services.append(item.service_type)
            seen_ids.add(item.service_type_id)
    return services


def effective_request_deposit_rule(service_request, total):
    """Choose the selected service rule producing the highest job-level deposit.

    A quotation covers the complete multi-service job, so rules are not added
    together. The strictest effective rule wins and is snapshotted on the quote.
    """
    winning_policy = 'none'
    winning_value = Decimal('0.00')
    winning_amount = Decimal('0.00')
    for service in request_deposit_services(service_request):
        amount = calculate_required_deposit(service.deposit_policy, service.deposit_value, total)
        if amount > winning_amount:
            winning_policy = service.deposit_policy
            winning_value = service.deposit_value
            winning_amount = amount
    return winning_policy, winning_value, winning_amount


def quotation_deposit_summary(quotation):
    required = Decimal(quotation.required_deposit_amount or 0).quantize(MONEY_QUANTUM)
    payments = getattr(quotation, '_prefetched_objects_cache', {}).get('deposit_payments')
    if payments is None:
        payments = quotation.deposit_payments.all()
    paid = sum((payment.amount for payment in payments if not payment.is_voided), Decimal('0.00'))
    paid = paid.quantize(MONEY_QUANTUM)
    remaining = max(required - paid, Decimal('0.00'))
    if required <= 0:
        payment_status = 'not_required'
    elif paid <= 0:
        payment_status = 'unpaid'
    elif remaining > 0:
        payment_status = 'partial'
    else:
        payment_status = 'paid'
    return {
        'required_deposit_amount': required,
        'deposit_paid_amount': paid,
        'deposit_remaining_amount': remaining,
        'deposit_status': payment_status,
    }


def ticket_deposit_gate(ticket):
    """Return the commercial gate for beginning service work on a ticket."""
    try:
        quotation = ticket.quotation
    except Exception:
        quotation = None

    if quotation is None:
        deposit_required = any(
            service.deposit_policy != 'none'
            for service in request_deposit_services(ticket.request)
        )
    else:
        deposit_required = quotation.deposit_policy != 'none'
    if not deposit_required:
        return {'ready': True, 'code': 'not_required', 'quotation': quotation}
    if quotation is None or quotation.status != 'Accepted':
        return {
            'ready': False,
            'code': 'quotation_not_accepted',
            'message': 'This service requires a deposit. Send a quotation and record the client acceptance first.',
            'quotation': quotation,
        }

    summary = quotation_deposit_summary(quotation)
    if summary['required_deposit_amount'] <= 0:
        return {
            'ready': False,
            'code': 'deposit_configuration_invalid',
            'message': 'The accepted quotation does not contain a valid required deposit amount.',
            'quotation': quotation,
            **summary,
        }
    if summary['deposit_remaining_amount'] > 0:
        return {
            'ready': False,
            'code': 'deposit_required',
            'message': (
                f"Record the remaining PHP {summary['deposit_remaining_amount']:,.2f} deposit "
                'before dispatching service work.'
            ),
            'quotation': quotation,
            **summary,
        }
    return {'ready': True, 'code': 'deposit_paid', 'quotation': quotation, **summary}
