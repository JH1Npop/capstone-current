"""Completed-job history contract and lifecycle regression coverage."""

from ._imports import *  # noqa: F403,F405
from services.models import FieldServiceReport


class JobHistoryContractTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(
            username='job_history_superadmin', password='pass', role='superadmin'
        )
        self.technician = User.objects.create_user(
            username='job_history_technician', password='pass', role='technician'
        )
        self.other_technician = User.objects.create_user(
            username='job_history_other_technician', password='pass', role='technician'
        )
        self.client_user = User.objects.create_user(
            username='job_history_client', password='pass', role='client'
        )
        self.service_type = ServiceType.objects.create(
            name='History Contract Service', estimated_duration=90
        )

    def create_ticket(self, status_value, technician=None, completed_offset=0):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description=f'{status_value} history contract',
            status='Approved',
        )
        completed_at = timezone.now() - timedelta(days=completed_offset)
        return ServiceTicket.objects.create(
            request=request_obj,
            technician=technician or self.technician,
            scheduled_date=timezone.localdate(),
            start_time=completed_at - timedelta(minutes=75),
            end_time=completed_at,
            completed_date=completed_at if status_value != 'Inspection Completed' else None,
            status=status_value,
        )

    def test_admin_history_is_paginated_and_contains_connected_detail_data(self):
        completed = self.create_ticket('Completed')
        turned_over = self.create_ticket('Turned Over / Accepted', completed_offset=1)
        self.create_ticket('Inspection Completed')
        crew_member = User.objects.create_user(
            username='job_history_crew', password='pass', role='technician'
        )
        TicketCrewAssignment.objects.create(ticket=completed, technician=crew_member)
        ServiceStatusHistory.objects.create(
            ticket=completed,
            status='Completed',
            changed_by=self.superadmin,
            notes='Verified completion.',
        )
        GeneratedDocument.objects.create(
            ticket=completed,
            document_type='field_service_report',
            title='Final field report',
            status='finalized',
        )
        FieldServiceReport.objects.create(
            ticket=completed,
            voltage_reading='230V',
            client_acknowledged=True,
        )
        self.client.force_authenticate(self.superadmin)

        response = self.client.get(
            '/api/services/coverage-heatmap/completed_jobs/',
            {'page': 1, 'page_size': 1, 'ordering': 'completed_date', 'direction': 'desc'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(response.data['total_pages'], 2)
        self.assertEqual(len(response.data['results']), 1)
        record = response.data['results'][0]
        self.assertEqual(record['id'], completed.id)
        self.assertEqual(record['duration_minutes'], 75)
        self.assertEqual(record['crew_members'][0]['id'], crew_member.id)
        self.assertEqual(record['field_service_reports'][0]['voltage_reading'], '230V')
        self.assertEqual(record['generated_documents'][0]['status'], 'finalized')
        self.assertEqual(record['timeline'][0]['notes'], 'Verified completion.')
        self.assertNotEqual(record['id'], turned_over.id)

    def test_technician_history_excludes_inspection_stage_and_other_technicians(self):
        completed = self.create_ticket('Completed')
        turned_over = self.create_ticket('Turned Over / Accepted', completed_offset=1)
        self.create_ticket('Inspection Completed')
        self.create_ticket('Completed', technician=self.other_technician)
        self.client.force_authenticate(self.technician)

        response = self.client.get('/api/technician/history/', {'page_size': 1})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total'], 2)
        self.assertEqual(response.data['total_pages'], 2)
        self.assertEqual([row['id'] for row in response.data['results']], [completed.id])

        second_page = self.client.get('/api/technician/history/', {'page': 2, 'page_size': 1})
        self.assertEqual([row['id'] for row in second_page.data['results']], [turned_over.id])
        self.assertEqual(second_page.data['results'][0]['status'], 'Turned Over / Accepted')

    def test_technician_history_rejects_an_inverted_date_range(self):
        self.client.force_authenticate(self.technician)

        response = self.client.get(
            '/api/technician/history/',
            {'date_from': '2026-09-02', 'date_to': '2026-09-01'},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('date_from cannot be later', response.data['detail'])

    def test_job_history_defaults_to_ten_results_per_page(self):
        for completed_offset in range(11):
            self.create_ticket('Completed', completed_offset=completed_offset)

        self.client.force_authenticate(self.superadmin)
        admin_response = self.client.get('/api/services/coverage-heatmap/completed_jobs/')
        self.assertEqual(admin_response.status_code, status.HTTP_200_OK)
        self.assertEqual(admin_response.data['page_size'], 10)
        self.assertEqual(admin_response.data['total_pages'], 2)
        self.assertEqual(len(admin_response.data['results']), 10)

        self.client.force_authenticate(self.technician)
        technician_response = self.client.get('/api/technician/history/')
        self.assertEqual(technician_response.status_code, status.HTTP_200_OK)
        self.assertEqual(technician_response.data['page_size'], 10)
        self.assertEqual(technician_response.data['total_pages'], 2)
        self.assertEqual(len(technician_response.data['results']), 10)
