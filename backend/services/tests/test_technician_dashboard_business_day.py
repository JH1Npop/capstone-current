from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest import mock

from django.utils import timezone

from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceTicket, ServiceType
from users.models import User


class TechnicianDashboardBusinessDayTests(APITestCase):
    """The dashboard's "today" is the business day (UTC+8), not the UTC date."""

    def setUp(self):
        self.client_user = User.objects.create_user(username='dash-client', password='pass', role='client')
        self.technician = User.objects.create_user(
            username='dash-tech', password='pass', role='technician', status='active', is_available=True,
        )
        self.service_type = ServiceType.objects.create(name='Dashboard service', description='x', estimated_duration=60)

    def ticket(self, scheduled, status='Not Started', completed_at=None):
        request = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='x', priority='Normal', status='Approved',
        )
        return ServiceTicket.objects.create(
            request=request, technician=self.technician, scheduled_date=scheduled, status=status,
            priority='Normal', completed_date=completed_at,
        )

    def test_dashboard_uses_the_business_day_between_midnight_and_eight(self):
        # 20:00 UTC on 6 November is 04:00 on 7 November in the business timezone.
        now = datetime(2026, 11, 6, 20, 0, tzinfo=dt_timezone.utc)
        yesterday_job = self.ticket(date(2026, 11, 6))
        today_job = self.ticket(date(2026, 11, 7))
        done_this_business_day = self.ticket(
            date(2026, 11, 7), status='Completed', completed_at=datetime(2026, 11, 6, 20, 30, tzinfo=dt_timezone.utc),
        )
        done_before = self.ticket(
            date(2026, 11, 6), status='Completed', completed_at=datetime(2026, 11, 6, 10, 0, tzinfo=dt_timezone.utc),
        )
        self.client.force_authenticate(user=self.technician)

        with mock.patch('django.utils.timezone.now', return_value=now):
            response = self.client.get('/api/technician/dashboard/')

        self.assertEqual(response.status_code, 200)
        upcoming = {job['id'] for job in response.data['todays_schedule']}
        # Yesterday's job (6 November) is no longer upcoming at 04:00 on the 7th.
        self.assertNotIn(yesterday_job.id, upcoming)
        self.assertIn(today_job.id, upcoming)
        # Completed at 04:30 on the 7th counts as today; completed at 18:00 on the 6th does not.
        self.assertEqual(response.data['stats']['completed_today'], 1)
        self.assertNotIn(done_before.id, {job['id'] for job in response.data['active_jobs']})
        self.assertIn(done_this_business_day.id, upcoming)

    def test_recent_activity_is_what_changed_lately_newest_first(self):
        from services.models import ServiceStatusHistory

        now = datetime(2026, 11, 7, 2, 0, tzinfo=dt_timezone.utc)
        old_assignment_changed_today = self.ticket(date(2026, 11, 7), status='In Progress')
        ServiceTicket.objects.filter(pk=old_assignment_changed_today.pk).update(assigned_at=datetime(2026, 11, 2, tzinfo=dt_timezone.utc))
        history = ServiceStatusHistory.objects.create(ticket=old_assignment_changed_today, status='In Progress')
        ServiceStatusHistory.objects.filter(pk=history.pk).update(timestamp=datetime(2026, 11, 7, 1, 0, tzinfo=dt_timezone.utc))
        assigned_recently = self.ticket(date(2026, 11, 8))
        ServiceTicket.objects.filter(pk=assigned_recently.pk).update(assigned_at=datetime(2026, 11, 5, tzinfo=dt_timezone.utc))
        stale = self.ticket(date(2026, 10, 20))
        ServiceTicket.objects.filter(pk=stale.pk).update(assigned_at=datetime(2026, 10, 20, tzinfo=dt_timezone.utc))
        ServiceStatusHistory.objects.filter(ticket=stale).update(timestamp=datetime(2026, 10, 20, tzinfo=dt_timezone.utc))
        ServiceStatusHistory.objects.filter(ticket=assigned_recently).update(timestamp=datetime(2026, 11, 5, tzinfo=dt_timezone.utc))
        ServiceStatusHistory.objects.filter(ticket=old_assignment_changed_today).exclude(pk=history.pk).update(
            timestamp=datetime(2026, 11, 2, tzinfo=dt_timezone.utc),
        )
        self.client.force_authenticate(user=self.technician)

        with mock.patch('django.utils.timezone.now', return_value=now):
            response = self.client.get('/api/technician/dashboard/')

        recent = [row['id'] for row in response.data['recent_activity']]
        # The job assigned five days ago but started today comes first; nothing older than 7 days appears.
        self.assertEqual(recent, [old_assignment_changed_today.id, assigned_recently.id])
        self.assertIsNotNone(response.data['recent_activity'][0]['last_activity_at'])


class TechnicianScheduleTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='sched-client', password='pass', role='client', first_name='Maria', last_name='Santos',
        )
        self.technician = User.objects.create_user(
            username='sched-tech', password='pass', role='technician', status='active', is_available=True,
        )
        service_type = ServiceType.objects.create(name='Schedule service', description='x', estimated_duration=60)
        request = ServiceRequest.objects.create(
            client=self.client_user, service_type=service_type, description='x', priority='Normal', status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=request, technician=self.technician, scheduled_date=date(2026, 11, 20), status='Not Started', priority='Normal',
        )
        self.client.force_authenticate(user=self.technician)

    def test_schedule_shows_the_client_name_not_the_username(self):
        response = self.client.get('/api/technician/schedule/', {'start': '2026-11-01', 'end': '2026-11-30'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['jobs'][0]['client']['full_name'], 'Maria Santos')

    def test_schedule_refuses_open_ended_ranges(self):
        response = self.client.get('/api/technician/schedule/', {'start': '2026-01-01', 'end': '2027-12-31'})

        self.assertEqual(response.status_code, 400)

    def test_schedule_lists_days_off_holidays_and_closures(self):
        from services.models import CalendarClosure
        from users.models import AdminSettings

        settings_obj = AdminSettings.objects.order_by('id').first() or AdminSettings.objects.create()
        settings_obj.business_days = [1, 2, 3, 4, 5]
        settings_obj.holiday_dates = ['2026-11-30']
        settings_obj.save()
        CalendarClosure.objects.create(date=date(2026, 11, 20), time_slot='all_day', availability_status='closed', reason='Typhoon')
        CalendarClosure.objects.create(date=date(2026, 11, 18), time_slot='morning', availability_status='limited', reason='Training')
        CalendarClosure.objects.create(date=date(2026, 11, 19), time_slot='all_day', availability_status='closed', reason='Old', is_active=False)

        notes = self.client.get('/api/technician/schedule/', {'start': '2026-11-01', 'end': '2026-11-30'}).data['day_notes']

        self.assertEqual(notes['2026-11-30'][0]['label'], 'Holiday')
        self.assertEqual(notes['2026-11-21'][0]['kind'], 'day_off')  # a Saturday
        self.assertNotIn('2026-11-23', notes)  # a Monday, nothing special
        self.assertEqual(notes['2026-11-20'][0], {'kind': 'closed', 'label': 'Closed: All day', 'reason': 'Typhoon'})
        self.assertEqual(notes['2026-11-18'][0]['kind'], 'limited')
        self.assertNotIn('2026-11-19', notes)  # reopened closures are not shown


class TechnicianHistorySummaryTests(APITestCase):
    """Job History's summary is all-time (not the filtered page), counted per ticket, by business month."""

    def setUp(self):
        self.client_user = User.objects.create_user(username='hist-client', password='pass', role='client')
        self.technician = User.objects.create_user(
            username='hist-tech', password='pass', role='technician', status='active', is_available=True,
        )
        self.service_type = ServiceType.objects.create(name='History service', description='x', estimated_duration=60)

    def ticket(self, completed_at, rating=None, status='Completed'):
        request = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='x', priority='Normal', status='Approved',
        )
        return ServiceTicket.objects.create(
            request=request, technician=self.technician, scheduled_date=completed_at.date(), status=status,
            priority='Normal', completed_date=completed_at, client_rating=rating,
        )

    def test_summary_counts_all_completed_jobs_and_the_business_month(self):
        # 17:00 UTC on 31 October is 01:00 on 1 November in the business timezone: this month.
        now = datetime(2026, 11, 7, 2, 0, tzinfo=dt_timezone.utc)
        self.ticket(datetime(2026, 10, 31, 17, 0, tzinfo=dt_timezone.utc), rating=5)
        self.ticket(datetime(2026, 10, 31, 15, 0, tzinfo=dt_timezone.utc), rating=4)
        self.ticket(datetime(2026, 9, 10, 3, 0, tzinfo=dt_timezone.utc))
        self.ticket(datetime(2026, 11, 6, 3, 0, tzinfo=dt_timezone.utc), status='In Progress')
        self.client.force_authenticate(user=self.technician)

        with mock.patch('django.utils.timezone.now', return_value=now):
            response = self.client.get('/api/technician/history/', {'page_size': 1, 'search': 'no-such-ticket'})

        self.assertEqual(response.status_code, 200)
        # The search finds nothing, but the summary still describes all the technician's completed work.
        self.assertEqual(response.data['total'], 0)
        self.assertEqual(response.data['summary'], {
            'completed_total': 3,
            'completed_this_month': 1,
            'average_rating': 4.5,
            'rated_count': 2,
        })

    def test_profile_counts_the_same_finished_jobs_as_job_history_once_each(self):
        from services.models import TicketCrewAssignment

        recent = timezone.now() - timedelta(days=3)
        crew_job = self.ticket(recent, rating=5)
        # Crew rows on the same job must not count it twice or skew the average.
        for index in range(2):
            helper = User.objects.create_user(username=f'hist-helper-{index}', password='pass', role='technician')
            TicketCrewAssignment.objects.create(ticket=crew_job, technician=helper)
        TicketCrewAssignment.objects.create(ticket=crew_job, technician=self.technician)
        self.ticket(recent, rating=3, status='Turned Over / Accepted')
        self.ticket(timezone.now() - timedelta(days=90))
        self.ticket(recent, status='In Progress')
        self.client.force_authenticate(user=self.technician)

        profile = self.client.get('/api/technician/profile/').data
        history = self.client.get('/api/technician/history/').data['summary']

        self.assertEqual(profile['totalCompleted'], 3)
        self.assertEqual(profile['totalCompleted'], history['completed_total'])
        self.assertEqual(profile['completedLast30Days'], 2)
        self.assertEqual(profile['rating'], 4.0)
        self.assertEqual(profile['ratedCount'], 2)
