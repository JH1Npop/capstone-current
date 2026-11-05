import io
from zipfile import ZIP_DEFLATED, ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient
from reportlab.pdfgen import canvas

from services.models import DocumentDefinition, DocumentOutput, DocumentTemplate, DocumentTemplateVersion
from users.models import User


QUOTATION_REQUIRED_BODY = '{{client_name}}{{#price_rows}}{{/price_rows}}{{#bom_rows}}{{/bom_rows}}'


def docx_upload(name='template.docx', body=QUOTATION_REQUIRED_BODY, external=False, embedded=False):
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('word/document.xml', f'<w:document xmlns:w="w"><w:p><w:r><w:t>{body}</w:t></w:r></w:p></w:document>')
        rel = '<Relationships><Relationship TargetMode="External" Target="https://example.test/a"/></Relationships>' if external else '<Relationships/>'
        archive.writestr('word/_rels/document.xml.rels', rel)
        if embedded:
            archive.writestr('word/embeddings/object.bin', b'unsafe')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


def pdf_upload(name='template.pdf', extra=b''):
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(612, 792))
    pdf.drawString(72, 720, 'Preserved company document')
    pdf.save()
    data = buffer.getvalue()
    if extra:
        data = data.replace(b'%%EOF', extra + b'\n%%EOF')
    return SimpleUploadedFile(name, data, content_type='application/pdf')


class DocumentTemplateInfrastructureTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='template-admin', password='pass', email='template-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='template-client', password='pass', role='client')
        self.definition = DocumentDefinition.objects.get(code='quotation_proposal')
        self.template = DocumentTemplate.objects.get(definition=self.definition, name='Standard')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def upload(self, upload, notes=''):
        return self.api.post('/api/services/document-template-versions/', {'template': self.template.id, 'file': upload, 'change_notes': notes}, format='multipart')

    def test_valid_upload_is_immutable_inactive_and_extracts_split_run_placeholder(self):
        upload = docx_upload(body='{{client</w:t></w:r><w:r><w:t>_name}}')
        response = self.upload(upload, 'Initial design')
        self.assertEqual(response.status_code, 201, response.data)
        version = DocumentTemplateVersion.objects.get(pk=response.data['id'])
        self.assertEqual(version.version_number, 1)
        self.assertEqual(version.validation_status, 'valid')
        self.assertEqual(version.publication_status, 'draft')
        self.assertEqual(version.file_format, 'docx')
        self.assertEqual(version.readiness_status, 'ready_auto')
        self.assertEqual(version.placeholder_manifest['placeholders'], ['client_name'])
        self.assertEqual(len(version.sha256), 64)
        self.assertNotIn('file', response.data)
        self.assertTrue(version.file.name.startswith(f'document_templates/{self.template.id}/'))

    def test_pdf_source_can_be_saved_downloaded_and_is_not_falsely_fill_ready(self):
        response = self.upload(pdf_upload(), 'Original company PDF')
        self.assertEqual(response.status_code, 201, response.data)
        version = DocumentTemplateVersion.objects.get(pk=response.data['id'])
        self.assertEqual(version.file_format, 'pdf')
        self.assertEqual(version.mime_type, 'application/pdf')
        self.assertEqual(version.validation_status, 'valid')
        self.assertEqual(version.readiness_status, 'saved')
        self.assertEqual(version.publication_status, 'draft')
        self.assertFalse(version.placeholder_manifest['has_acroform_hint'])

        activation = self.api.post(f'/api/services/document-template-versions/{version.id}/activate/')
        self.assertEqual(activation.status_code, 409, activation.data)
        self.assertIn('safely saved', activation.data['detail'])

        download = self.api.get(f'/api/services/document-template-versions/{version.id}/download/')
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download['Content-Type'], 'application/pdf')
        self.assertTrue(b''.join(download.streaming_content).startswith(b'%PDF-'))

    def test_pdf_active_content_and_incomplete_files_are_rejected(self):
        for upload in [
            pdf_upload(extra=b'4 0 obj<</JavaScript (alert)>>endobj'),
            SimpleUploadedFile('broken.pdf', b'%PDF-1.4\nno eof', content_type='application/pdf'),
        ]:
            with self.subTest(name=upload.name):
                response = self.upload(upload)
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(DocumentTemplateVersion.objects.count(), 0)

    def test_unknown_placeholder_is_retained_as_invalid_but_cannot_activate(self):
        response = self.upload(docx_upload(body='{{run_arbitrary_code}}'))
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['validation_status'], 'invalid')
        activation = self.api.post(f"/api/services/document-template-versions/{response.data['id']}/activate/")
        self.assertEqual(activation.status_code, 409)
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=response.data['id']).publication_status, 'draft')

    def test_unsafe_docx_is_rejected_without_storing_a_version(self):
        for upload in [docx_upload(external=True), docx_upload(embedded=True), docx_upload(name='macro.docm')]:
            with self.subTest(name=upload.name):
                response = self.upload(upload)
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(DocumentTemplateVersion.objects.count(), 0)

    def test_activation_and_rollback_are_atomic_and_preserve_versions(self):
        first = self.upload(docx_upload(body=f'{QUOTATION_REQUIRED_BODY} first')).data
        second = self.upload(docx_upload(body=f'{QUOTATION_REQUIRED_BODY} second')).data
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{first['id']}/activate/").status_code, 200)
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{second['id']}/activate/").status_code, 200)
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=first['id']).publication_status, 'retired')
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=second['id']).publication_status, 'active')
        rollback = self.api.post(f"/api/services/document-template-versions/{first['id']}/rollback/")
        self.assertEqual(rollback.status_code, 200, rollback.data)
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=first['id']).publication_status, 'active')
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=second['id']).publication_status, 'retired')
        self.assertEqual(DocumentTemplateVersion.objects.count(), 2)

    def test_core_activation_requires_mandatory_connections_and_preserves_current_design(self):
        active = self.upload(docx_upload(body=f'{QUOTATION_REQUIRED_BODY} active')).data
        self.assertEqual(active['activation_missing_components'], [])
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{active['id']}/activate/").status_code, 200)

        incomplete = self.upload(docx_upload(body='{{client_name}}')).data
        self.assertEqual(incomplete['activation_missing_components'], ['bom_rows', 'price_rows'])
        response = self.api.post(f"/api/services/document-template-versions/{incomplete['id']}/activate/")

        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data['missing_components'], ['bom_rows', 'price_rows'])
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=active['id']).publication_status, 'active')
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=incomplete['id']).publication_status, 'draft')

    def test_clients_cannot_list_or_upload_global_templates(self):
        self.api.force_authenticate(self.client_user)
        self.assertEqual(self.api.get('/api/services/document-templates/').status_code, 403)
        self.assertEqual(self.upload(docx_upload()).status_code, 403)

    def test_setting_a_new_default_design_clears_the_previous_default(self):
        alternate = DocumentTemplate.objects.create(definition=self.definition, name='Alternate')
        response = self.api.patch(
            f'/api/services/document-templates/{alternate.id}/',
            {'is_default': True},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.template.refresh_from_db()
        alternate.refresh_from_db()
        self.assertFalse(self.template.is_default)
        self.assertTrue(alternate.is_default)

    def test_retired_non_default_design_and_unreferenced_versions_can_be_deleted(self):
        alternate = DocumentTemplate.objects.create(definition=self.definition, name='Temporary', is_enabled=False)
        upload = self.api.post(
            '/api/services/document-template-versions/',
            {'template': alternate.id, 'file': docx_upload()},
            format='multipart',
        )
        self.assertEqual(upload.status_code, 201, upload.data)
        version = DocumentTemplateVersion.objects.get(pk=upload.data['id'])
        storage = version.file.storage
        stored_name = version.file.name

        with self.captureOnCommitCallbacks(execute=True):
            response = self.api.delete(f'/api/services/document-templates/{alternate.id}/')

        self.assertEqual(response.status_code, 204, getattr(response, 'data', None))
        self.assertFalse(DocumentTemplate.objects.filter(pk=alternate.id).exists())
        self.assertFalse(DocumentTemplateVersion.objects.filter(pk=version.id).exists())
        self.assertFalse(storage.exists(stored_name))

    def test_enabled_default_design_can_be_deleted_when_unreferenced(self):
        replacement = DocumentTemplate.objects.create(definition=self.definition, name='Replacement')
        upload = self.upload(docx_upload())
        self.assertEqual(upload.status_code, 201, upload.data)

        response = self.api.delete(f'/api/services/document-templates/{self.template.id}/')

        self.assertEqual(response.status_code, 204, getattr(response, 'data', None))
        self.assertFalse(DocumentTemplate.objects.filter(pk=self.template.id).exists())
        replacement.refresh_from_db()
        self.assertTrue(replacement.is_default)

    def test_design_deletion_protects_active_and_historical_use(self):
        uploaded = self.upload(docx_upload())
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{uploaded.data['id']}/activate/").status_code, 200)
        active_response = self.api.delete(f'/api/services/document-templates/{self.template.id}/')
        self.assertEqual(active_response.status_code, 409, active_response.data)
        self.assertIn('active version', active_response.data['detail'])

        alternate = DocumentTemplate.objects.create(definition=self.definition, name='Historical', is_enabled=False)
        uploaded = self.api.post(
            '/api/services/document-template-versions/',
            {'template': alternate.id, 'file': docx_upload()},
            format='multipart',
        )
        version = DocumentTemplateVersion.objects.get(pk=uploaded.data['id'])
        DocumentOutput.objects.create(
            definition=self.definition,
            template_version=version,
            output_format='docx',
            renderer_source='dynamic',
            original_filename='historical.docx',
            source_snapshot={},
        )
        response = self.api.delete(f'/api/services/document-templates/{alternate.id}/')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertIn('Generated document history', response.data['detail'])
        self.assertTrue(DocumentTemplate.objects.filter(pk=alternate.id).exists())
