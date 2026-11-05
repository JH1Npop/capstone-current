"""Step 6 (PDF): labels such as "Client Name:" on a text-based PDF get a suggested box after them."""
import io
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from rest_framework.test import APIClient

from services.document_templates import placeholder_catalog
from services.models import DocumentTemplate, ServiceRequest, ServiceTicket, ServiceType
from services.pdf_suggestions import find_pdf_field_suggestions
from users.models import User


def form_pdf(lines=None, scanned=False):
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(612, 792))
    if not scanned:
        pdf.setFont('Helvetica', 12)
        for text, y in (lines or [('Client Name:', 700), ('Ticket Number:', 660), ('Remarks:', 620), ('Client Address: 12 Main St', 580)]):
            pdf.drawString(72, y, text)
    else:
        pdf.rect(72, 600, 300, 100, fill=1)   # a picture-like page: no text at all
    pdf.save()
    return buffer.getvalue()


class PdfDetectionTests(SimpleTestCase):
    allowed = set(placeholder_catalog('quotation_proposal'))

    def test_known_blank_labels_get_a_box_right_after_them(self):
        found = {item['key']: item for item in find_pdf_field_suggestions(form_pdf(), self.allowed)}
        self.assertEqual(set(found), {'client_name', 'ticket_number'})   # Remarks is unknown; Client Address is already filled in
        box = found['client_name']['placement']
        self.assertEqual(found['client_name']['page'], 1)
        self.assertGreater(box['x'], 72 / 612)             # after the label, not on top of it
        self.assertLess(box['x'], 0.5)
        self.assertAlmostEqual(box['y'], (792 - 700 - 12) / 792, delta=0.05)   # on the same line (y measured from the top)
        self.assertLessEqual(box['x'] + box['width'], 1)

    def test_scanned_or_unreadable_pdfs_give_no_suggestions(self):
        self.assertEqual(find_pdf_field_suggestions(form_pdf(scanned=True), self.allowed), [])
        self.assertEqual(find_pdf_field_suggestions(b'%PDF-1.4 garbage', self.allowed), [])


class PlaceFieldsEndpointTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='pdf-admin', password='pass', email='pdf-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='pdf-client', password='pass', role='client', first_name='Jamie', last_name='Customer')
        service = ServiceType.objects.create(name='PDF service', estimated_duration=60, deposit_policy='fixed', deposit_value=Decimal('1000.00'))
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='PDF', status='Approved')
        self.ticket = ServiceTicket.objects.create(request=request_obj, status='Ready for Service', scheduled_date=timezone.localdate())
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.template = DocumentTemplate.objects.get(definition__code='quotation_proposal', is_default=True)

    def upload(self, data=None):
        upload = SimpleUploadedFile('form.pdf', data or form_pdf(), content_type='application/pdf')
        response = self.api.post('/api/services/document-template-versions/', {'template': self.template.id, 'file': upload}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_offer_place_use_and_generate_a_filled_pdf(self):
        version = self.upload()
        offer = next(item for item in version['checklist'] if item.get('action') == 'place_fields')
        self.assertEqual(sorted(offer['names']), ['Client Name', 'Ticket Number'])
        url = f"/api/services/document-template-versions/{version['id']}/place-fields/"
        placed = self.api.post(url, {'names': offer['names']}, format='json')
        self.assertEqual(placed.status_code, 200, placed.data)
        self.assertEqual(sorted(placed.data['placed_fields']), ['client_name', 'ticket_number'])
        self.assertEqual(placed.data['readiness_status'], 'ready_auto')
        self.assertFalse(any(item.get('action') == 'place_fields' for item in placed.data['checklist']))   # nothing left to offer

        used = self.api.post(f"/api/services/document-template-versions/{version['id']}/use-design/")
        self.assertEqual(used.status_code, 200, used.data)
        response = self.api.post(f'/api/services/service-tickets/{self.ticket.id}/generate-document/', {'document_type': 'quotation_proposal'}, format='json')
        self.assertEqual(response.status_code, 200)
        text = PdfReader(io.BytesIO(b''.join(response.streaming_content))).pages[0].extract_text()
        self.assertIn('Client Name:', text)
        self.assertIn('Jamie Customer', text)

    def test_only_offered_labels_on_a_draft_pdf_and_nothing_for_a_scanned_page(self):
        version = self.upload()
        url = f"/api/services/document-template-versions/{version['id']}/place-fields/"
        self.assertEqual(self.api.post(url, {'names': ['Remarks']}, format='json').status_code, 400)
        self.assertEqual(self.api.post(url, {'names': []}, format='json').status_code, 400)
        scanned = self.upload(form_pdf(scanned=True))
        self.assertFalse(any(item.get('action') == 'place_fields' for item in scanned['checklist']))

    def test_a_client_account_cannot_place_fields(self):
        version = self.upload()
        outsider = APIClient()
        outsider.force_authenticate(self.client_user)
        response = outsider.post(f"/api/services/document-template-versions/{version['id']}/place-fields/", {'names': ['Client Name']}, format='json')
        self.assertIn(response.status_code, {403, 404})
