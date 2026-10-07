"""Transactional email backends for providers reachable over HTTPS."""

import json
import logging
from email.utils import parseaddr
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend


logger = logging.getLogger(__name__)


class BrevoEmailBackend(BaseEmailBackend):
    """Send Django email messages through Brevo's transactional HTTPS API."""

    api_url = 'https://api.brevo.com/v3/smtp/email'

    def __init__(self, api_key=None, timeout=None, **kwargs):
        super().__init__(**kwargs)
        self.api_key = api_key or settings.BREVO_API_KEY
        self.timeout = timeout or settings.BREVO_API_TIMEOUT_SECONDS

    @staticmethod
    def _address(value):
        name, email = parseaddr(value or '')
        result = {'email': email}
        if name:
            result['name'] = name
        return result

    def _payload(self, message):
        sender = self._address(message.from_email or settings.DEFAULT_FROM_EMAIL)
        payload = {
            'sender': sender,
            'to': [self._address(value) for value in message.to],
            'subject': str(message.subject),
            'textContent': str(message.body or ''),
        }

        if message.cc:
            payload['cc'] = [self._address(value) for value in message.cc]
        if message.bcc:
            payload['bcc'] = [self._address(value) for value in message.bcc]
        if message.reply_to:
            payload['replyTo'] = self._address(message.reply_to[0])

        for alternative in getattr(message, 'alternatives', ()):
            if alternative.mimetype == 'text/html':
                payload['htmlContent'] = alternative.content
                break

        return payload

    def _send(self, message):
        if not message.recipients():
            return False

        request = Request(
            self.api_url,
            data=json.dumps(self._payload(message)).encode('utf-8'),
            headers={
                'accept': 'application/json',
                'api-key': self.api_key,
                'content-type': 'application/json',
            },
            method='POST',
        )

        try:
            with urlopen(request, timeout=self.timeout) as response:
                if response.status != 201:
                    raise RuntimeError(f'Brevo email API returned HTTP {response.status}')
        except (HTTPError, URLError, OSError, RuntimeError) as exc:
            if not self.fail_silently:
                raise
            logger.error('Brevo email delivery failed: %s', exc)
            return False
        return True

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        return sum(1 for message in email_messages if self._send(message))
