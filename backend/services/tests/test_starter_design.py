"""Step 4: the blank starter file for a custom document and the plain list of fields a design can use."""
import io
from zipfile import ZipFile

from django.test import TestCase
from rest_framework.test import APIClient

from services.document_templates import plain_field_list
from services.models import DocumentDefinition
from users.models import User


class StarterDesignTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='starter-admin', password='pass', email='starter-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='starter-client', password='pass', role='client')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)
        response = self.api.post('/api/services/document-definitions/', {
            'name': 'Site Certificate', 'description': 'Starter test.', 'data_source': 'ticket', 'display_order': 120,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.definition = DocumentDefinition.objects.get(pk=response.data['id'])
        field = self.api.post('/api/services/document-field-definitions/', {
            'definition': self.definition.id, 'field_key': 'site_note', 'label': 'Site note', 'field_type': 'text', 'display_order': 1,
        }, format='json')
        self.assertEqual(field.status_code, 201, field.data)

    def body(self, response):
        return b''.join(response.streaming_content)

    def test_plain_field_list_uses_typable_names_and_keeps_tables_technical(self):
        items = plain_field_list(self.definition)
        by_key = {item['key']: item for item in items}
        self.assertEqual(by_key['client_name']['marker'], '[Client Name]')
        self.assertEqual(by_key['site_note']['marker'], '[Site Note]')
        self.assertTrue(all(item['marker'].startswith('[') for item in items if item['kind'] == 'field'))

    def test_starter_downloads_as_a_word_file_listing_every_field(self):
        response = self.api.get(f'/api/services/document-definitions/{self.definition.id}/starter/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('.docx', response['Content-Disposition'])
        with ZipFile(io.BytesIO(self.body(response))) as archive:
            text = archive.read('word/document.xml').decode('utf-8')
        self.assertIn('[Client Name]', text)
        self.assertIn('[Site Note]', text)

    def test_starter_uploaded_unchanged_passes_the_check_and_can_be_used(self):
        starter = self.body(self.api.get(f'/api/services/document-definitions/{self.definition.id}/starter/'))
        design = self.api.post('/api/services/document-templates/', {'definition': self.definition.id, 'name': 'Standard', 'is_default': True}, format='json')
        self.assertEqual(design.status_code, 201, design.data)
        upload = io.BytesIO(starter)
        upload.name = 'starter.docx'
        version = self.api.post('/api/services/document-template-versions/', {'template': design.data['id'], 'file': upload}, format='multipart')
        self.assertEqual(version.status_code, 201, version.data)
        self.assertEqual(version.data['validation_status'], 'valid')
        self.assertEqual([item for item in version.data['checklist'] if item['status'] == 'problem'], [])
        used = self.api.post(f"/api/services/document-template-versions/{version.data['id']}/use-design/")
        self.assertEqual(used.status_code, 200, used.data)

    def test_core_documents_have_no_starter_and_clients_cannot_download_one(self):
        core = DocumentDefinition.objects.get(code='quotation_proposal')
        self.assertEqual(self.api.get(f'/api/services/document-definitions/{core.id}/starter/').status_code, 409)
        outsider = APIClient()
        outsider.force_authenticate(self.client_user)
        self.assertIn(outsider.get(f'/api/services/document-definitions/{self.definition.id}/starter/').status_code, {403, 404})


class DeleteDocumentTypeTests(StarterDesignTests):
    """Deleting a custom document type: only when it never produced anything."""

    def url(self, definition=None):
        return f'/api/services/document-definitions/{(definition or self.definition).id}/'

    def add_design(self):
        design = self.api.post('/api/services/document-templates/', {'definition': self.definition.id, 'name': 'Standard', 'is_default': True}, format='json')
        starter = b''.join(self.api.get(self.url() + 'starter/').streaming_content)
        upload = io.BytesIO(starter)
        upload.name = 'starter.docx'
        version = self.api.post('/api/services/document-template-versions/', {'template': design.data['id'], 'file': upload}, format='multipart')
        self.assertEqual(version.status_code, 201, version.data)
        return version.data

    def test_unused_custom_type_is_deleted_with_its_designs_and_fields(self):
        from services.models import DocumentFieldDefinition, DocumentTemplate, DocumentTemplateVersion
        version = self.add_design()
        self.api.post(f"/api/services/document-template-versions/{version['id']}/use-design/")
        response = self.api.delete(self.url())
        self.assertEqual(response.status_code, 204)
        self.assertFalse(DocumentDefinition.objects.filter(pk=self.definition.pk).exists())
        self.assertFalse(DocumentTemplate.objects.filter(definition_id=self.definition.pk).exists())
        self.assertFalse(DocumentTemplateVersion.objects.filter(pk=version['id']).exists())
        self.assertFalse(DocumentFieldDefinition.objects.filter(definition_id=self.definition.pk).exists())

    def test_used_type_core_type_and_unauthorised_users_are_refused(self):
        from services.models import DocumentInstance
        core = DocumentDefinition.objects.get(code='quotation_proposal')
        self.assertEqual(self.api.delete(self.url(core)).status_code, 409)
        outsider = APIClient()
        outsider.force_authenticate(self.client_user)
        self.assertIn(outsider.delete(self.url()).status_code, {403, 404})
        DocumentInstance.objects.create(definition=self.definition, created_by=self.admin)
        refused = self.api.delete(self.url())
        self.assertEqual(refused.status_code, 409)
        self.assertIn('Disable it instead', refused.data['detail'])
        self.assertTrue(DocumentDefinition.objects.filter(pk=self.definition.pk).exists())


class BuiltInDesignTests(TestCase):
    """Each core document's own Word design can be downloaded and, uploaded unchanged, passes the check."""

    def setUp(self):
        self.admin = User.objects.create_superuser(username='builtin-admin', password='pass', email='builtin-admin@example.test', role='superadmin')
        self.client_user = User.objects.create_user(username='builtin-client', password='pass', role='client')
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def test_every_core_document_downloads_a_design_that_passes_the_check_unchanged(self):
        from services.models import DocumentTemplate
        for definition in DocumentDefinition.objects.filter(category='core'):
            response = self.api.get(f'/api/services/document-definitions/{definition.id}/built-in-design/')
            self.assertEqual(response.status_code, 200, definition.code)
            data = b''.join(response.streaming_content)
            upload = io.BytesIO(data)
            upload.name = f'{definition.code}.docx'
            template = DocumentTemplate.objects.get(definition=definition, is_default=True)
            version = self.api.post('/api/services/document-template-versions/', {'template': template.id, 'file': upload}, format='multipart')
            self.assertEqual(version.status_code, 201, (definition.code, version.data))
            problems = [item for item in version.data['checklist'] if item['status'] == 'problem']
            self.assertEqual(problems, [], definition.code)

    def test_custom_documents_and_clients_get_no_built_in_design(self):
        custom = self.api.post('/api/services/document-definitions/', {'name': 'Built-in Check', 'description': 'x', 'data_source': 'ticket', 'display_order': 130}, format='json')
        self.assertEqual(self.api.get(f"/api/services/document-definitions/{custom.data['id']}/built-in-design/").status_code, 409)
        core = DocumentDefinition.objects.get(code='quotation_proposal')
        outsider = APIClient()
        outsider.force_authenticate(self.client_user)
        self.assertIn(outsider.get(f'/api/services/document-definitions/{core.id}/built-in-design/').status_code, {403, 404})
