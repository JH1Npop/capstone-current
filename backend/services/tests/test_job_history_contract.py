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


class JobHistoryFilterAccuracyTests(APITestCase):
    """Period, multi-service, crew, search, ordering and malformed input on completed_jobs."""

    URL = '/api/services/coverage-heatmap/completed_jobs/'

    def setUp(self):
        from services.models import ServiceRequestService
        self.ServiceRequestService = ServiceRequestService
        self.superadmin = User.objects.create_user(username='jh2_super', password='pass', role='superadmin')
        self.lead = User.objects.create_user(username='jh2_lead', password='pass', role='technician', first_name='Leandro', last_name='Lead')
        self.crew = User.objects.create_user(username='jh2_crew', password='pass', role='technician', first_name='Cristina', last_name='Crew')
        self.client_user = User.objects.create_user(username='jh2_client', password='pass', role='client', first_name='Carla', last_name='Client')
        self.solar = ServiceType.objects.create(name='JH Solar', estimated_duration=60)
        self.battery = ServiceType.objects.create(name='JH Battery', estimated_duration=60)
        self.client.force_authenticate(self.superadmin)

    def _job(self, *, services=None, completed_days_ago=0, scheduled_days_ago=0, address='1 Rizal St', crew=()):
        services = services or [self.solar]
        request_obj = ServiceRequest.objects.create(
            client=self.client_user, service_type=services[0], description='done', status='Completed',
        )
        for order, service in enumerate(services):
            self.ServiceRequestService.objects.create(request=request_obj, service_type=service, sort_order=order)
        ServiceLocation.objects.create(request=request_obj, address=address, city='Lucena', province='Quezon', latitude=13.94, longitude=121.61)
        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.lead,
            scheduled_date=timezone.localdate() - timedelta(days=scheduled_days_ago),
            completed_date=timezone.now() - timedelta(days=completed_days_ago),
            status='Completed',
        )
        for member in crew:
            TicketCrewAssignment.objects.create(ticket=ticket, technician=member)
        return ticket

    def _ids(self, **params):
        response = self.client.get(self.URL, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [row['id'] for row in response.data['results']], response.data

    def test_period_uses_the_completion_date(self):
        recent = self._job(completed_days_ago=2, scheduled_days_ago=3)
        # Completed long ago even though its visit date falls inside the window.
        old = self._job(completed_days_ago=200, scheduled_days_ago=1)
        ids, _ = self._ids(days=7)
        self.assertIn(recent.id, ids)
        self.assertNotIn(old.id, ids)

    def test_service_filter_and_count_include_every_service(self):
        combo = self._job(services=[self.solar, self.battery])
        self._job(services=[self.solar])
        ids, data = self._ids(service_type=self.battery.id)
        self.assertEqual(ids, [combo.id])
        _, everything = self._ids()
        self.assertEqual(everything['service_types_served'], 2)
        self.assertEqual(data['total'], 1)

    def test_technician_filter_and_options_include_crew(self):
        with_crew = self._job(crew=[self.crew])
        self._job()
        ids, data = self._ids(technician=self.crew.id)
        self.assertEqual(ids, [with_crew.id])
        self.assertIn(self.crew.id, {option['id'] for option in data['technician_options']})

    def test_search_covers_technician_and_address(self):
        target = self._job(address='77 Mabini Avenue')
        ids, _ = self._ids(search='Mabini')
        self.assertEqual(ids, [target.id])
        ids, _ = self._ids(search='Leandro')
        self.assertIn(target.id, ids)

    def test_ordering_and_paging_return_distinct_rows(self):
        jobs = [self._job(crew=[self.crew], completed_days_ago=day) for day in range(3)]
        ids, data = self._ids(technician=self.crew.id, ordering='technician', direction='asc', page_size=2, page=1)
        more, _ = self._ids(technician=self.crew.id, ordering='technician', direction='asc', page_size=2, page=2)
        self.assertEqual(data['total'], 3)
        self.assertEqual(sorted(ids + more), sorted(job.id for job in jobs))

    def test_malformed_filter_values_are_ignored(self):
        self._job()
        for params in ({'client': 'abc'}, {'technician': 'x'}, {'service_type': '0'}):
            with self.subTest(params=params):
                _, data = self._ids(**params)
                self.assertEqual(data['total'], 1)
