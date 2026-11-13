"""Time cases with the clock moved.

The server keeps UTC (``TIME_ZONE``); the business works in UTC+8. Between 00:00 and 08:00 local time
the UTC date is still yesterday, and at any hour the UTC clock is 8 hours behind. Each test sets the
clock to a chosen local moment and checks the rule answers for the business's day and time.

Long-running cases (days, months) move the clock forward across the boundary that matters.
Expired quotations, unverified accounts and maintenance reminder stages have their own tests
(``test_quotation_revision.py``, ``users/tests.py``, ``test_maintenance_workflow.py``).
"""

from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.tokens import PasswordResetTokenGenerator, default_token_generator
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APITestCase

from notifications.models import Notification
from services.business_time import business_timezone
from services.maintenance import evaluate_schedule_status, evaluate_warranty_status, sync_maintenance_schedule, sync_ticket_warranty
from services.models import (
    AfterSalesCase as FollowUpCase, InspectionChecklist, MaintenanceSchedule, ServiceRequest, ServiceTicket, ServiceType,
)
from services.sla import check_and_escalate_sla_breaches, evaluate_service_ticket_sla, get_ticket_dispatch_state
from users.models import ActivityLog, AdminSettings, User

TODAY = date(2026, 11, 10)        # a Tuesday
YESTERDAY = TODAY - timedelta(days=1)


def local(day, hour, minute=0):
    """An aware moment at a local (UTC+8) wall-clock time."""
    return datetime.combine(day, time(hour, minute), tzinfo=business_timezone())


@contextmanager
def clock(moment):
    with mock.patch('django.utils.timezone.now', return_value=moment):
        yield


class TimeFixture(APITestCase):
    def setUp(self):
        self.office = User.objects.create_user(username='tc-office', password='x', role='superadmin')
        self.client_user = User.objects.create_user(username='tc-client', password='x', role='client', email='tc-client@example.com')
        self.tech = User.objects.create_user(username='tc-tech', password='x', role='technician', status='active')
        self.service = ServiceType.objects.create(name='Time cases', estimated_duration=60, estimated_cost=Decimal('1000'), max_daily_assignments=99)
        AdminSettings.objects.update_or_create(pk=1, defaults={'require_quotation_acceptance': False})

    def ticket(self, **fields):
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=self.service, description='Time case', status='Approved')
        values = dict(request=request_obj, status='Not Started', scheduled_date=TODAY, scheduled_time=time(9, 0))
        values.update(fields)
        return ServiceTicket.objects.create(**values)

    def as_office(self):
        self.client.force_authenticate(self.office)
        return self.client


class BeforeEightInTheMorningTests(TimeFixture):
    """06:30 local time: the server's UTC date is still yesterday."""

    def decide(self, **data):
        ticket = self.ticket(status='Inspection Completed', ticket_type='inspection')
        return self.as_office().post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', {
            'decision': 'approve_service', 'notes': 'Reviewed.', **data,
        }, format='json')

    def test_an_installation_cannot_be_set_for_yesterday_and_today_needs_a_time(self):
        with clock(local(TODAY, 6, 30)):
            yesterday = self.decide(scheduled_date=YESTERDAY.isoformat(), scheduled_time='10:00')
            today_without_time = self.decide(scheduled_date=TODAY.isoformat())
            today_later = self.decide(scheduled_date=TODAY.isoformat(), scheduled_time='10:00')
        self.assertEqual((yesterday.status_code, yesterday.data['error']), (400, 'The installation date cannot be in the past.'))
        self.assertEqual((today_without_time.status_code, today_without_time.data['code']), (400, 'same_day_time_required'))
        self.assertEqual(today_later.status_code, 200, today_later.data)

    def test_the_office_cannot_reschedule_to_yesterday(self):
        ticket = self.ticket(scheduled_date=TODAY + timedelta(days=3))
        with clock(local(TODAY, 6, 30)):
            response = self.as_office().post(f'/api/services/service-tickets/{ticket.id}/reschedule/', {
                'scheduled_date': YESTERDAY.isoformat(), 'notes': 'Client asked.',
            }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'scheduled_date cannot be in the past.')

    def test_maintenance_due_today_is_due(self):
        with clock(local(TODAY, 6, 30)):
            due_today = evaluate_schedule_status(MaintenanceSchedule(next_due_date=TODAY, notify_on_date=TODAY - timedelta(days=7), status='scheduled'))
            due_tomorrow = evaluate_schedule_status(MaintenanceSchedule(next_due_date=TODAY + timedelta(days=1), notify_on_date=TODAY, status='scheduled'))
        self.assertEqual((due_today, due_tomorrow), ('due', 'due_soon'))

    def test_a_job_finished_before_eight_counts_on_that_local_day(self):
        finished = local(TODAY, 7, 0)   # still the 9th in UTC
        # Reloaded, as real records are: the stored moment comes back in UTC (the 9th, 23:00).
        ticket = ServiceTicket.objects.get(pk=self.ticket(status='Completed', completed_date=finished, end_time=finished).pk)
        InspectionChecklist.objects.create(
            ticket=ticket, warranty_provided=True, warranty_period_days=30,
            maintenance_required=True, maintenance_profile='standard_area',
        )
        with clock(local(TODAY, 7, 5)):
            sync_ticket_warranty(ticket)
            schedule = sync_maintenance_schedule(ticket)
        ticket.refresh_from_db()
        self.assertEqual((ticket.warranty_start_date, ticket.warranty_end_date), (TODAY, TODAY + timedelta(days=30)))
        self.assertEqual(schedule.last_service_date, TODAY)

    def test_landing_page_promotions_run_by_the_local_day(self):
        settings_obj = AdminSettings.objects.get(pk=1)
        settings_obj.landing_page_promotions = [
            {'id': 'today', 'name': 'Today only', 'active': True, 'startDate': str(TODAY), 'endDate': str(TODAY)},
            {'id': 'ended', 'name': 'Ended yesterday', 'active': True, 'endDate': str(YESTERDAY)},
        ]
        settings_obj.save()
        with clock(local(TODAY, 6, 30)):
            response = self.client.get('/api/public/landing-page/')
        self.assertEqual([item['id'] for item in response.data['landingPagePromotions']], ['today'])

    def test_the_calendar_refuses_changes_to_yesterday(self):
        with clock(local(TODAY, 6, 30)):
            response = self.as_office().post('/api/admin/calendar/closures/', {
                'action': 'close', 'dates': [YESTERDAY.isoformat()], 'reason': 'Holiday.',
            }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['date'], 'Past dates cannot be changed.')

    def test_activity_log_today_and_date_filters_use_the_local_day(self):
        with clock(local(YESTERDAY, 23, 0)):
            ActivityLog.objects.create(actor=self.office, action='update', message='Late last night')
        with clock(local(TODAY, 6, 0)):
            ActivityLog.objects.create(actor=self.office, action='update', message='Early this morning')
        with clock(local(TODAY, 6, 30)):
            summary = self.as_office().get('/api/admin/activity-logs/summary/')
            listed = self.as_office().get(
                f'/api/admin/activity-logs/?date_from={TODAY}&date_to={TODAY}&page_size=100'
            )
        self.assertEqual(summary.status_code, 200, summary.data)
        rows = listed.data.get('results', listed.data)
        messages = {row['message'] for row in rows if row.get('message') in {'Late last night', 'Early this morning'}}
        self.assertEqual(messages, {'Early this morning'})
        # Rows made during setUp carry the real time, so count exactly the local day TODAY.
        on_the_day = ActivityLog.objects.filter(created_at__gte=local(TODAY, 0), created_at__lt=local(TODAY + timedelta(days=1), 0))
        self.assertEqual(summary.data['today'], on_the_day.count())
        self.assertTrue(on_the_day.filter(message='Early this morning').exists())
        self.assertFalse(on_the_day.filter(message='Late last night').exists())

    def test_technician_job_history_date_filter_uses_the_local_day(self):
        self.ticket(technician=self.tech, status='Completed', completed_date=local(TODAY, 7, 0))
        self.ticket(technician=self.tech, status='Completed', completed_date=local(YESTERDAY, 23, 0))
        self.client.force_authenticate(self.tech)
        with clock(local(TODAY, 7, 30)):
            response = self.client.get(f'/api/technician/history/?date_from={TODAY}&date_to={TODAY}')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data.get('count', len(response.data.get('results', []))), 1)


class LocalAppointmentTimeTests(TimeFixture):
    """Appointment times are local; the SLA clock and missed dispatch must read them that way (any hour)."""

    def test_a_late_start_is_flagged_from_the_local_appointment_time(self):
        ticket = self.ticket(technician=self.tech, assigned_at=local(YESTERDAY, 15))
        before = evaluate_service_ticket_sla(ticket, now=local(TODAY, 8, 50))
        late = evaluate_service_ticket_sla(ticket, now=local(TODAY, 10, 30))
        self.assertNotEqual(before['state'], 'overdue')
        self.assertEqual((late['rule'], late['state'], late['minutes_overdue']), ('start_delay', 'overdue', 30))

    def test_an_unassigned_job_is_a_missed_dispatch_once_its_local_start_passes(self):
        ticket = self.ticket()
        self.assertFalse(get_ticket_dispatch_state(ticket, now=local(TODAY, 8, 30))['is_missed_dispatch'])
        self.assertTrue(get_ticket_dispatch_state(ticket, now=local(TODAY, 14, 0))['is_missed_dispatch'])

    def test_a_same_day_installation_time_must_still_be_ahead(self):
        decisions = {}
        for label, at in (('10:00 at 14:00', '10:00'), ('16:00 at 14:00', '16:00')):
            ticket = self.ticket(status='Inspection Completed', ticket_type='inspection')
            with clock(local(TODAY, 14, 0)):
                decisions[label] = self.as_office().post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', {
                    'decision': 'approve_service', 'notes': 'Reviewed.', 'scheduled_date': TODAY.isoformat(), 'scheduled_time': at,
                }, format='json')
        self.assertEqual((decisions['10:00 at 14:00'].status_code, decisions['10:00 at 14:00'].data['code']), (400, 'same_day_time_must_be_future'))
        self.assertEqual(decisions['16:00 at 14:00'].status_code, 200)


class LongRunningTests(TimeFixture):
    """Days and months: what happens as time passes."""

    def test_a_late_start_alert_repeats_at_most_once_a_day(self):
        ticket = self.ticket(technician=self.tech, assigned_at=local(YESTERDAY, 15))

        def alerts():
            return Notification.objects.filter(user=self.tech, ticket=ticket).count()

        for moment in (local(TODAY, 10, 30), local(TODAY, 13, 0), local(TODAY, 17, 0)):
            with clock(moment):
                check_and_escalate_sla_breaches(now=moment)
        same_day = alerts()
        next_day = local(TODAY + timedelta(days=1), 11, 0)
        with clock(next_day):
            check_and_escalate_sla_breaches(now=next_day)
        self.assertEqual(same_day, 1)
        self.assertEqual(alerts(), 2)

    def test_warranty_is_active_through_its_last_day(self):
        ticket = self.ticket(status='Completed', warranty_period_days=365, warranty_start_date=TODAY, warranty_end_date=TODAY + timedelta(days=365))
        self.assertEqual(evaluate_warranty_status(ticket, reference_date=TODAY + timedelta(days=365)), 'active')
        self.assertEqual(evaluate_warranty_status(ticket, reference_date=TODAY + timedelta(days=366)), 'expired')

    def test_a_leap_day_job_gets_whole_periods(self):
        leap = date(2028, 2, 29)
        ticket = ServiceTicket.objects.get(pk=self.ticket(status='Completed', completed_date=local(leap, 10), end_time=local(leap, 10)).pk)
        InspectionChecklist.objects.create(ticket=ticket, warranty_provided=True, warranty_period_days=365, maintenance_required=True, maintenance_profile='standard_area')
        with clock(local(leap, 10, 5)):
            sync_ticket_warranty(ticket)
            schedule = sync_maintenance_schedule(ticket)
        ticket.refresh_from_db()
        self.assertEqual(ticket.warranty_end_date, date(2029, 2, 28))
        self.assertGreater(schedule.next_due_date, leap)

    @override_settings(PASSWORD_RESET_TIMEOUT=3 * 24 * 3600)
    def test_a_password_reset_link_expires(self):
        uid = urlsafe_base64_encode(force_bytes(self.client_user.pk))
        sent_at = datetime(2026, 11, 10, 9, 0)
        with mock.patch.object(PasswordResetTokenGenerator, '_now', return_value=sent_at):
            token = default_token_generator.make_token(self.client_user)
        payload = {'uid': uid, 'token': token, 'new_password': 'AnotherStrongPass456!', 'password_confirm': 'AnotherStrongPass456!'}
        with mock.patch.object(PasswordResetTokenGenerator, '_now', return_value=sent_at + timedelta(days=3, seconds=1)):
            late = self.client.post('/api/users/password_reset_confirm/', payload, format='json')
        self.assertEqual(late.status_code, 400)
        with mock.patch.object(PasswordResetTokenGenerator, '_now', return_value=sent_at + timedelta(days=2)):
            in_time = self.client.post('/api/users/password_reset_confirm/', payload, format='json')
        self.assertEqual(in_time.status_code, 200, in_time.data)

    def test_after_sales_overdue_count_uses_the_local_day(self):
        job = self.ticket(status='Completed', completed_date=local(YESTERDAY, 10))
        for due in (YESTERDAY, TODAY):
            FollowUpCase.objects.create(
                service_ticket=job, client=self.client_user, case_type='follow_up', status='open', priority='normal',
                summary=f'Due {due}', due_date=due,
            )
        with clock(local(TODAY, 6, 30)):
            response = self.as_office().get('/api/services/follow-up-cases/summary/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['overdue_cases'], 1)
