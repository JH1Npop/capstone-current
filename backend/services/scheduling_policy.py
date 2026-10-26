from datetime import time


BOOKABLE_TIME_SLOTS = frozenset({'morning', 'midday', 'afternoon'})
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
