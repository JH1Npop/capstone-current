"""Tell everyone who can see a conversation that it changed (no message content is sent)."""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import transaction

from notifications.realtime import user_group

logger = logging.getLogger(__name__)

STAFF_ROLES = ('superadmin', 'admin')


def message_audience_ids(message):
    from users.models import User
    from .serializers import CUSTOMER_SUPPORT_PREFIX

    audience = {message.sender_id, message.receiver_id}
    group_key = str(message.group_key or '')
    office = User.objects.filter(role__in=STAFF_ROLES, is_active=True).values_list('id', flat=True)
    if message.room_type == 'group' and group_key == 'staff':
        audience.update(User.objects.filter(role__in=STAFF_ROLES + ('technician',), is_active=True).values_list('id', flat=True))
    elif group_key.startswith(CUSTOMER_SUPPORT_PREFIX):
        client_id = group_key[len(CUSTOMER_SUPPORT_PREFIX):].split('_')[0].split(':')[0]
        if client_id.isdigit():
            audience.add(int(client_id))
        audience.update(office)
    if message.ticket_id:
        ticket = message.ticket
        audience.update({ticket.technician_id, ticket.assigned_admin_id, getattr(ticket.request, 'client_id', None)})
        audience.update(ticket.crew_assignments.values_list('technician_id', flat=True))
        audience.update(office)
    audience.discard(None)
    return audience


def broadcast_message_changed(message):
    def send():
        try:
            channel_layer = get_channel_layer()
            if channel_layer is None:
                return
            for user_id in message_audience_ids(message):
                async_to_sync(channel_layer.group_send)(user_group(user_id), {'type': 'messages.changed'})
        except Exception:
            # Live updates are best effort; chat polling still catches up.
            logger.exception('Unable to push message update for message_id=%s', message.pk)

    transaction.on_commit(send)
