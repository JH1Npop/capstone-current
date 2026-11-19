"""Settings > System > Support Email: shown to signed-in clients and at the end of client emails."""

from django.core import mail
from rest_framework.test import APITestCase

from notifications.notification_utils import send_system_email, with_support_line
from users.models import AdminSettings, User


class SupportContactTests(APITestCase):
    def setUp(self):
        AdminSettings.objects.update_or_create(id=1, defaults={'support_email': 'help@afn.example'})
        self.client_user = User.objects.create_user(username='support-contact-client', password='x', role='client', email='ana@example.com')

    def test_signed_in_client_sees_the_support_email_but_the_public_site_does_not(self):
        self.client.force_authenticate(self.client_user)
        response = self.client.get('/api/messages/support-cases/contact/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['supportEmail'], 'help@afn.example')
        self.client.force_authenticate(None)
        self.assertIn(self.client.get('/api/messages/support-cases/contact/').status_code, (401, 403))
        self.assertNotIn('supportEmail', self.client.get('/api/public/landing-page/').data)

    def test_client_emails_end_with_where_to_get_help_once(self):
        self.assertTrue(with_support_line('Your visit is booked.').endswith('Need help? Write to help@afn.example.'))
        self.assertEqual(with_support_line('Write to help@afn.example any time.'), 'Write to help@afn.example any time.')
        send_system_email(subject='Booked', body='Your visit is booked.', recipients=[self.client_user])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('Need help? Write to help@afn.example.', mail.outbox[0].body)
