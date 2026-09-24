from django.db.models import Q
from django.utils import timezone
from rest_framework import status, viewsets, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from .models import CustomerSupportCase, Message
from .serializers import CustomerSupportCaseSerializer, MessageSerializer
from notifications.models import Notification
from users.models import User
from users.permissions import CanAccessClientSupport, CanAccessMessages
from users.rbac import (
    COMMUNICATIONS_STAFF_VIEW_CAPABILITIES,
    COMMUNICATIONS_SUPPORT_MANAGE_CAPABILITIES,
    COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES,
    user_has_any_capability,
)
from .serializers import CUSTOMER_SUPPORT_PREFIX


STAFF_MESSAGE_ROLES = {'superadmin', 'admin', 'technician'}
ADMIN_MESSAGE_ROLES = {'superadmin', 'admin'}


def active_admins_with_capability(capability_codes):
    return [
        user
        for user in User.objects.filter(role__in=ADMIN_MESSAGE_ROLES, is_active=True, status='active')
        if user_has_any_capability(user, capability_codes)
    ]


def notify_admins_of_client_ticket_message(message):
    ticket = message.ticket
    sender = message.sender
    if not ticket or not sender or getattr(sender, 'role', None) != 'client':
        return

    client_name = sender.get_full_name().strip() or sender.username
    recipients = active_admins_with_capability(COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES)
    for recipient in recipients:
        if recipient.id == sender.id:
            continue
        Notification.objects.create(
            user=recipient,
            ticket=ticket,
            request=ticket.request,
            title='New after-sales message',
            message=f'{client_name} sent an after-sales message for ticket #{ticket.id}.',
            type='customer_inquiry',
        )


def notify_admins_of_customer_support_message(message):
    sender = message.sender
    if not sender or getattr(sender, 'role', None) != 'client':
        return
    if message.ticket_id or not str(message.group_key or '').startswith(CUSTOMER_SUPPORT_PREFIX):
        return

    client_name = sender.get_full_name().strip() or sender.username
    recipients = active_admins_with_capability(COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES)
    for recipient in recipients:
        if recipient.id == sender.id:
            continue
        Notification.objects.create(
            user=recipient,
            title='New customer service message',
            message=f'{client_name} sent a customer service message.',
            type='customer_inquiry',
        )


def notify_admins_of_customer_support_resolution(case, actor):
    actor_name = actor.get_full_name().strip() or actor.username
    client_name = case.client.get_full_name().strip() or case.client.username
    status_label = case.get_status_display().lower()
    recipients = active_admins_with_capability(COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES)
    for recipient in recipients:
        Notification.objects.create(
            user=recipient,
            title='Customer support case updated',
            message=(
                f'{actor_name} marked customer support case #{case.id} as {status_label}: '
                f'{case.subject} for {client_name}.'
            ),
            type='success',
        )

class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [CanAccessMessages]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_throttles(self):
        if self.action == 'create':
            self.throttle_scope = 'message_send'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        if getattr(request.user, 'role', None) not in STAFF_MESSAGE_ROLES | {'client'}:
            raise PermissionDenied('Only service participants can send messages.')
        group_key = str(request.data.get('group_key') or '')
        is_customer_support = group_key.startswith(CUSTOMER_SUPPORT_PREFIX)
        try:
            receiver_id = int(request.data.get('receiver')) if request.data.get('receiver') else None
        except (TypeError, ValueError):
            receiver_id = None
        receiver_is_client = bool(
            receiver_id
            and User.objects.filter(
                id=receiver_id,
                role='client',
                is_active=True,
                status='active',
            ).exists()
        )
        is_ticket_support = bool(request.data.get('ticket')) and (
            group_key.startswith('after_sales_ticket_') or receiver_is_client
        )
        if (
            getattr(request.user, 'role', None) in ADMIN_MESSAGE_ROLES
            and (is_customer_support or is_ticket_support)
            and not user_has_any_capability(request.user, COMMUNICATIONS_SUPPORT_MANAGE_CAPABILITIES)
        ):
            raise PermissionDenied('You need the Manage client support capability to reply to this thread.')
        if (
            getattr(request.user, 'role', None) in ADMIN_MESSAGE_ROLES
            and not (is_customer_support or is_ticket_support)
            and not user_has_any_capability(request.user, COMMUNICATIONS_STAFF_VIEW_CAPABILITIES)
        ):
            raise PermissionDenied('You need the View staff messages capability to send staff messages.')
        if getattr(request.user, 'role', None) == 'client' and not request.data.get('ticket') and not is_customer_support:
            raise PermissionDenied('Clients can only send ticket messages.')
        return super().create(request, *args, **kwargs)

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, 'role', None)

        if role == 'client':
            base_q = (
                Q(ticket__request__client=user) |
                Q(room_type='group', group_key__startswith=f'{CUSTOMER_SUPPORT_PREFIX}{user.id}')
            )
        elif role in ADMIN_MESSAGE_ROLES:
            base_q = Q(pk__in=[])
            if user_has_any_capability(user, COMMUNICATIONS_STAFF_VIEW_CAPABILITIES):
                base_q |= (
                    Q(room_type='group', group_key='staff') |
                    Q(room_type='direct', sender=user) |
                    Q(room_type='direct', receiver=user)
                )
            if user_has_any_capability(user, COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES):
                base_q |= (
                    Q(room_type='group', group_key__startswith=CUSTOMER_SUPPORT_PREFIX) |
                    Q(ticket__isnull=False)
                )
        elif role == 'technician':
            base_q = (
                Q(room_type='group', group_key='staff') |
                Q(room_type='direct', sender=user) |
                Q(room_type='direct', receiver=user) |
                Q(ticket__technician=user) |
                Q(ticket__assigned_admin=user) |
                Q(ticket__crew_assignments__technician=user)
            )
        else:
            return Message.objects.none()

        return Message.objects.filter(
            base_q
        ).select_related(
            'sender',
            'receiver',
            'ticket',
            'ticket__request',
            'ticket__request__location',
        ).distinct().order_by('-created_at')

    def perform_create(self, serializer):
        message = serializer.save(sender=self.request.user)
        notify_admins_of_client_ticket_message(message)
        notify_admins_of_customer_support_message(message)

    def update(self, request, *args, **kwargs):
        message = self.get_object()
        if message.sender_id != request.user.id:
            raise PermissionDenied('You can only edit messages you sent.')
        if message.is_deleted:
            raise PermissionDenied('This message was already unsent.')

        allowed_fields = {'text', 'image'}
        submitted_fields = set(request.data.keys())
        blocked_fields = submitted_fields - allowed_fields
        if blocked_fields:
            raise PermissionDenied('Only message text and image attachments can be edited.')

        serializer = self.get_serializer(message, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(edited_at=timezone.now())
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        message = self.get_object()
        if message.sender_id != request.user.id:
            raise PermissionDenied('You can only unsend messages you sent.')
        if not message.is_deleted:
            if message.image:
                message.image.delete(save=False)
            message.message_text = ''
            message.image = None
            message.is_deleted = True
            message.deleted_at = timezone.now()
            message.save(update_fields=['message_text', 'image', 'is_deleted', 'deleted_at', 'updated_at'])
        serializer = self.get_serializer(message)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def participants(self, request):
        if getattr(request.user, 'role', None) not in STAFF_MESSAGE_ROLES:
            raise PermissionDenied('Only admins, superadmins, and technicians can view staff message participants.')
        if (
            getattr(request.user, 'role', None) in ADMIN_MESSAGE_ROLES
            and not user_has_any_capability(request.user, COMMUNICATIONS_STAFF_VIEW_CAPABILITIES)
        ):
            raise PermissionDenied('You need the View staff messages capability to list participants.')

        users = User.objects.filter(
            role__in=STAFF_MESSAGE_ROLES,
            status='active',
            is_active=True,
        ).exclude(id=request.user.id).order_by('role', 'first_name', 'username')

        return Response([
            {
                'id': user.id,
                'name': user.get_full_name().strip() or user.username,
                'username': user.username,
                'role': user.role,
                'phone': user.phone or '',
            }
            for user in users
        ])


class CustomerSupportCaseViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSupportCaseSerializer
    permission_classes = [CanAccessClientSupport]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_throttles(self):
        if self.action == 'create':
            self.throttle_scope = 'service_request_create'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        user = self.request.user
        role = getattr(user, 'role', None)
        if role == 'client':
            return CustomerSupportCase.objects.filter(client=user)
        if role in ADMIN_MESSAGE_ROLES:
            return CustomerSupportCase.objects.select_related('client').all()
        return CustomerSupportCase.objects.none()

    def perform_create(self, serializer):
        if (
            self.request.user.role in ADMIN_MESSAGE_ROLES
            and not user_has_any_capability(self.request.user, COMMUNICATIONS_SUPPORT_MANAGE_CAPABILITIES)
        ):
            raise PermissionDenied('You need the Manage client support capability to create support cases.')
        case = serializer.save()
        if self.request.user.role == 'client':
            client_name = self.request.user.get_full_name().strip() or self.request.user.username
            recipients = active_admins_with_capability(COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES)
            for recipient in recipients:
                if recipient.id == self.request.user.id:
                    continue
                Notification.objects.create(
                    user=recipient,
                    title='New customer service case',
                    message=f'{client_name} opened a {case.get_priority_display().lower()} priority support case: {case.subject}.',
                    type='customer_inquiry',
                )

    def perform_update(self, serializer):
        if (
            self.request.user.role not in ADMIN_MESSAGE_ROLES
            or not user_has_any_capability(self.request.user, COMMUNICATIONS_SUPPORT_MANAGE_CAPABILITIES)
        ):
            raise PermissionDenied('You need the Manage client support capability to update support cases.')
        previous_status = serializer.instance.status
        case = serializer.save()
        final_statuses = {'resolved', 'closed'}
        if previous_status not in final_statuses and case.status in final_statuses:
            notify_admins_of_customer_support_resolution(case, self.request.user)
