"""Step 6 (Word): blanks such as "Client Name: ______" in a finished design are offered as fields."""
import io
from zipfile import ZipFile

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from services.blank_suggestions import apply_blank_suggestions, find_blank_suggestions
from services.document_templates import placeholder_catalog
from services.models import DocumentTemplate
from services.tests.test_replaced_design_integrity import docx_file, loop_table, paragraph
from users.models import User


def run(text):
    return f'<w:r><w:t>{text}</w:t></w:r>'


class BlankDetectionTests(SimpleTestCase):
    allowed = set(placeholder_catalog('quotation_proposal'))

    def test_labels_with_blank_lines_or_nothing_after_them_are_offered(self):
        xml = paragraph('Client Name: ____________') + paragraph('Ticket Number:') + paragraph('Customer: ........')
        found = {item['label']: item['key'] for item in find_blank_suggestions(xml, self.allowed)}
        self.assertEqual(found, {'Client Name': 'client_name', 'Ticket Number': 'ticket_number', 'Customer': 'client_name'})

    def test_ordinary_text_and_unknown_labels_are_left_alone(self):
        xml = (
            paragraph('Note: please read the terms') + paragraph('Favourite colour: ______') + paragraph('Client Name: Alex')
            + paragraph('Already [Client Name]') + paragraph('{{client_name}}')
        )
        self.assertEqual(find_blank_suggestions(xml, self.allowed), [])

    def test_blank_split_across_runs_is_replaced_cleanly(self):
        xml = '<w:p>' + run('Client Name') + run(': ') + run('____') + run('____') + run('</w:t></w:r><w:r><w:t>x') .replace('</w:t></w:r><w:r><w:t>x', '') + '</w:p>'
        data = io.BytesIO()
        from zipfile import ZIP_DEFLATED
        with ZipFile(data, 'w', ZIP_DEFLATED) as archive:
            archive.writestr('[Content_Types].xml', '<Types/>')
            archive.writestr('word/document.xml', '<w:document xmlns:w="w"><w:body>' + xml + '</w:body></w:document>')
        new_bytes, applied = apply_blank_suggestions(data.getvalue(), self.allowed, ['Client Name'])
        self.assertEqual(applied, ['Client Name'])
        with ZipFile(io.BytesIO(new_bytes)) as archive:
            out = archive.read('word/document.xml').decode('utf-8')
        self.assertIn('[Client Name]', out)
        self.assertNotIn('_', out)
        self.assertTrue(out.count('<w:p>') == out.count('</w:p>') == 1)


class FillBlanksEndpointTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='blank-admin', password='pass', email='blank-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='blank-client', password='pass', role='client')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        self.template = DocumentTemplate.objects.get(definition__code='quotation_proposal', is_default=True)

    BODY = (
        paragraph('Client Name: ______________') + paragraph('Ticket Number:') + paragraph('Free text: ____')
        + loop_table('price_rows', '{{description}}') + loop_table('bom_rows', '{{description}}')
    )

    def upload(self, body=None):
        response = self.api.post('/api/services/document-template-versions/', {'template': self.template.id, 'file': docx_file(body or self.BODY)}, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_checklist_offers_the_blanks_and_filling_them_makes_a_new_valid_version(self):
        original = self.upload()
        self.assertIn('Client name: not found', [i['label'] for i in original['checklist'] if i['status'] == 'problem'])   # no field is connected yet
        offer = next(item for item in original['checklist'] if item.get('action') == 'fill_blanks')
        self.assertEqual(sorted(offer['names']), ['Client Name', 'Ticket Number'])

        filled = self.api.post(f"/api/services/document-template-versions/{original['id']}/fill-blanks/", {'names': offer['names']}, format='json')
        self.assertEqual(filled.status_code, 201, filled.data)
        self.assertNotEqual(filled.data['id'], original['id'])
        self.assertEqual(filled.data['validation_status'], 'valid')
        self.assertEqual([i for i in filled.data['checklist'] if i['status'] == 'problem'], [])
        self.assertEqual(sorted(filled.data['placeholder_manifest']['plain_names']), ['Client Name', 'Ticket Number'])
        self.assertIn('Filled blanks', filled.data['change_notes'])

        # The uploaded file itself was not edited.
        again = self.api.get(f"/api/services/document-template-versions/{original['id']}/").data
        self.assertEqual(again['sha256'], original['sha256'])
        used = self.api.post(f"/api/services/document-template-versions/{filled.data['id']}/use-design/")
        self.assertEqual(used.status_code, 200, used.data)

    def test_only_offered_blanks_are_accepted_and_only_for_drafts(self):
        original = self.upload()
        url = f"/api/services/document-template-versions/{original['id']}/fill-blanks/"
        self.assertEqual(self.api.post(url, {'names': ['Free text']}, format='json').status_code, 400)
        self.assertEqual(self.api.post(url, {'names': []}, format='json').status_code, 400)
        good = self.api.post(url, {'names': ['Client Name']}, format='json')
        self.assertEqual(good.status_code, 201)
        self.api.post(f"/api/services/document-template-versions/{good.data['id']}/use-design/")
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{good.data['id']}/fill-blanks/", {'names': ['Client Name']}, format='json').status_code, 409)

    def test_a_client_account_cannot_fill_blanks(self):
        original = self.upload()
        outsider = APIClient()
        outsider.force_authenticate(self.client_user)
        response = outsider.post(f"/api/services/document-template-versions/{original['id']}/fill-blanks/", {'names': ['Client Name']}, format='json')
        self.assertIn(response.status_code, {403, 404})
