import logging

from django.db import DatabaseError
from rest_framework import status
from rest_framework.exceptions import Throttled
from rest_framework.response import Response
from rest_framework.views import exception_handler


logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Return a stable API response when the shared database is unavailable or log rate limits."""
    if isinstance(exc, DatabaseError):
        request = context.get('request')
        logger.error(
            'Database error while handling %s %s',
            getattr(request, 'method', 'UNKNOWN'),
            getattr(request, 'path', 'unknown'),
            exc_info=True,
        )
        return Response(
            {
                'error': 'Database temporarily unavailable.',
                'code': 'database_unavailable',
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    if isinstance(exc, Throttled):
        request = context.get('request')
        view = context.get('view')
        throttle_scope = getattr(view, 'throttle_scope', 'unknown') if view else 'unknown'
        path = getattr(request, 'path', 'unknown') if request else 'unknown'
        ip = request.META.get('REMOTE_ADDR') if (request and hasattr(request, 'META')) else 'unknown'

        try:
            from users.signals import log_activity, notify_admin_security_alert
            actor = request.user if (request and hasattr(request, 'user') and getattr(request.user, 'is_authenticated', False)) else None
            msg = f"Rate limit exceeded ({throttle_scope} scope) from IP {ip} on {path}"
            log_activity(
                actor=actor,
                category='security',
                action='throttled',
                message=msg,
                metadata={
                    'ip_address': ip,
                    'throttle_scope': throttle_scope,
                    'path': path,
                    'wait': getattr(exc, 'wait', None),
                },
            )
            if throttle_scope in ('login', 'password_reset', 'register') or 'login' in path or 'auth' in path:
                notify_admin_security_alert(
                    title=f"Security Alert: {throttle_scope.title()} Rate Limit Exceeded",
                    message=msg,
                    metadata={'ip_address': ip, 'throttle_scope': throttle_scope, 'path': path},
                )
        except Exception as log_exc:
            logger.warning("Failed to log throttling security event: %s", log_exc)

    return exception_handler(exc, context)
