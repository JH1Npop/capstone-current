from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import GeneratedDocument, ServiceRequest, ServiceTicket, ServiceType
from users.models import User, UserCapabilityGrant
from users.rbac import DOCUMENTS_MANAGE, DOCUMENTS_VIEW, PUBLIC_SITE_VIEW


class DocumentCapabilityTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='document-client', password='pass', role='client'
        )
        self.service_type = ServiceType.objects.create(
            name='Solar Installation', estimated_duration=480
        )
        self.service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Document capability project.',
            status='Approved',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.service_request,
            scheduled_date=timezone.localdate(),
        )
        self.prefill_url = f'/api/services/service-tickets/{self.ticket.id}/document-prefill/'
        self.draft_url = f'/api/services/service-tickets/{self.ticket.id}/document-draft/'

    def create_admin(self, username, capability):
        user = User.objects.create_user(username=username, password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=user, capability_code=capability)
        return user

    def test_document_viewer_can_read_but_cannot_write(self):
        user = self.create_admin('document-viewer', DOCUMENTS_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.prefill_url).status_code, status.HTTP_200_OK)
        self.assertEqual(
            self.client.get('/api/services/service-tickets/', {'search': 'Solar'}).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(self.draft_url, {'document_type': 'turnover_acceptance'}).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get('/api/services/solar-commissioning-checklists/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.post(
                self.draft_url,
                {'document_type': 'turnover_acceptance', 'data_json': {'capacity': '5 kWp'}},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post('/api/services/quotations/', {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f'/api/services/service-tickets/{self.ticket.id}/promote-to-project-profile/',
                {},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                '/api/services/solar-project-profiles/promote-estimate/',
                {'ticket_id': self.ticket.id},
                format='json',
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_document_manager_can_read_and_save_draft(self):
        user = self.create_admin('document-manager', DOCUMENTS_MANAGE)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.prefill_url).status_code, status.HTTP_200_OK)
        response = self.client.post(
            self.draft_url,
            {
                'document_type': 'turnover_acceptance',
                'data_json': {'systemCapacity': '5.5 kWp'},
                'status': 'draft',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertRegex(response.data['document_code'], r'^DOC-\d{4,}$')
        self.assertTrue(
            GeneratedDocument.objects.filter(
                ticket=self.ticket,
                document_type='turnover_acceptance',
            ).exists()
        )

    def test_finalized_generated_document_cannot_be_overwritten(self):
        user = self.create_admin('document-finalizer', DOCUMENTS_MANAGE)
        self.client.force_authenticate(user)
        first = self.client.post(
            self.draft_url,
            {
                'document_type': 'turnover_acceptance',
                'data_json': {'systemCapacity': '5.5 kWp'},
                'status': 'finalized',
            },
            format='json',
        )
        second = self.client.post(
            self.draft_url,
            {
                'document_type': 'turnover_acceptance',
                'data_json': {'systemCapacity': '999 kWp'},
                'status': 'draft',
            },
            format='json',
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)
        document = GeneratedDocument.objects.get(ticket=self.ticket, document_type='turnover_acceptance')
        self.assertEqual(document.data_json['systemCapacity'], '5.5 kWp')

    def test_quotation_post_is_retry_safe_per_ticket(self):
        user = self.create_admin('quotation-manager', DOCUMENTS_MANAGE)
        self.client.force_authenticate(user)
        payload = {
            'ticket': self.ticket.id,
            'client': self.client_user.id,
            'total_amount': '100000',
            'validity_days': 30,
            'bill_of_materials': [{'description': 'PV panel', 'quantity': 8}],
        }

        first = self.client.post('/api/services/quotations/', payload, format='json')
        payload['total_amount'] = '105000'
        second = self.client.post('/api/services/quotations/', payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(first.data['quotation_number'], f'QUO-{self.ticket.id:04d}')
        self.assertEqual(second.data['total_amount'], '105000')

    def test_unrelated_configured_admin_cannot_access_documents(self):
        user = self.create_admin('landing-document-denied', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.prefill_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get('/api/services/solar-commissioning-checklists/').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get('/api/services/solar-project-profiles/').status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_client_can_read_owned_document_collections_but_cannot_write(self):
        self.client.force_authenticate(self.client_user)

        self.assertEqual(
            self.client.get('/api/services/turnover-acceptances/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get('/api/services/installation-contracts/').status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.post('/api/services/solar-project-profiles/', {}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )
