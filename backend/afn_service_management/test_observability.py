import json
import logging

from django.test import RequestFactory, SimpleTestCase, override_settings
from django.http import HttpResponse

from afn_service_management.observability import JsonLogFormatter, RequestObservabilityMiddleware


class RequestObservabilityTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_response_echoes_safe_caller_request_id(self):
        middleware = RequestObservabilityMiddleware(lambda request: HttpResponse('ok'))
        response = middleware(self.factory.get('/health', HTTP_X_REQUEST_ID='trace-12345678'))
        self.assertEqual(response['X-Request-ID'], 'trace-12345678')

    def test_unsafe_request_id_is_replaced(self):
        middleware = RequestObservabilityMiddleware(lambda request: HttpResponse('ok'))
        response = middleware(self.factory.get('/health', HTTP_X_REQUEST_ID='bad id\nvalue'))
        self.assertRegex(response['X-Request-ID'], r'^[a-f0-9]{32}$')

    def test_json_formatter_produces_machine_readable_record(self):
        record = logging.LogRecord('test', logging.INFO, __file__, 1, 'ready %s', ('now',), None)
        record.request_id = 'trace-12345678'
        payload = json.loads(JsonLogFormatter().format(record))
        self.assertEqual(payload['message'], 'ready now')
        self.assertEqual(payload['request_id'], 'trace-12345678')
