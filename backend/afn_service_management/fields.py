import copy
import json

from django.db import models
from django.db.models.fields.json import KeyTransformFactory


class StructuredTextField(models.TextField):
    """Store list/dict data in a TEXT column while exposing Python objects."""

    description = "Text field that serializes JSON-like structures"

    def __init__(self, *args, structure="dict", **kwargs):
        self.structure = structure
        if "default" not in kwargs:
            kwargs["default"] = dict if structure == "dict" else list
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        kwargs["structure"] = self.structure
        return name, path, args, kwargs

    def _empty_value(self):
        return {} if self.structure == "dict" else []

    def _normalize(self, value):
        if value is None:
            return None if self.null else self._empty_value()
        if isinstance(value, (list, dict)):
            return copy.deepcopy(value)
        if value == "":
            return self._empty_value()
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except (TypeError, ValueError):
                return self._empty_value()
            if isinstance(parsed, (list, dict)):
                return parsed
        return self._empty_value()

    def from_db_value(self, value, expression, connection):
        return self._normalize(value)

    def to_python(self, value):
        return self._normalize(value)

    def get_prep_value(self, value):
        normalized = self._normalize(value)
        if normalized is None:
            return None
        return json.dumps(normalized)

    def get_transform(self, name):
        transform = super().get_transform(name)
        if transform:
            return transform
        return KeyTransformFactory(name)
