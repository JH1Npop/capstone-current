"""Step 5: replacing a built-in document's design never changes the data or the money rules behind it."""
import hashlib
import io
import xml.etree.ElementTree as ET
from decimal import Decimal
from zipfile import ZIP_DEFLATED, ZipFile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.deposits import ticket_deposit_gate
from services.models import DocumentOutput, DocumentTemplate, GeneratedDocument, QuotationRecord, ServiceRequest, ServiceTicket, ServiceType
from users.models import User

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'


def paragraph(text):
    return f'<w:p><w:r><w:t>{text}</w:t></w:r></w:p>'


def loop_table(key, *cells):
    """A Word table whose middle row repeats: the way staff build repeating rows in Word."""
    row = ''.join(f'<w:tc>{paragraph(cell)}</w:tc>' for cell in cells)
    return (
        '<w:tbl>'
        f'<w:tr><w:tc>{paragraph("{{#" + key + "}}")}</w:tc></w:tr>'
        f'<w:tr>{row}</w:tr>'
        f'<w:tr><w:tc>{paragraph("{{/" + key + "}}")}</w:tc></w:tr>'
        '</w:tbl>'
    )


def docx_file(body_xml, name='design.docx'):
    buffer = io.BytesIO()
    with ZipFile(buffer, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('word/document.xml', f'<w:document {W}><w:body>{body_xml}</w:body></w:document>')
        archive.writestr('word/_rels/document.xml.rels', '<Relationships/>')
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')


def rendered_xml(data):
    with ZipFile(io.BytesIO(data)) as archive:
        return archive.read('word/document.xml').decode('utf-8')


class ReplacedDesignIntegrityTests(TestCase):
    QUOTE_DESIGN = (
        paragraph('Quotation for [Client Name] / {{quotation_number}} / Ticket [Ticket Number]')
        + loop_table('price_rows', '{{description}}', '{{unit}}', '{{total_price}}')
        + loop_table('bom_rows', '{{item_no}}', '{{description}}', '{{qty}}', '{{amount}}')
    )

    def setUp(self):
        self.admin = User.objects.create_superuser(username='integrity-admin', password='pass', email='integrity-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='integrity-client', password='pass', role='client', first_name='Jamie', last_name='Customer')
        service = ServiceType.objects.create(name='Integrity service', estimated_duration=60, deposit_policy='fixed', deposit_value=Decimal('5000.00'))
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='Integrity', status='Approved')
        self.ticket = ServiceTicket.objects.create(request=request_obj, status='Ready for Service', scheduled_date=timezone.localdate())
        self.quotation = QuotationRecord.objects.create(
            ticket=self.ticket, client=self.client_user, quotation_number='QUO-INT-001', total_amount='PHP 20,000.00',
            deposit_policy='fixed', deposit_value=Decimal('5000.00'), required_deposit_amount=Decimal('5000.00'), status='Accepted',
        )
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def use_design(self, code, body_xml):
        template = DocumentTemplate.objects.get(definition__code=code, is_default=True)
        created = self.api.post('/api/services/document-template-versions/', {'template': template.id, 'file': docx_file(body_xml)}, format='multipart')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual([i for i in created.data['checklist'] if i['status'] == 'problem'], [], created.data['checklist'])
        used = self.api.post(f"/api/services/document-template-versions/{created.data['id']}/use-design/")
        self.assertEqual(used.status_code, 200, used.data)
        return created.data['id']

    def generate(self, code):
        response = self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': code}, format='json')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        return b''.join(response.streaming_content)

    def save_draft(self, code, data):
        GeneratedDocument.objects.create(ticket=self.ticket, document_type=code, data_json=data, status='draft')

    def test_quotation_with_a_replaced_design_keeps_every_row_and_never_touches_money(self):
        price_rows = [{'description': f'Package {i}', 'unit': '1 lot', 'totalPrice': f'PHP {i},000.00'} for i in range(1, 4)]
        bom_rows = [{'itemNo': i, 'description': f'Panel model P-{i:03d}', 'unit': 'pc', 'qty': i, 'unitPrice': '100.00', 'amount': f'{i * 100}.00'} for i in range(1, 41)]
        self.save_draft('quotation_proposal', {'priceRows': price_rows, 'bomRows': bom_rows})
        gate_before = ticket_deposit_gate(self.ticket)
        self.use_design('quotation_proposal', self.QUOTE_DESIGN)

        xml = rendered_xml(self.generate('quotation_proposal'))
        ET.fromstring(xml)
        self.assertIn('Quotation for Jamie Customer', xml)
        for i in range(1, 41):
            self.assertIn(f'Panel model P-{i:03d}', xml)
        for row in price_rows:
            self.assertIn(row['totalPrice'], xml)
        self.assertEqual(xml.count('Package '), 3)
        self.assertNotIn('{{', xml)
        self.assertNotIn('[Client Name]', xml)

        self.quotation.refresh_from_db()
        self.assertEqual((self.quotation.total_amount, self.quotation.required_deposit_amount, self.quotation.status), ('PHP 20,000.00', Decimal('5000.00'), 'Accepted'))
        self.assertEqual(ticket_deposit_gate(self.ticket), gate_before)

        output = DocumentOutput.objects.get(status='ready')
        self.assertEqual(len(output.source_snapshot['bom_rows']), 40)
        self.assertEqual([r['total_price'] for r in output.source_snapshot['price_rows']], [r['totalPrice'] for r in price_rows])
        self.assertEqual(output.source_snapshot['quotation_number'], 'QUO-INT-001')

    def test_old_output_is_untouched_by_a_new_design_and_rollback_restores_the_old_one(self):
        first_version = self.use_design('quotation_proposal', self.QUOTE_DESIGN.replace('Quotation for', 'First design for'))
        self.generate('quotation_proposal')
        first = DocumentOutput.objects.get(status='ready')
        first.file.open('rb')
        first_hash = hashlib.sha256(first.file.read()).hexdigest()
        first.file.close()

        second_version = self.use_design('quotation_proposal', self.QUOTE_DESIGN.replace('Quotation for', 'Second design for'))
        self.assertNotEqual(first_version, second_version)
        self.assertIn('Second design for', rendered_xml(self.generate('quotation_proposal')))

        first.refresh_from_db()
        first.file.open('rb')
        self.assertEqual(hashlib.sha256(first.file.read()).hexdigest(), first_hash)
        first.file.close()
        self.assertEqual(first.template_version_id, first_version)

        rolled = self.api.post(f'/api/services/document-template-versions/{first_version}/rollback/')
        self.assertEqual(rolled.status_code, 200, rolled.data)
        self.assertIn('First design for', rendered_xml(self.generate('quotation_proposal')))

    def test_field_service_report_with_many_rows_prints_every_row(self):
        rows = [{'brandModel': f'Unit {i}', 'serialNumber': f'SN-{i:04d}', 'recommendation': f'Check {i}'} for i in range(1, 61)]
        self.save_draft('field_service_report', {'rows': rows})
        body = (
            paragraph('Report for [Client Name], ticket [Ticket Number], service {{service_type}}')
            + loop_table('service_rows', '{{brand_model}}', '{{serial_number}}', '{{recommendation}}')
        )
        self.use_design('field_service_report', body)
        xml = rendered_xml(self.generate('field_service_report'))
        ET.fromstring(xml)
        for i in range(1, 61):
            self.assertIn(f'SN-{i:04d}', xml)
        self.assertEqual(xml.count('<w:tbl>'), 1)
        self.assertEqual(xml.count('<w:tr>'), 60)
        self.assertIn('Report for Jamie Customer', xml)

    def test_long_multi_page_contract_keeps_all_of_its_text(self):
        clauses = ' '.join(f'Clause {i}: the contractor shall complete stage {i} of the installation.' for i in range(1, 401))
        self.save_draft('installation_contract', {'scopeNotes': clauses, 'totalContractAmount': 'PHP 1,250,000.00'})
        body = paragraph('Contract with [Client Name]') + paragraph('{{scope_of_work}}') + ''.join(paragraph(f'Page filler {i}') for i in range(120)) + paragraph('Total {{total_contract_amount}}')
        self.use_design('installation_contract', body)
        xml = rendered_xml(self.generate('installation_contract'))
        ET.fromstring(xml)
        self.assertIn('Clause 1:', xml)
        self.assertIn('Clause 400:', xml)
        self.assertIn('Page filler 119', xml)
        self.assertIn('Total PHP 1,250,000.00', xml)
        self.assertIn('Contract with Jamie Customer', xml)

    def test_a_design_that_cannot_be_used_leaves_the_previous_design_in_use(self):
        good = self.use_design('quotation_proposal', self.QUOTE_DESIGN)
        template = DocumentTemplate.objects.get(definition__code='quotation_proposal', is_default=True)
        broken = self.api.post('/api/services/document-template-versions/', {'template': template.id, 'file': docx_file(paragraph('[Client Name] only'))}, format='multipart')
        self.assertEqual(broken.status_code, 201)
        refused = self.api.post(f"/api/services/document-template-versions/{broken.data['id']}/use-design/")
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(template.versions.get(publication_status='active').id, good)
        self.assertIn('Quotation for Jamie Customer', rendered_xml(self.generate('quotation_proposal')))
