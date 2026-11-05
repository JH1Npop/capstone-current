"""Plain-name fields: "[Client Name]" works like "{{ client_name }}" in uploaded Word designs."""
import io
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.document_templates import (
    convert_plain_names,
    looks_like_field_name,
    placeholder_catalog,
    plain_key,
    resolve_plain_name,
)
from services.models import DocumentTemplate, DocumentTemplateVersion, ServiceRequest, ServiceTicket, ServiceType
from services.tests.test_document_template_infrastructure import docx_upload
from users.models import User

QUOTATION_ROWS = '{{#price_rows}}{{/price_rows}}{{#bom_rows}}{{/bom_rows}}'


class PlainNameHelperTests(TestCase):
    def test_plain_key_matches_the_technical_placeholder_key(self):
        self.assertEqual(plain_key('Client Name'), 'client_name')
        self.assertEqual(plain_key('  Ticket-No. '), 'ticket_no')

    def test_names_resolve_to_approved_fields_for_the_document(self):
        quotation = set(placeholder_catalog('quotation_proposal'))
        self.assertEqual(resolve_plain_name('Client Name', quotation), 'client_name')
        self.assertEqual(resolve_plain_name('customer', quotation), 'client_name')
        self.assertEqual(resolve_plain_name('Ticket Number', quotation), 'ticket_number')
        self.assertEqual(resolve_plain_name('Date', quotation), 'quotation_date')
        report = set(placeholder_catalog('field_service_report'))
        self.assertEqual(resolve_plain_name('Date', report), 'service_date')

    def test_unknown_names_and_repeating_sections_are_not_plain_fields(self):
        quotation = set(placeholder_catalog('quotation_proposal'))
        self.assertIsNone(resolve_plain_name('Site Name', quotation))
        self.assertIsNone(resolve_plain_name('Price Rows', quotation))   # repeating sections need their own markers
        self.assertIsNone(resolve_plain_name('Equipment List', quotation))

    def test_ordinary_bracketed_words_are_not_suggested_as_fields(self):
        self.assertFalse(looks_like_field_name('Signature'))
        self.assertFalse(looks_like_field_name('N/A'))
        self.assertFalse(looks_like_field_name('1'))
        self.assertTrue(looks_like_field_name('Site Name'))


class ConvertPlainNamesTests(SimpleTestCase):
    ALLOWED = {'client_name', 'ticket_number', 'price_rows'}

    @staticmethod
    def wrap(inner):
        return f'<w:document xmlns:w="w"><w:body>{inner}</w:body></w:document>'

    def test_known_name_in_one_run_becomes_the_technical_placeholder(self):
        xml, found = convert_plain_names(self.wrap('<w:p><w:r><w:t>Dear [Client Name],</w:t></w:r></w:p>'), self.ALLOWED)
        self.assertIn('Dear {{client_name}},', xml)
        self.assertEqual(found, {'Client Name': 'client_name'})

    def test_name_split_across_word_runs_is_joined_and_the_xml_stays_valid(self):
        source = self.wrap('<w:p><w:r><w:t>Hi [Client</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t> Name]</w:t></w:r></w:p>')
        xml, found = convert_plain_names(source, self.ALLOWED)
        self.assertIn('{{client_name}}', xml)
        self.assertEqual(found, {'Client Name': 'client_name'})
        ET.fromstring(xml)   # still well-formed Word XML

    def test_unknown_numbers_and_signature_brackets_are_left_exactly_as_typed(self):
        source = self.wrap('<w:p><w:r><w:t>[Signature] [1] [Site Name] [Price Rows]</w:t></w:r></w:p>')
        xml, found = convert_plain_names(source, self.ALLOWED)
        self.assertEqual(xml, source)
        self.assertEqual(found, {})

    def test_a_bracket_never_joins_text_from_different_paragraphs(self):
        source = self.wrap('<w:p><w:r><w:t>[Client</w:t></w:r></w:p><w:p><w:r><w:t>Name]</w:t></w:r></w:p>')
        xml, found = convert_plain_names(source, self.ALLOWED)
        self.assertEqual(xml, source)
        self.assertEqual(found, {})


class PlainNameTemplateTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='plain-admin', password='pass', email='plain-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='plain-client', password='pass', role='client', first_name='Alex', last_name='Rivera')
        service = ServiceType.objects.create(name='Plain name service', estimated_duration=60)
        request_obj = ServiceRequest.objects.create(client=self.client_user, service_type=service, description='Plain name test', status='Approved')
        self.ticket = ServiceTicket.objects.create(request=request_obj, status='Ready for Service', scheduled_date=timezone.localdate())
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    @staticmethod
    def response_bytes(response):
        return b''.join(response.streaming_content)

    def core_template(self, code='quotation_proposal'):
        return DocumentTemplate.objects.get(definition__code=code, name='Standard')

    def upload_core(self, body, code='quotation_proposal'):
        return self.api.post('/api/services/document-template-versions/', {
            'template': self.core_template(code).id, 'file': docx_upload(body=body),
        }, format='multipart')

    def custom_definition_with_design(self, body):
        definition = self.api.post('/api/services/document-definitions/', {
            'name': 'Site Certificate', 'description': 'Made with plain names.', 'data_source': 'ticket', 'display_order': 101,
        }, format='json')
        self.assertEqual(definition.status_code, 201, definition.data)
        design = self.api.post('/api/services/document-templates/', {'definition': definition.data['id'], 'name': 'Standard', 'is_default': True}, format='json')
        self.assertEqual(design.status_code, 201, design.data)
        version = self.api.post('/api/services/document-template-versions/', {
            'template': design.data['id'], 'file': docx_upload(body=body),
        }, format='multipart')
        self.assertEqual(version.status_code, 201, version.data)
        return definition.data, version.data

    def test_core_design_written_with_plain_names_is_valid_and_can_be_activated(self):
        response = self.upload_core('Prepared for [Customer] ' + QUOTATION_ROWS)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['validation_status'], 'valid')
        manifest = response.data['placeholder_manifest']
        self.assertIn('client_name', manifest['placeholders'])
        self.assertEqual(manifest['plain_names'], {'Customer': 'client_name'})
        self.assertEqual(response.data['activation_missing_components'], [])
        activation = self.api.post(f"/api/services/document-template-versions/{response.data['id']}/activate/")
        self.assertEqual(activation.status_code, 200, activation.data)

    def test_core_design_with_only_unknown_names_still_reports_the_missing_component(self):
        response = self.upload_core('Prepared for [Buyer Person] ' + QUOTATION_ROWS)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['validation_status'], 'valid')
        self.assertIn('client_name', response.data['activation_missing_components'])
        warnings = response.data['validation_report']['warnings']
        self.assertEqual(warnings[0]['code'], 'possible_fields')
        self.assertIn('Buyer Person', warnings[0]['items'])

    def test_core_documents_cannot_gain_fields_from_a_design(self):
        response = self.upload_core('[Client Name] [Site Name] ' + QUOTATION_ROWS)
        denied = self.api.post(f"/api/services/document-template-versions/{response.data['id']}/accept-fields/", {'names': ['Site Name']}, format='json')
        self.assertEqual(denied.status_code, 409)

    def test_custom_design_with_new_names_is_checked_again_after_one_click_field_setup(self):
        definition, version = self.custom_definition_with_design('Certificate for [Client Name]. Note: [Site Note].')
        # First upload: [Client Name] is known; [Site Note] is only suggested, not an error.
        self.assertEqual(version['validation_status'], 'valid')
        self.assertEqual(version['placeholder_manifest']['possible_fields'], ['Site Note'])
        accepted = self.api.post(f"/api/services/document-template-versions/{version['id']}/accept-fields/", {'names': ['Site Note']}, format='json')
        self.assertEqual(accepted.status_code, 200, accepted.data)
        self.assertEqual(accepted.data['created_fields'], ['site_note'])
        self.assertEqual(accepted.data['placeholder_manifest']['possible_fields'], [])
        self.assertIn('site_note', accepted.data['placeholder_manifest']['plain_names'].values())
        self.assertEqual(accepted.data['validation_status'], 'valid')
        # The new field exists on the document and asking again does not create it twice.
        again = self.api.post(f"/api/services/document-template-versions/{version['id']}/accept-fields/", {'names': ['Site Note']}, format='json')
        self.assertEqual(again.status_code, 400)   # no longer a suggestion: it is a registered field now

    def test_accept_fields_only_accepts_names_found_in_the_design(self):
        _definition, version = self.custom_definition_with_design('Certificate for [Client Name]. Note: [Site Note].')
        response = self.api.post(f"/api/services/document-template-versions/{version['id']}/accept-fields/", {'names': ['Not In File']}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(DocumentTemplateVersion.objects.get(pk=version['id']).template.definition.field_definitions.exists())

    def test_revalidate_refreshes_a_design_uploaded_before_its_field_existed(self):
        definition, version = self.custom_definition_with_design('Certificate: {{certificate_note}}')
        self.assertEqual(version['validation_status'], 'invalid')   # certificate_note was not registered yet
        field = self.api.post('/api/services/document-field-definitions/', {
            'definition': definition['id'], 'field_key': 'certificate_note', 'label': 'Certificate note', 'field_type': 'text',
        }, format='json')
        self.assertEqual(field.status_code, 201, field.data)
        checked = self.api.post(f"/api/services/document-template-versions/{version['id']}/revalidate/")
        self.assertEqual(checked.status_code, 200, checked.data)
        self.assertEqual(checked.data['validation_status'], 'valid')

    def test_revalidate_is_refused_for_an_active_design(self):
        response = self.upload_core('[Client Name] ' + QUOTATION_ROWS)
        self.api.post(f"/api/services/document-template-versions/{response.data['id']}/activate/")
        refused = self.api.post(f"/api/services/document-template-versions/{response.data['id']}/revalidate/")
        self.assertEqual(refused.status_code, 409)

    def test_generated_word_file_fills_plain_names_like_technical_placeholders(self):
        definition, version = self.custom_definition_with_design('Certificate for [Client Name] ({{ticket_number}}). Note: [Site Note].')
        self.api.post(f"/api/services/document-template-versions/{version['id']}/accept-fields/", {'names': ['Site Note']}, format='json')
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{version['id']}/activate/").status_code, 200)
        enabled = self.api.patch(f"/api/services/document-definitions/{definition['id']}/", {'is_active': True}, format='json')
        self.assertEqual(enabled.status_code, 200, enabled.data)
        instance = self.api.post('/api/services/document-instances/', {
            'definition': definition['id'], 'ticket': self.ticket.id, 'selected_template_version': version['id'],
            'custom_field_values': {'site_note': 'Roof access confirmed'},
        }, format='json')
        self.assertEqual(instance.status_code, 201, instance.data)
        generated = self.api.post(f"/api/services/document-instances/{instance.data['id']}/generate/", {}, format='json')
        self.assertEqual(generated.status_code, 200, getattr(generated, 'data', ''))
        with ZipFile(io.BytesIO(self.response_bytes(generated))) as archive:
            text = archive.read('word/document.xml').decode('utf-8')
        self.assertIn('Alex Rivera', text)
        self.assertIn('Roof access confirmed', text)
        self.assertNotIn('[Client Name]', text)
        self.assertNotIn('[Site Note]', text)
        self.assertNotIn('{{', text)


class DesignChecklistAndUseDesignTests(PlainNameTemplateTests):
    """The plain checklist and the one-click "Use this design" (subclass reuses the fixtures and helpers)."""

    def labels(self, version_data, status):
        return [item['label'] for item in version_data['checklist'] if item['status'] == status]

    def test_core_checklist_lists_found_and_missing_items_in_plain_words(self):
        good = self.upload_core('[Client Name] ' + QUOTATION_ROWS)
        self.assertEqual(self.labels(good.data, 'problem'), [])
        self.assertIn('Client name: found', self.labels(good.data, 'ok'))
        self.assertIn('Price table: found', self.labels(good.data, 'ok'))
        bad = self.upload_core('[Client Name] Nothing else here')
        problems = self.labels(bad.data, 'problem')
        self.assertIn('Price table: not found', problems)
        self.assertIn('Equipment and materials table: not found', problems)
        hint = next(item['hint'] for item in bad.data['checklist'] if item['label'] == 'Price table: not found')
        self.assertIn('Keep the price table', hint)

    def test_unknown_field_names_are_reported_without_technical_codes(self):
        response = self.upload_core('{{buyer_person}} {{client_name}} ' + QUOTATION_ROWS)
        problem = next(item for item in response.data['checklist'] if item['status'] == 'problem')
        self.assertEqual(problem['label'], 'Some field names are not recognised')
        self.assertIn('buyer_person', problem['detail'])
        self.assertNotIn('unknown_placeholders', str(response.data['checklist']))

    def test_custom_checklist_offers_one_click_field_setup(self):
        _definition, version = self.custom_definition_with_design('[Client Name] [Site Note]')
        item = next(row for row in version['checklist'] if row.get('action') == 'add_fields')
        self.assertEqual(item['names'], ['Site Note'])
        self.assertEqual(item['status'], 'note')   # never blocks: someone may want the brackets to print as typed

    def test_use_design_activates_sets_default_and_enables_a_custom_document_in_one_step(self):
        definition, version = self.custom_definition_with_design('Certificate for [Client Name]')
        self.assertFalse(definition['is_active'])
        response = self.api.post(f"/api/services/document-template-versions/{version['id']}/use-design/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['publication_status'], 'active')
        self.assertTrue(response.data['definition_enabled'])
        from services.models import DocumentDefinition
        self.assertTrue(DocumentDefinition.objects.get(pk=definition['id']).is_active)
        template = DocumentTemplateVersion.objects.get(pk=version['id']).template
        self.assertTrue(template.is_default and template.is_enabled)

    def test_use_design_works_for_a_design_uploaded_before_its_fields_existed(self):
        definition, version = self.custom_definition_with_design('Certificate: {{certificate_note}}')
        self.assertEqual(version['validation_status'], 'invalid')
        blocked = self.api.post(f"/api/services/document-template-versions/{version['id']}/use-design/")
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data['detail'], 'This design needs attention before it can be used.')
        self.assertIn('Some field names are not recognised', [row['label'] for row in blocked.data['checklist']])
        self.api.post('/api/services/document-field-definitions/', {
            'definition': definition['id'], 'field_key': 'certificate_note', 'label': 'Certificate note', 'field_type': 'text',
        }, format='json')
        ready = self.api.post(f"/api/services/document-template-versions/{version['id']}/use-design/")
        self.assertEqual(ready.status_code, 200, ready.data)   # re-checked automatically, no re-upload needed

    def test_use_design_blocks_a_core_design_that_is_missing_a_required_table_and_keeps_the_old_one(self):
        old = self.upload_core('[Client Name] ' + QUOTATION_ROWS)
        self.assertEqual(self.api.post(f"/api/services/document-template-versions/{old.data['id']}/use-design/").status_code, 200)
        broken = self.upload_core('[Client Name] but no tables')
        blocked = self.api.post(f"/api/services/document-template-versions/{broken.data['id']}/use-design/")
        self.assertEqual(blocked.status_code, 409)
        self.assertIn('Price table: not found', [row['label'] for row in blocked.data['checklist']])
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=old.data['id']).publication_status, 'active')
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=broken.data['id']).publication_status, 'draft')

    def test_use_design_requires_publish_permission(self):
        _definition, version = self.custom_definition_with_design('Certificate for [Client Name]')
        outsider = APIClient()
        outsider.force_authenticate(self.client_user)
        denied = outsider.post(f"/api/services/document-template-versions/{version['id']}/use-design/")
        self.assertIn(denied.status_code, {403, 404})
        self.assertEqual(DocumentTemplateVersion.objects.get(pk=version['id']).publication_status, 'draft')
