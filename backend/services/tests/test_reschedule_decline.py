"""The office can answer a client's reschedule request with "keep the current date"."""

from ._imports import *  # noqa: F403,F405


class DeclineRescheduleRequestTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(username='decline-client', password='pass', role='client')
        self.other_client = User.objects.create_user(username='decline-other', password='pass', role='client')
        self.admin_user = User.objects.create_user(username='decline-admin', password='pass', role='admin')
        self.technician = User.objects.create_user(
            username='decline-tech', password='pass', role='technician', status='active', is_available=True,
        )
        self.service_type = ServiceType.objects.create(name='Decline Service', description='x', estimated_duration=60)
        self.kept_date = timezone.localdate() + timedelta(days=5)
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Keep date test',
            status='Approved',
            preferred_date=self.kept_date,
            preferred_time_slot='morning',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            scheduled_date=self.kept_date,
            scheduled_time_slot='morning',
            status='Not Started',
        )

    def _client_asks_to_move(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/request_reschedule/',
            {
                'reason': 'Out of town that week.',
                'preferred_date': (self.kept_date + timedelta(days=10)).isoformat(),
                'preferred_time_slot': 'afternoon',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def _decline(self, user, notes='Crew is fully booked that week; we will keep your date.'):
        self.client.force_authenticate(user=user)
        return self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/decline_reschedule/',
            {'notes': notes},
            format='json',
        )

    def test_office_keeps_the_date_clears_the_request_and_tells_the_client(self):
        self._client_asks_to_move()
        response = self._decline(self.admin_user)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.request_obj.refresh_from_db()
        self.assertFalse(self.ticket.reschedule_requested)
        self.assertIsNone(self.ticket.reschedule_reason)
        self.assertEqual(self.ticket.scheduled_date, self.kept_date)
        # The client's wish no longer stands as the preferred date.
        self.assertEqual(self.request_obj.preferred_date, self.kept_date)
        self.assertEqual(self.request_obj.preferred_time_slot, 'morning')

        history = ServiceStatusHistory.objects.filter(ticket=self.ticket).latest('id')
        self.assertIn('Reschedule request declined', history.notes)
        self.assertIn('Out of town that week.', history.notes)
        self.assertEqual(history.changed_by, self.admin_user)

        note = Notification.objects.filter(user=self.client_user).latest('id')
        self.assertIn('Schedule Unchanged', note.title)
        self.assertIn('fully booked', note.message)

    def test_a_reason_is_required(self):
        self._client_asks_to_move()
        response = self._decline(self.admin_user, notes='   ')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.ticket.refresh_from_db()
        self.assertTrue(self.ticket.reschedule_requested)

    def test_nothing_to_decline_without_an_open_request(self):
        response = self._decline(self.admin_user)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_client_and_technician_cannot_decline(self):
        self._client_asks_to_move()
        for user in (self.client_user, self.other_client, self.technician):
            response = self._decline(user)
            self.assertIn(
                response.status_code,
                (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
                f'{user.username} got {response.status_code}',
            )
        self.ticket.refresh_from_db()
        self.assertTrue(self.ticket.reschedule_requested)

    def test_client_can_ask_again_after_a_decline(self):
        self._client_asks_to_move()
        self.assertEqual(self._decline(self.admin_user).status_code, status.HTTP_200_OK)
        self._client_asks_to_move()
        self.ticket.refresh_from_db()
        self.assertTrue(self.ticket.reschedule_requested)
