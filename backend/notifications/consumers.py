import json

from channels.generic.websocket import AsyncWebsocketConsumer

from notifications.realtime import user_group

TOKEN_SUBPROTOCOL = 'afn.token'


class NotificationConsumer(AsyncWebsocketConsumer):
    """One socket per signed-in tab; receives unread-count changes for that user only."""

    async def connect(self):
        user = self.scope.get('user')
        self.group_name = None
        if not user or not user.is_authenticated:
            await self.close()
            return
        self.group_name = user_group(user.id)
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        subprotocol = TOKEN_SUBPROTOCOL if TOKEN_SUBPROTOCOL in self.scope.get('subprotocols', []) else None
        await self.accept(subprotocol=subprotocol)

    async def disconnect(self, close_code):
        if self.group_name:
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # The socket is push-only; ignore anything the browser sends.
        return

    async def notifications_changed(self, event):
        await self.send(text_data=json.dumps({'type': 'notifications.changed', 'unread_count': event.get('unread_count')}))

    async def messages_changed(self, event):
        await self.send(text_data=json.dumps({'type': 'messages.changed'}))
