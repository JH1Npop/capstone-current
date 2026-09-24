from django.apps import AppConfig


class ServicesConfig(AppConfig):
    name = 'services'

    def ready(self):
        # Keep derived technician availability synchronized even when ticket or
        # crew records are changed outside the REST workflow helpers.
        from . import signals  # noqa: F401
