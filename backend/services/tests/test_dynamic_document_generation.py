import io
from decimal import Decimal
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient

from services.deposits import ticket_deposit_gate
from services.document_templates import COLLECTION_PLACEHOLDERS, required_activation_components
from services.dynamic_document_generation import generate_archived_document, render_template_bytes
from services.models import DocumentOutput, DocumentTemplate, QuotationRecord, ServiceRequest, ServiceTicket, ServiceType
from services.tests.test_document_template_infrastructure import docx_upload
from users.models import User


def required_docx_body(code, extra=''):
    scalars = []
    loops = []
    for key in required_activation_components(code, 'docx'):
        if key in COLLECTION_PLACEHOLDERS:
            loops.append(
                f'</w:t></w:r></w:p><w:p><w:r><w:t>{{{{#{key}}}}}</w:t></w:r></w:p>'
                f'<w:p><w:r><w:t>{{{{/{key}}}}}</w:t></w:r></w:p><w:p><w:r><w:t>'
            )
        else:
            scalars.append(f'{{{{{key}}}}}')
    return ''.join(scalars) + extra + ''.join(loops)


class DynamicDocumentGenerationTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='generation-admin', password='pass', role='superadmin')
        self.client_user = User.objects.create_user(username='generation-client', password='pass', role='client', first_name='Jamie', last_name='Customer')
        service = ServiceType.objects.create(name='Generation service', estimated_duration=60, deposit_policy='fixed', deposit_value=Decimal('5000.00'))
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='Generate', status='Approved')
        self.ticket = ServiceTicket.objects.create(request=request_obj, status='Ready for Service', scheduled_date=timezone.localdate())
        self.quotation = QuotationRecord.objects.create(ticket=self.ticket, client=self.client_user, quotation_number='QUO-GEN-001', total_amount='PHP 20,000.00', deposit_policy='fixed', deposit_value=Decimal('5000.00'), required_deposit_amount=Decimal('5000.00'), status='Accepted')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def upload_and_activate(self):
        template = DocumentTemplate.objects.get(definition__code='quotation_proposal', is_default=True)
        upload = docx_upload(body=required_docx_body('quotation_proposal', ' / Quote: {{quotation_number}}'))
        created = self.api.post('/api/services/document-template-versions/', {'template': template.id, 'file': upload}, format='multipart')
        self.assertEqual(created.status_code, 201, created.data)
        activated = self.api.post(f"/api/services/document-template-versions/{created.data['id']}/activate/")
        self.assertEqual(activated.status_code, 200, activated.data)
        return created.data['id']

    @staticmethod
    def pdf_upload(name='quotation-layout.pdf'):
        buffer = io.BytesIO()
        document = canvas.Canvas(buffer, pagesize=(612, 792))
        document.drawString(36, 756, 'AFN quotation')
        document.save()
        return SimpleUploadedFile(name, buffer.getvalue(), content_type='application/pdf')

    def upload_pdf_with_field(self, *, fill_method='system', required=True):
        template = DocumentTemplate.objects.get(definition__code='quotation_proposal', is_default=True)
        created = self.api.post(
            '/api/services/document-template-versions/',
            {'template': template.id, 'file': self.pdf_upload()},
            format='multipart',
        )
        self.assertEqual(created.status_code, 201, created.data)
        field = self.api.post(
            '/api/services/document-template-fields/',
            {
                'template_version': created.data['id'],
                'field_key': 'client_name' if fill_method == 'system' else 'approval_note',
                'label': 'Client name' if fill_method == 'system' else 'Approval note',
                'field_type': 'text',
                'fill_method': fill_method,
                'source_key': 'client_name' if fill_method == 'system' else '',
                'is_required': required,
                'page_number': 1,
                'placement': {'x': 0.08, 'y': 0.18, 'width': 0.5, 'height': 0.06},
            },
            format='json',
        )
        self.assertEqual(field.status_code, 201, field.data)
        if fill_method == 'manual':
            system_field = self.api.post(
                '/api/services/document-template-fields/',
                {
                    'template_version': created.data['id'],
                    'field_key': 'client_name',
                    'label': 'Client name',
                    'field_type': 'text',
                    'fill_method': 'system',
                    'source_key': 'client_name',
                    'page_number': 1,
                    'placement': {'x': 0.08, 'y': 0.28, 'width': 0.5, 'height': 0.06},
                },
                format='json',
            )
            self.assertEqual(system_field.status_code, 201, system_field.data)
        activated = self.api.post(f"/api/services/document-template-versions/{created.data['id']}/activate/")
        self.assertEqual(activated.status_code, 200, activated.data)
        return created.data['id']

    @staticmethod
    def response_bytes(response):
        return b''.join(response.streaming_content)

    def test_active_template_generates_and_archives_exact_provenance(self):
        version_id = self.upload_and_activate()
        gate_before = ticket_deposit_gate(self.ticket)
        response = self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': 'quotation_proposal'}, format='json')
        self.assertEqual(response.status_code, 200)
        downloaded = self.response_bytes(response)
        with ZipFile(io.BytesIO(downloaded)) as archive:
            xml = archive.read('word/document.xml')
        self.assertIn(b'Jamie Customer', xml)
        self.assertIn(b'QUO-GEN-001', xml)
        self.assertNotIn(b'{{', xml)

        output = DocumentOutput.objects.get()
        self.assertEqual(output.template_version_id, version_id)
        self.assertEqual(output.renderer_source, 'dynamic')
        self.assertEqual(output.source_snapshot['quotation_number'], 'QUO-GEN-001')
        self.assertEqual(output.file_size, len(downloaded))
        self.assertEqual(len(output.sha256), 64)
        self.quotation.refresh_from_db()
        self.assertEqual(self.quotation.status, 'Accepted')
        self.assertEqual(self.quotation.total_amount, 'PHP 20,000.00')
        self.assertEqual(ticket_deposit_gate(self.ticket), gate_before)

    def test_active_core_pdf_template_replaces_visual_output_and_archives_provenance(self):
        version_id = self.upload_pdf_with_field()
        gate_before = ticket_deposit_gate(self.ticket)

        response = self.api.post(
            f'/api/services/service-tickets/{self.ticket.id}/generate-document/',
            {'document_type': 'quotation_proposal'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Content-Type'], 'application/pdf')
        downloaded = self.response_bytes(response)
        self.assertTrue(downloaded.startswith(b'%PDF'))
        extracted = '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(downloaded)).pages)
        self.assertIn('Jamie Customer', extracted)
        output = DocumentOutput.objects.get()
        self.assertEqual(output.template_version_id, version_id)
        self.assertEqual(output.output_format, 'pdf')
        self.assertEqual(output.renderer_source, 'dynamic')
        self.assertEqual(output.source_snapshot['configured_field_values']['client_name'], 'Jamie Customer')
        self.assertEqual(ticket_deposit_gate(self.ticket), gate_before)

    def test_core_pdf_with_required_manual_field_returns_validation_error(self):
        self.upload_pdf_with_field(fill_method='manual')

        response = self.api.post(
            f'/api/services/service-tickets/{self.ticket.id}/generate-document/',
            {'document_type': 'quotation_proposal'},
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('approval_note', str(response.data))
        failed = DocumentOutput.objects.get()
        self.assertEqual(failed.status, 'failed')
        self.assertEqual(failed.output_format, 'pdf')

    def test_no_active_version_uses_legacy_fallback_and_still_archives(self):
        response = self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': 'technical_data_sheet'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.response_bytes(response)
        output = DocumentOutput.objects.get()
        self.assertEqual(output.renderer_source, 'legacy')
        self.assertIsNone(output.template_version_id)
        self.assertTrue(output.file.name)

    def test_test_render_does_not_create_historical_output(self):
        version_id = self.upload_and_activate()
        response = self.api.post(f'/api/services/document-template-versions/{version_id}/test-render/', {'ticket_id': self.ticket.id}, format='json')
        self.assertEqual(response.status_code, 200)
        rendered = self.response_bytes(response)
        self.assertTrue(rendered.startswith(b'PK'))
        self.assertEqual(DocumentOutput.objects.count(), 0)

    def test_configured_pdf_test_render_downloads_sample_without_archiving(self):
        version_id = self.upload_pdf_with_field()
        response = self.api.post(
            f'/api/services/document-template-versions/{version_id}/test-render/',
            {'ticket_id': self.ticket.id},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data if hasattr(response, 'data') else '')
        self.assertEqual(response.headers['Content-Type'], 'application/pdf')
        rendered = self.response_bytes(response)
        self.assertTrue(rendered.startswith(b'%PDF'))
        extracted = '\n'.join(page.extract_text() or '' for page in PdfReader(io.BytesIO(rendered)).pages)
        self.assertIn('Jamie Customer', extracted)
        self.assertEqual(DocumentOutput.objects.count(), 0)

    def test_all_six_core_types_can_use_their_active_template(self):
        codes = [
            'technical_data_sheet', 'quotation_proposal', 'installation_contract',
            'commissioning_checklist', 'turnover_acceptance', 'field_service_report',
        ]
        for code in codes:
            template = DocumentTemplate.objects.get(definition__code=code, is_default=True)
            created = self.api.post('/api/services/document-template-versions/', {'template': template.id, 'file': docx_upload(name=f'{code}.docx', body=required_docx_body(code, ' Ticket {{ticket_number}}'))}, format='multipart')
            self.assertEqual(created.status_code, 201, created.data)
            self.assertEqual(self.api.post(f"/api/services/document-template-versions/{created.data['id']}/activate/").status_code, 200)
            response = self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': code}, format='json')
            self.assertEqual(response.status_code, 200, code)
            self.response_bytes(response)
        self.assertEqual(DocumentOutput.objects.count(), 6)
        self.assertEqual(DocumentOutput.objects.filter(renderer_source='dynamic', template_version__isnull=False).count(), 6)

    def test_dynamic_render_preserves_layout_parts_and_renders_headers_and_footers(self):
        buffer = io.BytesIO()
        logo = b'\x89PNG\r\n\x1a\nrepresentative-logo'
        styles = b'<w:styles xmlns:w="w"><w:style w:type="paragraph" w:styleId="AFN"/></w:styles>'
        with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('word/document.xml', f'<w:document xmlns:w="w"><w:tbl><w:tr><w:tc><w:p><w:r><w:t>{required_docx_body("quotation_proposal", " Ticket {{ticket_number}}")}</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>')
            archive.writestr('word/header1.xml', '<w:hdr xmlns:w="w"><w:p><w:r><w:t>Client {{client_name}}</w:t></w:r></w:p></w:hdr>')
            archive.writestr('word/footer1.xml', '<w:ftr xmlns:w="w"><w:p><w:r><w:t>{{company_name}}</w:t></w:r></w:p></w:ftr>')
            archive.writestr('word/styles.xml', styles)
            archive.writestr('word/media/logo.png', logo)
            archive.writestr('word/_rels/document.xml.rels', '<Relationships/>')
        upload = SimpleUploadedFile('representative-layout.docx', buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        template = DocumentTemplate.objects.get(definition__code='quotation_proposal', is_default=True)
        created = self.api.post('/api/services/document-template-versions/', {'template': template.id, 'file': upload}, format='multipart')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['validation_status'], 'valid')
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{created.data['id']}/activate/").status_code, 200)

        response = self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': 'quotation_proposal'}, format='json')
        self.assertEqual(response.status_code, 200)
        with ZipFile(io.BytesIO(self.response_bytes(response))) as rendered:
            self.assertIn(b'TKT-', rendered.read('word/document.xml'))
            self.assertIn(b'Jamie Customer', rendered.read('word/header1.xml'))
            self.assertIn(b'AFN Solar Power Engineering Services', rendered.read('word/footer1.xml'))
            self.assertEqual(rendered.read('word/styles.xml'), styles)
            self.assertEqual(rendered.read('word/media/logo.png'), logo)

    def test_word_authored_repeating_rows_and_text_edge_cases_render_safely(self):
        buffer = io.BytesIO()
        document_xml = (
            '<w:document xmlns:w="w"><w:body><w:tbl>'
            '<w:tr><w:tc><w:p><w:r><w:t>{{#bom_rows}}</w:t></w:r></w:p></w:tc></w:tr>'
            '<w:tr><w:tc><w:p><w:r><w:t>{{description}}</w:t></w:r></w:p></w:tc>'
            '<w:tc><w:p><w:r><w:t>{{qty}}</w:t></w:r></w:p></w:tc></w:tr>'
            '<w:tr><w:tc><w:p><w:r><w:t>{{/bom_rows}}</w:t></w:r></w:p></w:tc></w:tr>'
            '</w:tbl><w:p><w:r><w:t>{{optional_note}}</w:t></w:r></w:p>'
            '<w:p><w:r><w:t>{{long_value}}</w:t></w:r></w:p></w:body></w:document>'
        )
        with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('word/document.xml', document_xml)

        rendered_bytes = render_template_bytes(io.BytesIO(buffer.getvalue()), {
            'bom_rows': [
                {'description': 'José & Solar <One>', 'qty': 2},
                {'description': 'Battery – LiFePO₄', 'qty': 1},
            ],
            'long_value': 'x' * 5000,
        })
        with ZipFile(io.BytesIO(rendered_bytes)) as rendered:
            xml = rendered.read('word/document.xml').decode('utf-8')

        self.assertEqual(xml.count('<w:tr>'), 2)
        self.assertIn('José &amp; Solar &lt;One&gt;', xml)
        self.assertIn('Battery – LiFePO₄', xml)
        self.assertIn('x' * 5000, xml)
        self.assertNotIn('optional_note', xml)
        self.assertNotIn('{{', xml)

    def test_client_cannot_download_archived_company_document(self):
        self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': 'technical_data_sheet'}, format='json')
        output = DocumentOutput.objects.get()
        self.api.force_authenticate(self.client_user)
        response = self.api.get(f'/api/services/document-outputs/{output.id}/download/')
        self.assertEqual(response.status_code, 403)

    def test_generation_failure_keeps_active_version_and_retry_creates_clean_output(self):
        version_id = self.upload_and_activate()

        with patch('services.dynamic_document_generation.render_template_bytes', side_effect=RuntimeError('simulated renderer failure')):
            with self.assertRaisesRegex(RuntimeError, 'simulated renderer failure'):
                generate_archived_document(self.ticket, 'quotation_proposal', generated_by=self.admin)

        failed = DocumentOutput.objects.get(status='failed')
        self.assertEqual(failed.template_version_id, version_id)
        self.assertFalse(failed.file)
        self.assertEqual(failed.error_summary, 'simulated renderer failure')
        self.assertEqual(failed.template_version.publication_status, 'active')

        ready = generate_archived_document(self.ticket, 'quotation_proposal', generated_by=self.admin)
        self.assertEqual(ready.status, 'ready')
        self.assertEqual(ready.template_version_id, version_id)
        self.assertTrue(ready.file)
        self.assertEqual(DocumentOutput.objects.filter(status='failed').count(), 1)
        self.assertEqual(DocumentOutput.objects.filter(status='ready').count(), 1)
