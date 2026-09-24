"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class SLAEvaluationTests(TestCase):
    def setUp(self):
        self.now = timezone.make_aware(datetime(2026, 3, 22, 10, 0, 0))
        self.client_user = User.objects.create_user(
            username='sla-client',
            password='pass',
            role='client',
        )
        self.technician_user = User.objects.create_user(
            username='sla-tech',
            password='pass',
            role='technician',
        )
        self.service_type = ServiceType.objects.create(
            name='SLA Service',
            description='Service with SLA coverage',
            estimated_duration=60,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Pending request',
            priority='Normal',
            status='Pending',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician_user,
            scheduled_date=self.now.date(),
            scheduled_time=time(hour=9, minute=0),
            status='Not Started',
            priority='Normal',
        )

    def _update_request(self, **updates):
        ServiceRequest.objects.filter(pk=self.request_obj.pk).update(**updates)
        self.request_obj.refresh_from_db()

    def _update_ticket(self, **updates):
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(**updates)
        self.ticket.refresh_from_db()

    def test_pending_request_transitions_to_warning(self):
        self._update_request(request_date=self.now - timedelta(hours=5))

        evaluation = evaluate_service_request_sla(self.request_obj, now=self.now)

        self.assertEqual(evaluation['rule'], 'approval_delay')
        self.assertEqual(evaluation['state'], 'warning')
        self.assertEqual(evaluation['action_required'], 'Review request')
        self.assertEqual(evaluation['minutes_to_breach'], 180)

    def test_pending_request_transitions_to_overdue(self):
        self._update_request(request_date=self.now - timedelta(hours=9))

        evaluation = evaluate_service_request_sla(self.request_obj, now=self.now)

        self.assertEqual(evaluation['state'], 'overdue')
        self.assertEqual(evaluation['minutes_to_breach'], 0)
        self.assertEqual(evaluation['minutes_overdue'], 60)

    def test_unassigned_ticket_uses_assignment_delay_rule(self):
        self._update_ticket(
            technician=None,
            created_at=self.now - timedelta(hours=3),
            scheduled_time=time(hour=11, minute=0),
        )

        evaluation = evaluate_service_ticket_sla(self.ticket, now=self.now)

        self.assertEqual(evaluation['rule'], 'assignment_delay')
        self.assertEqual(evaluation['state'], 'warning')
        self.assertEqual(evaluation['action_required'], 'Assign technician')

    def test_future_unassigned_ticket_does_not_show_assignment_overdue(self):
        self._update_ticket(
            technician=None,
            created_at=self.now - timedelta(days=1),
            scheduled_date=self.now.date() + timedelta(days=1),
            scheduled_time=time(hour=11, minute=0),
        )

        evaluation = evaluate_service_ticket_sla(self.ticket, now=self.now)

        self.assertEqual(evaluation['rule'], 'assignment_delay')
        self.assertEqual(evaluation['state'], 'inactive')
        self.assertEqual(evaluation['label'], 'Assignment SLA not due yet')

    def test_assigned_ticket_uses_start_delay_rule(self):
        self._update_ticket(
            technician=self.technician_user,
            scheduled_date=self.now.date(),
            scheduled_time=(self.now - timedelta(minutes=70)).time(),
            status='Not Started',
        )

        evaluation = evaluate_service_ticket_sla(self.ticket, now=self.now)

        self.assertEqual(evaluation['rule'], 'start_delay')
        self.assertEqual(evaluation['state'], 'overdue')
        self.assertEqual(evaluation['minutes_overdue'], 10)
        self.assertEqual(evaluation['action_required'], 'Start work')

    def test_in_progress_ticket_uses_execution_delay_rule(self):
        self._update_ticket(
            status='In Progress',
            start_time=self.now - timedelta(minutes=100),
            technician=self.technician_user,
        )

        evaluation = evaluate_service_ticket_sla(self.ticket, now=self.now)

        self.assertEqual(evaluation['rule'], 'execution_delay')
        self.assertEqual(evaluation['state'], 'warning')
        self.assertEqual(evaluation['minutes_to_breach'], 20)
        self.assertEqual(evaluation['action_required'], 'Complete work')

    def test_reschedule_requested_ticket_uses_reschedule_delay_rule(self):
        self._update_ticket(
            status='Not Started',
            reschedule_requested=True,
            reschedule_requested_at=self.now - timedelta(hours=13),
        )

        evaluation = evaluate_service_ticket_sla(self.ticket, now=self.now)

        self.assertEqual(evaluation['rule'], 'reschedule_delay')
        self.assertEqual(evaluation['state'], 'overdue')
        self.assertEqual(evaluation['minutes_overdue'], 60)
        self.assertEqual(evaluation['action_required'], 'Review reschedule request')

    def test_completed_ticket_pauses_sla(self):
        self._update_ticket(status='Completed', completed_date=self.now)

        evaluation = evaluate_service_ticket_sla(self.ticket, now=self.now)

        self.assertEqual(evaluation['state'], 'paused')
        self.assertIsNone(evaluation['rule'])
        self.assertFalse(evaluation['is_active'])
