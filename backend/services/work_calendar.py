"""The working calendar: which days a job really occupies, and how much working time has passed.

Used by technician capacity (dispatch), the calendars and the execution SLA so they agree:

* Working days are the business days in Settings (ISO weekday 1 = Monday .. 7 = Sunday) minus
  the holiday dates. ``CalendarClosure`` days are *not* removed: closures control new client
  bookings (a day can be closed because it is fully booked) and do not mean the crew is off.
* A job's first day is always its scheduled date (the admin chose it, even on a day off); every
  later day is the next working day.
* Working time is counted only inside business hours on working days, at most the daily work
  limit per day (8 hours, or the overtime limit), in the business timezone.

The functions take a ``WorkCalendar`` so callers load Settings once, not per ticket or per day.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from django.utils import timezone

from services.business_time import business_timezone

DEFAULT_WORKING_WEEKDAYS = frozenset({1, 2, 3, 4, 5})
DEFAULT_OPEN = time(8, 0)
DEFAULT_CLOSE = time(17, 0)
DEFAULT_DAILY_LIMIT_MINUTES = 8 * 60
# A job can run for months; this bounds every loop so bad data can never spin forever.
MAX_CALENDAR_DAYS = 3 * 366


@dataclass(frozen=True)
class WorkCalendar:
    working_weekdays: frozenset = DEFAULT_WORKING_WEEKDAYS
    holidays: frozenset = field(default_factory=frozenset)
    open_time: time = DEFAULT_OPEN
    close_time: time = DEFAULT_CLOSE
    daily_limit_minutes: int = DEFAULT_DAILY_LIMIT_MINUTES

    def is_working_day(self, day):
        return day.isoweekday() in self.working_weekdays and day.isoformat() not in self.holidays


def _as_time(value, fallback):
    if isinstance(value, time):
        return value
    try:
        hours, minutes = str(value or '').split(':')[:2]
        return time(int(hours), int(minutes))
    except (TypeError, ValueError):
        return fallback


def load_work_calendar(settings_obj=None, *, daily_limit_minutes=None):
    """Build the calendar from Settings (loaded once by the caller when possible)."""
    if settings_obj is None:
        from users.models import AdminSettings

        settings_obj = AdminSettings.objects.order_by('id').first()
    if daily_limit_minutes is None:
        if settings_obj is None:
            daily_limit_minutes = DEFAULT_DAILY_LIMIT_MINUTES
        else:
            from services.views.helpers import get_daily_capacity_limit_minutes

            daily_limit_minutes = get_daily_capacity_limit_minutes(settings_obj=settings_obj)

    weekdays = set()
    for value in (getattr(settings_obj, 'business_days', None) or []):
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if 1 <= number <= 7:
            weekdays.add(number)
    open_time = _as_time(getattr(settings_obj, 'business_open_time', None), DEFAULT_OPEN)
    close_time = _as_time(getattr(settings_obj, 'business_close_time', None), DEFAULT_CLOSE)
    if close_time <= open_time:
        open_time, close_time = DEFAULT_OPEN, DEFAULT_CLOSE
    return WorkCalendar(
        # Old data with no business days would make every loop endless; fall back to Monday-Friday.
        working_weekdays=frozenset(weekdays) or DEFAULT_WORKING_WEEKDAYS,
        holidays=frozenset(str(value) for value in (getattr(settings_obj, 'holiday_dates', None) or [])),
        open_time=open_time,
        close_time=close_time,
        daily_limit_minutes=max(1, int(daily_limit_minutes or DEFAULT_DAILY_LIMIT_MINUTES)),
    )


def work_day_allocations(start_date, minutes, calendar):
    """{date: minutes} for a job of ``minutes`` starting on ``start_date``.

    Day 1 is the scheduled date; later days skip days off and holidays.
    """
    if not start_date:
        return {}
    remaining = max(0, int(minutes or 0))
    allocations = {}
    current = start_date
    first = True
    for _ in range(MAX_CALENDAR_DAYS):
        if remaining <= 0:
            break
        if first or calendar.is_working_day(current):
            day_minutes = min(remaining, calendar.daily_limit_minutes)
            allocations[current] = day_minutes
            remaining -= day_minutes
            first = False
        current += timedelta(days=1)
    return allocations


def _local(moment):
    if timezone.is_naive(moment):
        moment = timezone.make_aware(moment, timezone.get_default_timezone())
    return moment.astimezone(business_timezone())


def _day_window(day, calendar, tz):
    return (
        datetime.combine(day, calendar.open_time, tzinfo=tz),
        datetime.combine(day, calendar.close_time, tzinfo=tz),
    )


def working_minutes_between(start, end, calendar, *, count_start_day=True):
    """Working minutes from ``start`` to ``end`` (business hours, working days, daily limit).

    The day work started counts even if it is not a working day (the crew was there).
    """
    if not start or not end or end <= start:
        return 0
    tz = business_timezone()
    start_local, end_local = _local(start), _local(end)
    total = 0
    day = start_local.date()
    for _ in range(MAX_CALENDAR_DAYS):
        if day > end_local.date():
            break
        if calendar.is_working_day(day) or (count_start_day and day == start_local.date()):
            window_open, window_close = _day_window(day, calendar, tz)
            begin = max(window_open, start_local)
            finish = min(window_close, end_local)
            if finish > begin:
                total += min(calendar.daily_limit_minutes, int((finish - begin).total_seconds() // 60))
        day += timedelta(days=1)
    return total


def add_working_minutes(start, minutes, calendar):
    """The moment ``minutes`` of working time after ``start`` (same rules as above)."""
    if not start:
        return None
    tz = business_timezone()
    start_local = _local(start)
    remaining = max(0, int(minutes or 0))
    day = start_local.date()
    first = True
    for _ in range(MAX_CALENDAR_DAYS):
        if first or calendar.is_working_day(day):
            window_open, window_close = _day_window(day, calendar, tz)
            begin = max(window_open, start_local) if first else window_open
            available = max(0, min(calendar.daily_limit_minutes, int((window_close - begin).total_seconds() // 60)))
            if remaining <= available:
                return begin + timedelta(minutes=remaining)
            remaining -= available
        first = False
        day += timedelta(days=1)
    return start_local + timedelta(days=MAX_CALENDAR_DAYS)


def on_hold_intervals(status_history, until):
    """[(start, end)] spans a ticket spent On Hold, from its status history (oldest first)."""
    intervals = []
    held_since = None
    for entry in status_history:
        status = str(getattr(entry, 'status', '') or '')
        moment = getattr(entry, 'timestamp', None)
        if not moment:
            continue
        if status == 'On Hold' and held_since is None:
            held_since = moment
        elif status != 'On Hold' and held_since is not None:
            intervals.append((held_since, moment))
            held_since = None
    if held_since is not None:
        intervals.append((held_since, until))
    return intervals


def job_work_days(ticket, calendar, *, minutes=None):
    """Every work day of a ticket, as {date: minutes}."""
    if minutes is None:
        service_type = getattr(getattr(ticket, 'request', None), 'service_type', None)
        minutes = int(getattr(service_type, 'estimated_duration', 0) or 0)
    return work_day_allocations(getattr(ticket, 'scheduled_date', None), minutes, calendar)


def as_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None


# A job that started before a calendar's range can still be running in it. Earlier jobs are only
# looked up if they are longer than one work day, and at most this far back.
LONG_JOB_LOOKBACK_DAYS = 400


def tickets_overlapping(queryset, start_date, end_date, calendar):
    """Narrow a ticket queryset to the ones that may have a work day between start and end."""
    from django.db.models import Q

    return queryset.filter(
        Q(scheduled_date__gte=start_date, scheduled_date__lte=end_date)
        | Q(
            scheduled_date__lt=start_date,
            scheduled_date__gte=start_date - timedelta(days=LONG_JOB_LOOKBACK_DAYS),
            request__service_type__estimated_duration__gt=calendar.daily_limit_minutes,
        )
    )


def work_days_in_range(ticket, calendar, start_date, end_date):
    """[{date, day, of}] for a ticket's work days between start and end ("Day 3 of 65").

    A finished job's days stop at the day it finished.
    """
    from services.ticket_status import COMPLETED_TICKET_STATUSES

    days = sorted(job_work_days(ticket, calendar))
    if not days and getattr(ticket, 'scheduled_date', None):
        days = [ticket.scheduled_date]
    completed_date = getattr(ticket, 'completed_date', None)
    if getattr(ticket, 'status', None) in COMPLETED_TICKET_STATUSES and completed_date:
        finished_on = _local(completed_date).date()
        days = [day for day in days if day <= finished_on] or days[:1]
    total = len(days)
    return [
        {'date': day.isoformat(), 'day': index + 1, 'of': total}
        for index, day in enumerate(days)
        if start_date <= day <= end_date
    ]
