"""Provider-neutral request correlation and structured logging."""

import contextvars
import json
import logging
import re
import time
import uuid


request_id_context = contextvars.ContextVar('request_id', default='-')
SAFE_REQUEST_ID = re.compile(r'^[A-Za-z0-9._:-]{8,128}$')


class RequestIdFilter(logging.Filter):
    def filter(self, record):
        record.request_id = request_id_context.get()
        return True


class JsonLogFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            'timestamp': self.formatTime(record, '%Y-%m-%dT%H:%M:%S%z'),
            'level': record.levelname,
            'logger': record.name,
            'request_id': getattr(record, 'request_id', '-'),
            'message': record.getMessage(),
        }
        if record.exc_info:
            payload['exception'] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


class RequestObservabilityMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = logging.getLogger('afn.request')

    def __call__(self, request):
        incoming = str(request.headers.get('X-Request-ID', '')).strip()
        request_id = incoming if SAFE_REQUEST_ID.fullmatch(incoming) else uuid.uuid4().hex
        request.request_id = request_id
        token = request_id_context.set(request_id)
        started = time.monotonic()
        try:
            response = self.get_response(request)
            duration_ms = round((time.monotonic() - started) * 1000, 2)
            response['X-Request-ID'] = request_id
            self.logger.info(
                '%s %s status=%s duration_ms=%s',
                request.method,
                request.path,
                response.status_code,
                duration_ms,
            )
            return response
        except Exception:
            duration_ms = round((time.monotonic() - started) * 1000, 2)
            self.logger.exception(
                '%s %s status=500 duration_ms=%s',
                request.method,
                request.path,
                duration_ms,
            )
            raise
        finally:
            request_id_context.reset(token)
