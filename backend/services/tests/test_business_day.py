from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.test import SimpleTestCase

from services.business_time import business_today
from services.serializers import SalesPaymentSerializer

# 01:00 on 23 Oct in UTC+8 is still 22 Oct in UTC.
EARLY_MORNING_UTC = datetime(2026, 10, 22, 17, 0, tzinfo=dt_timezone.utc)


class BusinessDayTests(SimpleTestCase):
    def test_business_today_is_the_local_calendar_day(self):
        with patch('services.business_time.timezone.now', return_value=EARLY_MORNING_UTC):
            self.assertEqual(business_today().isoformat(), '2026-10-23')

    def test_payment_dated_today_is_accepted_before_8_am_local(self):
        with patch('services.business_time.timezone.now', return_value=EARLY_MORNING_UTC):
            today = SalesPaymentSerializer(data={'amount': '100.00', 'paid_on': '2026-10-23', 'method': 'cash'})
            self.assertTrue(today.is_valid(), today.errors)
            tomorrow = SalesPaymentSerializer(data={'amount': '100.00', 'paid_on': (business_today() + timedelta(days=1)).isoformat(), 'method': 'cash'})
            self.assertFalse(tomorrow.is_valid())
            self.assertIn('paid_on', tomorrow.errors)
