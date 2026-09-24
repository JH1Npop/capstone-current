from datetime import datetime

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from services.models import DemandForecast, ServiceRequest, ServiceTrend, ServiceType
from users.forecasting_service import (
    _add_months,
    _month_start,
    generate_service_forecast,
    load_forecast_contract,
    train_and_backtest,
)
from users.models import User


class ValidatedDemandForecastTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='forecast_admin', email='forecast-admin@example.com', password='Pass1234!',
            role='admin', status='active', is_active=True,
        )
        self.client_user = User.objects.create_user(
            username='forecast_client', email='forecast-client@example.com', password='Pass1234!',
            role='client', status='active', is_active=True,
        )
        self.service = ServiceType.objects.create(name='Stable Forecast Service', estimated_duration=60)
        self.api = APIClient()
        self.api.force_authenticate(self.admin)

    def _seed_months(self, monthly_counts, description='Verified historical request'):
        current_month = _month_start(timezone.localdate())
        start_month = _add_months(current_month, -len(monthly_counts))
        rows = []
        for offset, count in enumerate(monthly_counts):
            month = _add_months(start_month, offset)
            for sequence in range(count):
                day = min(1 + sequence, 20)
                requested_at = timezone.make_aware(datetime(month.year, month.month, day, 9, sequence % 60))
                rows.append(ServiceRequest(
                    client=self.client_user,
                    service_type=self.service,
                    description=description,
                    priority='Normal',
                    status='Completed',
                    request_date=requested_at,
                ))
        ServiceRequest.objects.bulk_create(rows)

    def test_stable_three_year_history_is_backtested_published_and_readable(self):
        self._seed_months([5] * 36)
        result = train_and_backtest(self.service.id)
        self.assertTrue(result['validated'])
        self.assertTrue(result['backtested'])
        self.assertEqual(result['metrics']['wape_percent'], 0)

        published = generate_service_forecast(self.service, persist=True)
        self.assertTrue(published['published'])
        self.assertEqual(len(published['predictions']), 6)
        self.assertEqual(DemandForecast.objects.filter(service_type=self.service).count(), 6)
        trend = ServiceTrend.objects.get(service_type=self.service)
        self.assertEqual(trend.confidence_interval['model_key'], 'monthly_seasonal_linear_trend_v1')
        self.assertTrue(trend.confidence_interval['validated'])

        contract = load_forecast_contract(self.service.id)
        self.assertTrue(contract['available'])
        self.assertTrue(contract['model_status']['error_metrics_stored'])
        self.assertEqual(contract['model_status']['published_service_count'], 1)
        self.assertEqual(len(contract['monthly']), 6)
        self.assertGreater(contract['next_30_days'], 0)
        self.assertLessEqual(
            contract['next_30_days'],
            sum(row['predicted_requests'] for row in contract['monthly'][:2]),
        )

        response = self.api.get('/api/admin/analytics/', {
            'workspace': 'forecasting', 'service_type_id': self.service.id,
        })
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['demand_forecast']['available'])
        self.assertTrue(response.data['forecast']['predictions_available'])
        self.assertEqual(len(response.data['forecast']['predictions']), 6)

        self.admin.role = 'superadmin'
        self.admin.save(update_fields=['role'])
        regenerated = self.api.post('/api/services/demand-forecasts/generate_forecast/', {
            'service_type_id': self.service.id,
            'horizon_months': 6,
        }, format='json')
        self.assertEqual(regenerated.status_code, 200)
        self.assertTrue(regenerated.data['published'])

    def test_synthetic_seed_records_do_not_make_model_ready(self):
        self._seed_months([5] * 36, description='[Historical Seed] Demonstration request')
        result = generate_service_forecast(self.service, persist=True)
        self.assertFalse(result['published'])
        self.assertEqual(result['readiness']['request_count'], 0)
        self.assertEqual(DemandForecast.objects.count(), 0)
        self.assertEqual(ServiceTrend.objects.count(), 0)

    def test_poor_holdout_performance_is_stored_but_predictions_are_withheld(self):
        self._seed_months(([4] * 30) + [1, 19, 1, 19, 1, 19])
        result = generate_service_forecast(self.service, persist=True)
        self.assertFalse(result['published'])
        self.assertTrue(result['model']['backtested'])
        self.assertFalse(result['model']['validated'])
        self.assertGreater(result['model']['metrics']['wape_percent'], 60)
        self.assertEqual(DemandForecast.objects.count(), 0)
        self.assertEqual(ServiceTrend.objects.count(), 1)
        self.assertFalse(load_forecast_contract(self.service.id)['available'])

    def test_generation_endpoint_rejects_non_superadmin_write_without_predictions(self):
        response = self.api.post('/api/services/demand-forecasts/generate_forecast/', {
            'service_type_id': self.service.id,
            'horizon_months': 6,
        }, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(DemandForecast.objects.count(), 0)
