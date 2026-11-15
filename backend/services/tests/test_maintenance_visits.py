"""Booking a maintenance visit from a plan, and how the finished visit continues the plan."""
from datetime import timedelta
from unittest.mock import patch

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from notifications.models import Notification
from services.business_time import business_today
from services.maintenance import process_maintenance_alerts
from services.models import (
    AfterSalesCase, InspectionChecklist, MaintenanceSchedule, ServiceLocation, ServiceRequest, ServiceTicket, ServiceType,
)
from services.views.helpers import sync_ticket_maintenance_schedule
from users.models import User


class MaintenanceVisitTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='visit-client', password='x', role='client', email='owner@example.test')
        self.other_client = User.objects.create_user(username='visit-other', password='x', role='client')
        self.admin = User.objects.create_user(username='visit-admin', password='x', role='admin')
        self.tech = User.objects.create_user(username='visit-tech', password='x', role='technician')
        self.service = ServiceType.objects.create(name='Solar Cleaning', estimated_duration=60)
        self.plan = self.make_plan()

    def make_job(self, address='12 Mabini St, Calamba', client=None, status='Completed', days_ago=100):
        request = ServiceRequest.objects.create(
            client=client or self.owner, service_type=self.service, description='Job', status='Completed',
        )
        ServiceLocation.objects.create(
            request=request, address=address, city='Calamba', province='Laguna', latitude=14.2117, longitude=121.1653,
        )
        return ServiceTicket.objects.create(
            request=request, status=status, scheduled_date=business_today() - timedelta(days=days_ago),
            completed_date=timezone.now() - timedelta(days=days_ago),
        )

    def make_plan(self, **overrides):
        ticket = self.make_job()
        fields = dict(
            service_ticket=ticket, client=self.owner, service_type=self.service, maintenance_profile='commercial_area',
            interval_days=90, last_service_date=business_today() - timedelta(days=88),
            next_due_date=business_today() + timedelta(days=2), notify_on_date=business_today() - timedelta(days=5),
            status='due_soon',
        )
        fields.update(overrides)
        return MaintenanceSchedule.objects.create(**fields)

    def book(self, user, plan=None, **data):
        self.client.force_authenticate(user=user)
        payload = {'preferred_date': (business_today() + timedelta(days=3)).isoformat(), **data}
        return self.client.post(f'/api/services/maintenance-schedules/{(plan or self.plan).id}/book-visit/', payload, format='json')

    # ── Booking ──
    def test_office_books_a_linked_pending_visit_at_the_plan_site(self):
        response = self.book(self.admin, notes='Bring the long brush.')
        self.assertEqual(response.status_code, 201, response.data)
        visit = ServiceRequest.objects.get(pk=response.data['request']['id'])
        self.assertEqual(visit.maintenance_plan_id, self.plan.id)
        self.assertEqual(visit.status, 'Pending')
        self.assertEqual(visit.client_id, self.owner.id)
        self.assertEqual(visit.request_source, 'admin_created')
        self.assertEqual(visit.location.address, '12 Mabini St, Calamba')
        self.assertIn('Bring the long brush.', visit.description)
        self.assertEqual(response.data['plan']['booked_visit']['request_id'], visit.id)
        self.assertEqual(response.data['request']['maintenance_plan'], self.plan.id)

        again = self.book(self.admin)
        self.assertEqual(again.status_code, 400, 'one open visit per plan')

    def test_the_plans_client_can_book_but_nobody_else(self):
        self.assertEqual(self.book(self.other_client).status_code, 403)
        self.assertEqual(self.book(self.tech).status_code, 403)
        response = self.book(self.owner)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ServiceRequest.objects.get(pk=response.data['request']['id']).request_source, 'client_portal')

    def test_booking_needs_an_active_plan_and_a_valid_date(self):
        self.assertEqual(self.book(self.admin, preferred_date='').status_code, 400)
        self.assertEqual(self.book(self.admin, preferred_date=(business_today() - timedelta(days=1)).isoformat()).status_code, 400)
        stopped = self.make_plan(status='dismissed')
        self.assertEqual(self.book(self.admin, plan=stopped).status_code, 400)
        self.assertFalse(ServiceRequest.objects.filter(maintenance_plan__isnull=False).exists())

    def test_the_link_cannot_be_set_through_the_normal_request_form(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post('/api/services/service-requests/', {
            'service_type': self.service.id, 'description': 'x', 'maintenance_plan': self.plan.id,
            'preferred_date': (business_today() + timedelta(days=3)).isoformat(),
            'location_address': 'Somewhere', 'latitude': '14.2', 'longitude': '121.1',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNone(ServiceRequest.objects.get(pk=response.data['id']).maintenance_plan_id)

    # ── While booked ──
    @patch('services.maintenance.send_mail')
    def test_reminders_pause_while_a_visit_is_booked(self, mock_mail):
        self.book(self.admin)
        Notification.objects.all().delete()
        summary = process_maintenance_alerts()
        self.assertEqual(summary.get('visit_booked'), 1)
        self.assertEqual(summary['seven_day'] + summary['three_day'] + summary['due'] + summary['client_notified'], 0)
        self.assertFalse(Notification.objects.filter(type='reminder').exists())
        mock_mail.assert_not_called()

        # A cancelled visit frees the plan: reminders resume and it can be booked again.
        ServiceRequest.objects.filter(maintenance_plan=self.plan).update(status='Cancelled')
        self.assertGreater(process_maintenance_alerts()['three_day'], 0)
        self.assertEqual(self.book(self.admin).status_code, 201)

    # ── Visit finished ──
    def test_finishing_the_visit_starts_the_next_cycle_without_a_second_plan(self):
        visit = ServiceRequest.objects.get(pk=self.book(self.admin).data['request']['id'])
        case = AfterSalesCase.objects.create(
            service_ticket=self.plan.service_ticket, client=self.owner, case_type='maintenance', status='open',
            priority='normal', summary='Maintenance due', due_date=self.plan.next_due_date, creation_source='maintenance_alert',
        )
        visit_ticket = ServiceTicket.objects.create(
            request=visit, status='Completed', scheduled_date=business_today(), completed_date=timezone.now(),
        )
        InspectionChecklist.objects.create(ticket=visit_ticket, maintenance_required=True, maintenance_profile='standard_area')

        sync_ticket_maintenance_schedule(visit_ticket)
        self.plan.refresh_from_db()
        case.refresh_from_db()
        self.assertEqual(self.plan.last_service_date, business_today())
        self.assertEqual(self.plan.interval_days, 120, "the visit's checklist sets the new interval")
        self.assertEqual(self.plan.next_due_date, business_today() + timedelta(days=120))
        self.assertEqual(case.status, 'resolved')
        self.assertFalse(MaintenanceSchedule.objects.filter(service_ticket=visit_ticket).exists())

        # Re-saving the visit's checklist or turnover later does not roll it again.
        first_due = self.plan.next_due_date
        sync_ticket_maintenance_schedule(visit_ticket)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.next_due_date, first_due)
        self.assertEqual(Notification.objects.filter(user=self.owner, title='Next Maintenance Scheduled').count(), 1)

    def test_an_unlinked_repeat_job_at_the_same_site_continues_the_plan(self):
        repeat = self.make_job(days_ago=0)
        InspectionChecklist.objects.create(ticket=repeat, maintenance_required=True, maintenance_profile='commercial_area')
        sync_ticket_maintenance_schedule(repeat)
        self.plan.refresh_from_db()
        self.assertEqual(self.plan.last_service_date, business_today())
        self.assertEqual(MaintenanceSchedule.objects.filter(client=self.owner).count(), 1)

        # A different site is a separate plan.
        elsewhere = self.make_job(address='99 Rizal Ave, Sta. Rosa', days_ago=0)
        InspectionChecklist.objects.create(ticket=elsewhere, maintenance_required=True, maintenance_profile='commercial_area')
        sync_ticket_maintenance_schedule(elsewhere)
        self.assertEqual(MaintenanceSchedule.objects.filter(client=self.owner).count(), 2)

    # ── Lists ──
    def test_client_sees_only_their_plans_without_office_fields(self):
        self.make_plan(client=self.other_client, service_ticket=self.make_job(client=self.other_client))
        self.client.force_authenticate(user=self.owner)
        rows = self.client.get('/api/services/maintenance-schedules/mine/').data
        self.assertEqual([row['id'] for row in rows], [self.plan.id])
        self.assertNotIn('risk_score', rows[0])
        self.assertIn('booked_visit', rows[0])
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get('/api/services/maintenance-schedules/mine/').status_code, 403)

    def test_the_office_list_does_not_query_once_per_plan(self):
        self.book(self.admin)
        self.client.force_authenticate(user=self.admin)

        def count_queries():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.client.get('/api/services/maintenance-schedules/', {'status': 'all'}).status_code, 200)
            return len(ctx.captured_queries)

        few = count_queries()
        for _ in range(5):
            plan = self.make_plan()
            self.book(self.admin, plan=plan)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(count_queries(), few)


class MaintenanceVisitServiceSettingTests(MaintenanceVisitTests):
    def test_the_catalog_setting_picks_the_visit_service(self):
        cleaning = ServiceType.objects.create(name='Solar Panel Cleaning', estimated_duration=60)
        self.service.maintenance_service = cleaning
        self.service.save(update_fields=['maintenance_service'])

        self.client.force_authenticate(user=self.admin)
        row = self.client.get(f'/api/services/maintenance-schedules/{self.plan.id}/').data
        self.assertEqual(row['visit_service_type'], cleaning.id)
        self.assertEqual(row['visit_service_type_name'], 'Solar Panel Cleaning')

        response = self.book(self.admin)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(ServiceRequest.objects.get(pk=response.data['request']['id']).service_type_id, cleaning.id)

    def test_an_inactive_setting_falls_back_and_cannot_be_chosen(self):
        retired = ServiceType.objects.create(name='Old Cleaning', estimated_duration=60, is_active=False)
        self.service.maintenance_service = retired
        self.service.save(update_fields=['maintenance_service'])
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get(f'/api/services/maintenance-schedules/{self.plan.id}/').data['visit_service_type'], self.service.id)

        superadmin = User.objects.create_user(username='visit-super', password='x', role='superadmin')
        self.client.force_authenticate(user=superadmin)
        response = self.client.patch(f'/api/services/service-types/{self.service.id}/', {'maintenance_service': retired.id}, format='json')
        self.assertEqual(response.status_code, 400)
        active = ServiceType.objects.create(name='Panel Wash', estimated_duration=60)
        response = self.client.patch(f'/api/services/service-types/{self.service.id}/', {'maintenance_service': active.id}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['maintenance_service_name'], 'Panel Wash')
