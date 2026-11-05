from django.test import SimpleTestCase
from unittest.mock import patch

from afn_service_management.storage import AFNMediaCloudinaryStorage


class AFNMediaCloudinaryStorageTests(SimpleTestCase):
    def setUp(self):
        self.storage = AFNMediaCloudinaryStorage()

    def test_routes_document_files_to_raw_storage(self):
        for name in ('template.docx', 'report.pdf', 'notes.txt'):
            with self.subTest(name=name):
                self.assertEqual(self.storage._get_resource_type(name), 'raw')

    def test_document_paths_use_authenticated_delivery(self):
        for name in (
            'document_templates/1/template.docx',
            'generated_documents/ticket-1/output.docx',
            'document_attachments/1/signed.pdf',
            'media/document_templates/1/template.docx',
        ):
            with self.subTest(name=name):
                self.assertTrue(self.storage._is_protected_document(name))
                self.assertEqual(self.storage._delivery_type(name), 'authenticated')
        self.assertEqual(self.storage._delivery_type('profiles/photo.jpg'), 'upload')

    @patch('afn_service_management.storage.cloudinary.uploader.upload')
    def test_upload_marks_documents_authenticated_but_keeps_images_public(self, upload):
        upload.return_value = {'public_id': 'stored'}
        self.storage._upload('media/document_templates/1/template.docx', object())
        self.assertEqual(upload.call_args.kwargs['resource_type'], 'raw')
        self.assertEqual(upload.call_args.kwargs['type'], 'authenticated')

        self.storage._upload('media/profiles/photo.jpg', object())
        self.assertEqual(upload.call_args.kwargs['resource_type'], 'image')
        self.assertEqual(upload.call_args.kwargs['type'], 'upload')

    @patch('afn_service_management.storage.cloudinary.utils.private_download_url')
    def test_document_url_is_short_lived_and_authenticated(self, private_download_url):
        private_download_url.return_value = 'https://example.test/private'
        self.assertEqual(
            self.storage._get_url('document_templates/1/template.docx'),
            'https://example.test/private',
        )
        self.assertEqual(private_download_url.call_args.args[:2], ('media/document_templates/1/template.docx', None))
        self.assertEqual(private_download_url.call_args.kwargs['type'], 'authenticated')
        self.assertEqual(private_download_url.call_args.kwargs['resource_type'], 'raw')
        self.assertGreater(private_download_url.call_args.kwargs['expires_at'], 0)

    def test_routes_images_and_video_to_their_cloudinary_resource_types(self):
        self.assertEqual(self.storage._get_resource_type('proof.JPG'), 'image')
        self.assertEqual(self.storage._get_resource_type('recording.mp4'), 'video')
