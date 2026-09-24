"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class RoutingFallbackTests(TestCase):
    def test_get_route_returns_synthetic_route_when_external_calls_fail(self):
        with self.settings(IS_TEST=False):
            with patch('services.ors_utils.client', None):
                with patch('requests.get', side_effect=RuntimeError('network blocked')):
                    route = ors_utils.get_route((121.0244, 14.5547), (121.0200, 14.5600))

        self.assertEqual(route['type'], 'FeatureCollection')
        feature = route['features'][0]
        self.assertEqual(feature['properties']['routing_source'], 'synthetic')
        self.assertTrue(feature['properties']['is_fallback'])
        self.assertEqual(
            feature['geometry']['coordinates'],
            [[121.0244, 14.5547], [121.02, 14.56]],
        )
        segment = feature['properties']['segments'][0]
        self.assertTrue(segment['fallback'])
        self.assertGreater(segment['distance'], 0)
        self.assertGreater(segment['duration'], 0)

    def test_ors_route_endpoint_uses_synthetic_fallback_when_external_routing_disabled(self):
        user = User.objects.create_user(username='admin-route', password='pass', role='admin')
        api_client = APIClient()
        api_client.force_authenticate(user=user)

        with self.settings(DISABLE_EXTERNAL_ROUTING=True):
            response = api_client.get('/api/services/ors/route/', {
                'start': '121.60054,13.928376',
                'end': '121.592183,14.022091',
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['type'], 'FeatureCollection')
        feature = response.data['features'][0]
        self.assertEqual(feature['properties']['routing_source'], 'synthetic')
        self.assertTrue(feature['properties']['is_fallback'])
