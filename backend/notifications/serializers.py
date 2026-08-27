from rest_framework import serializers
from .models import Notification, NotificationTemplate, NotificationLog


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


class NotificationTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationTemplate
        fields = ['id', 'name', 'notification_type', 'subject', 'body', 'variables']


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationLog
        fields = [
            'id', 'notification', 'email_status',
            'email_response', 'attempt_count', 'last_attempt'
        ]
