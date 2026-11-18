"""Office ways out of stuck field work (2026-11-18 dead-end review).

1. A started job whose lead can no longer continue: the office pauses it, then reassigns it.
2. A technician whose GPS arrival check is blocked: the office confirms arrival (logged).
3. The office cancels for its own reasons without blaming the client.
"""

from ._imports import *  # noqa: F403,F405
from services.models import ArrivalValidationLog
from users.views.admin_users import _open_assignment_conflict


class OfficeStuckJobActionTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(username='stuck-client', password='pass', role='client')
        self.admin_user = User.objects.create_user(username='stuck-admin', password='pass', role='admin')
        self.lead = User.objects.create_user(
            username='stuck-lead', password='pass', role='technician', status='active', is_available=True,
            current_latitude='14.560000', current_longitude='121.020000',
        )
        self.replacement = User.objects.create_user(
            username='stuck-replacement', password='pass', role='technician', status='active', is_available=True,
            current_latitude='14.561000', current_longitude='121.021000',
        )
        self.service_type = ServiceType.objects.create(name='Stuck Service', description='x', estimated_duration=60)
        for tech in (self.lead, self.replacement):
            TechnicianSkill.objects.create(technician=tech, service_type=self.service_type, skill_level='expert')
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service_type, description='Stuck job', status='In Progress',
        )
        ServiceLocation.objects.create(
            request=self.request_obj, address='1 Rizal St', latitude='14.560000', longitude='121.020000',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.lead,
            scheduled_date=timezone.localdate(),
            scheduled_time_slot='morning',
            status='In Progress',
            start_time=timezone.now(),
        )
        self.client.force_authenticate(user=self.admin_user)

    def _status(self, new_status, reason='Lead technician is sick today.'):
        return self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/update_status/',
            {'status': new_status, 'reason': reason},
            format='json',
        )

    def test_started_job_cannot_be_reassigned_until_the_office_pauses_it(self):
        refused = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {'technician_id': self.replacement.id, 'dispatch_stage': 'service'},
            format='json',
        )
        self.assertEqual(refused.status_code, status.HTTP_400_BAD_REQUEST)

        paused = self._status('On Hold')
        self.assertEqual(paused.status_code, status.HTTP_200_OK, paused.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'On Hold')

        lead_note = Notification.objects.filter(user=self.lead).latest('id')
        self.assertIn('Paused by the Office', lead_note.title)
        self.assertIn('sick', lead_note.message)
        client_note = Notification.objects.filter(user=self.client_user).latest('id')
        self.assertIn('Paused', client_note.title)
        self.assertNotIn('sick', client_note.message)  # the internal reason stays internal

        reassigned = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {
                'technician_id': self.replacement.id,
                'dispatch_stage': 'service',
                'scheduled_date': (timezone.localdate() + timedelta(days=1)).isoformat(),
                'scheduled_time_slot': 'morning',
            },
            format='json',
        )
        self.assertEqual(reassigned.status_code, status.HTTP_200_OK, reassigned.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.technician, self.replacement)
        # The old lead has no open work left, so the office can now deactivate them.
        self.assertIsNone(_open_assignment_conflict(self.lead))

    def test_office_can_pause_from_travel_and_arrival_too(self):
        for start in ('Navigating', 'Arrived on Site'):
            self.ticket.status = start
            self.ticket.save(update_fields=['status'])
            response = self._status('On Hold')
            self.assertEqual(response.status_code, status.HTTP_200_OK, (start, response.data))

    def test_pause_needs_a_reason_and_only_office_staff_may_do_it(self):
        self.assertEqual(self._status('On Hold', reason='  ').status_code, status.HTTP_400_BAD_REQUEST)
        for user in (self.client_user, self.replacement):
            self.client.force_authenticate(user=user)
            response = self._status('On Hold')
            self.assertIn(response.status_code, (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND))
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'In Progress')

    def test_office_confirms_arrival_when_gps_is_blocked_and_it_is_logged(self):
        self.ticket.status = 'Navigating'
        self.ticket.start_time = None
        self.ticket.save(update_fields=['status', 'start_time'])

        response = self._status('Arrived on Site', reason='Client confirmed by phone; map pin is 80 m off.')

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'Arrived on Site')
        log = ArrivalValidationLog.objects.filter(ticket=self.ticket).latest('id')
        self.assertEqual(log.action, 'arrival_bypassed')
        self.assertEqual(log.performed_by, self.admin_user)
        self.assertEqual(log.technician, self.lead)
        self.assertIn('map pin is 80 m off', log.remarks)

    def test_office_cancellation_is_recorded_as_the_office_reason(self):
        response = self._status('Cancelled', reason='Office cancelled: roof is unsafe to work on.')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        history = ServiceStatusHistory.objects.filter(ticket=self.ticket, status='Cancelled').latest('id')
        self.assertTrue(history.notes.startswith('Office cancelled:'))
