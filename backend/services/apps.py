from django.apps import AppConfig


class ServicesConfig(AppConfig):
    name = 'services'

    def ready(self):
        # Keep derived technician availability synchronized even when ticket or
        # crew records are changed outside the REST workflow helpers.
        from . import signals  # noqa: F401

        # StructuredTextField keeps lists/dicts in a TEXT column. Without this mapping a
        # ModelSerializer treats it as a CharField and sends Python text such as
        # "['https://…/done.png']" instead of a JSON list (clients then saw no completion photos).
        from rest_framework import serializers

        from afn_service_management.fields import StructuredTextField

        serializers.ModelSerializer.serializer_field_mapping[StructuredTextField] = serializers.JSONField
