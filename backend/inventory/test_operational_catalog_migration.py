import importlib

from django.apps import apps
from django.test import TestCase

from inventory.models import InventoryItem, InventoryTransaction, ServiceTypeInventoryRequirement
from services.models import ServiceType


class OperationalCatalogMigrationTests(TestCase):
    def test_seed_adds_missing_catalog_data_without_overwriting_admin_values(self):
        migration = importlib.import_module('inventory.migrations.0008_seed_operational_catalog')
        service = ServiceType.objects.get(name='Solar Panel Installation')
        ServiceType.objects.filter(pk=service.pk).update(procedures=[], required_equipment=[])
        custom = ServiceType.objects.create(
            name='Field Service Diagnostic',
            procedures=[{'step': 1, 'title': 'Administrator step'}],
            required_equipment=['Administrator tool'],
        )
        existing = InventoryItem.objects.get(sku='SOL-550W')
        InventoryItem.objects.filter(pk=existing.pk).update(
            name='Administrator-owned panel', quantity=2, total_value=2,
        )
        opening_transaction_count = InventoryTransaction.objects.filter(
            reference_number='OPENING-CATALOG'
        ).count()

        migration.seed_operational_catalog(apps, None)
        migration.seed_operational_catalog(apps, None)

        service.refresh_from_db()
        custom.refresh_from_db()
        existing.refresh_from_db()
        self.assertEqual(len(service.procedures), 6)
        self.assertTrue(service.required_equipment)
        self.assertEqual(custom.procedures, [{'step': 1, 'title': 'Administrator step'}])
        self.assertEqual(custom.required_equipment, ['Administrator tool'])
        self.assertEqual(existing.name, 'Administrator-owned panel')
        self.assertEqual(existing.quantity, 2)
        self.assertEqual(InventoryItem.objects.filter(sku__iexact='SOL-550W').count(), 1)
        self.assertEqual(InventoryItem.objects.count(), 9)
        self.assertEqual(
            InventoryTransaction.objects.filter(reference_number='OPENING-CATALOG').count(),
            opening_transaction_count,
        )
        self.assertEqual(ServiceTypeInventoryRequirement.objects.filter(service_type=service).count(), 3)
