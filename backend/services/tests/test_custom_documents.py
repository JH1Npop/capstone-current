import io
from zipfile import ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from pypdf import PdfReader
from reportlab.pdfgen import canvas

from services.models import DocumentAttachment, DocumentDefinition, DocumentInstance, DocumentOutput, DocumentTemplate, ServiceRequest, ServiceTicket, ServiceType
from services.tests.test_document_template_infrastructure import docx_upload
from users.models import User, UserCapabilityGrant
from users.rbac import ADMIN_CONFIGURED_MARKER, DOCUMENTS_MANAGE, DOCUMENTS_VIEW, DOCUMENT_ATTACHMENTS_MANAGE, DOCUMENT_TEMPLATES_PUBLISH


class CustomDocumentTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='custom-doc-admin', password='pass', role='superadmin')
        self.client_user = User.objects.create_user(username='custom-doc-client', password='pass', role='client', first_name='Alex', last_name='Rivera')
        service = ServiceType.objects.create(name='Custom document service', estimated_duration=60)
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='Custom document test', status='Approved')
        self.ticket = ServiceTicket.objects.create(request=request_obj, status='Ready for Service', scheduled_date=timezone.localdate())
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    @staticmethod
    def response_bytes(response):
        return b''.join(response.streaming_content)

    def register_definition(self):
        response = self.api.post('/api/services/document-definitions/', {
            'name': 'Maintenance Certificate',
            'description': 'Custom certificate without a new workflow.',
            'data_source': 'ticket',
            'display_order': 100,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['category'], 'custom')
        self.assertFalse(response.data['is_active'])
        return response.data

    def add_field_and_template(self, definition_id):
        field = self.api.post('/api/services/document-field-definitions/', {
            'definition': definition_id,
            'field_key': 'maintenance_summary',
            'label': 'Maintenance summary',
            'field_type': 'multiline',
            'is_required': True,
            'validation_config': {'max_length': 500},
        }, format='json')
        self.assertEqual(field.status_code, 201, field.data)
        design = self.api.post('/api/services/document-templates/', {
            'definition': definition_id,
            'name': 'Standard',
            'is_default': True,
        }, format='json')
        self.assertEqual(design.status_code, 201, design.data)
        version = self.api.post('/api/services/document-template-versions/', {
            'template': design.data['id'],
            'file': docx_upload(body='Certificate for {{client_name}}: {{maintenance_summary}}'),
        }, format='multipart')
        self.assertEqual(version.status_code, 201, version.data)
        self.assertEqual(version.data['validation_status'], 'valid')
        activation = self.api.post(f"/api/services/document-template-versions/{version.data['id']}/activate/")
        self.assertEqual(activation.status_code, 200, activation.data)
        return design.data, version.data

    @staticmethod
    def pdf_template_upload():
        buffer = io.BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=(612, 792))
        pdf.drawString(72, 735, 'Maintenance Certificate')
        pdf.drawString(72, 690, 'Client:')
        pdf.drawString(72, 650, 'Summary:')
        pdf.save()
        return SimpleUploadedFile('maintenance-certificate.pdf', buffer.getvalue(), content_type='application/pdf')

    def test_registration_fields_generation_archive_and_attachments(self):
        definition = self.register_definition()
        premature = self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        self.assertEqual(premature.status_code, 400)
        _design, version = self.add_field_and_template(definition['id'])
        enabled = self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        self.assertEqual(enabled.status_code, 200, enabled.data)

        instance = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'],
            'ticket': self.ticket.id,
            'selected_template_version': version['id'],
            'custom_field_values': {'maintenance_summary': 'System inspected and operating normally.'},
        }, format='json')
        self.assertEqual(instance.status_code, 201, instance.data)
        preview = self.api.post(f"/api/services/document-instances/{instance.data['id']}/preview/", {}, format='json')
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview['Content-Type'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        with ZipFile(io.BytesIO(self.response_bytes(preview))) as preview_archive:
            self.assertIn(b'Alex Rivera', preview_archive.read('word/document.xml'))
        self.assertFalse(DocumentOutput.objects.filter(instance_id=instance.data['id']).exists())
        generated = self.api.post(f"/api/services/document-instances/{instance.data['id']}/generate/", {}, format='json')
        self.assertEqual(generated.status_code, 200)
        rendered = self.response_bytes(generated)
        with ZipFile(io.BytesIO(rendered)) as archive:
            xml = archive.read('word/document.xml')
        self.assertIn(b'Alex Rivera', xml)
        self.assertIn(b'System inspected and operating normally.', xml)
        self.assertNotIn(b'{{', xml)

        output = DocumentOutput.objects.get(instance_id=instance.data['id'])
        self.assertEqual(output.template_version_id, version['id'])
        self.assertEqual(output.source_snapshot['maintenance_summary'], 'System inspected and operating normally.')
        self.assertEqual(output.ticket_id, self.ticket.id)
        record = DocumentInstance.objects.get(pk=instance.data['id'])
        self.assertEqual(record.status, 'generated')

        attachment = self.api.post('/api/services/document-attachments/', {
            'instance': record.id,
            'file': SimpleUploadedFile('signed-note.pdf', b'%PDF-1.4 signed', content_type='application/pdf'),
            'description': 'Signed supporting note',
        }, format='multipart')
        self.assertEqual(attachment.status_code, 201, attachment.data)
        self.assertNotIn('file', attachment.data)
        stored = DocumentAttachment.objects.get(pk=attachment.data['id'])
        self.assertEqual(len(stored.sha256), 64)
        downloaded = self.api.get(f'/api/services/document-attachments/{stored.id}/download/')
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(self.response_bytes(downloaded), b'%PDF-1.4 signed')

    def test_pdf_template_fields_manual_fill_generation_and_archive(self):
        definition = self.register_definition()
        design = self.api.post('/api/services/document-templates/', {
            'definition': definition['id'], 'name': 'PDF layout', 'is_default': True,
        }, format='json')
        self.assertEqual(design.status_code, 201, design.data)
        version = self.api.post('/api/services/document-template-versions/', {
            'template': design.data['id'], 'file': self.pdf_template_upload(),
        }, format='multipart')
        self.assertEqual(version.status_code, 201, version.data)
        self.assertEqual(version.data['readiness_status'], 'saved')

        manual = self.api.post('/api/services/document-template-fields/', {
            'template_version': version.data['id'],
            'field_key': 'maintenance_summary',
            'label': 'Maintenance summary',
            'field_type': 'text',
            'fill_method': 'manual',
            'is_required': True,
            'page_number': 1,
            'placement': {'x': 0.22, 'y': 0.16, 'width': 0.6, 'height': 0.04},
        }, format='json')
        self.assertEqual(manual.status_code, 201, manual.data)
        system = self.api.post('/api/services/document-template-fields/', {
            'template_version': version.data['id'],
            'field_key': 'client_display',
            'label': 'Client name',
            'field_type': 'text',
            'fill_method': 'system',
            'source_key': 'client_name',
            'page_number': 1,
            'placement': {'x': 0.2, 'y': 0.105, 'width': 0.5, 'height': 0.04},
        }, format='json')
        self.assertEqual(system.status_code, 201, system.data)
        refreshed = self.api.get(f"/api/services/document-template-versions/{version.data['id']}/")
        self.assertEqual(refreshed.data['readiness_status'], 'ready_auto')

        activation = self.api.post(f"/api/services/document-template-versions/{version.data['id']}/activate/")
        self.assertEqual(activation.status_code, 200, activation.data)
        enabled = self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        self.assertEqual(enabled.status_code, 200, enabled.data)
        instance = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'],
            'ticket': self.ticket.id,
            'selected_template_version': version.data['id'],
            'custom_field_values': {'maintenance_summary': 'System inspected and operating normally.'},
        }, format='json')
        self.assertEqual(instance.status_code, 201, instance.data)
        preview = self.api.post(f"/api/services/document-instances/{instance.data['id']}/preview/", {}, format='json')
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview['Content-Type'], 'application/pdf')
        self.assertIn('Alex Rivera', '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(self.response_bytes(preview))).pages))
        self.assertFalse(DocumentOutput.objects.filter(instance_id=instance.data['id']).exists())
        generated = self.api.post(f"/api/services/document-instances/{instance.data['id']}/generate/", {}, format='json')
        self.assertEqual(generated.status_code, 200, getattr(generated, 'data', None))
        self.assertEqual(generated['Content-Type'], 'application/pdf')
        rendered = self.response_bytes(generated)
        text = '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(rendered)).pages)
        self.assertIn('Alex Rivera', text)
        self.assertIn('System inspected and operating normally.', text)
        output = DocumentOutput.objects.get(instance_id=instance.data['id'])
        self.assertEqual(output.output_format, 'pdf')
        self.assertEqual(output.template_version_id, version.data['id'])
        self.assertEqual(output.source_snapshot['configured_field_values']['maintenance_summary'], 'System inspected and operating normally.')

    def test_required_unknown_and_reserved_fields_are_rejected(self):
        definition = self.register_definition()
        self.add_field_and_template(definition['id'])
        self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        missing = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'], 'ticket': self.ticket.id, 'custom_field_values': {},
        }, format='json')
        self.assertEqual(missing.status_code, 400)
        unknown = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'], 'ticket': self.ticket.id,
            'custom_field_values': {'maintenance_summary': 'Okay', 'quotation_total': '999'},
        }, format='json')
        self.assertEqual(unknown.status_code, 400)
        reserved = self.api.post('/api/services/document-field-definitions/', {
            'definition': definition['id'], 'field_key': 'client_name', 'label': 'Override client', 'field_type': 'text',
        }, format='json')
        self.assertEqual(reserved.status_code, 400)

    def test_attachment_content_must_match_its_extension(self):
        definition = self.register_definition()
        _design, version = self.add_field_and_template(definition['id'])
        self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        instance = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'], 'ticket': self.ticket.id,
            'selected_template_version': version['id'],
            'custom_field_values': {'maintenance_summary': 'Private data'},
        }, format='json').data
        spoofed = self.api.post('/api/services/document-attachments/', {
            'instance': instance['id'],
            'file': SimpleUploadedFile('not-really.pdf', b'<script>alert(1)</script>', content_type='application/pdf'),
        }, format='multipart')
        self.assertEqual(spoofed.status_code, 400)
        self.assertFalse(DocumentAttachment.objects.filter(instance_id=instance['id']).exists())

    def test_clients_cannot_register_generate_or_download_custom_documents(self):
        definition = self.register_definition()
        self.add_field_and_template(definition['id'])
        self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        instance = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'], 'ticket': self.ticket.id,
            'custom_field_values': {'maintenance_summary': 'Private data'},
        }, format='json').data
        self.api.force_authenticate(self.client_user)
        self.assertEqual(self.api.post('/api/services/document-definitions/', {'name': 'Unsafe', 'data_source': 'ticket'}, format='json').status_code, 403)
        self.assertEqual(self.api.post(f"/api/services/document-instances/{instance['id']}/generate/", {}, format='json').status_code, 403)
        self.assertEqual(self.api.get('/api/services/document-instances/').status_code, 403)

    def test_definition_capability_restriction_applies_to_related_records(self):
        definition = self.api.post('/api/services/document-definitions/', {
            'name': 'Restricted Certificate',
            'data_source': 'ticket',
            'access_capabilities': [DOCUMENT_TEMPLATES_PUBLISH],
        }, format='json').data
        _design, version = self.add_field_and_template(definition['id'])
        self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        instance = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'], 'ticket': self.ticket.id,
            'selected_template_version': version['id'],
            'custom_field_values': {'maintenance_summary': 'Restricted data'},
        }, format='json').data
        attachment = self.api.post('/api/services/document-attachments/', {
            'instance': instance['id'],
            'file': SimpleUploadedFile('restricted.pdf', b'%PDF-1.4 restricted', content_type='application/pdf'),
        }, format='multipart').data

        limited_admin = User.objects.create_user(username='limited-doc-admin', password='pass', role='admin')
        UserCapabilityGrant.objects.bulk_create([
            UserCapabilityGrant(user=limited_admin, capability_code=ADMIN_CONFIGURED_MARKER),
            UserCapabilityGrant(user=limited_admin, capability_code=DOCUMENTS_VIEW),
            UserCapabilityGrant(user=limited_admin, capability_code=DOCUMENTS_MANAGE),
            UserCapabilityGrant(user=limited_admin, capability_code=DOCUMENT_ATTACHMENTS_MANAGE),
        ])
        self.api.force_authenticate(limited_admin)
        listed = self.api.get('/api/services/document-definitions/')
        self.assertEqual(listed.status_code, 200)
        self.assertNotIn(definition['id'], [item['id'] for item in listed.data])
        self.assertEqual(self.api.get(f"/api/services/document-definitions/{definition['id']}/").status_code, 404)
        self.assertEqual(self.api.post(f"/api/services/document-instances/{instance['id']}/generate/", {}, format='json').status_code, 404)
        self.assertEqual(self.api.get(f"/api/services/document-attachments/{attachment['id']}/download/").status_code, 404)
