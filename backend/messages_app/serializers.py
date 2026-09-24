from rest_framework import serializers
from django.utils import timezone
from .models import CustomerSupportCase, Message


STAFF_MESSAGE_ROLES = {'superadmin', 'admin', 'technician'}
ADMIN_MESSAGE_ROLES = {'superadmin', 'admin'}
CUSTOMER_SUPPORT_PREFIX = 'customer_support_client_'


def get_customer_support_client_id(group_key):
    if not group_key or not str(group_key).startswith(CUSTOMER_SUPPORT_PREFIX):
        return None
    try:
        return int(str(group_key).replace(CUSTOMER_SUPPORT_PREFIX, '', 1).split('_', 1)[0])
    except (TypeError, ValueError):
        return None


def user_can_access_ticket(user, ticket):
    if not user or not ticket:
        return False
    if user.role in ADMIN_MESSAGE_ROLES:
        return True
    if user.role == 'client':
        return ticket.request.client_id == user.id
    if user.role == 'technician':
        return (
            ticket.technician_id == user.id or
            ticket.assigned_admin_id == user.id or
            ticket.crew_assignments.filter(technician_id=user.id).exists()
        )
    return False


class MessageSerializer(serializers.ModelSerializer):
    ticket = serializers.PrimaryKeyRelatedField(
        queryset=Message._meta.get_field('ticket').remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    receiver = serializers.PrimaryKeyRelatedField(
        queryset=Message._meta.get_field('receiver').remote_field.model.objects.all(),
        required=False,
        allow_null=True,
    )
    text = serializers.CharField(source='message_text', required=False, allow_blank=True)
    timestamp = serializers.DateTimeField(source='created_at', read_only=True)
    ticket_id = serializers.IntegerField(source='ticket.id', read_only=True)
    image = serializers.FileField(required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()
    sender_name = serializers.SerializerMethodField()
    receiver_name = serializers.SerializerMethodField()
    sender_phone = serializers.CharField(source='sender.phone', read_only=True)
    receiver_phone = serializers.CharField(source='receiver.phone', read_only=True)
    ticket_address = serializers.SerializerMethodField()
    ticket_latitude = serializers.SerializerMethodField()
    ticket_longitude = serializers.SerializerMethodField()

    def get_image_url(self, obj):
        if obj.is_deleted or not obj.image:
            return ''
        return obj.image.url

    def get_sender_name(self, obj):
        if not obj.sender:
            return ''
        full_name = obj.sender.get_full_name().strip()
        return full_name or obj.sender.username

    def get_receiver_name(self, obj):
        if not obj.receiver:
            return ''
        full_name = obj.receiver.get_full_name().strip()
        return full_name or obj.receiver.username

    def get_ticket_address(self, obj):
        try:
            return obj.ticket.request.location.address
        except Exception:
            return ''

    def get_ticket_latitude(self, obj):
        try:
            latitude = obj.ticket.request.location.latitude
            return float(latitude) if latitude is not None else None
        except Exception:
            return None

    def get_ticket_longitude(self, obj):
        try:
            longitude = obj.ticket.request.location.longitude
            return float(longitude) if longitude is not None else None
        except Exception:
            return None

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get('request')
        sender = getattr(request, 'user', None)
        text = attrs.get('message_text', getattr(self.instance, 'message_text', ''))
        image = attrs.get('image', getattr(self.instance, 'image', None))
        room_type = attrs.get('room_type') or getattr(self.instance, 'room_type', 'direct') or 'direct'
        group_key = attrs.get('group_key') or getattr(self.instance, 'group_key', None)
        receiver = attrs.get('receiver') or getattr(self.instance, 'receiver', None)
        ticket = attrs.get('ticket') or getattr(self.instance, 'ticket', None)

        if room_type not in {'direct', 'group'}:
            raise serializers.ValidationError({'room_type': 'Unsupported message room type.'})
        if not sender or not sender.is_authenticated:
            raise serializers.ValidationError('Authentication is required to send a message.')
        if image:
            from afn_service_management.upload_validation import validate_image_upload

            _format, _content_type, safe_extension, original_stem = validate_image_upload(
                image,
                max_bytes=5 * 1024 * 1024,
                allowed_formats={'JPEG', 'PNG', 'WEBP', 'GIF'},
                field_name='image',
            )
            image.name = f'{original_stem}{safe_extension}'
        if len(str(text or '')) > 5000:
            raise serializers.ValidationError({'text': 'Messages cannot exceed 5000 characters.'})
        if not str(text or '').strip() and not image:
            raise serializers.ValidationError({'text': 'Add a message or attach an image.'})
        if room_type == 'direct' and receiver and (not receiver.is_active or receiver.status != 'active'):
            raise serializers.ValidationError({'receiver': 'Choose an active message recipient.'})

        if ticket:
            if not user_can_access_ticket(sender, ticket):
                raise serializers.ValidationError({'ticket': 'You do not have access to this ticket.'})

            if room_type == 'direct':
                if receiver is None:
                    raise serializers.ValidationError({'receiver': 'A message receiver is required.'})
                if receiver.id == sender.id:
                    raise serializers.ValidationError({'receiver': 'Choose another participant for this message.'})
                if not user_can_access_ticket(receiver, ticket):
                    raise serializers.ValidationError({'receiver': 'Choose a participant assigned to this ticket.'})
                attrs['group_key'] = None
            else:
                attrs['receiver'] = None
                attrs['group_key'] = attrs.get('group_key') or f'after_sales_ticket_{ticket.id}'
            return attrs

        support_client_id = get_customer_support_client_id(group_key)
        if support_client_id is not None:
            if room_type != 'group':
                raise serializers.ValidationError({'room_type': 'Customer support messages must use a group room.'})
            if sender.role == 'client' and sender.id != support_client_id:
                raise serializers.ValidationError({'group_key': 'Clients can only use their own customer support thread.'})
            if sender.role not in ADMIN_MESSAGE_ROLES | {'client'}:
                raise serializers.ValidationError('Only clients, admins, and superadmins can use customer support messages.')
            attrs['receiver'] = None
            return attrs

        if sender.role not in STAFF_MESSAGE_ROLES:
            raise serializers.ValidationError('Only admins, superadmins, and technicians can use staff messages.')

        if room_type == 'direct' and receiver is None:
            raise serializers.ValidationError({'receiver': 'A message receiver is required.'})
        if room_type == 'direct' and receiver.role not in STAFF_MESSAGE_ROLES:
            raise serializers.ValidationError({'receiver': 'Choose an admin, superadmin, or technician.'})
        if room_type == 'direct' and receiver.id == sender.id:
            raise serializers.ValidationError({'receiver': 'Choose another participant for this message.'})
        if room_type == 'group':
            attrs['receiver'] = None
            attrs['group_key'] = attrs.get('group_key') or 'staff'
        else:
            attrs['group_key'] = None

        return attrs

    class Meta:
        model = Message
        fields = [
            'id',
            'ticket',
            'ticket_id',
            'ticket_address',
            'ticket_latitude',
            'ticket_longitude',
            'room_type',
            'group_key',
            'sender',
            'sender_name',
            'sender_phone',
            'receiver',
            'receiver_name',
            'receiver_phone',
            'text',
            'image',
            'image_url',
            'is_deleted',
            'edited_at',
            'deleted_at',
            'updated_at',
            'timestamp',
            'created_at',
        ]
        read_only_fields = [
            'id',
            'ticket_id',
            'ticket_address',
            'ticket_latitude',
            'ticket_longitude',
            'sender',
            'sender_name',
            'sender_phone',
            'receiver_name',
            'receiver_phone',
            'image_url',
            'is_deleted',
            'edited_at',
            'deleted_at',
            'updated_at',
            'timestamp',
            'created_at',
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if instance.is_deleted:
            data['text'] = ''
            data['image'] = None
            data['image_url'] = ''
        return data


class CustomerSupportCaseSerializer(serializers.ModelSerializer):
    client = serializers.PrimaryKeyRelatedField(
        queryset=CustomerSupportCase._meta.get_field('client').remote_field.model.objects.filter(role='client'),
        required=False,
    )
    client_name = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    ticket_id = serializers.IntegerField(source='ticket.id', read_only=True)
    ticket_code = serializers.SerializerMethodField()
    case_code = serializers.SerializerMethodField()

    def get_ticket_code(self, obj):
        if obj.ticket:
            return f"TKT-{obj.ticket.id:04d}"
        return ''

    def get_case_code(self, obj):
        return f"CSC-{obj.id:04d}"

    def get_client_name(self, obj):
        full_name = obj.client.get_full_name().strip()
        return full_name or obj.client.username

    def get_message_count(self, obj):
        return Message.objects.filter(room_type='group', group_key=obj.group_key, ticket__isnull=True).count()

    def get_last_message(self, obj):
        message = Message.objects.filter(room_type='group', group_key=obj.group_key, ticket__isnull=True).order_by('-created_at').first()
        return message.message_text if message else ''

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if not user or not user.is_authenticated:
            raise serializers.ValidationError('Authentication is required.')

        if not self.instance and user.role == 'client':
            attrs['client'] = user
            attrs['group_key'] = f'{CUSTOMER_SUPPORT_PREFIX}{user.id}_{int(timezone.now().timestamp())}'
            ticket = attrs.get('ticket')
            if ticket and ticket.request.client_id != user.id:
                raise serializers.ValidationError({
                    'ticket': 'You can only open a support case for your own ticket.'
                })
        elif not self.instance and user.role not in ADMIN_MESSAGE_ROLES:
            raise serializers.ValidationError('Only clients, admins, and superadmins can create customer support cases.')

        if self.instance and user.role == 'client' and any(field in attrs for field in {'status', 'priority'}):
            raise serializers.ValidationError('Clients cannot change support case status or priority.')

        status_value = attrs.get('status')
        if status_value in {'resolved', 'closed'} and self.instance and not self.instance.resolved_at:
            attrs['resolved_at'] = timezone.now()
        if status_value in {'open', 'in_review'}:
            attrs['resolved_at'] = None

        return attrs

    class Meta:
        model = CustomerSupportCase
        fields = [
            'id',
            'case_code',
            'client',
            'client_name',
            'group_key',
            'ticket',
            'ticket_id',
            'ticket_code',
            'subject',
            'category',
            'priority',
            'status',
            'message_count',
            'last_message',
            'created_at',
            'updated_at',
            'resolved_at',
        ]
        read_only_fields = [
            'id',
            'case_code',
            'client_name',
            'group_key',
            'ticket_id',
            'ticket_code',
            'message_count',
            'last_message',
            'created_at',
            'updated_at',
            'resolved_at',
        ]
