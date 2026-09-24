"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class ProjectHandoverActionTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='handover_admin', password='Password123!', role='admin')
        self.client_user = User.objects.create_user(username='handover_client', password='Password123!', role='client')
        self.api = APIClient()
        self.api.force_authenticate(user=self.admin)
        service_type = ServiceType.objects.create(name='Solar Installation')
        request_obj = ServiceRequest.objects.create(
            client=self.client_user, service_type=service_type, description='Project handover', status='Pending'
        )
        self.ticket = ServiceTicket.objects.create(
            request=request_obj,
            status='Completed',
            scheduled_date=timezone.localdate(),
            warranty_period_days=365,
        )

    def test_draft_finalize_specs_and_equipment_persist(self):
        draft_response = self.api.post(
            f'/api/services/service-tickets/{self.ticket.id}/document-draft/',
            {'document_type': 'turnover_acceptance', 'data_json': {'systemCapacity': '5.5 kWp'}},
            format='json',
        )
        self.assertEqual(draft_response.status_code, status.HTTP_200_OK)
        self.assertTrue(GeneratedDocument.objects.filter(ticket=self.ticket, document_type='turnover_acceptance').exists())

        turnover_response = self.api.post('/api/services/turnover-acceptances/', {
            'ticket': self.ticket.id,
            'turnover_date': '2026-07-13',
            'warranty_start_date': '2026-07-13',
            'accepted_by_client_name': 'Client Name',
        }, format='json')
        self.assertEqual(turnover_response.status_code, status.HTTP_201_CREATED)
        turnover_id = turnover_response.data['id']

        finalize_response = self.api.post(
            f'/api/services/turnover-acceptances/{turnover_id}/finalize/', {}, format='json'
        )
        self.assertEqual(finalize_response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        turnover = TurnoverAcceptance.objects.get(id=turnover_id)
        self.assertEqual(turnover.status, 'finalized')
        self.assertEqual(self.ticket.status, 'Turned Over / Accepted')
        self.assertEqual(self.ticket.warranty_status, 'active')

        specs_response = self.api.post(
            f'/api/services/service-tickets/{self.ticket.id}/update-project-details/',
            {'project_details': {'system_capacity_kwp': '5.5', 'number_of_solar_panels': '10'}},
            format='json',
        )
        self.assertEqual(specs_response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.project_details['system_capacity_kwp'], '5.5')

        equipment_response = self.api.post('/api/services/installed-equipment/', {
            'ticket': self.ticket.id,
            'client': self.client_user.id,
            'equipment_type': 'Solar Panel',
            'brand_model': 'Panel Details Stored on Ticket',
            'capacity': '10 panels',
        }, format='json')
        self.assertEqual(equipment_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(InstalledEquipment.objects.filter(ticket=self.ticket, client=self.client_user).exists())
