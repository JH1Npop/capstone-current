"""Daily after-sales alerts (warranty ending, overdue cases), the maintenance reminder window that
follows the setting, and the warranty list."""
from datetime import timedelta
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APITestCase

from notifications.models import Notification
from services.after_sales_alerts import process_overdue_after_sales_cases, process_warranty_expiry_reminders
from services.business_time import business_today
from services.maintenance import process_maintenance_alerts
from services.models import (
    AfterSalesCase, AfterSalesCaseEvent, MaintenanceSchedule, ServiceRequest, ServiceTicket, ServiceType,
)
from users.models import AdminSettings, User


class AfterSalesAlertTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(username='alert-client', password='x', role='client', email='client@example.test')
        self.admin = User.objects.create_user(username='alert-admin', password='x', role='admin')
        self.superadmin = User.objects.create_user(username='alert-super', password='x', role='superadmin')
        self.service_type = ServiceType.objects.create(name='Solar Cleaning', estimated_duration=60)

    def ticket(self, **fields):
        request = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='x', status='Completed',
        )
        defaults = {'status': 'Completed', 'scheduled_date': business_today(), 'completed_date': timezone.now()}
        defaults.update(fields)
        return ServiceTicket.objects.create(request=request, **defaults)

    def warranty_ticket(self, days_left, status='active'):
        end = business_today() + timedelta(days=days_left)
        return self.ticket(
            warranty_status=status, warranty_period_days=365,
            warranty_start_date=end - timedelta(days=365), warranty_end_date=end,
        )

    # ── Warranty ending ──
    @patch('services.after_sales_alerts.send_mail')
    def test_warranty_reminder_goes_out_once_inside_30_days(self, mock_mail):
        inside = self.warranty_ticket(20)
        self.warranty_ticket(45)            # too early
        self.warranty_ticket(-1)            # already ended
        self.warranty_ticket(10, 'void')    # voided

        first = process_warranty_expiry_reminders()
        second = process_warranty_expiry_reminders()

        self.assertEqual(first['warranty_reminders'], 1)
        self.assertEqual(second['warranty_reminders'], 0, 'sent once per end date')
        self.assertEqual(mock_mail.call_count, 1)
        self.assertEqual(Notification.objects.filter(user=self.client_user, title='Warranty Ending Soon', ticket=inside).count(), 1)
        self.assertEqual(Notification.objects.filter(title='Warranty ending soon', ticket=inside).count(), 2, 'admin and superadmin')

        # Clearing notifications must not make it send again.
        Notification.objects.all().delete()
        self.assertEqual(process_warranty_expiry_reminders()['warranty_reminders'], 0)

    @patch('services.after_sales_alerts.send_mail')
    def test_missed_days_are_caught_up(self, _mock_mail):
        self.warranty_ticket(3)
        self.assertEqual(process_warranty_expiry_reminders()['warranty_reminders'], 1)

    # ── Overdue cases ──
    def case(self, due_in, status='open', case_type='complaint', assigned_to=None):
        return AfterSalesCase.objects.create(
            service_ticket=self.ticket(), client=self.client_user, case_type=case_type, status=status,
            priority='normal', summary='Inverter beeping', due_date=business_today() + timedelta(days=due_in),
            assigned_to=assigned_to,
        )

    def test_overdue_case_alerts_once_and_goes_to_the_assignee(self):
        assigned = self.case(-2, assigned_to=self.admin)
        unassigned = self.case(-1, status='in_progress')
        self.case(0)                                   # due today: not overdue yet
        self.case(-3, status='resolved')               # finished
        self.case(-3, case_type='maintenance')         # maintenance has its own reminders

        self.assertEqual(process_overdue_after_sales_cases()['overdue_cases'], 2)
        self.assertEqual(process_overdue_after_sales_cases()['overdue_cases'], 0, 'once per due date')

        assigned_alerts = Notification.objects.filter(title='After-sales case overdue', message__contains=f'ASC-{assigned.id:04d}')
        self.assertEqual(list(assigned_alerts.values_list('user', flat=True)), [self.admin.id])
        unassigned_alerts = Notification.objects.filter(title='After-sales case overdue', message__contains=f'ASC-{unassigned.id:04d}')
        self.assertEqual(set(unassigned_alerts.values_list('user', flat=True)), {self.admin.id, self.superadmin.id})
        self.assertTrue(AfterSalesCaseEvent.objects.filter(case=assigned, notes__startswith='Overdue alert sent').exists())

    def test_a_new_due_date_can_alert_again(self):
        case = self.case(-2)
        process_overdue_after_sales_cases()
        case.due_date = business_today() - timedelta(days=1)
        case.save(update_fields=['due_date'])
        self.assertEqual(process_overdue_after_sales_cases()['overdue_cases'], 1)

    def test_daily_run_includes_the_after_sales_alerts(self):
        with patch('services.after_sales_alerts.send_mail'), patch('services.maintenance.send_mail'):
            self.warranty_ticket(5)
            self.case(-1)
            call_command('run_operational_automations', '--mode', 'daily', stdout=StringIO())
        self.assertTrue(Notification.objects.filter(title='Warranty Ending Soon').exists())
        self.assertTrue(Notification.objects.filter(title='After-sales case overdue').exists())

    # ── Maintenance reminder window follows the setting ──
    def test_due_soon_and_reminder_start_follow_the_setting(self):
        settings_obj = AdminSettings.objects.order_by('id').first() or AdminSettings.objects.create()
        settings_obj.maintenance_reminder_days = 14
        settings_obj.save()
        ticket = self.ticket()
        schedule = MaintenanceSchedule.objects.create(
            service_ticket=ticket, client=self.client_user, service_type=self.service_type,
            maintenance_profile='standard_area', interval_days=120,
            last_service_date=business_today() - timedelta(days=110),
            next_due_date=business_today() + timedelta(days=10),
            notify_on_date=business_today() + timedelta(days=3),  # old fixed 7-day window
            follow_up_window_days=7, status='scheduled',
        )
        with patch('services.maintenance.send_mail'):
            summary = process_maintenance_alerts()
        schedule.refresh_from_db()
        self.assertEqual(summary['seven_day'], 1, 'first reminder at 14 days')
        self.assertEqual(schedule.follow_up_window_days, 14)
        self.assertEqual(schedule.notify_on_date, schedule.next_due_date - timedelta(days=14))
        self.assertEqual(schedule.status, 'due_soon', 'label matches the reminder')

    # ── Warranty list ──
    def test_warranty_list_filters_and_access(self):
        active = self.warranty_ticket(100)
        ending = self.warranty_ticket(10)
        expired = self.warranty_ticket(-5)
        void = self.warranty_ticket(50, 'void')
        url = '/api/services/maintenance-schedules/warranties/'

        def ids(params):
            self.client.force_authenticate(user=self.admin)
            data = self.client.get(url, params).data
            rows = data['results'] if isinstance(data, dict) else data
            return [row['ticket_id'] for row in rows]

        self.assertEqual(ids({}), [ending.id, active.id])
        self.assertEqual(ids({'warranty_status': 'ending_soon'}), [ending.id])
        self.assertEqual(ids({'warranty_status': 'expired'}), [expired.id])
        self.assertEqual(ids({'warranty_status': 'void'}), [void.id])
        self.assertEqual(len(ids({'warranty_status': 'all'})), 4)
        self.assertEqual(ids({'search': f'TKT-{ending.id:04d}'}), [ending.id])

        self.client.force_authenticate(user=self.admin)
        row = self.client.get(url, {'warranty_status': 'ending_soon'}).data
        row = (row['results'] if isinstance(row, dict) else row)[0]
        self.assertEqual(row['days_left'], 10)
        self.assertEqual(row['warranty_status'], 'active')

        self.client.force_authenticate(user=self.client_user)
        self.assertEqual(self.client.get(url).status_code, 403)
