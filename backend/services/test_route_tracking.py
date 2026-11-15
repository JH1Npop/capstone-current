"""Navigating technicians: the road route follows them and reroutes when they leave it."""

from decimal import Decimal

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from services import route_tracking
from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType
from users.models import User

URL = '/api/services/technician/location/'
JOB = (14.2786, 121.1250)  # lat, lng of the client site
# A planned route from (14.2400, 121.0700) to the job, as GeoJSON [lng, lat].
ROUTE = {'type': 'LineString', 'coordinates': [[121.0700, 14.2400], [121.1000, 14.2600], [121.1250, 14.2786]]}


class RouteTrackingTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.technician = User.objects.create_user(username='route_tech', password='pass', role='technician')
        client_user = User.objects.create_user(username='route_client', password='pass', role='client')
        service = ServiceType.objects.create(name='Route Service', description='x', estimated_duration=60)
        request = ServiceRequest.objects.create(client=client_user, service_type=service, description='x', priority='Normal')
        ServiceLocation.objects.create(
            request=request, address='12 Rizal St', city='Cabuyao', province='Laguna',
            latitude=Decimal(str(JOB[0])), longitude=Decimal(str(JOB[1])),
        )
        self.ticket = ServiceTicket.objects.create(
            request=request, technician=self.technician, status='Navigating', route_geometry=ROUTE,
            scheduled_date=timezone.localdate(),
            route_distance=7300, route_duration=780,
        )
        self.client.force_authenticate(user=self.technician)

    def post(self, lat, lng, accuracy=10):
        response = self.client.post(URL, {'latitude': lat, 'longitude': lng, 'accuracy': accuracy}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.ticket.refresh_from_db()

    def test_distance_to_route(self):
        self.assertLess(route_tracking.distance_to_route_meters(14.2600, 121.1000, ROUTE), 1)
        self.assertGreater(route_tracking.distance_to_route_meters(14.3000, 121.0700, ROUTE), 3000)
        self.assertIsNone(route_tracking.distance_to_route_meters(14.26, 121.10, None))

    def test_on_route_location_keeps_the_route(self):
        self.post(14.2600, 121.1001)
        self.assertEqual(self.ticket.route_geometry['coordinates'], ROUTE['coordinates'])
        self.assertNotIn('reason', self.ticket.route_geometry)

    def test_off_route_location_reroutes_from_the_technician_to_the_job(self):
        self.post(14.3000, 121.0700)
        geometry = self.ticket.route_geometry
        self.assertEqual(geometry['reason'], 'off_route')
        self.assertIn('computed_at', geometry)
        start, end = geometry['coordinates'][0], geometry['coordinates'][-1]
        self.assertAlmostEqual(start[1], 14.3000, places=3)
        self.assertAlmostEqual(start[0], 121.0700, places=3)
        self.assertAlmostEqual(end[1], JOB[0], places=3)
        self.assertAlmostEqual(end[0], JOB[1], places=3)
        self.assertGreater(self.ticket.route_duration, 0)

    def test_rerouting_waits_a_minute_between_attempts(self):
        self.post(14.3000, 121.0700)
        first = self.ticket.route_geometry['coordinates'][0]
        self.post(14.3200, 121.0500)
        self.assertEqual(self.ticket.route_geometry['coordinates'][0], first)

    def test_missing_route_is_created(self):
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(route_geometry=None)
        self.post(14.2500, 121.0800)
        self.assertEqual(self.ticket.route_geometry['reason'], 'no_route')

    def test_only_navigating_tickets_are_rerouted(self):
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(status='Arrived on Site')
        self.post(14.3000, 121.0700)
        self.assertEqual(self.ticket.route_geometry['coordinates'], ROUTE['coordinates'])

    def test_wide_gps_error_does_not_trigger_a_reroute(self):
        # 300 m off the road, but the reading is only good to +/-250 m (1.5x = 375 m).
        self.post(14.2627, 121.1000, accuracy=250)
        self.assertEqual(self.ticket.route_geometry['coordinates'], ROUTE['coordinates'])


class RoutingFallbackTests(APITestCase):
    """ORS quota/timeout falls back to OSRM; a straight line is never saved as a road route."""

    OSRM_OK = {
        'code': 'Ok',
        'routes': [{
            'geometry': {'type': 'LineString', 'coordinates': [[121.07, 14.24], [121.10, 14.26], [121.125, 14.2786]]},
            'legs': [{'distance': 7300, 'duration': 780, 'steps': []}],
        }],
    }

    def _live_routing(self):
        from django.test import override_settings
        return override_settings(IS_TEST=False, DISABLE_EXTERNAL_ROUTING=False)

    def test_ors_failure_falls_back_to_osrm(self):
        from unittest import mock
        from services import ors_utils

        failing_client = mock.Mock()
        failing_client.directions.side_effect = Exception('429 Too Many Requests')
        response = mock.Mock()
        response.json.return_value = self.OSRM_OK
        response.raise_for_status.return_value = None
        with self._live_routing(), mock.patch.object(ors_utils, 'client', failing_client), \
                mock.patch('requests.get', return_value=response) as osrm:
            route = ors_utils.get_route((121.07, 14.24), (121.125, 14.2786))
        osrm.assert_called_once()
        self.assertEqual(route['features'][0]['properties']['routing_source'], 'osrm')
        with self._live_routing():
            self.assertTrue(ors_utils.is_road_route(route))

    def test_straight_line_is_not_saved_when_all_routing_fails(self):
        from unittest import mock
        from services import ors_utils

        failing_client = mock.Mock()
        failing_client.directions.side_effect = Exception('timeout')
        with self._live_routing(), mock.patch.object(ors_utils, 'client', failing_client), \
                mock.patch('requests.get', side_effect=Exception('OSRM down')):
            route = ors_utils.get_route((121.07, 14.24), (121.125, 14.2786))
            self.assertEqual(route['features'][0]['properties']['routing_source'], 'synthetic')
            self.assertFalse(ors_utils.is_road_route(route))

    def test_reroute_keeps_the_previous_route_when_routing_fails(self):
        from unittest import mock
        from services import ors_utils

        technician = User.objects.create_user(username='fallback_tech', password='pass', role='technician')
        client_user = User.objects.create_user(username='fallback_client', password='pass', role='client')
        service = ServiceType.objects.create(name='Fallback Service', description='x', estimated_duration=60)
        request = ServiceRequest.objects.create(client=client_user, service_type=service, description='x', priority='Normal')
        ticket = ServiceTicket.objects.create(
            request=request, technician=technician, status='Navigating', route_geometry=ROUTE,
            scheduled_date=timezone.localdate(),
        )
        failing_client = mock.Mock()
        failing_client.directions.side_effect = Exception('429 Too Many Requests')
        with self._live_routing(), mock.patch.object(ors_utils, 'client', failing_client), \
                mock.patch('requests.get', side_effect=Exception('OSRM down')):
            route_tracking.store_route(ticket.id, (121.07, 14.30), (JOB[1], JOB[0]), 'off_route')
        ticket.refresh_from_db()
        self.assertEqual(ticket.route_geometry['coordinates'], ROUTE['coordinates'])
