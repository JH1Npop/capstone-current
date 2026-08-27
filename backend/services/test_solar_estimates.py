from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import ServiceRequest, ServiceType, SolarEstimate
from services.solar_calculator import SolarCalculationError, calculate_solar_estimate


User = get_user_model()


class SolarCalculatorTests(APITestCase):
    def test_monthly_calculation_matches_documented_example(self):
        result = calculate_solar_estimate({
            'calculation_mode': 'monthly',
            'monthly_consumption': 450,
            'peak_sun_hours': 5,
            'system_loss_percent': 20,
            'panel_wattage': 550,
            'electricity_rate': 12,
            'desired_offset_percent': 100,
            'available_roof_area': None,
        })

        self.assertEqual(result['panelCount'], 7)
        self.assertEqual(result['requiredCapacity'], 3.75)
        self.assertEqual(result['installedCapacity'], 3.85)
        self.assertEqual(result['monthlyGeneration'], 462.0)

    def test_appliance_hours_cannot_exceed_one_day(self):
        with self.assertRaises(SolarCalculationError) as context:
            calculate_solar_estimate({
                'calculation_mode': 'appliances',
                'appliances': [{
                    'name': 'Air conditioner', 'quantity': 1, 'wattage': 1200,
                    'dayHours': 16, 'nightHours': 10, 'surgeFactor': 1.5,
                }],
                'peak_sun_hours': 5,
                'system_loss_percent': 20,
                'panel_wattage': 550,
                'electricity_rate': 12,
                'desired_offset_percent': 100,
                'available_roof_area': None,
            })

        self.assertIn('appliances', context.exception.errors)


class SolarEstimateApiTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='solar-client', email='solar@example.com', password='test-pass', role='client'
        )
        self.other_client = User.objects.create_user(
            username='other-client', email='other@example.com', password='test-pass', role='client'
        )
        self.service_type = ServiceType.objects.create(
            name='Solar Site Assessment', estimated_duration=120, is_active=True
        )
        self.list_url = reverse('solar-estimate-list')
        self.payload = {
            'calculation_mode': 'monthly',
            'monthly_consumption': '450.00',
            'peak_sun_hours': '5.00',
            'system_loss_percent': '20.00',
            'panel_wattage': 550,
            'electricity_rate': '12.00',
            'desired_offset_percent': '100.00',
            'available_roof_area': '25.00',
            'selected_promotion': {'id': 'promo-550', 'title': '550 W package'},
        }

    def create_estimate(self):
        self.client.force_authenticate(self.client_user)
        response = self.client.post(self.list_url, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return SolarEstimate.objects.get(pk=response.data['id'])

    def test_client_can_save_server_calculated_estimate(self):
        estimate = self.create_estimate()

        self.assertEqual(estimate.client, self.client_user)
        self.assertEqual(estimate.result_snapshot['panelCount'], 7)
        self.assertEqual(estimate.calculation_version, '1.0')
        self.assertEqual(estimate.status, 'draft')

    def test_client_cannot_read_another_clients_estimate(self):
        estimate = self.create_estimate()
        self.client.force_authenticate(self.other_client)

        response = self.client.get(reverse('solar-estimate-detail', args=[estimate.pk]))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_conversion_is_idempotent_and_links_pending_request(self):
        estimate = self.create_estimate()
        convert_url = reverse('solar-estimate-convert', args=[estimate.pk])
        conversion_payload = {
            'service_type': self.service_type.pk,
            'location_address': '123 Solar Street',
            'location_city': 'Davao City',
            'location_province': 'Davao del Sur',
            'latitude': '7.073100',
            'longitude': '125.612800',
        }

        first = self.client.post(convert_url, conversion_payload, format='json')
        second = self.client.post(convert_url, conversion_payload, format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED, first.data)
        self.assertEqual(second.status_code, status.HTTP_200_OK, second.data)
        self.assertTrue(first.data['created'])
        self.assertFalse(second.data['created'])
        self.assertEqual(ServiceRequest.objects.count(), 1)

        estimate.refresh_from_db()
        self.assertEqual(estimate.status, 'converted')
        self.assertEqual(estimate.service_request.status, 'Pending')
        self.assertEqual(estimate.service_request.client, self.client_user)
        self.assertEqual(estimate.service_request.location.city, 'Davao City')
