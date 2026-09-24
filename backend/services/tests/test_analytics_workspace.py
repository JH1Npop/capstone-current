from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import (
    DemandForecast,
    SalesRecord,
    SalesRecordLine,
    ServiceAnalytics,
    ServiceLocation,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
)
from users.models import User, UserCapabilityGrant
from users.rbac import ANALYTICS_VIEW


@override_settings(BUSINESS_DISPLAY_TIMEZONE='Asia/Manila')
class AnalyticsWorkspaceTests(APITestCase):
    url = '/api/admin/analytics/'

    def setUp(self):
        self.admin = User.objects.create_user(username='analytics-admin-new', password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=ANALYTICS_VIEW)
        self.client_user = User.objects.create_user(username='analytics-client-new', password='pass', role='client')
        self.tech = User.objects.create_user(username='analytics-tech-new', password='pass', role='technician')
        self.other_tech = User.objects.create_user(username='analytics-tech-other', password='pass', role='technician')
        self.solar = ServiceType.objects.create(name='Solar analytics', estimated_duration=120)
        self.aircon = ServiceType.objects.create(name='Aircon analytics', estimated_duration=60)
        self.client.force_authenticate(self.admin)

    def create_ticket(self, *, moment, service=None, technician=None, ticket_status='Not Started', priority='Normal', city='Lucena', province='Quezon', duration_hours=None):
        service = service or self.solar
        request_obj = ServiceRequest.objects.create(
            client=self.client_user, service_type=service, description='Genuine analytics request',
            priority=priority, status='Approved',
        )
        ServiceRequest.objects.filter(pk=request_obj.pk).update(request_date=moment)
        ServiceLocation.objects.create(request=request_obj, address='Test address', city=city, province=province)
        start_time = moment + timedelta(hours=1) if duration_hours is not None else None
        completed_date = start_time + timedelta(hours=duration_hours) if duration_hours is not None else None
        ticket = ServiceTicket.objects.create(
            request=request_obj, technician=technician, scheduled_date=moment.date(),
            assigned_at=moment, start_time=start_time, completed_date=completed_date,
            status=ticket_status, priority=priority,
        )
        ServiceTicket.objects.filter(pk=ticket.pk).update(created_at=moment)
        ticket.refresh_from_db()
        return ticket

    def test_kpi_formulas_and_invalid_duration_observation(self):
        manila = ZoneInfo('Asia/Manila')
        moment = datetime(2026, 9, 10, 9, tzinfo=manila)
        self.create_ticket(moment=moment, technician=self.tech, ticket_status='Completed', duration_hours=2)
        invalid = self.create_ticket(moment=moment, technician=self.tech, ticket_status='Completed', duration_hours=1)
        ServiceTicket.objects.filter(pk=invalid.pk).update(completed_date=invalid.start_time - timedelta(hours=1))
        self.create_ticket(moment=moment, technician=None, ticket_status='Cancelled')

        response = self.client.get(self.url, {'start_date': '2026-09-10', 'end_date': '2026-09-10'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['kpis']['total_tickets'], 3)
        self.assertEqual(response.data['kpis']['completed_tickets'], 2)
        self.assertEqual(response.data['kpis']['completion_rate'], 66.7)
        self.assertEqual(response.data['kpis']['average_completion_hours'], 2)
        self.assertEqual(response.data['kpis']['average_completion_observations'], 1)

    def test_manila_midnight_boundaries_and_zero_filled_daily_series(self):
        utc = ZoneInfo('UTC')
        self.create_ticket(moment=datetime(2026, 9, 9, 16, 0, tzinfo=utc), technician=self.tech)
        response = self.client.get(self.url, {
            'start_date': '2026-09-10', 'end_date': '2026-09-11', 'group_by': 'day',
        })

        self.assertEqual(response.data['kpis']['total_tickets'], 1)
        trend = response.data['charts']['requests_vs_completions']
        self.assertEqual([row['period'] for row in trend], ['2026-09-10', '2026-09-11'])
        self.assertEqual(trend[1]['requests'], 0)

    def test_previous_period_comparison_uses_equal_adjacent_range(self):
        manila = ZoneInfo('Asia/Manila')
        current = datetime(2026, 9, 10, 9, tzinfo=manila)
        previous = datetime(2026, 9, 9, 9, tzinfo=manila)
        self.create_ticket(moment=current, technician=self.tech, ticket_status='Completed', duration_hours=2)
        self.create_ticket(moment=current, technician=self.tech, ticket_status='Not Started')
        self.create_ticket(moment=previous, technician=self.tech, ticket_status='Completed', duration_hours=4)

        response = self.client.get(self.url, {
            'start_date': '2026-09-10', 'end_date': '2026-09-10',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['comparison']['period'], {
            'start_date': '2026-09-09', 'end_date': '2026-09-09',
        })
        total_comparison = response.data['comparison']['kpis']['total_tickets']
        self.assertEqual(total_comparison['current'], 2)
        self.assertEqual(total_comparison['previous'], 1)
        self.assertEqual(total_comparison['absolute_change'], 1)
        self.assertEqual(total_comparison['percentage_change'], 100.0)
        self.assertTrue(total_comparison['comparison_available'])
        self.assertEqual(response.data['comparison']['kpis']['completion_rate']['current'], 50.0)
        self.assertEqual(response.data['comparison']['kpis']['completion_rate']['previous'], 100.0)
        self.assertEqual(response.data['comparison']['kpis']['completion_rate']['delta_points'], -50.0)
        self.assertEqual(response.data['comparison']['kpis']['average_completion_hours']['current'], 2.0)
        self.assertEqual(response.data['comparison']['kpis']['average_completion_hours']['previous'], 4.0)
        self.assertEqual(response.data['charts']['service_demand'][0]['previous_requests'], 1)
        completed = next(item for item in response.data['charts']['ticket_statuses'] if item['status'] == 'Completed')
        self.assertEqual((completed['count'], completed['previous_count']), (1, 1))
        self.assertEqual(response.data['charts']['locations'][0]['previous_requests'], 1)

    def test_every_supported_dimension_filters_the_response(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=ZoneInfo('Asia/Manila'))
        self.create_ticket(moment=moment, service=self.solar, technician=self.tech, ticket_status='Completed', priority='High', city='Lucena', province='Quezon', duration_hours=2)
        self.create_ticket(moment=moment, service=self.aircon, technician=None, ticket_status='Not Started', city='Sariaya', province='Quezon')
        params = {
            'start_date': '2026-09-10', 'end_date': '2026-09-10',
            'service_type_id': self.solar.id, 'technician_id': self.tech.id,
            'status': 'Completed', 'priority': 'High', 'city': 'lucena',
            'province': 'quezon', 'assignment_state': 'assigned',
        }
        response = self.client.get(self.url, params)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['kpis']['total_tickets'], 1)
        self.assertEqual(response.data['charts']['service_demand'][0]['requests'], 1)
        self.assertEqual(response.data['charts']['locations'][0]['city'], 'Lucena')

    def test_admin_endpoint_denies_technician_and_client(self):
        for user in (self.tech, self.client_user):
            with self.subTest(role=user.role):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(self.url).status_code, status.HTTP_403_FORBIDDEN)

    def test_permissions_cover_superadmin_default_admin_capability_and_anonymous(self):
        superadmin = User.objects.create_user(
            username='analytics-owner', password='pass', role='superadmin', is_superuser=True,
        )
        ungranted_admin = User.objects.create_user(username='analytics-ungranted', password='pass', role='admin')
        for user, expected in ((superadmin, status.HTTP_200_OK), (ungranted_admin, status.HTTP_200_OK)):
            with self.subTest(role=user.username):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(self.url).status_code, expected)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.get(self.url).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_comparison_modes_are_validated_and_never_overlap(self):
        expected_periods = {
            'previous_period': ('2026-08-02', '2026-08-31'),
            'previous_month': ('2026-08-01', '2026-08-31'),
            'previous_quarter': ('2026-04-01', '2026-06-30'),
            'previous_year': ('2025-09-01', '2025-09-30'),
        }
        for mode, expected in expected_periods.items():
            with self.subTest(mode=mode):
                response = self.client.get(self.url, {
                    'start_date': '2026-09-01', 'end_date': '2026-09-30', 'comparison': mode,
                })
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                period = response.data['comparison']['period']
                self.assertEqual((period['start_date'], period['end_date']), expected)
                self.assertLess(period['end_date'], response.data['period']['start_date'])

        disabled = self.client.get(self.url, {
            'start_date': '2026-09-01', 'end_date': '2026-09-30', 'comparison': 'none',
        })
        self.assertFalse(disabled.data['comparison']['enabled'])
        self.assertEqual(disabled.data['comparison']['period'], {'start_date': None, 'end_date': None})
        self.assertIsNone(disabled.data['comparison']['kpis']['total_tickets']['previous'])
        self.assertEqual(self.client.get(self.url, {'comparison': 'future'}).status_code, status.HTTP_400_BAD_REQUEST)

        custom = self.client.get(self.url, {
            'start_date': '2026-09-10', 'end_date': '2026-09-10',
            'comparison': 'custom',
            'comparison_start_date': '2026-08-05', 'comparison_end_date': '2026-08-05',
        })
        self.assertEqual(custom.status_code, status.HTTP_200_OK)
        self.assertEqual(custom.data['comparison']['mode'], 'custom')
        self.assertEqual(custom.data['comparison']['period'], {
            'start_date': '2026-08-05', 'end_date': '2026-08-05',
        })

        invalid_custom_ranges = [
            {},
            {'comparison_start_date': '2026-08-06', 'comparison_end_date': '2026-08-05'},
            {'comparison_start_date': '2026-09-10', 'comparison_end_date': '2026-09-10'},
            {'comparison_start_date': '2026-08-01', 'comparison_end_date': '2026-08-02'},
        ]
        for extra in invalid_custom_ranges:
            with self.subTest(custom_range=extra):
                response = self.client.get(self.url, {
                    'start_date': '2026-09-10', 'end_date': '2026-09-10',
                    'comparison': 'custom', **extra,
                })
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn('comparison_date_range', response.data)

    def test_all_specialized_workspaces_have_deterministic_scoped_contracts(self):
        required_keys = {
            'technicians': {'summary', 'leaderboard', 'rankings', 'daily_capacity', 'filter_options'},
            'sales': {'kpis', 'charts', 'data_quality', 'filter_options'},
            'inventory': {'summary', 'charts', 'shortage_risk', 'data_quality', 'filter_options'},
            'after_sales': {'case_kpis', 'case_charts', 'maintenance_summary', 'filter_options'},
            'forecasting': {'forecast', 'history_summary', 'historical_charts', 'item_demand_readiness', 'model_status', 'filter_options'},
        }
        for workspace, keys in required_keys.items():
            with self.subTest(workspace=workspace):
                response = self.client.get(self.url, {'workspace': workspace, 'days': 30})
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data['workspace'], workspace)
                self.assertTrue(keys.issubset(response.data.keys()))
        self.assertEqual(self.client.get(self.url, {'workspace': 'unknown'}).status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_relational_filter_ids_return_controlled_errors(self):
        cases = [
            ({'service_type_id': 999999}, 'service_type_id'),
            ({'technician_id': 999999}, 'technician_id'),
            ({'workspace': 'inventory', 'category_id': 999999}, 'category_id'),
            ({'workspace': 'inventory', 'item_id': 999999}, 'item_id'),
            ({'workspace': 'after_sales', 'maintenance_service_type_id': 999999}, 'maintenance_service_type_id'),
        ]
        for params, field in cases:
            with self.subTest(field=field):
                response = self.client.get(self.url, params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_sales_uses_confirmed_records_without_line_total_duplication(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=ZoneInfo('Asia/Manila'))
        confirmed_ticket = self.create_ticket(moment=moment, technician=self.tech)
        confirmed = SalesRecord.objects.create(
            ticket=confirmed_ticket, client=self.client_user, status='confirmed',
            sale_date=date(2026, 9, 10), currency_code='PHP', agreed_total=Decimal('1000.00'),
        )
        SalesRecordLine.objects.create(
            sales_record=confirmed, line_type='service', service_type=self.solar,
            name='Service labor', quantity=1, unit_price=Decimal('400.00'), line_total=Decimal('400.00'),
        )
        SalesRecordLine.objects.create(
            sales_record=confirmed, line_type='other', name='Other', quantity=1,
            unit_price=Decimal('600.00'), line_total=Decimal('600.00'),
        )
        voided_ticket = self.create_ticket(moment=moment, technician=self.tech)
        SalesRecord.objects.create(
            ticket=voided_ticket, client=self.client_user, status='voided',
            sale_date=date(2026, 9, 10), currency_code='PHP', agreed_total=Decimal('9000.00'),
            voided_at=moment,
        )
        response = self.client.get(self.url, {
            'workspace': 'sales', 'start_date': '2026-09-10', 'end_date': '2026-09-10',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['kpis']['confirmed_sales_count']['current'], 1)
        self.assertEqual(Decimal(response.data['kpis']['confirmed_sales_amount']['current']), Decimal('1000.00'))
        self.assertEqual(
            sum(Decimal(row['amount']) for row in response.data['charts']['line_composition']),
            Decimal('1000.00'),
        )
        self.assertEqual(response.data['kpis']['voided_sales_amount']['count'], 1)

    def test_forecast_evidence_uses_genuine_history_and_exposes_real_visual_data(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=ZoneInfo('Asia/Manila'))
        self.create_ticket(moment=moment, service=self.solar, technician=self.tech)
        seeded = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.solar,
            description='[Historical Seed] synthetic request', priority='Normal', status='Approved',
        )
        ServiceRequest.objects.filter(pk=seeded.pk).update(request_date=moment - timedelta(days=35))

        response = self.client.get(self.url, {'workspace': 'forecasting'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['forecast']['request_count'], 1)
        monthly = response.data['historical_charts']['monthly_demand']
        self.assertEqual(sum(row['requests'] for row in monthly), 1)
        self.assertEqual(response.data['historical_charts']['service_mix'][0]['requests'], 1)
        self.assertEqual(response.data['history_summary']['peak_month_requests'], 1)
        self.assertIn('service_location_density', response.data['historical_charts'])
        self.assertIn('historical_item_usage', response.data['historical_charts'])
        self.assertFalse(response.data['item_demand_readiness']['available'])
        self.assertEqual(response.data['item_demand_readiness']['predictions'], [])

    def test_workspace_query_counts_are_bounded(self):
        moment = timezone.now()
        self.create_ticket(moment=moment, technician=self.tech)
        ceilings = {'technicians': 20, 'sales': 25, 'inventory': 32, 'after_sales': 40, 'forecasting': 12}
        for workspace, ceiling in ceilings.items():
            with self.subTest(workspace=workspace):
                with CaptureQueriesContext(connection) as queries:
                    response = self.client.get(self.url, {'workspace': workspace, 'days': 30})
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertLessEqual(len(queries), ceiling)

    def test_technician_performance_breakdown_is_self_scoped(self):
        moment = timezone.now()
        self.create_ticket(moment=moment, technician=self.tech)
        self.create_ticket(moment=moment, technician=self.other_tech)
        self.client.force_authenticate(self.tech)
        response = self.client.get('/api/services/technician-performance/performance_breakdown/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row['technician_id'] for row in response.data], [self.tech.id])

    def test_snapshot_get_and_insufficient_forecast_do_not_write(self):
        self.assertEqual(ServiceAnalytics.objects.count(), 0)
        snapshot = self.client.get('/api/services/analytics/dashboard_metrics/')
        self.assertEqual(snapshot.status_code, status.HTTP_200_OK)
        self.assertEqual(snapshot.data['source'], 'live_read_only')
        self.assertEqual(ServiceAnalytics.objects.count(), 0)

        before = DemandForecast.objects.count()
        forecast = self.client.post('/api/services/demand-forecasts/generate_forecast/', {
            'service_type_id': self.solar.id, 'periods': 7,
        }, format='json')
        self.assertEqual(forecast.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(DemandForecast.objects.count(), before)

    def test_unified_endpoint_stays_within_query_budget(self):
        moment = timezone.now()
        self.create_ticket(moment=moment, technician=self.tech)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url, {'days': 30})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertLessEqual(len(queries), 20)
