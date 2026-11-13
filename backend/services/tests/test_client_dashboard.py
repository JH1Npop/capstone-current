from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from services.business_time import business_today
from services.models import ServiceRequest, ServiceTicket, ServiceType
from users.models import User


class ClientDashboardTests(APITestCase):
    """Each job is counted once, in one stage; accepted (turned-over) work still counts as finished."""

    def setUp(self):
        self.client_user = User.objects.create_user(username='dash-client', password='pass', role='client')
        self.other_client = User.objects.create_user(username='dash-other', password='pass', role='client')
        self.service_type = ServiceType.objects.create(name='Panel cleaning', description='x', estimated_duration=60)
        # The business (UTC+8) day the dashboard uses; the UTC date is a day behind before 08:00 local.
        self.today = business_today()

    def request(self, status='Approved', owner=None):
        return ServiceRequest.objects.create(
            client=owner or self.client_user, service_type=self.service_type, description='x',
            priority='Normal', status=status, preferred_date=self.today + timedelta(days=3),
        )

    def ticket(self, status, *, days=None, rating=None, owner=None):
        request_status = 'Completed' if status in ('Completed', 'Turned Over / Accepted') else 'Approved'
        return ServiceTicket.objects.create(
            request=self.request(request_status, owner), status=status, priority='Normal',
            # Every ticket has a visit date; finished ones default to ten days ago.
            scheduled_date=self.today + timedelta(days=days if days is not None else -10),
            completed_date=timezone.now() if request_status == 'Completed' else None,
            client_rating=rating,
        )

    def test_every_job_is_counted_once_and_accepted_work_still_counts(self):
        self.request('Pending')
        self.request('Pending')
        later = self.ticket('Not Started', days=6)
        soonest = self.ticket('Ready for Service', days=2)
        self.ticket('Not Started', days=10)
        self.ticket('On Hold', days=-4)  # its date has passed
        self.ticket('In Progress', days=0)
        self.ticket('Completed', rating=5)
        self.ticket('Turned Over / Accepted', rating=3)
        self.ticket('Cancelled')
        self.ticket('In Progress', days=1, owner=self.other_client)
        self.client.force_authenticate(user=self.client_user)

        data = self.client.get('/api/dashboard/stats/', {'role': 'client'}).data

        overview = data['overview']
        self.assertEqual(overview['total_requests'], 10)
        self.assertEqual(overview['awaiting_approval'], 2)
        self.assertEqual(overview['active_tickets'], 5)
        self.assertEqual(overview['completed_services'], 2)
        # The stages add up to everything open: 2 waiting for approval + 5 open jobs.
        self.assertEqual(data['status_breakdown'], {'pending': 2, 'waiting_to_start': 3, 'in_progress': 1, 'on_hold': 1})
        self.assertEqual(data['performance'], {'avg_rating': 4.0, 'total_rated': 2})
        # Today's field visit is the next appointment; the past on-hold date is not.
        self.assertEqual(data['next_appointment']['status'], 'In Progress')
        open_ids = [row['id'] for row in data['active_tickets']]
        self.assertEqual(open_ids[1:3], [soonest.id, later.id])
        self.assertEqual(data['active_tickets'][-1]['status'], 'On Hold')
        self.assertEqual(len(data['active_requests']), 2)
        self.assertTrue(all(row['status'] == 'Pending' for row in data['active_requests']))
        self.assertEqual({row['status'] for row in data['recent_history']}, {'Completed', 'Turned Over / Accepted'})
        self.assertEqual(data['alerts'][0]['message'], 'You have 2 requests waiting for approval.')
        self.assertEqual(data['alerts'][1]['message'], '1 service is on hold. Open it to see why.')
        self.assertEqual(data['recommendations'], [])

    def test_no_open_work_suggests_a_new_request_and_no_next_visit(self):
        self.ticket('Completed')
        self.ticket('On Hold', days=-2)
        self.client.force_authenticate(user=self.client_user)

        data = self.client.get('/api/dashboard/stats/', {'role': 'client'}).data

        self.assertIsNone(data['next_appointment'])
        self.assertEqual(data['recommendations'], [])

        ServiceTicket.objects.filter(status='On Hold').update(status='Cancelled')
        data = self.client.get('/api/dashboard/stats/', {'role': 'client'}).data
        self.assertEqual([item['action'] for item in data['recommendations']], ['Create Request'])
