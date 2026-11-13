"""Query ceilings: busy screens must not ask the database once per job, client or notice.

A local run with a few years of data (25,000 jobs, 3,000 users) found screens that made one query per
row: the Dashboard (3,662 queries), the Tickets summary (1,637), the Calendar (6,311), the user and
client lists (3,045) and Technician performance (1,121). Each test here loads a screen with a few rows,
adds more rows, and checks the number of queries stays the same.
"""

from datetime import time, timedelta
from decimal import Decimal

from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from services.business_time import business_today
from services.models import ServiceRequest, ServiceStatusHistory, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User

# Room for a query or two that depends on the data (for example a cache filled on first use), never one per row.
SLACK = 2


class QueryCeilingTests(APITestCase):
    def setUp(self):
        self.office = User.objects.create_user(username='qc-office', password='x', role='superadmin')
        self.service = ServiceType.objects.create(
            name='Ceiling check', estimated_duration=60, estimated_cost=Decimal('1000'), max_daily_assignments=999,
        )
        self.made = 0
        self.client.force_authenticate(self.office)

    def add_jobs(self, count):
        """Open and finished jobs with a technician, a crew, status history and a reschedule note."""
        today = business_today()
        for _ in range(count):
            self.made += 1
            n = self.made
            client = User.objects.create_user(username=f'qc-client-{n}', password='x', role='client', email=f'qc{n}@example.com')
            tech = User.objects.create_user(username=f'qc-tech-{n}', password='x', role='technician', status='active')
            request_obj = ServiceRequest.objects.create(
                client=client, service_type=self.service, description='Ceiling job', status='Approved',
            )
            status = ['Not Started', 'In Progress', 'Completed', 'On Hold'][n % 4]
            ticket = ServiceTicket.objects.create(
                request=request_obj, technician=tech, status=status,
                scheduled_date=today + timedelta(days=n % 5), scheduled_time=time(9, 0),
                assigned_at=timezone.now() - timedelta(days=1),
                completed_date=timezone.now() if status == 'Completed' else None,
            )
            TicketCrewAssignment.objects.create(ticket=ticket, technician=tech)
            ServiceStatusHistory.objects.create(ticket=ticket, status='Not Started', notes='Ticket created')
            ServiceStatusHistory.objects.create(ticket=ticket, status=status, notes=f'Rescheduled to {today}')

    def queries(self, path):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(path, HTTP_HOST='localhost')
        self.assertEqual(response.status_code, 200, (path, getattr(response, 'data', None)))
        return len(ctx.captured_queries)

    def assert_flat(self, path):
        self.add_jobs(3)
        self.queries(path)  # warm-up: settings and other one-time reads
        few = self.queries(path)
        self.add_jobs(27)
        many = self.queries(path)
        self.assertLessEqual(many, few + SLACK, f'{path}: {few} queries with 3 jobs, {many} with 30')

    def test_dashboard(self):
        self.assert_flat('/api/services/dashboard/')

    def test_tickets_summary(self):
        self.assert_flat('/api/services/service-tickets/summary/')

    def test_calendar(self):
        today = business_today()
        self.assert_flat(f'/api/admin/calendar/?start={today - timedelta(days=1)}&end={today + timedelta(days=30)}')

    def test_user_list(self):
        self.assert_flat('/api/users/')

    def test_client_list(self):
        self.assert_flat('/api/admin/clients/')

    def test_technician_performance(self):
        self.assert_flat('/api/services/technician-performance/performance_breakdown/')

    def test_notifications_tab(self):
        from notifications.models import Notification

        def add(count):
            for index in range(count):
                Notification.objects.create(user=self.office, title=f'N{index}', message='x', type='warning')
        add(3)
        self.queries('/api/notifications/?category=warning')
        few = self.queries('/api/notifications/?category=warning')
        add(30)
        self.assertLessEqual(self.queries('/api/notifications/?category=warning'), few + SLACK)
