from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.utils import timezone
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(viewsets.ModelViewSet):
    queryset = Notification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_throttles(self):
        if self.action in ['mark_read', 'mark_all_read']:
            self.throttle_scope = 'notification_action'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        # Return only notifications for the current user
        return Notification.objects.filter(user=self.request.user).select_related(
            'user', 'ticket', 'request'
        ).order_by('-created_at')

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed('POST')

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a notification as read (idempotent if already read or missing)."""
        notification = self.get_queryset().filter(pk=pk).first()
        if not notification:
            return Response(
                {'status': 'noop', 'detail': 'Notification not found or no longer available.'},
                status=status.HTTP_200_OK,
            )
        notification.mark_as_read()
        return Response({
            'status': 'Notification marked as read',
            'notification_id': notification.id,
            'read_at': notification.read_at,
        })

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all notifications as read"""
        read_at = timezone.now()
        updated_count = self.get_queryset().filter(status='unread').update(
            status='read',
            read_at=read_at,
        )
        return Response({
            'status': 'All notifications marked as read',
            'updated_count': updated_count,
            'read_at': read_at,
        })

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        count = self.get_queryset().filter(status='unread').count()
        return Response({'unread_count': count})

    @action(detail=False, methods=['delete'])
    def delete_all(self, request):
        """Delete all notifications owned by the current user."""
        deleted_count, _ = self.get_queryset().delete()
        return Response({
            'status': 'All notifications deleted',
            'deleted_count': deleted_count,
        })

