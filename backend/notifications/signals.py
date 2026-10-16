from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from notifications.realtime import broadcast_unread_count


@receiver(post_save, sender='notifications.Notification')
def push_notification_saved(sender, instance, **kwargs):
    broadcast_unread_count(instance.user_id)


@receiver(post_delete, sender='notifications.Notification')
def push_notification_deleted(sender, instance, **kwargs):
    broadcast_unread_count(instance.user_id)
