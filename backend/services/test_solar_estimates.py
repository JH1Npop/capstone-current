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

    def test_savings_value_daytime_use_at_retail_and_exports_at_credit(self):
        result = calculate_solar_estimate({
            'calculation_mode': 'monthly',
            'monthly_consumption': 450,
            'peak_sun_hours': 5,
            'system_loss_percent': 20,
            'panel_wattage': 550,
            'electricity_rate': 12,
            'desired_offset_percent': 100,
            'available_roof_area': None,
            'daytime_usage_percent': 40,
            'export_credit_rate': 5.5,
        })

        # 462 kWh generated; 180 kWh (40% of 450) used in the daytime at PHP 12.
        self.assertEqual(result['selfConsumedEnergy'], 180.0)
        self.assertEqual(result['exportedEnergy'], 282.0)
        self.assertEqual(result['monthlySavingsWithoutNetMetering'], 2160.0)
        # Only the 270 kWh still bought from the grid can be offset by export credits.
        self.assertEqual(result['monthlySavings'], 3645.0)
        self.assertLess(result['monthlySavings'], 450 * 12)

    def test_savings_defaults_apply_and_export_credit_is_capped_at_retail_rate(self):
        base = {
            'calculation_mode': 'monthly', 'monthly_consumption': 450, 'peak_sun_hours': 5,
            'system_loss_percent': 20, 'panel_wattage': 550, 'electricity_rate': 4,
            'desired_offset_percent': 100, 'available_roof_area': None,
        }
        defaults = calculate_solar_estimate(base)
        self.assertEqual(defaults['daytimeUsagePercent'], 40.0)
        self.assertEqual(defaults['exportCreditRate'], 4.0)

        capped = calculate_solar_estimate({**base, 'export_credit_rate': 9})
        self.assertEqual(capped['exportCreditRate'], 4.0)
        self.assertEqual(capped['monthlySavings'], 450 * 4)

    def test_appliance_duty_cycle_reduces_energy_and_sets_daytime_share(self):
        result = calculate_solar_estimate({
            'calculation_mode': 'appliances',
            'appliances': [
                {'name': 'Refrigerator', 'quantity': 1, 'wattage': 150, 'dayHours': 12, 'nightHours': 12,
                 'surgeFactor': 3, 'dutyCycle': 35},
                {'name': 'Electric fan', 'quantity': 1, 'wattage': 100, 'nightHours': 10},
            ],
            'peak_sun_hours': 4.5,
            'system_loss_percent': 20,
            'panel_wattage': 550,
            'electricity_rate': 12,
            'desired_offset_percent': 100,
            'available_roof_area': None,
            'daytime_usage_percent': 95,
        })

        # Refrigerator: 150 W x 12 h x 35% = 0.63 kWh each half-day; fan runs 1 kWh at night.
        self.assertEqual(result['dayEnergy'], 0.63)
        self.assertEqual(result['nightEnergy'], 1.63)
        # The appliance schedule decides the daytime share; a posted percentage is ignored.
        self.assertEqual(result['daytimeUsagePercent'], 27.88)
        self.assertEqual(result['normalizedAppliances'][0]['dutyCycle'], 35.0)
        self.assertEqual(result['normalizedAppliances'][1]['dutyCycle'], 100.0)
        # Inverter sizing still uses full connected watts plus the compressor surge.
        self.assertEqual(result['inverterCapacity'], 0.66)

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
        self.assertEqual(estimate.calculation_version, '1.1')
        self.assertEqual(estimate.status, 'draft')

    def test_estimate_keeps_savings_inputs_in_snapshot_across_updates(self):
        self.client.force_authenticate(self.client_user)
        response = self.client.post(
            self.list_url,
            {**self.payload, 'daytime_usage_percent': '70.00', 'export_credit_rate': '0.00'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertNotIn('daytime_usage_percent', response.data)
        snapshot = response.data['result_snapshot']
        self.assertEqual(snapshot['daytimeUsagePercent'], 70.0)
        self.assertEqual(snapshot['monthlySavings'], snapshot['monthlySavingsWithoutNetMetering'])

        estimate = SolarEstimate.objects.get(pk=response.data['id'])
        detail_url = reverse('solar-estimate-detail', args=[estimate.pk])
        update = self.client.patch(detail_url, {'monthly_consumption': '600.00'}, format='json')
        self.assertEqual(update.status_code, status.HTTP_200_OK, update.data)
        estimate.refresh_from_db()
        self.assertEqual(estimate.result_snapshot['daytimeUsagePercent'], 70.0)
        self.assertEqual(estimate.result_snapshot['exportCreditRate'], 0.0)

    def test_appliance_mode_ignores_client_derived_monthly_total(self):
        self.client.force_authenticate(self.client_user)
        payload = {
            **self.payload,
            'calculation_mode': 'appliances',
            'monthly_consumption': '99999999999999999999',
            'appliances': [{
                'name': 'Portable freezer',
                'quantity': 1,
                'wattage': 300,
                'dayHours': 8,
                'nightHours': 4,
                'surgeFactor': 1.5,
            }],
        }

        response = self.client.post(self.list_url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        estimate = SolarEstimate.objects.get(pk=response.data['id'])
        self.assertEqual(str(estimate.monthly_consumption), '108.00')
        self.assertEqual(estimate.appliances[0]['name'], 'Portable freezer')

    def test_appliance_mode_returns_specific_limit_error_for_oversized_wattage(self):
        self.client.force_authenticate(self.client_user)
        payload = {
            **self.payload,
            'calculation_mode': 'appliances',
            'monthly_consumption': '99999999999999999999',
            'appliances': [{
                'name': 'Test appliance',
                'quantity': 1,
                'wattage': 100001,
                'dayHours': 1,
                'nightHours': 0,
                'surgeFactor': 1,
            }],
        }

        response = self.client.post(self.list_url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('100000', str(response.data))
        self.assertNotIn('digits in total', str(response.data))

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
