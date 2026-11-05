from io import StringIO
from tempfile import TemporaryDirectory

from django.core.management import call_command
from django.test import TestCase, override_settings

from services.models import DocumentTemplateVersion
from users.models import User


class ImportLegacyDocumentTemplatesTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(
            username='baseline-importer',
            password='pass',
            email='baseline-importer@example.test',
            role='superadmin',
        )

    def test_dry_run_validates_all_six_without_creating_versions(self):
        output = StringIO()
        call_command('import_legacy_document_templates', stdout=output)
        self.assertEqual(DocumentTemplateVersion.objects.count(), 0)
        self.assertIn('DRY RUN: 6 valid, 0 created, 0 already registered', output.getvalue())

    def test_apply_registers_inactive_immutable_baselines_idempotently(self):
        with TemporaryDirectory() as media_root, override_settings(
            STORAGES={'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}},
            MEDIA_ROOT=media_root,
        ):
            output = StringIO()
            call_command(
                'import_legacy_document_templates',
                apply=True,
                actor=self.admin.username,
                stdout=output,
            )
            versions = DocumentTemplateVersion.objects.select_related('template', 'template__definition')
            self.assertEqual(versions.count(), 6)
            self.assertFalse(versions.exclude(validation_status='valid').exists())
            self.assertFalse(versions.exclude(publication_status='draft').exists())
            self.assertFalse(versions.exclude(version_number=1).exists())
            self.assertFalse(versions.exclude(uploaded_by=self.admin).exists())
            self.assertTrue(all(version.file.storage.exists(version.file.name) for version in versions))
            field_report = versions.get(template__definition__code='field_service_report')
            self.assertEqual(field_report.file_size, 91221)

            rerun = StringIO()
            call_command(
                'import_legacy_document_templates',
                apply=True,
                actor=self.admin.username,
                stdout=rerun,
            )
            self.assertEqual(DocumentTemplateVersion.objects.count(), 6)
            self.assertIn('APPLY: 6 valid, 0 created, 6 already registered', rerun.getvalue())
