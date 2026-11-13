"""Working calendar: long jobs span working days, working time counts business hours only."""

from datetime import date, datetime, timedelta, timezone as dt_timezone

from django.test import TestCase

from services.models import ServiceRequest, ServiceStatusHistory, ServiceTicket, ServiceType
from services.sla import evaluate_service_ticket_sla
from services.views.helpers import get_technician_daily_capacity
from services.work_calendar import (
    WorkCalendar,
    add_working_minutes,
    load_work_calendar,
    on_hold_intervals,
    work_day_allocations,
    working_minutes_between,
)
from users.models import AdminSettings, User

UTC = dt_timezone.utc
# Business timezone is UTC+8 (Asia/Singapore): local 08:00 is 00:00 UTC on the same day.
CALENDAR = WorkCalendar(holidays=frozenset({'2026-11-11'}))


def local(year, month, day, hour, minute=0):
    """A moment given in business (UTC+8) time, as an aware UTC datetime."""
    return datetime(year, month, day, hour, minute, tzinfo=UTC) - timedelta(hours=8)


class WorkDayAllocationTests(TestCase):
    def test_a_long_job_skips_weekends_and_holidays(self):
        # Friday 6 Nov, 3 work days: Fri, then Mon 9, Tue 10 (Sat/Sun skipped).
        days = work_day_allocations(date(2026, 11, 6), 3 * 480, CALENDAR)
        self.assertEqual(list(days), [date(2026, 11, 6), date(2026, 11, 9), date(2026, 11, 10)])
        # Across a holiday (Wed 11 Nov): Tue 10, Thu 12.
        days = work_day_allocations(date(2026, 11, 10), 2 * 480, CALENDAR)
        self.assertEqual(list(days), [date(2026, 11, 10), date(2026, 11, 12)])

    def test_the_scheduled_day_counts_even_on_a_day_off(self):
        days = work_day_allocations(date(2026, 11, 7), 2 * 480, CALENDAR)  # a Saturday
        self.assertEqual(list(days), [date(2026, 11, 7), date(2026, 11, 9)])

    def test_a_three_month_job_ends_thirteen_working_weeks_later(self):
        days = work_day_allocations(date(2026, 1, 5), 65 * 480, WorkCalendar())
        self.assertEqual(len(days), 65)
        self.assertEqual(max(days), date(2026, 4, 3))  # not 65 calendar days

    def test_no_business_days_in_settings_falls_back_to_weekdays(self):
        settings_obj = AdminSettings(business_days=[], holiday_dates=[])
        calendar = load_work_calendar(settings_obj, daily_limit_minutes=480)
        self.assertEqual(calendar.working_weekdays, frozenset({1, 2, 3, 4, 5}))


class WorkingTimeTests(TestCase):
    def test_only_business_hours_on_working_days_count(self):
        # Friday 14:00 to Monday 10:00: 3 h Friday + 2 h Monday.
        minutes = working_minutes_between(local(2026, 11, 6, 14), local(2026, 11, 9, 10), CALENDAR)
        self.assertEqual(minutes, 5 * 60)

    def test_adding_working_time_skips_nights_and_weekends(self):
        # 10 working hours from Friday 14:00: 3 h Friday (to 17:00), then 7 h Monday from 08:00.
        finish = add_working_minutes(local(2026, 11, 6, 14), 600, CALENDAR)
        self.assertEqual(finish, local(2026, 11, 9, 15))

    def test_on_hold_spans_come_from_the_status_history(self):
        class Entry:
            def __init__(self, status, moment):
                self.status, self.timestamp = status, moment

        history = [Entry('In Progress', 1), Entry('On Hold', 2), Entry('In Progress', 5), Entry('On Hold', 8)]
        self.assertEqual(on_hold_intervals(history, 10), [(2, 5), (8, 10)])


class LongJobTests(TestCase):
    def setUp(self):
        AdminSettings.objects.all().delete()
        AdminSettings.objects.create(business_days=[1, 2, 3, 4, 5], holiday_dates=[])
        self.client_user = User.objects.create_user(username='long-client', password='pass', role='client')
        self.technician = User.objects.create_user(username='long-tech', password='pass', role='technician', status='active')
        self.long_service = ServiceType.objects.create(name='Three month install', description='x', estimated_duration=65 * 480)
        self.short_service = ServiceType.objects.create(name='Quick visit', description='x', estimated_duration=120)

    def ticket(self, service, scheduled, status='Not Started', **extra):
        request = ServiceRequest.objects.create(
            client=self.client_user, service_type=service, description='x', priority='Normal', status='Approved',
        )
        return ServiceTicket.objects.create(
            request=request, technician=self.technician, scheduled_date=scheduled, status=status, priority='Normal', **extra,
        )

    def test_a_three_month_job_is_not_overdue_on_its_first_afternoon(self):
        start = local(2026, 11, 9, 9)  # Monday 09:00
        job = self.ticket(self.long_service, date(2026, 11, 9), status='In Progress', start_time=start)

        afternoon = evaluate_service_ticket_sla(job, now=local(2026, 11, 9, 16))
        six_weeks = evaluate_service_ticket_sla(job, now=local(2026, 12, 18, 16))

        self.assertEqual(afternoon['state'], 'healthy')
        self.assertEqual(six_weeks['state'], 'healthy')
        # Overdue only after its 65 working days plus the extra time from the Execution delay rule.
        due = afternoon['due_at'] if isinstance(afternoon['due_at'], datetime) else datetime.fromisoformat(afternoon['due_at'])
        self.assertGreater(due, local(2027, 2, 5, 8))

    def test_a_short_job_is_judged_against_its_own_length(self):
        start = local(2026, 11, 9, 9)
        job = self.ticket(self.short_service, date(2026, 11, 9), status='In Progress', start_time=start)
        # 120-minute job + 90 extra = warning at 12:30, + 120 extra = overdue at 13:00.
        self.assertEqual(evaluate_service_ticket_sla(job, now=local(2026, 11, 9, 12))['state'], 'healthy')
        self.assertEqual(evaluate_service_ticket_sla(job, now=local(2026, 11, 9, 12, 45))['state'], 'warning')
        self.assertEqual(evaluate_service_ticket_sla(job, now=local(2026, 11, 9, 13, 5))['state'], 'overdue')

    def test_time_on_hold_does_not_count(self):
        start = local(2026, 11, 9, 9)
        job = self.ticket(self.short_service, date(2026, 11, 9), status='In Progress', start_time=start)
        for status, moment in (('In Progress', start), ('On Hold', local(2026, 11, 9, 10)), ('In Progress', local(2026, 11, 9, 14))):
            entry = ServiceStatusHistory.objects.create(ticket=job, status=status)
            ServiceStatusHistory.objects.filter(pk=entry.pk).update(timestamp=moment)
        # Four hours on hold push the 13:00 deadline to 17:00 (warning from 16:30).
        self.assertEqual(evaluate_service_ticket_sla(job, now=local(2026, 11, 9, 16))['state'], 'healthy')
        self.assertEqual(evaluate_service_ticket_sla(job, now=local(2026, 11, 9, 16, 45))['state'], 'warning')

    def test_capacity_uses_working_days_and_frees_after_completion(self):
        two_day = ServiceType.objects.create(name='Two day', description='x', estimated_duration=960)
        self.ticket(two_day, date(2026, 11, 6))  # Friday: occupies Friday and Monday, not Saturday
        candidate = self.ticket(self.short_service, date(2026, 11, 20))
        self.assertTrue(get_technician_daily_capacity(self.technician, date(2026, 11, 7), candidate)['fits'])
        self.assertFalse(get_technician_daily_capacity(self.technician, date(2026, 11, 9), candidate)['fits'])

        # Finished early on Friday: Monday is free again.
        ServiceTicket.objects.filter(request__service_type=two_day).update(
            status='Completed', completed_date=local(2026, 11, 6, 15),
        )
        self.assertTrue(get_technician_daily_capacity(self.technician, date(2026, 11, 9), candidate)['fits'])


class CalendarWorkDaysTests(TestCase):
    def setUp(self):
        from rest_framework.test import APIClient
        from users.rbac import ROLE_CAPABILITY_MAP

        AdminSettings.objects.all().delete()
        AdminSettings.objects.create(business_days=[1, 2, 3, 4, 5], holiday_dates=['2026-12-25'])
        self.client_user = User.objects.create_user(username='cal-client', password='pass', role='client', first_name='Ana', last_name='Cruz')
        self.technician = User.objects.create_user(username='cal-tech', password='pass', role='technician', status='active')
        self.superadmin = User.objects.create_user(username='cal-owner', password='pass', role='superadmin')
        service = ServiceType.objects.create(name='Twenty day install', description='x', estimated_duration=20 * 480)
        request = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='x', priority='Normal', status='Approved')
        # Starts Monday 16 Nov: 20 working days run to Fri 11 Dec (weekends skipped).
        self.job = ServiceTicket.objects.create(
            request=request, technician=self.technician, scheduled_date=date(2026, 11, 16), status='In Progress', priority='Normal',
        )
        self.api = APIClient()

    def test_technician_schedule_lists_every_work_day_of_a_job_that_started_last_month(self):
        self.api.force_authenticate(user=self.technician)
        response = self.api.get('/api/technician/schedule/', {'start': '2026-12-01', 'end': '2026-12-31'})

        self.assertEqual(response.status_code, 200)
        [job] = response.data['jobs']
        dates = [entry['date'] for entry in job['work_days']]
        self.assertEqual(dates[0], '2026-12-01')
        self.assertEqual(dates[-1], '2026-12-11')
        self.assertNotIn('2026-12-05', dates)  # a Saturday
        self.assertEqual(job['work_days'][0], {'date': '2026-12-01', 'day': 12, 'of': 20})
        self.assertEqual(job['work_days'][-1]['day'], 20)

    def test_admin_calendar_lists_the_same_work_days(self):
        self.api.force_authenticate(user=self.superadmin)
        response = self.api.get('/api/admin/calendar/', {'start': '2026-12-01', 'end': '2026-12-31'})

        self.assertEqual(response.status_code, 200)
        [event] = [item for item in response.data['events'] if item['ticket_id'] == self.job.id]
        self.assertEqual(event['date'], '2026-11-16')  # still the start date
        self.assertEqual(len(event['work_days']), 9)  # 1-4 Dec and 7-11 Dec
        self.assertEqual(event['work_days'][-1], {'date': '2026-12-11', 'day': 20, 'of': 20})

    def test_a_finished_job_stops_at_the_day_it_finished(self):
        ServiceTicket.objects.filter(pk=self.job.pk).update(status='Completed', completed_date=local(2026, 11, 20, 15))
        self.api.force_authenticate(user=self.technician)
        response = self.api.get('/api/technician/schedule/', {'start': '2026-11-01', 'end': '2026-11-30', 'show_completed': '1'})

        [job] = response.data['jobs']
        self.assertEqual([entry['date'] for entry in job['work_days']][-1], '2026-11-20')
        self.assertEqual(job['work_days'][0]['of'], 5)
