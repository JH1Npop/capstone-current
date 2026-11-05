from datetime import time


BOOKABLE_TIME_SLOTS = frozenset({'morning', 'midday', 'afternoon'})
ORDERED_BOOKABLE_TIME_SLOTS = ('morning', 'midday', 'afternoon')
DEFAULT_APPOINTMENT_DAILY_CAPACITY = 3
BUSINESS_DAY_START = time(hour=8)
BUSINESS_DAY_END = time(hour=17)
BUSINESS_HOURS_ERROR = (
    'Service visits must start between 8:00 AM and 5:00 PM. '
    'Choose a morning, midday, or afternoon schedule.'
)


def is_bookable_time_slot(value):
    """Return whether a normalized slot can be used for a new schedule."""
    return value in BOOKABLE_TIME_SLOTS


def is_business_start_time(value):
    """Allow service start times from 08:00 through 16:59."""
    return value is None or BUSINESS_DAY_START <= value < BUSINESS_DAY_END


def time_slot_for_time(value):
    if value is None:
        return None
    if time(hour=8) <= value < time(hour=11):
        return 'morning'
    if time(hour=11) <= value < time(hour=14):
        return 'midday'
    if time(hour=14) <= value < time(hour=17):
        return 'afternoon'
    return None


def get_calendar_closure(scheduled_date, time_slot=None, scheduled_time=None):
    """Return the active whole-day or exact-slot closure for a schedule."""
    if not scheduled_date:
        return None

    from services.models import CalendarClosure

    slots = ['all_day']
    effective_slot = time_slot if time_slot in BOOKABLE_TIME_SLOTS else time_slot_for_time(scheduled_time)
    if effective_slot:
        slots.append(effective_slot)
    return CalendarClosure.objects.filter(
        date=scheduled_date,
        time_slot__in=slots,
        availability_status='closed',
        is_active=True,
    ).order_by('time_slot').first()


def get_appointment_daily_capacity():
    """Return the shared maximum number of scheduled visits for one date."""
    return DEFAULT_APPOINTMENT_DAILY_CAPACITY


def lock_appointment_capacity_policy():
    """Serialize capacity-sensitive writes when called inside transaction.atomic()."""
    from users.models import AdminSettings

    settings_obj = AdminSettings.objects.select_for_update().order_by('id').first()
    if settings_obj is not None:
        return settings_obj

    # A fresh database has no row to lock. Use a deterministic singleton key so
    # concurrent first writers contend on the same insert, then lock the row
    # before reading capacity. Django's get_or_create handles the insert race.
    settings_obj, _ = AdminSettings.objects.get_or_create(pk=1)
    return AdminSettings.objects.select_for_update().get(pk=settings_obj.pk)


def get_scheduled_slot_counts(start_date, end_date=None, exclude_ticket_id=None):
    from services.models import ServiceTicket

    end_date = end_date or start_date
    queryset = ServiceTicket.objects.filter(
        scheduled_date__range=(start_date, end_date),
    ).exclude(status='Cancelled')
    if exclude_ticket_id:
        queryset = queryset.exclude(pk=exclude_ticket_id)

    counts = {}
    for scheduled_date, time_slot, scheduled_time in queryset.values_list(
        'scheduled_date', 'scheduled_time_slot', 'scheduled_time'
    ):
        effective_slot = time_slot if time_slot in BOOKABLE_TIME_SLOTS else time_slot_for_time(scheduled_time)
        effective_slot = effective_slot or 'unspecified'
        date_counts = counts.setdefault(
            scheduled_date.isoformat(),
            {**{slot: 0 for slot in ORDERED_BOOKABLE_TIME_SLOTS}, 'unspecified': 0},
        )
        date_counts[effective_slot] += 1
    return counts


def resolve_slot_availability(*, count, capacity, all_day_override=None, slot_override=None):
    overrides = [override for override in (all_day_override, slot_override) if override]
    if any(override.availability_status == 'closed' for override in overrides):
        return {'status': 'closed', 'source': 'admin'}
    if count >= capacity:
        return {'status': 'full', 'source': 'capacity'}
    if any(override.availability_status == 'limited' for override in overrides):
        return {'status': 'limited', 'source': 'admin'}
    if capacity > 1 and count >= capacity - 1:
        return {'status': 'limited', 'source': 'capacity'}
    return {'status': 'available', 'source': 'capacity'}


def get_calendar_slot_availability(scheduled_date, time_slot, *, exclude_ticket_id=None):
    if not scheduled_date or time_slot not in BOOKABLE_TIME_SLOTS:
        return {'status': 'available', 'source': 'capacity'}

    from services.models import CalendarClosure

    overrides = {
        override.time_slot: override
        for override in CalendarClosure.objects.filter(
            date=scheduled_date,
            time_slot__in=('all_day', time_slot),
            is_active=True,
        )
    }
    counts = get_scheduled_slot_counts(scheduled_date, exclude_ticket_id=exclude_ticket_id)
    date_counts = counts.get(scheduled_date.isoformat(), {})
    return resolve_slot_availability(
        count=sum(date_counts.values()),
        capacity=get_appointment_daily_capacity(),
        all_day_override=overrides.get('all_day'),
        slot_override=overrides.get(time_slot),
    )


def get_calendar_closure_error(scheduled_date, time_slot=None, scheduled_time=None, *, exclude_ticket_id=None):
    closure = get_calendar_closure(scheduled_date, time_slot, scheduled_time)
    if closure:
        return (
            f'{scheduled_date} is closed for '
            f'{closure.get_time_slot_display().lower()}: {closure.reason}'
        )

    effective_slot = time_slot if time_slot in BOOKABLE_TIME_SLOTS else time_slot_for_time(scheduled_time)
    if effective_slot:
        availability = get_calendar_slot_availability(
            scheduled_date,
            effective_slot,
            exclude_ticket_id=exclude_ticket_id,
        )
        if availability['status'] == 'full':
            return (
                f'{scheduled_date} has reached the daily appointment capacity of '
                f'{get_appointment_daily_capacity()} jobs. Choose another date.'
            )
        return ''

    if scheduled_date:
        statuses = [
            get_calendar_slot_availability(
                scheduled_date,
                slot,
                exclude_ticket_id=exclude_ticket_id,
            )['status']
            for slot in ORDERED_BOOKABLE_TIME_SLOTS
        ]
        if all(status in {'closed', 'full'} for status in statuses):
            return f'{scheduled_date} has no appointment availability. Choose another date.'
    return ''
