from unittest.mock import patch

from django.core import mail
from django.test import override_settings
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from notifications.sla_notifications import notify_supervisors_ticket_escalation
from notifications.notification_utils import send_team_email, send_team_notification, send_user_email
from notifications.models import Notification
from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType
from users.models import User


class NotificationViewSetTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='notif_user',
            email='notif@example.com',
            password='Password123!',
            role='client'
        )
        self.other_user = User.objects.create_user(
            username='other_notif_user',
            email='other-notif@example.com',
            password='Password123!',
            role='client'
        )
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_user_can_delete_own_notification(self):
        notification = Notification.objects.create(
            user=self.user,
            title='Own notification',
            message='Hello',
            type='info'
        )

        response = self.client.delete(f'/api/notifications/{notification.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Notification.objects.filter(id=notification.id).exists())

    def test_user_cannot_delete_another_users_notification(self):
        notification = Notification.objects.create(
            user=self.other_user,
            title='Other notification',
            message='Hidden',
            type='info'
        )

        response = self.client.delete(f'/api/notifications/{notification.id}/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Notification.objects.filter(id=notification.id).exists())

    def test_user_can_list_own_notifications(self):
        own_notification = Notification.objects.create(
            user=self.user,
            title='Own notification',
            message='Visible',
            type='info'
        )
        Notification.objects.create(
            user=self.other_user,
            title='Other notification',
            message='Hidden',
            type='warning'
        )

        response = self.client.get('/api/notifications/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', response.data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['id'], own_notification.id)
        self.assertEqual(results[0]['related_ticket'], None)
        self.assertEqual(results[0]['related_request'], None)

    def test_mark_read_sets_read_timestamp(self):
        notification = Notification.objects.create(
            user=self.user,
            title='Unread notification',
            message='Please read me',
            type='info'
        )

        response = self.client.post(f'/api/notifications/{notification.id}/mark_read/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        notification.refresh_from_db()
        self.assertEqual(notification.status, 'read')
        self.assertIsNotNone(notification.read_at)
        self.assertIsNotNone(response.data['read_at'])

    def test_mark_read_missing_notification_is_noop(self):
        response = self.client.post('/api/notifications/999999/mark_read/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get('status'), 'noop')

    def test_mark_all_read_updates_unread_notifications(self):
        first = Notification.objects.create(
            user=self.user,
            title='First',
            message='One',
            type='info'
        )
        second = Notification.objects.create(
            user=self.user,
            title='Second',
            message='Two',
            type='warning'
        )

        response = self.client.post('/api/notifications/mark_all_read/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 2)
        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.status, 'read')
        self.assertEqual(second.status, 'read')
        self.assertIsNotNone(first.read_at)
        self.assertIsNotNone(second.read_at)

    def test_user_cannot_create_notification_via_api(self):
        response = self.client.post('/api/notifications/', {
            'user': self.other_user.id,
            'title': 'Spoofed notification',
            'message': 'This should not be created',
            'type': 'warning',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertFalse(Notification.objects.filter(title='Spoofed notification').exists())


class NotificationUtilityTests(APITestCase):
    def setUp(self):
        self.tech_one = User.objects.create_user(
            username='tech_one',
            email='tech-one@example.com',
            password='Password123!',
            role='technician'
        )
        self.tech_two = User.objects.create_user(
            username='tech_two',
            email='tech-two@example.com',
            password='Password123!',
            role='technician'
        )
        self.client_user = User.objects.create_user(
            username='client_one',
            email='client-one@example.com',
            password='Password123!',
            role='client'
        )

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='AFN Service <no-reply@example.com>',
    )
    def test_send_user_email_sends_direct_email_without_notification(self):
        result = send_user_email(
            user=self.client_user,
            subject='Service Request Received',
            body='We received your service request.',
        )

        self.assertTrue(result['success'])
        self.assertEqual(result['sent_count'], 1)
        self.assertEqual(result['recipients'], ['client-one@example.com'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, 'Service Request Received')
        self.assertEqual(mail.outbox[0].to, ['client-one@example.com'])
        self.assertFalse(Notification.objects.filter(user=self.client_user).exists())

    @override_settings(
        EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
        DEFAULT_FROM_EMAIL='AFN Service <no-reply@example.com>',
    )
    def test_send_team_email_sends_to_selected_role_without_notification(self):
        result = send_team_email(
            'Technician Schedule Update',
            'Please review your schedule.',
            role='technician',
        )

        self.assertTrue(result['success'])
        self.assertEqual(result['recipient_count'], 2)
        self.assertEqual(result['sent_count'], 1)
        self.assertCountEqual(result['recipients'], ['tech-one@example.com', 'tech-two@example.com'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertCountEqual(mail.outbox[0].to, ['tech-one@example.com', 'tech-two@example.com'])
        self.assertFalse(Notification.objects.filter(title='Technician Schedule Update').exists())

    @patch('notifications.notification_utils.send_notification_email', return_value=True)
    def test_send_team_notification_creates_one_notification_per_recipient(self, mock_send_email):
        result = send_team_notification(
            'Team Task',
            'Please review the new job assignment.',
            role='technician',
            notification_type='ticket_assigned',
            data={
                'action': 'view_job',
                'job_id': 42,
            },
        )

        notifications = Notification.objects.filter(title='Team Task')

        self.assertTrue(result['success'])
        self.assertEqual(result['recipient_count'], 2)
        self.assertEqual(notifications.count(), 2)
        self.assertSetEqual(
            set(notifications.values_list('user_id', flat=True)),
            {self.tech_one.id, self.tech_two.id},
        )
        self.assertEqual(mock_send_email.call_count, 2)

    def test_send_team_notification_requires_a_selector(self):
        with self.assertRaises(ValueError):
            send_team_notification(
                'Unsafe Broadcast',
                'This should not go to everyone by accident.',
            )

    @patch('notifications.notification_utils.send_notification_email', return_value=True)
    def test_notify_supervisors_ticket_escalation_creates_warning_notifications(self, mock_send_email):
        admin_user = User.objects.create_user(
            username='notif_admin',
            email='notif-admin@example.com',
            password='Password123!',
            role='admin'
        )
        operations_admin = User.objects.create_user(
            username='notif_operations_admin',
            email='notif-operations-admin@example.com',
            password='Password123!',
            role='admin'
        )
        service_type = ServiceType.objects.create(name='Escalation Service')
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=service_type,
            description='Escalation scenario',
            status='Approved',
        )
        ServiceLocation.objects.create(
            request=request_obj,
            address='123 Escalation Ave',
            city='Pasig',
            province='Metro Manila',
        )
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.tech_one,
            assigned_admin=operations_admin,
            scheduled_date=request_obj.request_date.date(),
            status='Not Started',
            priority='Urgent',
        )

        notify_supervisors_ticket_escalation(
            ticket,
            'start_overdue',
            {
                'minutes_overdue': 30,
                'action_required': 'Start work',
            },
        )

        notifications = Notification.objects.filter(
            ticket=ticket,
            type='warning',
            title=f'Ticket #{ticket.id} start time SLA breached',
        )

        self.assertEqual(notifications.count(), 2)
        self.assertSetEqual(
            set(notifications.values_list('user_id', flat=True)),
            {admin_user.id, operations_admin.id},
        )
        self.assertEqual(mock_send_email.call_count, 2)
