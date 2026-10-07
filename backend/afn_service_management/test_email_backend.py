import json
from urllib.error import HTTPError
from unittest.mock import patch

from django.core.mail import EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings

from afn_service_management.email_backends import BrevoEmailBackend


class _Response:
    status = 201

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False


@override_settings(
    BREVO_API_KEY='test-api-key',
    BREVO_API_TIMEOUT_SECONDS=9,
    DEFAULT_FROM_EMAIL='AFN Service <verified@example.org>',
)
class BrevoEmailBackendTests(SimpleTestCase):
    @patch('afn_service_management.email_backends.urlopen', return_value=_Response())
    def test_sends_django_message_through_https_api(self, mocked_urlopen):
        message = EmailMultiAlternatives(
            subject='Verify account',
            body='Use the verification link.',
            to=['Client Name <client@example.org>'],
            reply_to=['Support <support@example.org>'],
        )
        message.attach_alternative('<p>Use the verification link.</p>', 'text/html')

        sent = BrevoEmailBackend().send_messages([message])

        self.assertEqual(sent, 1)
        request = mocked_urlopen.call_args.args[0]
        payload = json.loads(request.data.decode('utf-8'))
        self.assertEqual(request.full_url, 'https://api.brevo.com/v3/smtp/email')
        self.assertEqual(request.headers['Api-key'], 'test-api-key')
        self.assertEqual(payload['sender'], {'name': 'AFN Service', 'email': 'verified@example.org'})
        self.assertEqual(payload['to'], [{'name': 'Client Name', 'email': 'client@example.org'}])
        self.assertEqual(payload['replyTo'], {'name': 'Support', 'email': 'support@example.org'})
        self.assertEqual(payload['textContent'], 'Use the verification link.')
        self.assertEqual(payload['htmlContent'], '<p>Use the verification link.</p>')
        self.assertEqual(mocked_urlopen.call_args.kwargs['timeout'], 9)

    @patch('afn_service_management.email_backends.urlopen')
    def test_provider_error_fails_closed(self, mocked_urlopen):
        mocked_urlopen.side_effect = HTTPError(
            url='https://api.brevo.com/v3/smtp/email',
            code=401,
            msg='Unauthorized',
            hdrs=None,
            fp=None,
        )
        message = EmailMultiAlternatives(subject='Verify', body='Body', to=['client@example.org'])

        with self.assertRaises(HTTPError):
            BrevoEmailBackend(fail_silently=False).send_messages([message])

        self.assertEqual(BrevoEmailBackend(fail_silently=True).send_messages([message]), 0)
