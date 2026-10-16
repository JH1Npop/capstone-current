from django.apps import AppConfig


class MessagesAppConfig(AppConfig):
    name = 'messages_app'

    def ready(self):
        from messages_app import signals  # noqa: F401  (connect live-update signals)
