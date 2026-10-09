import importlib

from django.apps import apps
from django.test import TestCase

from services.models import ServiceType


class DefaultServiceCatalogMigrationTests(TestCase):
    def test_seed_populates_empty_catalog_and_is_non_destructive(self):
        migration = importlib.import_module(
            'services.migrations.0058_seed_default_service_catalog'
        )
        ServiceType.objects.all().delete()

        migration.seed_default_service_catalog(apps, None)

        self.assertEqual(ServiceType.objects.count(), 9)
        self.assertEqual(
            ServiceType.objects.filter(is_active=True).count(),
            9,
        )
        self.assertTrue(
            ServiceType.objects.filter(name='Solar Panel Installation').exists()
        )
        preserved = ServiceType.objects.create(
            name='Administrator-owned service',
            description='Do not replace me.',
            is_active=False,
        )

        migration.seed_default_service_catalog(apps, None)

        self.assertEqual(ServiceType.objects.count(), 10)
        preserved.refresh_from_db()
        self.assertEqual(preserved.description, 'Do not replace me.')
        self.assertFalse(preserved.is_active)
