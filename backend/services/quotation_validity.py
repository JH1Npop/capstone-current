"""How long a sent quotation can be accepted.

A quotation says "valid for N days". The clock starts on the business (UTC+8) day the office last
sent it: while a quotation is waiting for the client (status ``Sent``), the only writes to it are
the office sending or updating it, so ``updated_at`` is that moment. Sending an updated quotation
therefore restarts the period. The quotation can be accepted through the last valid day
(sent on 8 November with 30 days: accept until 8 December, inclusive).
"""

from datetime import timedelta

from .business_time import business_timezone, business_today


def default_validity_days():
    """The office's "Quotation Validity (days)" setting (Admin Settings), 30 if unset."""
    try:
        from users.models import AdminSettings

        settings_row = AdminSettings.objects.order_by('id').first()
    except Exception:
        settings_row = None
    days = getattr(settings_row, 'quotation_validity_days', None)
    return days if days and 1 <= days <= 365 else 30


def quotation_valid_until(quotation):
    """Last business day the quotation can be accepted, or None if it has not been sent."""
    if quotation is None or quotation.status != 'Sent':
        return None
    sent_at = quotation.updated_at or quotation.created_at
    if sent_at is None:
        return None
    days = quotation.validity_days or 0
    return sent_at.astimezone(business_timezone()).date() + timedelta(days=max(days, 0))


def quotation_is_expired(quotation):
    valid_until = quotation_valid_until(quotation)
    return valid_until is not None and business_today() > valid_until
