from django.db.models.signals import post_save
from django.dispatch import receiver

from messages_app.realtime import broadcast_message_changed


@receiver(post_save, sender='messages_app.Message')
def push_message_saved(sender, instance, **kwargs):
    broadcast_message_changed(instance)
