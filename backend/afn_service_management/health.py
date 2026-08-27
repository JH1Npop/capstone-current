import logging
from django.conf import settings
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import DatabaseError, connection
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

logger = logging.getLogger(__name__)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def liveness_view(request):
    """
    Liveness probe endpoint. Returns 200 OK if the application service process is up and running.
    Used by container orchestration (e.g. Kubernetes, Docker healthcheck) to determine if the container should be restarted.
    """
    return Response({'status': 'ok', 'service': 'afn_service_management'}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def readiness_view(request):
    """
    Readiness probe endpoint. Checks external dependencies:
    - Database connectivity (SQL query execution)
    - Cache / Redis connectivity (if configured)
    - Storage system availability
    Returns 200 OK ('ready') if critical dependencies are available, or 503 Service Unavailable ('unavailable') if not.
    """
    checks = {
        'database': 'ready',
        'cache': 'ready',
        'storage': 'ready',
    }
    is_ready = True

    # 1. Check Database
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception as e:
        logger.warning('Readiness check failed on database connection: %s', e, exc_info=True)
        checks['database'] = 'unavailable'
        is_ready = False

    # 2. Check Cache / Redis
    try:
        cache.set('health_readiness_probe', '1', timeout=10)
        cached_val = cache.get('health_readiness_probe')
        if cached_val != '1':
            checks['cache'] = 'degraded'
    except Exception as e:
        logger.warning('Readiness check failed on cache/Redis: %s', e, exc_info=True)
        checks['cache'] = 'degraded'

    # 3. Check Media/File Storage
    try:
        # Check if storage class responds without throwing critical errors
        if hasattr(default_storage, 'exists'):
            default_storage.exists('health_check_dummy.txt')
        else:
            checks['storage'] = 'degraded'
    except Exception as e:
        logger.warning('Readiness check failed on media storage: %s', e, exc_info=True)
        checks['storage'] = 'degraded'

    response_status = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return Response({
        'status': 'ready' if is_ready else 'unavailable',
        'checks': checks,
    }, status=response_status)
