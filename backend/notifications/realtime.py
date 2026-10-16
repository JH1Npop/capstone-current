"""Push notification changes to the owner's open browser tabs over WebSockets."""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

logger = logging.getLogger(__name__)


def user_group(user_id):
    return f'notifications_user_{user_id}'


def broadcast_unread_count(user_id):
    """After the current transaction commits, tell the user's tabs their new unread count."""
    if not user_id:
        return

    def send():
        from notifications.models import Notification

        try:
            channel_layer = get_channel_layer()
            if channel_layer is None:
                return
            unread = Notification.objects.filter(user_id=user_id, status='unread').count()
            async_to_sync(channel_layer.group_send)(
                user_group(user_id),
                {'type': 'notifications.changed', 'unread_count': unread},
            )
        except Exception:
            # Live updates are best effort; polling still catches up.
            logger.exception('Unable to push notification update for user_id=%s', user_id)

    transaction.on_commit(send)
