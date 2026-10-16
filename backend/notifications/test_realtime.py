"""Live notification pushes over the notifications WebSocket."""

from asgiref.sync import sync_to_async
from channels.testing import WebsocketCommunicator
from django.test import TransactionTestCase
from rest_framework.authtoken.models import Token

from afn_service_management.asgi import application
from messages_app.models import Message
from notifications.models import Notification
from users.models import User


class NotificationSocketTests(TransactionTestCase):
    async def connect(self, user):
        token = await sync_to_async(Token.objects.create)(user=user)
        communicator = WebsocketCommunicator(application, '/ws/notifications/', subprotocols=['afn.token', token.key])
        connected, subprotocol = await communicator.connect()
        return communicator, connected, subprotocol

    async def test_owner_receives_unread_count_and_other_users_do_not(self):
        owner = await sync_to_async(User.objects.create_user)(username='socket-owner', password='pass', role='client')
        other = await sync_to_async(User.objects.create_user)(username='socket-other', password='pass', role='client')
        owner_socket, connected, subprotocol = await self.connect(owner)
        other_socket, other_connected, _ = await self.connect(other)
        self.assertTrue(connected)
        self.assertTrue(other_connected)
        self.assertEqual(subprotocol, 'afn.token')

        await sync_to_async(Notification.objects.create)(user=owner, message='Your request was approved.')

        pushed = await owner_socket.receive_json_from(timeout=3)
        self.assertEqual(pushed, {'type': 'notifications.changed', 'unread_count': 1})
        self.assertTrue(await other_socket.receive_nothing(timeout=0.3))

        await owner_socket.disconnect()
        await other_socket.disconnect()

    async def test_connection_without_a_valid_token_is_refused(self):
        anonymous = WebsocketCommunicator(application, '/ws/notifications/')
        connected, _ = await anonymous.connect()
        self.assertFalse(connected)

        forged = WebsocketCommunicator(application, '/ws/notifications/', subprotocols=['afn.token', 'not-a-real-token'])
        connected, _ = await forged.connect()
        self.assertFalse(connected)

    async def test_direct_message_pings_only_the_conversation(self):
        sender = await sync_to_async(User.objects.create_user)(username='socket-sender', password='pass', role='technician')
        receiver = await sync_to_async(User.objects.create_user)(username='socket-receiver', password='pass', role='technician')
        outsider = await sync_to_async(User.objects.create_user)(username='socket-outsider', password='pass', role='client')
        receiver_socket, _, _ = await self.connect(receiver)
        outsider_socket, _, _ = await self.connect(outsider)

        await sync_to_async(Message.objects.create)(sender=sender, receiver=receiver, room_type='direct', message_text='On my way.')

        self.assertEqual(await receiver_socket.receive_json_from(timeout=3), {'type': 'messages.changed'})
        self.assertTrue(await outsider_socket.receive_nothing(timeout=0.3))
        await receiver_socket.disconnect()
        await outsider_socket.disconnect()
