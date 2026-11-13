"""Each Admin Settings value changes what the system does, and changing it back restores it.

One test class per setting group. Settings are global, so every test sets what it needs on the
single AdminSettings row the API uses.
"""

from unittest.mock import patch

from django.core import mail
from django.test import override_settings

from ._imports import *  # noqa: F403,F405
from messages_app.views import _create_notification as create_message_notification
from notifications.notification_utils import send_user_notification
from services.business_time import business_today
from services.maintenance import process_maintenance_alerts
from services.models import SLARule
from services.sla import _rule_durations
from services.views.helpers import create_notification, send_notification_email
from users.models import AdminSettings
from users.rbac import PUBLIC_SITE_VIEW, SYSTEM_SETTINGS_MANAGE


def settings_row(**values):
    row = AdminSettings.objects.order_by('id').first() or AdminSettings.objects.create()
    for field, value in values.items():
        setattr(row, field, value)
    row.save()
    return row


class NotificationSwitchTests(APITestCase):
    """Notifications (master), In-app Alerts and Email Alerts are obeyed by every sender."""

    def setUp(self):
        self.client_user = User.objects.create_user(username='switch-client', password='x', role='client', email='switch-client@example.com')
        self.admin = User.objects.create_user(username='switch-admin', password='x', role='admin', email='switch-admin@example.com')

    def send_everything(self):
        """One notice through each in-app path the system uses."""
        create_notification(self.client_user, 'Helper path.', title='Helper path')
        create_message_notification(self.client_user, title='Messages path', message='Messages path.', notification_type='message')
        send_user_notification(user=self.client_user, title='Utility path', body='Utility path.', send_email=False)
        return Notification.objects.filter(user=self.client_user).count()

    def test_in_app_alerts_off_stops_every_in_app_notice_and_on_restores_it(self):
        settings_row(enable_notifications=True, enable_in_app_notifications=False)
        self.assertEqual(self.send_everything(), 0)
        settings_row(enable_in_app_notifications=True)
        self.assertEqual(self.send_everything(), 3)

    def test_master_switch_off_stops_in_app_and_email(self):
        settings_row(enable_notifications=False, enable_in_app_notifications=True, enable_email_notifications=True)
        self.assertEqual(self.send_everything(), 0)
        with self.captureOnCommitCallbacks(execute=True):
            send_notification_email(self.client_user, 'Subject', 'Body')
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_email_alerts_off_stops_alert_email_and_on_restores_it(self):
        settings_row(enable_notifications=True, enable_email_notifications=False)
        with self.captureOnCommitCallbacks(execute=True):
            send_notification_email(self.client_user, 'Subject', 'Body')
        self.assertEqual(len(mail.outbox), 0)
        settings_row(enable_email_notifications=True)
        with self.captureOnCommitCallbacks(execute=True):
            send_notification_email(self.client_user, 'Subject', 'Body')
        self.assertEqual(len(mail.outbox), 1)


class MaintenanceReminderSettingTests(APITestCase):
    """The daily reminder job: Maintenance Reminder days, the switches, and clients without email."""

    def setUp(self):
        self.client_user = User.objects.create_user(username='reminder-client', password='x', role='client')
        self.admin = User.objects.create_user(username='reminder-admin', password='x', role='admin')
        self.retired_admin = User.objects.create_user(username='retired-admin', password='x', role='admin', is_active=False, status='inactive')
        service = ServiceType.objects.create(name='Panel cleaning', estimated_duration=60)
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='Clean', status='Completed')
        self.ticket = ServiceTicket.objects.create(request=request_obj, scheduled_date=business_today(), status='Completed', completed_date=timezone.now())
        self.schedule = MaintenanceSchedule.objects.create(
            service_ticket=self.ticket, client=self.client_user, service_type=service,
            maintenance_profile='commercial_area', interval_days=90, follow_up_window_days=14,
            last_service_date=business_today() - timedelta(days=78),
            next_due_date=business_today() + timedelta(days=12),
            notify_on_date=business_today(), status='scheduled',
        )

    def reminders(self, user):
        return Notification.objects.filter(user=user, ticket=self.ticket, type='reminder')

    def test_reminder_days_setting_decides_when_the_first_reminder_goes_out(self):
        settings_row(enable_notifications=True, enable_in_app_notifications=True, maintenance_reminder_days=7)
        process_maintenance_alerts()
        self.assertEqual(self.reminders(self.client_user).count(), 0, 'due in 12 days is outside a 7-day window')

        settings_row(maintenance_reminder_days=14)
        process_maintenance_alerts()
        client_notice = self.reminders(self.client_user).get()
        self.assertEqual(client_notice.title, 'Maintenance Reminder')
        self.assertIn('due in 12 day(s)', client_notice.message)
        admin_notice = self.reminders(self.admin).get()
        self.assertIn('due in 12 days', admin_notice.message)
        self.assertFalse(self.reminders(self.retired_admin).exists())

        process_maintenance_alerts()
        self.assertEqual(self.reminders(self.client_user).count(), 1, 'one reminder per stage')

    def test_in_app_off_sends_no_reminder_and_the_stage_waits(self):
        settings_row(enable_notifications=True, enable_in_app_notifications=False, enable_email_notifications=True, maintenance_reminder_days=14)
        process_maintenance_alerts()
        self.assertFalse(Notification.objects.filter(ticket=self.ticket).exists())
        self.schedule.refresh_from_db()
        self.assertIsNone(self.schedule.client_notified_at, 'nothing reached the client, so it is tried again')

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_a_failed_email_still_leaves_the_in_app_reminder(self):
        self.client_user.email = 'reminder-client@example.com'
        self.client_user.save(update_fields=['email'])
        settings_row(enable_notifications=True, enable_in_app_notifications=True, enable_email_notifications=True, maintenance_reminder_days=14)
        with patch('services.maintenance.send_mail', side_effect=RuntimeError('smtp down')):
            process_maintenance_alerts()
        self.assertEqual(self.reminders(self.client_user).count(), 1)

    @override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
    def test_email_alerts_off_skips_the_reminder_email_only(self):
        self.client_user.email = 'reminder-client@example.com'
        self.client_user.save(update_fields=['email'])
        settings_row(enable_notifications=True, enable_in_app_notifications=True, enable_email_notifications=False, maintenance_reminder_days=14)
        process_maintenance_alerts()
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(self.reminders(self.client_user).count(), 1)


class ArrivalValidationSettingTests(APITestCase):
    """Location Range Validation and Allowed Radius decide whether a technician may mark arrival."""

    SITE = (14.2786, 121.125)

    def setUp(self):
        self.tech = User.objects.create_user(username='arrival-tech', password='x', role='technician', status='active')
        self.client_user = User.objects.create_user(username='arrival-client', password='x', role='client')
        self.service = ServiceType.objects.create(name='Arrival check', estimated_duration=60)

    def travelling_job(self):
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=self.service, description='Arrive', status='Approved')
        ServiceLocation.objects.create(request=request_obj, address='Site', city='Cabuyao', province='Laguna', latitude=self.SITE[0], longitude=self.SITE[1])
        return ServiceTicket.objects.create(request=request_obj, technician=self.tech, scheduled_date=business_today(), status='Navigating')

    def arrive(self, ticket, latitude, longitude):
        self.client.force_authenticate(self.tech)
        return self.client.post(f'/api/technician/jobs/{ticket.id}/arrive/', {'latitude': latitude, 'longitude': longitude}, format='json')

    def test_radius_decides_how_close_the_technician_must_be(self):
        about_550_m_away = (self.SITE[0] + 0.005, self.SITE[1])
        settings_row(location_validation_enabled=True, arrival_radius_meters=30)
        ticket = self.travelling_job()
        refused = self.arrive(ticket, *about_550_m_away)
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data['error'], 'You are outside the allowed arrival range.')
        self.assertEqual(refused.data['radius_meters'], 30)

        settings_row(arrival_radius_meters=1000)
        self.assertEqual(self.arrive(ticket, *about_550_m_away).status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Arrived on Site')

    def test_validation_off_lets_a_far_arrival_through_and_on_refuses_it(self):
        far = (14.4, 121.3)
        settings_row(location_validation_enabled=False, location_validation_disabled_reason='GPS outage.', arrival_radius_meters=30)
        self.assertEqual(self.arrive(self.travelling_job(), *far).status_code, 200)
        settings_row(location_validation_enabled=True)
        self.assertEqual(self.arrive(self.travelling_job(), *far).status_code, 400)


class SlaRuleSettingTests(APITestCase):
    def tearDown(self):
        # The test database rolls back after each test but the rule cache does not; forget the
        # values this test saved so later tests read the seeded rule again.
        from django.core.cache import cache

        cache.delete('sla_rule_start_delay')

    def test_a_saved_sla_rule_applies_immediately(self):
        rule = SLARule.objects.get(key='start_delay')
        _rule_durations('start_delay', timedelta(minutes=1), timedelta(minutes=2))  # fills the cache
        superadmin = User.objects.create_user(username='sla-super', password='x', role='superadmin')
        self.client.force_authenticate(superadmin)
        response = self.client.patch(f'/api/services/sla-rules/{rule.id}/', {'warning_minutes': 77, 'overdue_minutes': 155}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            _rule_durations('start_delay', timedelta(minutes=1), timedelta(minutes=2)),
            (timedelta(minutes=77), timedelta(minutes=155)),
        )


class SettingsSaveTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(username='settings-super', password='x', role='superadmin')
        self.other_super = User.objects.create_user(username='settings-super-2', password='x', role='admin')
        settings_row(arrival_radius_meters=30, location_validation_enabled=True)

    def put(self, user, data):
        self.client.force_authenticate(user)
        return self.client.put('/api/admin/settings/', data, format='json')

    def test_saving_another_setting_does_not_change_who_last_set_arrival_validation(self):
        self.assertEqual(self.put(self.superadmin, {'arrivalRadiusMeters': 45}).status_code, 200)
        row = AdminSettings.objects.order_by('id').first()
        self.assertEqual(row.location_validation_updated_by, self.superadmin)
        stamped_at = row.location_validation_updated_at

        # The page used to resend the unchanged arrival values with every save.
        response = self.put(self.other_super, {'holidayDates': ['2027-12-25'], 'arrivalRadiusMeters': 45, 'locationValidationEnabled': True})
        self.assertEqual(response.status_code, 200, response.data)
        row.refresh_from_db()
        self.assertEqual(row.location_validation_updated_by, self.superadmin)
        self.assertEqual(row.location_validation_updated_at, stamped_at)

        self.assertEqual(self.put(self.other_super, {'arrivalRadiusMeters': 60}).status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.location_validation_updated_by, self.other_super)

    def test_single_field_saves_are_checked_against_the_saved_values(self):
        """The page sends only changed fields, so rules comparing two fields use the saved one."""
        from datetime import time as clock

        settings_row(business_open_time=clock(8, 0), business_close_time=clock(17, 0))
        refused = self.put(self.superadmin, {'businessCloseTime': '07:00'})
        self.assertEqual(refused.status_code, 400)
        self.assertIn('businessCloseTime', refused.data)
        self.assertEqual(self.put(self.superadmin, {'businessOpenTime': '09:00'}).status_code, 200)

        settings_row(location_validation_enabled=True, location_validation_disabled_reason='')
        self.assertEqual(self.put(self.superadmin, {'locationValidationEnabled': False}).status_code, 400)
        settings_row(location_validation_disabled_reason='GPS outage last month.')
        self.assertEqual(self.put(self.superadmin, {'locationValidationEnabled': False}).status_code, 200)
        self.assertEqual(self.put(self.superadmin, {'overtimeDailyCapacityMinutes': 470}).status_code, 400)

    def test_an_admin_who_can_only_view_the_public_site_can_save_system_settings(self):
        scoped = User.objects.create_user(username='settings-scoped', password='x', role='admin')
        UserCapabilityGrant.objects.create(user=scoped, capability_code=SYSTEM_SETTINGS_MANAGE)
        UserCapabilityGrant.objects.create(user=scoped, capability_code=PUBLIC_SITE_VIEW)
        self.client.force_authenticate(scoped)
        loaded = self.client.get('/api/admin/settings/').data
        self.assertIn('landingPageContent', loaded, 'this person sees the public-site fields')

        # The page now sends only what changed.
        self.assertEqual(self.put(scoped, {'maintenanceReminderDays': 9}).status_code, 200)
        # Publishing stays refused without the publish capability.
        self.assertEqual(self.put(scoped, {'landingPageContent': loaded['landingPageContent']}).status_code, 403)


class DocumentDefaultsSettingTests(APITestCase):
    def test_document_prefill_uses_the_company_details_in_settings(self):
        settings_row(company_name='Sunrise Solar Co.', company_address='12 Rizal St, Lucena')
        superadmin = User.objects.create_user(username='docs-super', password='x', role='superadmin')
        client_user = User.objects.create_user(username='docs-client', password='x', role='client')
        service = ServiceType.objects.create(name='Docs service', estimated_duration=60)
        request_obj = ServiceRequest.objects.create(client=client_user, service_type=service, description='Docs', status='Approved')
        ticket = ServiceTicket.objects.create(request=request_obj, scheduled_date=business_today(), status='Not Started')
        self.client.force_authenticate(superadmin)
        response = self.client.get(f'/api/services/service-tickets/{ticket.id}/document-prefill/')
        self.assertEqual(response.status_code, 200)
        defaults = response.data['document_defaults']
        self.assertEqual(defaults['company_name'], 'Sunrise Solar Co.')
        self.assertEqual(defaults['company_address'], '12 Rizal St, Lucena')
        self.assertTrue(defaults['company_contact'].startswith('09171460224'))
