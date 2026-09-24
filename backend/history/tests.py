from importlib import import_module
from types import SimpleNamespace

from django.apps import apps
from django.test import SimpleTestCase


class RetiredServiceHistoryTests(SimpleTestCase):
    def test_legacy_model_and_api_are_not_exposed(self):
        with self.assertRaises(LookupError):
            apps.get_model('history', 'ServiceHistory')

        response = self.client.get('/api/history/history/')

        self.assertEqual(response.status_code, 404)

    def test_removal_migration_refuses_to_drop_populated_history(self):
        migration = import_module('history.migrations.0005_delete_servicehistory')
        manager = SimpleNamespace(
            using=lambda _alias: SimpleNamespace(exists=lambda: True)
        )
        historical_apps = SimpleNamespace(
            get_model=lambda _app_label, _model_name: SimpleNamespace(objects=manager)
        )
        schema_editor = SimpleNamespace(connection=SimpleNamespace(alias='default'))

        with self.assertRaisesRegex(RuntimeError, 'Export and reconcile'):
            migration.require_empty_service_history(historical_apps, schema_editor)
