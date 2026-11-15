"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405
from django.conf import settings
from django.test import SimpleTestCase


class CoverageHeatmapTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='heatmap_admin',
            password='pass',
            role='admin'
        )
        self.client.force_authenticate(user=self.admin_user)

        self.client_user = User.objects.create_user(
            username='heatmap_client',
            password='pass',
            role='client'
        )
        self.service_type = ServiceType.objects.create(
            name='Heatmap Service',
            description='Heatmap test service',
            estimated_duration=60
        )

    def test_service_density_route_returns_grouped_hotspots(self):
        first_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request 1',
            priority='Normal',
            status='Completed'
        )
        second_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request 2',
            priority='Normal',
            status='Completed'
        )

        ServiceLocation.objects.create(
            request=first_request,
            address='12 Heatmap Street',
            city='Lagos',
            province='Lagos',
            latitude=6.5001,
            longitude=3.3001
        )
        ServiceLocation.objects.create(
            request=second_request,
            address='12 Heatmap Street',
            city='Lagos',
            province='Lagos',
            latitude=6.5001,
            longitude=3.3001
        )

        response = self.client.get('/api/services/coverage-heatmap/service_density/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_points'], 1)
        self.assertEqual(response.data['max_density'], 2)
        self.assertEqual(response.data['heatmap_data'][0]['count'], 2)

    def test_service_density_excludes_unfinished_requests(self):
        active_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Approved request',
            priority='Normal',
            status='Approved',
        )
        completed_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Completed request',
            priority='Normal',
            status='Completed',
        )

        ServiceLocation.objects.create(
            request=active_request,
            address='16 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.6010,
            longitude=120.9860,
        )
        ServiceLocation.objects.create(
            request=completed_request,
            address='16 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.6010,
            longitude=120.9860,
        )

        response = self.client.get('/api/services/coverage-heatmap/service_density/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_points'], 1)
        point = response.data['heatmap_data'][0]
        self.assertEqual(point['count'], 1)
        self.assertEqual(point['status_breakdown'][0]['name'], 'Completed')

    def test_service_density_supports_client_and_technician_filters(self):
        technician = User.objects.create_user(
            username='heatmap_technician',
            password='pass',
            role='technician',
            status='active',
            current_latitude=14.5995,
            current_longitude=120.9842,
        )
        other_client = User.objects.create_user(
            username='other_heatmap_client',
            password='pass',
            role='client',
        )
        matching_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Matching completed request',
            priority='Normal',
            status='Completed',
        )
        other_request = ServiceRequest.objects.create(
            client=other_client,
            service_type=self.service_type,
            description='Other completed request',
            priority='Normal',
            status='Completed',
        )
        ServiceLocation.objects.create(
            request=matching_request,
            address='14 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.5995,
            longitude=120.9842,
        )
        ServiceLocation.objects.create(
            request=other_request,
            address='15 Heatmap Street',
            city='Manila',
            province='Metro Manila',
            latitude=14.6000,
            longitude=120.9850,
        )
        ServiceTicket.objects.create(
            request=matching_request,
            technician=technician,
            scheduled_date=timezone.localdate(),
            status='Completed',
            completed_date=timezone.now(),
        )

        response = self.client.get(
            '/api/services/coverage-heatmap/service_density/',
            {'client': self.client_user.id, 'technician': technician.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_points'], 1)
        point = response.data['heatmap_data'][0]
        self.assertEqual(point['count'], 1)
        self.assertEqual(point['clients'][0]['id'], self.client_user.id)
        self.assertEqual(point['technicians'][0]['id'], technician.id)


class CoverageHeatmapAccuracyTests(APITestCase):
    """Counts, multi-service requests, crew, faceted filter options and bad input."""

    def setUp(self):
        from services.models import ServiceRequestService
        self.ServiceRequestService = ServiceRequestService
        self.admin_user = User.objects.create_user(username='heat_admin2', password='pass', role='admin')
        self.client.force_authenticate(user=self.admin_user)
        self.first_client = User.objects.create_user(username='heat_c1', password='pass', role='client', first_name='Ana', last_name='One')
        self.second_client = User.objects.create_user(username='heat_c2', password='pass', role='client', first_name='Ben', last_name='Two')
        self.solar = ServiceType.objects.create(name='Heat Solar', description='x', estimated_duration=60)
        self.battery = ServiceType.objects.create(name='Heat Battery', description='x', estimated_duration=60)
        self.lead = User.objects.create_user(username='heat_lead', password='pass', role='technician', status='active', first_name='Lea', last_name='Lead')
        self.crew = User.objects.create_user(username='heat_crew', password='pass', role='technician', status='active', first_name='Cru', last_name='Crew')

    def _completed(
        self, client, services, lat, lng, *, lead=None, crew=(),
        address='Heat St', city='Cabuyao', province='Laguna',
    ):
        request_obj = ServiceRequest.objects.create(
            client=client, service_type=services[0], description='Done', priority='Normal', status='Completed',
        )
        for order, service in enumerate(services):
            self.ServiceRequestService.objects.create(request=request_obj, service_type=service, sort_order=order)
        ServiceLocation.objects.create(
            request=request_obj, address=address, city=city, province=province,
            latitude=lat, longitude=lng,
        )
        if lead:
            ticket = ServiceTicket.objects.create(
                request=request_obj, technician=lead, scheduled_date=timezone.localdate(),
                status='Completed', completed_date=timezone.now(),
            )
            for member in crew:
                TicketCrewAssignment.objects.create(ticket=ticket, technician=member)
        return request_obj

    def _get(self, **params):
        response = self.client.get('/api/services/coverage-heatmap/service_density/', params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def test_total_jobs_counts_jobs_not_hotspots(self):
        self._completed(self.first_client, [self.solar], 14.2786, 121.1210)
        self._completed(self.first_client, [self.solar], 14.2787, 121.1220)
        self._completed(self.second_client, [self.solar], 14.5000, 121.0000)
        data = self._get()
        self.assertEqual(data['total_points'], 2)
        self.assertEqual(data['total_jobs'], 3)

    def test_administrative_levels_group_barangay_city_and_province(self):
        self._completed(
            self.first_client, [self.solar], 14.2786, 121.1210,
            address='12 Main Road, Brgy. Pulo', city='Cabuyao', province='Laguna',
        )
        self._completed(
            self.second_client, [self.battery], 14.2986, 121.1410,
            address='18 Lake Road, Barangay Pulo', city='Cabuyao', province='Laguna',
        )
        self._completed(
            self.first_client, [self.solar], 14.3286, 121.0810,
            address='4 Market Road, Brgy. San Antonio', city='Biñan', province='Laguna',
        )

        levels = self._get()['geographic_levels']

        self.assertEqual([(row['area_name'], row['count']) for row in levels['barangay']], [
            ('Pulo', 2),
            ('San Antonio', 1),
        ])
        self.assertEqual([(row['area_name'], row['count']) for row in levels['city']], [
            ('Cabuyao', 2),
            ('Biñan', 1),
        ])
        self.assertEqual([(row['area_name'], row['count']) for row in levels['province']], [('Laguna', 3)])
        self.assertAlmostEqual(levels['province'][0]['lat'], (14.2786 + 14.2986 + 14.3286) / 3)

    def test_municipality_level_places_jobs_by_coordinates_not_typed_city(self):
        # Sta. Rosa and Calamba centres; the first city is typed wrongly on purpose.
        self._completed(self.first_client, [self.solar], 14.2840, 121.0920, city='Typo City', province='Laguna')
        self._completed(self.second_client, [self.battery], 14.2770, 121.0990, city='', province='')
        self._completed(self.first_client, [self.solar], 14.2000, 121.1600, city='Calamba', province='Laguna')
        # Manila Bay, outside every CALABARZON outline.
        self._completed(self.first_client, [self.solar], 14.5500, 120.8000, city='Sea', province='Sea')

        data = self._get()
        rows = data['geographic_levels']['municipality']
        self.assertEqual([(row['area_name'], row['count']) for row in rows], [
            ('City of Santa Rosa', 2),
            ('City of Calamba', 1),
        ])
        self.assertTrue(all(len(row['psgc']) == 10 for row in rows))
        self.assertEqual(rows[0]['address'], 'City of Santa Rosa, Laguna')
        self.assertEqual(data['jobs_outside_boundaries'], 1)
        self.assertEqual(data['total_jobs'], 4)
        # Each hotspot is drawn at the average position of its jobs (not its ~1 km grid corner)
        # and carries the outline where its jobs are, for the selected-area heat points.
        hotspot_areas = {
            (round(point['lat'], 4), round(point['lng'], 4)): point['area_psgc'] for point in data['heatmap_data']
        }
        self.assertEqual(hotspot_areas[(14.284, 121.092)], rows[0]['psgc'])
        self.assertEqual(hotspot_areas[(14.2, 121.16)], rows[1]['psgc'])
        self.assertIsNone(hotspot_areas[(14.55, 120.8)])

        # Barangay drill-down: each job is placed in a barangay outline inside its town.
        barangays = {row['psgc']: row for row in data['geographic_levels']['barangay_boundary']}
        self.assertEqual(
            {(row['area_name'], row['municipality_psgc'], row['count']) for row in barangays.values()},
            {('Balibago', rows[0]['psgc'], 1), ('Dita', rows[0]['psgc'], 1), ('Lecheria', rows[1]['psgc'], 1)},
        )
        self.assertEqual(barangays['0403428002']['address'], 'Balibago, City of Santa Rosa')
        self.assertEqual([row['unplaced_barangay_jobs'] for row in rows], [0, 0])
        hotspot_barangays = {
            (round(point['lat'], 4), round(point['lng'], 4)): point['barangay_psgc'] for point in data['heatmap_data']
        }
        # The grid corner of this Balibago job (14.28, 121.09) lies in another barangay; the
        # heat point still belongs to Balibago because its job is there.
        self.assertEqual(hotspot_barangays[(14.284, 121.092)], '0403428002')
        self.assertEqual(hotspot_barangays[(14.277, 121.099)], '0403428005')
        self.assertEqual(hotspot_barangays[(14.2, 121.16)], '0403405020')
        self.assertIsNone(hotspot_barangays[(14.55, 120.8)])

    def test_every_service_of_a_multi_service_request_counts(self):
        self._completed(self.first_client, [self.solar, self.battery], 14.2786, 121.1250)
        point = self._get()['heatmap_data'][0]
        self.assertEqual(point['count'], 1)
        self.assertEqual({item['name'] for item in point['service_breakdown']}, {'Heat Solar', 'Heat Battery'})
        filtered = self._get(service_type=self.battery.id)
        self.assertEqual(filtered['total_jobs'], 1)

    def test_crew_members_are_listed_and_filterable(self):
        self._completed(self.first_client, [self.solar], 14.2786, 121.1250, lead=self.lead, crew=[self.crew])
        point = self._get()['heatmap_data'][0]
        self.assertEqual({tech['id'] for tech in point['technicians']}, {self.lead.id, self.crew.id})
        self.assertEqual(self._get(technician=self.crew.id)['total_jobs'], 1)

    def test_choosing_a_value_keeps_the_other_choices_for_that_filter(self):
        self._completed(self.first_client, [self.solar], 14.2786, 121.1250, lead=self.lead)
        self._completed(self.second_client, [self.battery], 14.5000, 121.0000, lead=self.crew)
        data = self._get(client=self.first_client.id)
        self.assertEqual(data['total_jobs'], 1)
        self.assertEqual({option['id'] for option in data['client_options']}, {self.first_client.id, self.second_client.id})
        # The other filters narrow to what the chosen client has.
        self.assertEqual([option['id'] for option in data['technician_options']], [self.lead.id])
        self.assertEqual([option['id'] for option in data['service_options']], [self.solar.id])
        technician_data = self._get(technician=self.lead.id)
        self.assertEqual({option['id'] for option in technician_data['technician_options']}, {self.lead.id, self.crew.id})

    def test_malformed_filter_values_are_ignored(self):
        self._completed(self.first_client, [self.solar], 14.2786, 121.1250)
        for params in ({'client': 'abc'}, {'technician': '1;drop'}, {'service_type': '-4'}):
            with self.subTest(params=params):
                self.assertEqual(self._get(**params)['total_jobs'], 1)
        coverage = self.client.get('/api/services/coverage-heatmap/technician_coverage/', {'technician': 'abc'})
        self.assertEqual(coverage.status_code, status.HTTP_200_OK)


class CityMunicipalityBoundaryTests(SimpleTestCase):
    def test_backend_and_frontend_boundary_files_are_identical(self):
        from pathlib import Path
        from services.geo_boundaries import BOUNDARY_FILE

        frontend_copy = Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'data' / 'calabarzonCityMunicipalities.json'
        if not frontend_copy.exists():
            self.skipTest('frontend folder is not deployed with the backend')
        self.assertEqual(BOUNDARY_FILE.read_bytes(), frontend_copy.read_bytes())

    def test_backend_and_frontend_barangay_outlines_match(self):
        import json
        from pathlib import Path
        from services.geo_boundaries import BARANGAY_FILE

        frontend_dir = Path(settings.BASE_DIR).parent / 'frontend' / 'src' / 'data' / 'barangays'
        if not frontend_dir.exists():
            self.skipTest('frontend folder is not deployed with the backend')
        backend = json.loads(BARANGAY_FILE.read_text(encoding='utf-8'))['municipalities']
        frontend = {
            path.stem: json.loads(path.read_text(encoding='utf-8'))['features']
            for path in frontend_dir.glob('*.json')
        }
        self.assertEqual(set(backend), set(frontend))
        for municipality_psgc, features in backend.items():
            self.assertEqual(features, frontend[municipality_psgc], municipality_psgc)

    def test_every_barangay_belongs_to_a_loaded_town(self):
        from services.geo_boundaries import load_barangay_areas, load_city_municipality_areas

        grouped = load_barangay_areas()
        towns = {area['psgc'] for area in load_city_municipality_areas()}
        self.assertEqual(set(grouped), towns)
        self.assertEqual(sum(len(areas) for areas in grouped.values()), 3992)
        self.assertTrue(all(
            area['municipality_psgc'] == town for town, areas in grouped.items() for area in areas
        ))

    def test_all_calabarzon_cities_and_municipalities_are_loaded(self):
        from services.geo_boundaries import load_city_municipality_areas

        areas = load_city_municipality_areas()
        self.assertEqual(len(areas), 142)
        self.assertEqual(
            {area['province'] for area in areas},
            {'Batangas', 'Cavite', 'Laguna', 'Quezon', 'Rizal'},
        )

    def test_points_resolve_to_the_containing_area(self):
        from services.geo_boundaries import find_city_municipality

        self.assertEqual(find_city_municipality(14.2840, 121.0920)['name'], 'City of Santa Rosa')
        self.assertEqual(find_city_municipality(14.5866, 121.1760)['name'], 'City of Antipolo')
        self.assertEqual(find_city_municipality(13.7565, 121.0583)['province'], 'Batangas')
        self.assertIsNone(find_city_municipality(14.5995, 120.9842))  # Manila, outside the region
        self.assertIsNone(find_city_municipality(None, 121.0))
