"""Rules that keep technician tracking honest.

Phones fall back to rough Wi-Fi/cell-tower positions (hundreds of metres to kilometres off) and
can hand back a cached reading up to a minute old. These rules decide which readings may become
the technician's current position, and when a reading was really measured.

The phone sends `reading_age_ms` (its own "now" minus the reading's timestamp, both on the
phone's clock), so a wrong phone clock cannot shift the time; the server subtracts the age from
its own clock.
"""

from django.utils import timezone

# A reading less precise than this is "rough" (GPS did not lock).
ROUGH_ACCURACY_METERS = 100
# Readings measured longer ago than this are cached leftovers and are not saved.
MAX_READING_AGE_SECONDS = 120
# While a precise reading this recent exists, a rough reading does not replace it.
PRECISE_HOLD_SECONDS = 180


def reading_time(raw_age_ms, now=None):
    """Return (measured_at, too_old) for the reading's age in milliseconds.

    A missing or invalid age means "measured now" (older clients send none).
    """
    now = now or timezone.now()
    try:
        age_seconds = max(float(raw_age_ms) / 1000.0, 0.0)
    except (TypeError, ValueError):
        return now, False
    if age_seconds > MAX_READING_AGE_SECONDS:
        return now - timezone.timedelta(seconds=age_seconds), True
    return now - timezone.timedelta(seconds=age_seconds), False


def is_rough(accuracy):
    """Accuracy 0 means "not reported" and is treated as usable, as before."""
    return accuracy > ROUGH_ACCURACY_METERS


def has_recent_precise_reading(technician, now=None):
    from services.models import TechnicianLocationHistory

    now = now or timezone.now()
    return TechnicianLocationHistory.objects.filter(
        technician=technician,
        timestamp__gte=now - timezone.timedelta(seconds=PRECISE_HOLD_SECONDS),
        accuracy__gt=0,
        accuracy__lte=ROUGH_ACCURACY_METERS,
    ).exists()


def should_keep_previous_position(technician, accuracy, now=None):
    """True when a rough reading arrives while a precise recent position is still known."""
    return is_rough(accuracy) and has_recent_precise_reading(technician, now=now)
