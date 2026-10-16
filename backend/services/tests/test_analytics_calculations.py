"""Regression tests for analytics calculation fixes and the basic service-quality measures."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from services.models import QuotationRecord, SalesRecord, ServiceLocation, ServiceRequest, ServiceTicket, ServiceType
from users.models import User, UserCapabilityGrant
from users.rbac import ANALYTICS_VIEW

MANILA = ZoneInfo('Asia/Manila')


@override_settings(BUSINESS_DISPLAY_TIMEZONE='Asia/Manila')
class AnalyticsCalculationTests(APITestCase):
    url = '/api/admin/analytics/'

    def setUp(self):
        self.admin = User.objects.create_user(username='calc-admin', password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=self.admin, capability_code=ANALYTICS_VIEW)
        self.client_user = User.objects.create_user(username='calc-client', password='pass', role='client')
        User.objects.filter(pk=self.client_user.pk).update(date_joined=datetime(2026, 1, 1, tzinfo=MANILA))
        self.tech = User.objects.create_user(username='calc-tech', password='pass', role='technician')
        self.solar = ServiceType.objects.create(name='Solar calc', estimated_duration=120)
        self.client.force_authenticate(self.admin)

    def create_ticket(self, *, moment, status_value='Not Started', technician=None, request_obj=None,
                      completed=None, scheduled=None, rating=None, assigned=None):
        if request_obj is None:
            request_obj = ServiceRequest.objects.create(
                client=self.client_user, service_type=self.solar, description='Genuine calc request', status='Approved',
            )
            ServiceRequest.objects.filter(pk=request_obj.pk).update(request_date=moment)
            ServiceLocation.objects.create(request=request_obj, address='Addr', city='Lucena', province='Quezon')
            request_obj.refresh_from_db()
        ticket = ServiceTicket.objects.create(
            request=request_obj, technician=technician, status=status_value,
            scheduled_date=scheduled or moment.date(), assigned_at=assigned,
            start_time=(completed - timedelta(hours=2)) if completed else None,
            completed_date=completed, client_rating=rating,
        )
        ServiceTicket.objects.filter(pk=ticket.pk).update(created_at=moment)
        return ticket

    def get(self, **params):
        response = self.client.get(self.url, {'start_date': '2026-09-10', 'end_date': '2026-09-10', **params})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def test_turned_over_tickets_count_as_completed_work(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=MANILA)
        finished = moment + timedelta(hours=4)
        self.create_ticket(moment=moment, status_value='Completed', technician=self.tech, completed=finished, assigned=moment)
        self.create_ticket(moment=moment, status_value='Turned Over / Accepted', technician=self.tech, completed=finished, assigned=moment)

        data = self.get()

        self.assertEqual(data['kpis']['completed_tickets'], 2)
        self.assertEqual(data['kpis']['completion_rate'], 100.0)
        self.assertEqual(data['kpis']['average_completion_observations'], 2)
        self.assertEqual(sum(row['completions'] for row in data['charts']['requests_vs_completions']), 2)
        self.assertEqual(data['charts']['technician_workload'][0]['completed_jobs'], 2)

        technicians = self.get(workspace='technicians')
        self.assertEqual(technicians['leaderboard'][0]['completed_lead_jobs'], 2)
        self.assertEqual(technicians['leaderboard'][0]['pending_lead_jobs'], 0)

    def test_request_with_two_matching_tickets_is_counted_once(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=MANILA)
        first = self.create_ticket(moment=moment, technician=self.tech)
        self.create_ticket(moment=moment, technician=self.tech, request_obj=first.request)

        data = self.get(technician_id=self.tech.id)

        self.assertEqual(data['charts']['service_demand'][0]['requests'], 1)
        self.assertEqual(data['charts']['locations'][0]['requests'], 1)
        self.assertEqual(sum(row['requests'] for row in data['charts']['requests_vs_completions']), 1)

    def test_next_seven_days_excludes_the_eighth_day(self):
        today = timezone.now().astimezone(MANILA).date()
        moment = datetime.combine(today, datetime.min.time(), tzinfo=MANILA)
        self.create_ticket(moment=moment, technician=self.tech, scheduled=today + timedelta(days=6))
        self.create_ticket(moment=moment, technician=self.tech, scheduled=today + timedelta(days=7))

        data = self.client.get(self.url).data

        self.assertEqual(data['attention']['upcoming_scheduled_jobs'], 1)

    def test_empty_previous_period_has_no_completion_rate_baseline(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=MANILA)
        self.create_ticket(moment=moment, status_value='Completed', completed=moment + timedelta(hours=3))

        comparison = self.get()['comparison']['kpis']['completion_rate']

        self.assertEqual(comparison['current'], 100.0)
        self.assertIsNone(comparison['previous'])
        self.assertIsNone(comparison['delta_points'])

    def test_basic_service_quality_measures(self):
        moment = datetime(2026, 9, 10, 8, tzinfo=MANILA)
        day = moment.date()
        # Assigned 2h and 4h after the request: average response 3h.
        self.create_ticket(moment=moment, status_value='Completed', technician=self.tech, assigned=moment + timedelta(hours=2),
                           completed=moment + timedelta(hours=6), scheduled=day, rating=5)
        self.create_ticket(moment=moment, status_value='Turned Over / Accepted', technician=self.tech,
                           assigned=moment + timedelta(hours=4), completed=moment + timedelta(hours=9),
                           scheduled=day - timedelta(days=1), rating=3)
        self.create_ticket(moment=moment, status_value='Cancelled')
        self.create_ticket(moment=moment)
        new_client = User.objects.create_user(username='calc-new-client', password='pass', role='client')
        User.objects.filter(pk=new_client.pk).update(date_joined=moment)

        kpis = self.get()['kpis']

        self.assertEqual(kpis['average_response_hours'], 3.0)
        self.assertEqual(kpis['response_observations'], 2)
        self.assertEqual(kpis['on_schedule_rate'], 50.0)
        self.assertEqual(kpis['on_schedule_observations'], 2)
        self.assertEqual(kpis['average_client_rating'], 4.0)
        self.assertEqual(kpis['rating_count'], 2)
        self.assertEqual(kpis['cancellation_rate'], 25.0)
        self.assertEqual(kpis['cancelled_tickets'], 1)
        self.assertEqual(kpis['new_clients'], 1)

    def test_quotation_conversion_is_unavailable_without_decisions(self):
        data = self.get(workspace='sales')

        self.assertIsNone(data['kpis']['quotation_conversion_rate']['current'])
        self.assertIsNone(data['kpis']['quotation_conversion_rate']['previous'])
        self.assertTrue(QuotationRecord.objects.count() == 0)

    def test_sales_trend_fills_every_period_in_one_currency(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=MANILA)
        for amount, sale_day in [('1000.00', date(2026, 9, 10)), ('500.00', date(2026, 9, 12))]:
            ticket = self.create_ticket(moment=moment, status_value='Completed', completed=moment + timedelta(hours=3))
            SalesRecord.objects.create(
                ticket=ticket, client=self.client_user, status='confirmed',
                sale_date=sale_day, currency_code='PHP', agreed_total=Decimal(amount),
            )

        data = self.get(workspace='sales', start_date='2026-09-10', end_date='2026-09-12')
        trend = data['charts']['sales_trend']

        self.assertEqual([row['period'] for row in trend], ['2026-09-10', '2026-09-11', '2026-09-12'])
        self.assertEqual([Decimal(row['amount']) for row in trend], [Decimal('1000.00'), Decimal('0'), Decimal('500.00')])
        self.assertEqual([row['count'] for row in trend], [1, 0, 1])
        # Two PHP sales on different dates are one currency, so the total is shown.
        self.assertFalse(data['data_quality']['multiple_currencies'])
        self.assertEqual(Decimal(data['kpis']['confirmed_sales_amount']['current']), Decimal('1500.00'))

    def test_ai_summary_matches_the_analytics_page(self):
        moment = datetime(2026, 9, 10, 9, tzinfo=MANILA)
        self.create_ticket(moment=moment, status_value='Turned Over / Accepted', technician=self.tech,
                           completed=moment + timedelta(hours=3), assigned=moment + timedelta(hours=1), rating=4)
        self.create_ticket(moment=moment, technician=self.tech, assigned=moment + timedelta(hours=3))

        page = self.get()
        response = self.client.get('/api/admin/analytics/ai-summary/', {'days': 1, 'start_date': '2026-09-10', 'end_date': '2026-09-10'})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        summary = response.data['analytics']

        self.assertEqual(summary['overview']['avgResponseTimeHours'], page['kpis']['average_response_hours'])
        self.assertEqual(summary['overview']['averageClientRating'], 4.0)
        self.assertEqual(summary['overview']['activeTechnicians'], 1)
        self.assertEqual(summary['topServices'][0]['serviceType'], self.solar.name)
        self.assertEqual(summary['topTechnician']['completedJobs'], 1)
        self.assertEqual(summary['confirmedSales']['count'], 0)
        self.assertNotIn('completedServiceValue', summary)
