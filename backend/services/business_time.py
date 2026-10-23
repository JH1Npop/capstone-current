"""The business's calendar day.

The server clock stays on UTC (``TIME_ZONE``) while people work in
``BUSINESS_DISPLAY_TIMEZONE`` (UTC+8). Between midnight and 08:00 local time the UTC
date is still "yesterday", so checks such as "a payment cannot be dated in the
future" must compare against the business day, not ``timezone.localdate()``.
"""

import zoneinfo

from django.conf import settings
from django.utils import timezone


def business_timezone():
    try:
        return zoneinfo.ZoneInfo(getattr(settings, 'BUSINESS_DISPLAY_TIMEZONE', 'Asia/Singapore'))
    except Exception:
        return timezone.get_current_timezone()


def business_today():
    return timezone.now().astimezone(business_timezone()).date()
