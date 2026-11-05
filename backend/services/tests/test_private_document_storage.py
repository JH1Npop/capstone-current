from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from services.management.commands.privatize_document_assets import Command


class PrivateDocumentStorageMigrationTests(SimpleTestCase):
    def setUp(self):
        self.storage = Mock()
        self.storage._resource_url.side_effect = lambda name, delivery: f'https://example.test/{delivery}/{name}'

    def test_classifies_authenticated_and_legacy_public_assets(self):
        authenticated = Mock(status_code=200)
        self.storage._request.return_value = authenticated
        self.assertEqual(Command._classify(self.storage, 'document_templates/1/a.docx'), 'authenticated')
        self.assertEqual(self.storage._request.call_count, 1)

        self.storage._request.reset_mock()
        self.storage._request.side_effect = [Mock(status_code=404), Mock(status_code=200)]
        self.assertEqual(Command._classify(self.storage, 'document_templates/1/a.docx'), 'legacy_public')
        self.assertEqual(self.storage._request.call_count, 2)

    def test_classifies_missing_only_after_both_delivery_types_fail(self):
        self.storage._request.side_effect = [Mock(status_code=404), Mock(status_code=404)]
        self.assertEqual(Command._classify(self.storage, 'document_templates/1/a.docx'), 'missing')

    @patch('services.management.commands.privatize_document_assets.cloudinary.uploader.rename')
    def test_cloudinary_rename_contract_preserves_public_id_and_changes_type(self, rename):
        name = 'media/document_templates/1/a.docx'
        rename.return_value = {'public_id': name}
        result = rename(
            name,
            name,
            resource_type='raw',
            type='upload',
            to_type='authenticated',
            invalidate=True,
        )
        self.assertEqual(result['public_id'], name)
        rename.assert_called_once_with(
            name,
            name,
            resource_type='raw',
            type='upload',
            to_type='authenticated',
            invalidate=True,
        )
