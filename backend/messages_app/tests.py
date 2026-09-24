from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from messages_app.models import CustomerSupportCase, Message
from messages_app.consumers import MessageConsumer
from notifications.models import Notification
from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User, UserCapabilityGrant
from users.rbac import (
    ADMIN_CONFIGURED_MARKER,
    COMMUNICATIONS_STAFF_VIEW,
    COMMUNICATIONS_SUPPORT_MANAGE,
    COMMUNICATIONS_SUPPORT_VIEW,
    SYSTEM_SETTINGS_VIEW,
    TECHNICIAN_MESSAGES_VIEW,
)


class MessageApiTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='message-admin',
            password='Password123!',
            role='admin',
            first_name='Admin',
            last_name='One',
        )
        self.superadmin_user = User.objects.create_user(
            username='message-superadmin',
            password='Password123!',
            role='superadmin',
            first_name='Super',
            last_name='Admin',
        )
        self.technician_user = User.objects.create_user(
            username='message-tech',
            password='Password123!',
            role='technician',
            first_name='Tech',
            last_name='One',
        )
        self.client_user = User.objects.create_user(
            username='message-client',
            password='Password123!',
            role='client',
        )
        self.other_client_user = User.objects.create_user(
            username='message-other-client',
            password='Password123!',
            role='client',
        )
        self.service_type = ServiceType.objects.create(name='After-sales test')
        self.service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Needs after-sales support.',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.service_request,
            technician=self.technician_user,
            assigned_admin=self.admin_user,
            scheduled_date=timezone.now().date(),
            status='Completed',
        )
        self.token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')

    def configured_admin(self, username, *capabilities):
        user = User.objects.create_user(
            username=username,
            password='Password123!',
            role='admin',
        )
        UserCapabilityGrant.objects.bulk_create([
            UserCapabilityGrant(user=user, capability_code=ADMIN_CONFIGURED_MARKER),
            *[
                UserCapabilityGrant(user=user, capability_code=capability)
                for capability in capabilities
            ],
        ])
        return user

    def test_restricted_admin_without_communications_cannot_access_message_apis(self):
        restricted = self.configured_admin('message-restricted', SYSTEM_SETTINGS_VIEW)
        self.client.force_authenticate(user=restricted)

        self.assertEqual(self.client.get('/api/messages/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/messages/participants/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/messages/support-cases/').status_code, status.HTTP_403_FORBIDDEN)

    def test_staff_message_capability_does_not_expose_client_support(self):
        staff_viewer = self.configured_admin('message-staff-viewer', COMMUNICATIONS_STAFF_VIEW)
        staff_message = Message.objects.create(
            sender=self.superadmin_user,
            room_type='group',
            group_key='staff',
            message_text='Internal operations update.',
        )
        Message.objects.create(
            sender=self.client_user,
            room_type='group',
            group_key=f'customer_support_client_{self.client_user.id}',
            message_text='Private support concern.',
        )
        self.client.force_authenticate(user=staff_viewer)

        response = self.client.get('/api/messages/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_items = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual({item['id'] for item in response_items}, {staff_message.id})
        self.assertEqual(self.client.get('/api/messages/support-cases/').status_code, status.HTTP_403_FORBIDDEN)

    def test_support_view_requires_manage_capability_for_replies_and_case_updates(self):
        support_viewer = self.configured_admin('message-support-viewer', COMMUNICATIONS_SUPPORT_VIEW)
        support_case = CustomerSupportCase.objects.create(
            client=self.client_user,
            group_key=f'customer_support_client_{self.client_user.id}_security',
            subject='Private support case',
        )
        self.client.force_authenticate(user=support_viewer)

        self.assertEqual(self.client.get('/api/messages/support-cases/').status_code, status.HTTP_200_OK)
        reply = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'customer_support_client_{self.client_user.id}',
                'text': 'Unauthorized reply.',
            },
            format='json',
        )
        update = self.client.patch(
            f'/api/messages/support-cases/{support_case.id}/',
            {'status': 'resolved'},
            format='json',
        )
        self.assertEqual(reply.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update.status_code, status.HTTP_403_FORBIDDEN)

        support_manager = self.configured_admin('message-support-manager', COMMUNICATIONS_SUPPORT_MANAGE)
        self.client.force_authenticate(user=support_manager)
        managed_update = self.client.patch(
            f'/api/messages/support-cases/{support_case.id}/',
            {'status': 'resolved'},
            format='json',
        )
        self.assertEqual(managed_update.status_code, status.HTTP_200_OK)

    def test_staff_view_cannot_bypass_support_manage_with_direct_client_ticket_message(self):
        staff_viewer = self.configured_admin('direct-ticket-staff', COMMUNICATIONS_STAFF_VIEW)
        support_manager = self.configured_admin('direct-ticket-support', COMMUNICATIONS_SUPPORT_MANAGE)
        payload = {
            'ticket': self.ticket.id,
            'room_type': 'direct',
            'receiver': self.client_user.id,
            'text': 'Ticket support response.',
        }

        self.client.force_authenticate(user=staff_viewer)
        self.assertEqual(
            self.client.post('/api/messages/', payload, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(user=support_manager)
        self.assertEqual(
            self.client.post('/api/messages/', payload, format='json').status_code,
            status.HTTP_201_CREATED,
        )

    def test_client_support_attachment_rejects_spoofed_image_content(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')
        fake_image = SimpleUploadedFile(
            'support-proof.png',
            b'not a real image',
            content_type='image/png',
        )

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'customer_support_client_{self.client_user.id}',
                'text': 'Attached proof.',
                'image': fake_image,
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Message.objects.filter(message_text='Attached proof.').exists())

    def test_participants_are_staff_only(self):
        response = self.client.get('/api/messages/participants/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        participant_ids = {item['id'] for item in response.data}
        self.assertIn(self.superadmin_user.id, participant_ids)
        self.assertIn(self.technician_user.id, participant_ids)
        self.assertNotIn(self.client_user.id, participant_ids)
        self.assertNotIn(self.admin_user.id, participant_ids)

    def test_create_direct_message_between_admin_and_technician(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'direct',
                'receiver': self.technician_user.id,
                'text': 'Please update your current job status.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.sender, self.admin_user)
        self.assertEqual(message.receiver, self.technician_user)
        self.assertEqual(message.room_type, 'direct')
        self.assertEqual(message.message_text, 'Please update your current job status.')

    def test_websocket_ticket_participants_exclude_unrelated_receivers_and_include_crew(self):
        crew_user = User.objects.create_user(
            username='message-crew-tech',
            password='Password123!',
            role='technician',
        )
        TicketCrewAssignment.objects.create(ticket=self.ticket, technician=crew_user)
        consumer = MessageConsumer()

        self.assertTrue(consumer.has_permission(crew_user, self.ticket))
        self.assertTrue(consumer.can_receive_ticket_message(self.client_user, self.ticket))
        self.assertFalse(consumer.can_receive_ticket_message(self.other_client_user, self.ticket))

    def test_websocket_assigned_technician_requires_messages_capability(self):
        consumer = MessageConsumer()
        UserCapabilityGrant.objects.create(
            user=self.technician_user,
            capability_code=SYSTEM_SETTINGS_VIEW,
        )

        self.assertFalse(consumer.has_permission(self.technician_user, self.ticket))

        UserCapabilityGrant.objects.create(
            user=self.technician_user,
            capability_code=TECHNICIAN_MESSAGES_VIEW,
        )
        self.assertTrue(consumer.has_permission(self.technician_user, self.ticket))

    def test_websocket_admin_authority_matches_communications_capabilities(self):
        restricted = self.configured_admin('ws-restricted', SYSTEM_SETTINGS_VIEW)
        staff_viewer = self.configured_admin('ws-staff', COMMUNICATIONS_STAFF_VIEW)
        support_viewer = self.configured_admin('ws-support-view', COMMUNICATIONS_SUPPORT_VIEW)
        support_manager = self.configured_admin('ws-support-manage', COMMUNICATIONS_SUPPORT_MANAGE)
        consumer = MessageConsumer()

        self.assertFalse(consumer.has_permission(restricted, self.ticket))
        self.assertTrue(consumer.can_send_ticket_message(staff_viewer, self.technician_user, self.ticket))
        self.assertFalse(consumer.can_send_ticket_message(staff_viewer, self.client_user, self.ticket))
        self.assertFalse(consumer.can_send_ticket_message(support_viewer, self.client_user, self.ticket))
        self.assertTrue(consumer.can_send_ticket_message(support_manager, self.client_user, self.ticket))

    def test_support_notifications_exclude_admins_without_support_view(self):
        restricted = self.configured_admin('support-notification-restricted', SYSTEM_SETTINGS_VIEW)
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'customer_support_client_{self.client_user.id}',
                'text': 'Private support details.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(
            Notification.objects.filter(
                user=restricted,
                title='New customer service message',
            ).exists()
        )

    def test_create_group_message_for_staff_room(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': 'staff',
                'text': 'Team reminder for today.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.room_type, 'group')
        self.assertEqual(message.group_key, 'staff')
        self.assertIsNone(message.receiver)
        self.assertIn('staff', str(message))

    def test_client_cannot_use_staff_messages(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': 'staff',
                'text': 'Client should not send this.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_client_can_create_customer_support_message_without_ticket(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'customer_support_client_{self.client_user.id}',
                'text': 'I need help from customer service.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.sender, self.client_user)
        self.assertIsNone(message.ticket)
        self.assertEqual(message.group_key, f'customer_support_client_{self.client_user.id}')
        self.assertIsNone(message.receiver)

    def test_client_can_create_customer_support_case(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/support-cases/',
            {
                'subject': 'Billing question',
                'category': 'billing',
                'priority': 'normal',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['client'], self.client_user.id)
        self.assertEqual(response.data['subject'], 'Billing question')
        self.assertTrue(response.data['group_key'].startswith(f'customer_support_client_{self.client_user.id}_'))

    def test_client_cannot_link_support_case_to_another_clients_ticket(self):
        other_request = ServiceRequest.objects.create(
            client=self.other_client_user,
            service_type=self.service_type,
            description='Other client request.',
            status='Approved',
        )
        other_ticket = ServiceTicket.objects.create(
            request=other_request,
            scheduled_date=timezone.now().date(),
            status='Completed',
        )
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/support-cases/',
            {
                'ticket': other_ticket.id,
                'subject': 'Unrelated ticket',
                'category': 'technical',
                'priority': 'normal',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('ticket', response.data)

    def test_admin_can_close_customer_support_case(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')
        create_response = self.client.post(
            '/api/messages/support-cases/',
            {
                'subject': 'Schedule concern',
                'category': 'schedule',
                'priority': 'high',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        response = self.client.patch(
            f"/api/messages/support-cases/{create_response.data['id']}/",
            {'status': 'resolved'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'resolved')
        self.assertIsNotNone(response.data['resolved_at'])

    def test_client_only_lists_own_customer_support_cases(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')
        own_response = self.client.post(
            '/api/messages/support-cases/',
            {
                'subject': 'Own concern',
                'category': 'general',
                'priority': 'normal',
            },
            format='json',
        )
        self.assertEqual(own_response.status_code, status.HTTP_201_CREATED)

        other_token = Token.objects.create(user=self.other_client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {other_token.key}')
        other_response = self.client.post(
            '/api/messages/support-cases/',
            {
                'subject': 'Other concern',
                'category': 'general',
                'priority': 'normal',
            },
            format='json',
        )
        self.assertEqual(other_response.status_code, status.HTTP_201_CREATED)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')
        response = self.client.get('/api/messages/support-cases/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_items = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        case_ids = {item['id'] for item in response_items}
        self.assertIn(own_response.data['id'], case_ids)
        self.assertNotIn(other_response.data['id'], case_ids)

    def test_customer_support_message_notifies_admins_only(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'customer_support_client_{self.client_user.id}',
                'text': 'This is a customer service concern.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        notifications = Notification.objects.filter(
            title='New customer service message',
            type='customer_inquiry',
        )
        self.assertEqual(notifications.count(), 2)
        notified_users = {notification.user_id for notification in notifications}
        self.assertEqual(notified_users, {self.admin_user.id, self.superadmin_user.id})
        self.assertNotIn(self.technician_user.id, notified_users)

    def test_technician_cannot_see_customer_support_messages(self):
        Message.objects.create(
            sender=self.client_user,
            room_type='group',
            group_key=f'customer_support_client_{self.client_user.id}',
            message_text='Private customer service concern.',
        )
        tech_token = Token.objects.create(user=self.technician_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {tech_token.key}')

        response = self.client.get('/api/messages/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_items = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual(len(response_items), 0)

    def test_admin_can_reply_to_customer_support_message(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'customer_support_client_{self.client_user.id}',
                'text': 'Support will check this for you.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.sender, self.admin_user)
        self.assertEqual(message.group_key, f'customer_support_client_{self.client_user.id}')

    def test_client_can_create_ticket_after_sales_message(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'after_sales_ticket_{self.ticket.id}',
                'ticket': self.ticket.id,
                'text': 'I need after-sales help for this ticket.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(id=response.data['id'])
        self.assertEqual(message.sender, self.client_user)
        self.assertEqual(message.ticket, self.ticket)
        self.assertEqual(message.group_key, f'after_sales_ticket_{self.ticket.id}')
        self.assertIsNone(message.receiver)

    def test_client_ticket_message_notifies_admin_workspace(self):
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'group',
                'group_key': f'after_sales_ticket_{self.ticket.id}',
                'ticket': self.ticket.id,
                'text': 'Please help with a warranty issue.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        notifications = Notification.objects.filter(
            ticket=self.ticket,
            type='customer_inquiry',
        )
        self.assertEqual(notifications.count(), 2)
        notified_users = {notification.user_id for notification in notifications}
        self.assertEqual(notified_users, {self.admin_user.id, self.superadmin_user.id})

    def test_client_only_sees_own_ticket_messages(self):
        Message.objects.create(
            sender=self.client_user,
            ticket=self.ticket,
            room_type='group',
            group_key=f'after_sales_ticket_{self.ticket.id}',
            message_text='Visible message.',
        )
        other_request = ServiceRequest.objects.create(
            client=self.other_client_user,
            service_type=self.service_type,
            description='Other client support.',
            status='Approved',
        )
        other_ticket = ServiceTicket.objects.create(
            request=other_request,
            technician=self.technician_user,
            assigned_admin=self.admin_user,
            scheduled_date=timezone.now().date(),
        )
        Message.objects.create(
            sender=self.other_client_user,
            ticket=other_ticket,
            room_type='group',
            group_key=f'after_sales_ticket_{other_ticket.id}',
            message_text='Hidden message.',
        )
        client_token = Token.objects.create(user=self.client_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {client_token.key}')

        response = self.client.get('/api/messages/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response_items = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        message_ids = {item['id'] for item in response_items}
        self.assertEqual(len(message_ids), 1)
        self.assertTrue(Message.objects.filter(id__in=message_ids, ticket=self.ticket).exists())

    def test_direct_message_rejects_client_receiver(self):
        response = self.client.post(
            '/api/messages/',
            {
                'room_type': 'direct',
                'receiver': self.client_user.id,
                'text': 'This should not be allowed.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('receiver', response.data)
