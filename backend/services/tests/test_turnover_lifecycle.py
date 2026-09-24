"""Tests split mechanically from the former services.tests module."""

from ._imports import *  # noqa: F403,F405


class TurnoverLifecycleTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='turnover_admin',
            email='turnover_admin@example.com',
            password='Password123!',
            role='admin',
            admin_scope='All',
        )
        self.technician = User.objects.create_user(
            username='turnover_tech',
            email='turnover_tech@example.com',
            password='Password123!',
            role='technician',
        )
        self.client_user = User.objects.create_user(
            username='turnover_client',
            email='turnover_client@example.com',
            password='Password123!',
            role='client',
        )
        self.service_type = ServiceType.objects.create(
            name='Solar Installation',
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            status='Completed',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician,
            status='Completed',
            scheduled_date=timezone.localdate(),
            start_time=timezone.now() - timedelta(hours=1),
            end_time=timezone.now(),
            completed_date=timezone.now(),
        )
        from services.models import InspectionChecklist, TurnoverAcceptance
        self.checklist = InspectionChecklist.objects.create(
            ticket=self.ticket,
            is_completed=True,
            warranty_provided=True,
            warranty_period_days=365,
            maintenance_required=True,
            maintenance_profile='quarterly',
            maintenance_interval_days=90,
        )
        self.turnover = TurnoverAcceptance.objects.create(
            ticket=self.ticket,
            status='draft',
        )

    def test_turnover_finalize_creates_warranty_and_maintenance(self):
        self.client.force_authenticate(user=self.admin)
        from services.models import MaintenanceSchedule
        response = self.client.post(f'/api/services/turnover-acceptances/{self.turnover.id}/finalize/', {
            'warranty_start_date': str(timezone.localdate()),
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'Turned Over / Accepted')
        self.assertEqual(self.ticket.warranty_status, 'active')
        self.assertIsNotNone(self.ticket.warranty_start_date)
        self.assertIsNotNone(self.ticket.warranty_end_date)

        schedule = MaintenanceSchedule.objects.filter(service_ticket=self.ticket).first()
        self.assertIsNotNone(schedule)
        self.assertEqual(schedule.interval_days, 90)
        self.assertEqual(schedule.maintenance_profile, 'quarterly')
