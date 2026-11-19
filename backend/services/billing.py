"""Progress billing: a quotation's payment schedule (e.g. 30% / 60% / 10%).

Only the agreed stages are stored (BillingMilestone). Everything else is worked out here:
  amount    the stage's share of the quotation total (the last stage takes the rounding remainder);
  due_on    when its trigger happened (acceptance, work start, completion, handover) plus
            PAYMENT_WINDOW_DAYS, or the set date;
  paid      every payment received for the job (deposit, progress and sales-record payments, voided
            ones excluded), applied to the stages in order;
  status    paid, overdue (past due_on with money left), due (trigger reached) or upcoming.

The pre-service deposit rule (services/deposits.py, ticket_deposit_gate) is unchanged: deposit
payments still unlock dispatch, and they also count toward the first stages here.
"""

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from services.business_time import business_timezone, business_today
from services.deposits import MONEY_QUANTUM, decimal_from_money

PAYMENT_WINDOW_DAYS = 7
MAX_MILESTONES = 6
TRIGGERS = ('acceptance', 'work_start', 'completion', 'handover', 'date')
EDITABLE_QUOTATION_STATUSES = ('Draft', 'Sent', 'Rejected')


def _local_date(moment):
    if not moment:
        return None
    if hasattr(moment, 'astimezone'):
        return moment.astimezone(business_timezone()).date()
    return moment


def quotation_total(quotation):
    return decimal_from_money(quotation.total_amount) or Decimal('0.00')


def job_payments(quotation):
    """Non-voided payments for the job: on the quotation, or on its active sales record."""
    from services.models import SalesPayment

    ticket = quotation.ticket
    payments = SalesPayment.objects.filter(is_voided=False).filter(
        quotation=quotation,
    ) | SalesPayment.objects.filter(
        is_voided=False,
        sales_record__ticket=ticket,
        sales_record__status__in=('draft', 'confirmed'),
    )
    return list(payments.distinct().order_by('paid_on', 'id'))


def trigger_date(quotation, trigger, milestone=None):
    ticket = quotation.ticket
    if trigger == 'acceptance':
        return _local_date(quotation.client_responded_at or quotation.updated_at) if quotation.status == 'Accepted' else None
    if trigger == 'work_start':
        return _local_date(ticket.start_time)
    if trigger == 'completion':
        return _local_date(ticket.completed_date)
    if trigger == 'handover':
        from services.models import TurnoverAcceptance

        turnover = TurnoverAcceptance.objects.filter(ticket=ticket, status__in=('finalized', 'accepted')).first()
        return _local_date(turnover.finalized_at) if turnover else None
    if trigger == 'date':
        return milestone.due_date if milestone else None
    return None


def billing_plan(quotation, *, today=None):
    """The schedule with amounts, due dates, what is paid and what is left."""
    today = today or business_today()
    milestones = list(quotation.billing_milestones.all())
    total = quotation_total(quotation)
    paid_total = sum((payment.amount for payment in job_payments(quotation)), Decimal('0.00')).quantize(MONEY_QUANTUM)
    cancelled = quotation.ticket.status == 'Cancelled'

    rows = []
    allotted = Decimal('0.00')
    remaining_money = paid_total
    for index, milestone in enumerate(milestones):
        if index == len(milestones) - 1:
            amount = (total - allotted).quantize(MONEY_QUANTUM)
        else:
            amount = (total * milestone.percent / Decimal('100')).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)
        allotted += amount
        paid = min(amount, remaining_money)
        remaining_money -= paid
        left = (amount - paid).quantize(MONEY_QUANTUM)

        started = trigger_date(quotation, milestone.trigger, milestone)
        if milestone.trigger == 'date':
            due_on = milestone.due_date
        else:
            due_on = started + timedelta(days=PAYMENT_WINDOW_DAYS) if started else None

        if left <= 0:
            state = 'paid'
        elif cancelled:
            state = 'cancelled'
        elif due_on and today > due_on:
            state = 'overdue'
        elif started or (milestone.trigger == 'date' and due_on and today >= due_on - timedelta(days=PAYMENT_WINDOW_DAYS)):
            state = 'due'
        else:
            state = 'upcoming'

        rows.append({
            'id': milestone.id,
            'label': milestone.label,
            'percent': str(milestone.percent),
            'trigger': milestone.trigger,
            'trigger_label': milestone.get_trigger_display(),
            'due_date': milestone.due_date.isoformat() if milestone.due_date else None,
            'due_on': due_on.isoformat() if due_on else None,
            'amount': str(amount),
            'paid': str(paid.quantize(MONEY_QUANTUM)),
            'remaining': str(left),
            'status': state,
        })

    return {
        'quotation_id': quotation.id,
        'currency': 'PHP',
        'total': str(total),
        'paid': str(paid_total),
        'balance': str(max(total - paid_total, Decimal('0.00')).quantize(MONEY_QUANTUM)),
        'has_plan': bool(milestones),
        'editable': plan_edit_refusal(quotation) is None,
        'milestones': rows,
        'overdue_amount': str(sum((Decimal(row['remaining']) for row in rows if row['status'] == 'overdue'), Decimal('0.00'))),
    }


def plan_edit_refusal(quotation):
    """Why the office cannot change the schedule now, or None."""
    if quotation.ticket.status == 'Cancelled':
        return 'This job was cancelled, so its payment schedule can no longer change.'
    if quotation.status in EDITABLE_QUOTATION_STATUSES:
        return None
    if quotation.status == 'Accepted':
        # An accepted quotation is a commercial agreement. The office may still record the schedule
        # that was agreed (for example on paper) once, before any progress payment.
        if quotation.billing_milestones.exists():
            return 'The client accepted this quotation with its payment schedule; it can no longer change.'
        if quotation.deposit_payments.filter(kind='progress').exists():
            return 'Progress payments were already recorded against this quotation.'
        return None
    return 'This quotation cannot take a payment schedule.'


def validate_plan_rows(rows):
    """Return (clean_rows, errors)."""
    if not isinstance(rows, list) or not rows:
        return None, 'Add at least one payment stage.'
    if len(rows) > MAX_MILESTONES:
        return None, f'Use at most {MAX_MILESTONES} payment stages.'
    clean = []
    total = Decimal('0')
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            return None, f'Stage {index} is not valid.'
        label = str(row.get('label') or '').strip()
        if not label:
            return None, f'Stage {index} needs a name (for example "Downpayment").'
        try:
            percent = Decimal(str(row.get('percent'))).quantize(MONEY_QUANTUM)
        except Exception:
            return None, f'Stage {index} needs a percentage.'
        if percent <= 0 or percent > 100:
            return None, f'Stage {index}: the percentage must be more than 0 and at most 100.'
        trigger = str(row.get('trigger') or '')
        if trigger not in TRIGGERS:
            return None, f'Stage {index}: choose when it is due.'
        due_date = None
        if trigger == 'date':
            from django.utils.dateparse import parse_date

            due_date = parse_date(str(row.get('due_date') or ''))
            if due_date is None:
                return None, f'Stage {index}: choose the due date.'
        total += percent
        clean.append({'label': label[:120], 'percent': percent, 'trigger': trigger, 'due_date': due_date, 'sort_order': index})
    if abs(total - Decimal('100')) > Decimal('0.01'):
        return None, f'The stages add up to {total}%. They must add up to 100%.'
    return clean, None


def progress_payment_refusal(quotation, amount):
    """Why a progress payment cannot be recorded, or None."""
    from services.deposits import quotation_deposit_summary

    if quotation.status != 'Accepted':
        return 'Progress payments can only be recorded after the quotation is accepted.'
    if quotation.ticket.status == 'Cancelled':
        return 'This job was cancelled, so no new payment can be recorded.'
    if not quotation.billing_milestones.exists():
        return 'Set a payment schedule first.'
    if quotation.sales_records.filter(status='confirmed').exists():
        return 'This job has a confirmed sales record; record the payment there.'
    if quotation_deposit_summary(quotation)['deposit_remaining_amount'] > 0:
        return 'Record the required deposit first (it unlocks the service work).'
    balance = Decimal(billing_plan(quotation)['balance'])
    if amount > balance:
        return f'This is more than the remaining balance of PHP {balance:,.2f}.'
    return None


def overdue_reminder_marker(quotation, row):
    return f"Payment overdue reminder sent for quotation #{quotation.id}, stage {row['id']} (due {row['due_on']})."


def process_overdue_billing_reminders(reference_date=None):
    """Remind the client and the office once per overdue stage (daily automation)."""
    from notifications.models import Notification
    from notifications.notification_utils import in_app_notifications_enabled
    from services.models import QuotationRecord
    from users.models import ActivityLog, User
    from users.signals import log_activity

    today = reference_date or business_today()
    sent = 0
    quotations = (
        QuotationRecord.objects.filter(status='Accepted', billing_milestones__isnull=False)
        .exclude(ticket__status='Cancelled')
        .select_related('ticket__request', 'client')
        .distinct()
    )
    staff = list(User.objects.filter(role__in=['admin', 'superadmin'], is_active=True))
    for quotation in quotations:
        plan = billing_plan(quotation, today=today)
        for row in plan['milestones']:
            if row['status'] != 'overdue':
                continue
            marker = overdue_reminder_marker(quotation, row)
            if ActivityLog.objects.filter(target_model='quotationrecord', target_id=quotation.id, message=marker).exists():
                continue
            if in_app_notifications_enabled():
                Notification.objects.create(
                    user=quotation.client, ticket=quotation.ticket, request=quotation.ticket.request,
                    title='Payment due',
                    message=f"{row['label']} of PHP {Decimal(row['remaining']):,.2f} for TKT-{quotation.ticket_id:04d} was due on {row['due_on']}.",
                    type='reminder',
                )
                for member in staff:
                    Notification.objects.create(
                        user=member, ticket=quotation.ticket, request=quotation.ticket.request,
                        title='Payment overdue',
                        message=f"{row['label']} (PHP {Decimal(row['remaining']):,.2f}) for TKT-{quotation.ticket_id:04d} was due on {row['due_on']}.",
                        type='reminder',
                    )
            log_activity(actor=None, category='system', action='system', target=quotation, message=marker)
            sent += 1
    return {'billing_reminders': sent}
