from django.test import TestCase

from services.document_templates import PLACEHOLDER_REGISTRY, placeholder_catalog_details
from services.models import DocumentDefinition, DocumentFieldDefinition


class DocumentPlaceholderCatalogTests(TestCase):
    REQUIRED_METADATA = {
        'key', 'label', 'description', 'source_field', 'value_type',
        'formatting_rules', 'applicable_document_types', 'is_required',
        'is_collection',
    }

    def test_every_core_placeholder_has_complete_metadata(self):
        for code, keys in PLACEHOLDER_REGISTRY.items():
            definition = DocumentDefinition.objects.get(code=code)
            details = placeholder_catalog_details(definition)
            by_key = {item['key']: item for item in details}
            self.assertEqual(set(by_key), keys)
            for key, item in by_key.items():
                with self.subTest(code=code, key=key):
                    self.assertEqual(set(item), self.REQUIRED_METADATA)
                    self.assertTrue(item['label'])
                    self.assertTrue(item['description'])
                    self.assertTrue(item['source_field'])
                    self.assertIn(code, item['applicable_document_types'])

    def test_repeating_and_financial_placeholders_are_explicitly_typed(self):
        quotation = DocumentDefinition.objects.get(code='quotation_proposal')
        details = {item['key']: item for item in placeholder_catalog_details(quotation)}
        self.assertEqual(details['bom_rows']['value_type'], 'collection')
        self.assertTrue(details['bom_rows']['is_collection'])
        self.assertIn('{{#bom_rows}}', details['bom_rows']['formatting_rules'])
        self.assertEqual(details['unit_price']['value_type'], 'currency')
        self.assertIn('must not recalculate', details['unit_price']['formatting_rules'])

    def test_custom_field_metadata_preserves_registered_type_and_required_flag(self):
        definition = DocumentDefinition.objects.create(
            code='warranty-certificate',
            name='Warranty Certificate',
            category='custom',
            data_source='ticket',
        )
        DocumentFieldDefinition.objects.create(
            definition=definition,
            field_key='warranty_years',
            label='Warranty years',
            field_type='number',
            is_required=True,
        )
        details = {item['key']: item for item in placeholder_catalog_details(definition)}
        self.assertEqual(details['warranty_years']['value_type'], 'number')
        self.assertTrue(details['warranty_years']['is_required'])
        self.assertEqual(details['warranty_years']['source_field'], 'custom_field_values.warranty_years')
