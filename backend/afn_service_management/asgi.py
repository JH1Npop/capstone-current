"""
ASGI config for afn_service_management project.

This configuration enables Django Channels for WebSocket support,
allowing real-time messaging and notifications.
"""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings')

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from afn_service_management.websocket_auth import TokenAuthMiddlewareStack

# Initialize Django ASGI app
django_asgi_app = get_asgi_application()

# Import routing after Django setup
from inventory.routing import websocket_urlpatterns as inventory_ws_patterns
from messages_app.routing import websocket_urlpatterns as messages_ws_patterns

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AuthMiddlewareStack(
        TokenAuthMiddlewareStack(
            URLRouter(
                messages_ws_patterns + inventory_ws_patterns,
            )
        )
    ),
})
