import re

from rest_framework import serializers
from .models import Notification


TICKET_REFERENCE_PATTERN = re.compile(r'\b(?:service\s+)?ticket\s*#?\s*(\d+)\b', re.IGNORECASE)


def format_ticket_references(value):
    """Present legacy ticket references using the canonical TKT-#### identity."""
    if not isinstance(value, str) or not value:
        return value
    return TICKET_REFERENCE_PATTERN.sub(
        lambda match: f'TKT-{int(match.group(1)):04d}',
        value,
    )


class NotificationSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    related_ticket = serializers.IntegerField(source='ticket_id', read_only=True)
    related_request = serializers.IntegerField(source='request_id', read_only=True)
    priority = serializers.SerializerMethodField()
    push_sent = serializers.SerializerMethodField()

    def get_priority(self, obj):
        if obj.ticket_id and getattr(obj.ticket, 'priority', None):
            return obj.ticket.priority
        if obj.request_id and getattr(obj.request, 'priority', None):
            return obj.request.priority
        return None

    def get_push_sent(self, obj):
        return False

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['title'] = format_ticket_references(representation.get('title'))
        representation['message'] = format_ticket_references(representation.get('message'))
        return representation

    class Meta:
        model = Notification
        fields = [
            'id', 'user', 'user_name', 'type', 'title', 'message',
            'ticket', 'request', 'related_ticket', 'related_request', 'status', 'priority',
            'send_email',
            'email_sent', 'push_sent', 'created_at', 'read_at'
        ]
        read_only_fields = [
            'user', 'ticket', 'request', 'status',
            'created_at', 'read_at', 'email_sent',
            'push_sent', 'related_ticket', 'related_request', 'priority'
        ]
