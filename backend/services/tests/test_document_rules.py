"""Job documents (turnover acceptance, installation contract, technical data sheet, field service
report, commissioning checklist) and the job's proof photos: who reads, who changes, what is locked,
and what can be deleted.
"""

from ._imports import *  # noqa: F403,F405
from services.business_time import business_today
from services.models import (
    FieldServiceReport, InstallationContract, SolarCommissioningChecklist, TechnicalDataSheet, TurnoverAcceptance,
)
from users.rbac import DOCUMENTS_VIEW, REPORTS_VIEW

ROLES = ['owner client', 'other client', 'lead tech', 'other tech', 'docs viewer', 'admin', 'scoped admin', 'superadmin']
# list (rows seen), get, patch — the same for every job document.
EXPECTED_LIST_ROWS = [1, 0, 1, 0, 1, 1, None, 1]          # None = 403
EXPECTED_GET = [200, 404, 200, 404, 200, 200, 403, 200]
EXPECTED_PATCH_FIELD_FORMS = [403, 403, 200, 404, 403, 200, 403, 200]   # technicians fill these on site
# The installation contract is a commercial document: technicians do not see it at all.
EXPECTED_CONTRACT_LIST_ROWS = [1, 0, 0, 0, 1, 1, None, 1]
EXPECTED_CONTRACT_GET = [200, 404, 404, 404, 200, 200, 403, 200]
EXPECTED_PATCH_CONTRACT = [403, 403, 403, 403, 403, 200, 403, 200]      # office only

DOCUMENTS = {
    'turnover-acceptances': lambda t: TurnoverAcceptance.objects.create(ticket=t),
    'installation-contracts': lambda t: InstallationContract.objects.create(ticket=t),
    'technical-data-sheets': lambda t: TechnicalDataSheet.objects.create(ticket=t),
    'field-service-reports': lambda t: FieldServiceReport.objects.create(ticket=t),
    'solar-commissioning-checklists': lambda t: SolarCommissioningChecklist.objects.create(ticket=t),
}


class DocumentFixture(APITestCase):
    def setUp(self):
        mk = User.objects.create_user
        self.users = {
            'owner client': mk(username='dr-owner', password='x', role='client'),
            'other client': mk(username='dr-other', password='x', role='client'),
            'lead tech': mk(username='dr-lead', password='x', role='technician', status='active'),
            'other tech': mk(username='dr-tech2', password='x', role='technician', status='active'),
            'docs viewer': mk(username='dr-viewer', password='x', role='admin'),
            'admin': mk(username='dr-admin', password='x', role='admin'),
            'scoped admin': mk(username='dr-scoped', password='x', role='admin'),
            'superadmin': mk(username='dr-super', password='x', role='superadmin'),
        }
        UserCapabilityGrant.objects.create(user=self.users['scoped admin'], capability_code=REPORTS_VIEW)
        UserCapabilityGrant.objects.create(user=self.users['docs viewer'], capability_code=DOCUMENTS_VIEW)
        self.service = ServiceType.objects.create(name='Document rules', estimated_duration=60)

    def ticket(self):
        req = ServiceRequest.objects.create(client=self.users['owner client'], service_type=self.service, description='d', status='Completed')
        return ServiceTicket.objects.create(
            request=req, technician=self.users['lead tech'], scheduled_date=business_today(), status='Completed', completed_date=timezone.now(),
        )

    def as_(self, who):
        self.client.force_authenticate(self.users[who])
        return self.client


class DocumentAccessTests(DocumentFixture):
    def test_who_reads_and_changes_each_job_document(self):
        for name, make in DOCUMENTS.items():
            document = make(self.ticket())
            contract = name == 'installation-contracts'
            list_expected = EXPECTED_CONTRACT_LIST_ROWS if contract else EXPECTED_LIST_ROWS
            get_expected_row = EXPECTED_CONTRACT_GET if contract else EXPECTED_GET
            patch_expected = EXPECTED_PATCH_CONTRACT if contract else EXPECTED_PATCH_FIELD_FORMS
            for role, rows_expected, get_expected, patch_code in zip(ROLES, list_expected, get_expected_row, patch_expected):
                with self.subTest(document=name, role=role):
                    listed = self.as_(role).get(f'/api/services/{name}/')
                    if rows_expected is None:
                        self.assertEqual(listed.status_code, 403)
                    else:
                        self.assertEqual(listed.status_code, 200)
                        data = listed.data.get('results', listed.data) if isinstance(listed.data, dict) else listed.data
                        self.assertEqual(len(data), rows_expected)
                    self.assertEqual(self.as_(role).get(f'/api/services/{name}/{document.id}/').status_code, get_expected)
                    self.assertEqual(self.as_(role).patch(f'/api/services/{name}/{document.id}/', {}, format='json').status_code, patch_code)

    def test_proof_photos_follow_the_job(self):
        ticket = self.ticket()
        for role, expected in zip(ROLES, EXPECTED_GET):
            with self.subTest(role=role):
                self.assertEqual(self.as_(role).get(f'/api/services/service-tickets/{ticket.id}/proof_images/').status_code, expected)


class DocumentLockTests(DocumentFixture):
    LOCKED = [
        ('turnover-acceptances', lambda t: TurnoverAcceptance.objects.create(ticket=t, status='finalized')),
        ('turnover-acceptances', lambda t: TurnoverAcceptance.objects.create(ticket=t, status='accepted')),
        ('installation-contracts', lambda t: InstallationContract.objects.create(ticket=t, status='signed')),
        ('technical-data-sheets', lambda t: TechnicalDataSheet.objects.create(ticket=t, status='reviewed')),
        ('solar-commissioning-checklists', lambda t: SolarCommissioningChecklist.objects.create(ticket=t, status='finalized')),
        ('field-service-reports', lambda t: FieldServiceReport.objects.create(ticket=t, client_acknowledged=True)),
    ]

    def test_a_finished_document_cannot_be_changed_or_deleted(self):
        for name, make in self.LOCKED:
            with self.subTest(document=name):
                document = make(self.ticket())
                self.assertEqual(self.as_('superadmin').patch(f'/api/services/{name}/{document.id}/', {}, format='json').status_code, 400)
                deleted = self.as_('superadmin').delete(f'/api/services/{name}/{document.id}/')
                self.assertEqual(deleted.status_code, 409)
                self.assertTrue(type(document).objects.filter(pk=document.pk).exists())

    def test_a_draft_document_can_be_deleted_by_the_office(self):
        for name, make in DOCUMENTS.items():
            with self.subTest(document=name):
                document = make(self.ticket())
                self.assertEqual(self.as_('lead tech').delete(f'/api/services/{name}/{document.id}/').status_code, 403)
                self.assertEqual(self.as_('superadmin').delete(f'/api/services/{name}/{document.id}/').status_code, 204)


class FieldServiceReportRuleTests(DocumentFixture):
    def test_a_technician_cannot_record_the_clients_acknowledgement(self):
        ticket = self.ticket()
        ticket.status = 'In Progress'
        ticket.save(update_fields=['status'])
        response = self.as_('lead tech').post('/api/services/field-service-reports/', {
            'ticket': ticket.id, 'brand_model': 'Carrier', 'client_acknowledged': True, 'client_signature_date': business_today().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        report = FieldServiceReport.objects.get(pk=response.data['id'])
        self.assertFalse(report.client_acknowledged)
        self.assertIsNone(report.client_signature_date)
        # The office records it; the report is then locked.
        self.assertEqual(self.as_('superadmin').patch(f'/api/services/field-service-reports/{report.id}/', {'client_acknowledged': True}, format='json').status_code, 200)
        self.assertEqual(self.as_('lead tech').patch(f'/api/services/field-service-reports/{report.id}/', {'brand_model': 'Changed'}, format='json').status_code, 400)
