from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User


class TechnicianAvailabilitySignalTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='availability-client',
            password='pass',
            role='client',
        )
        self.technician = User.objects.create_user(
            username='availability-tech',
            password='pass',
            role='technician',
            status='active',
            is_available=False,
        )
        self.backup = User.objects.create_user(
            username='availability-backup',
            password='pass',
            role='technician',
            status='active',
            is_available=True,
        )
        self.service_type = ServiceType.objects.create(
            name='Availability service',
            description='Availability synchronization test service',
            estimated_duration=60,
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Availability synchronization request',
            priority='Normal',
            status='Approved',
        )

    def refresh_availability(self, user):
        user.refresh_from_db()
        return user.is_available

    def test_ticket_status_changes_reconcile_derived_availability(self):
        ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )
        self.assertTrue(self.refresh_availability(self.technician))

        ticket.status = 'In Progress'
        ticket.save(update_fields=['status'])
        self.assertFalse(self.refresh_availability(self.technician))

        ticket.status = 'Completed'
        ticket.save(update_fields=['status'])
        self.assertTrue(self.refresh_availability(self.technician))

    def test_direct_reassignment_reconciles_previous_and_new_leads(self):
        ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
        )
        self.assertFalse(self.refresh_availability(self.technician))

        ticket.technician = self.backup
        ticket.save(update_fields=['technician'])

        self.assertTrue(self.refresh_availability(self.technician))
        self.assertFalse(self.refresh_availability(self.backup))

    def test_crew_addition_and_removal_reconcile_availability(self):
        ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            technician=self.technician,
            scheduled_date=timezone.localdate(),
            status='In Progress',
            priority='Normal',
        )
        assignment = TicketCrewAssignment.objects.create(
            ticket=ticket,
            technician=self.backup,
        )
        self.assertFalse(self.refresh_availability(self.backup))

        assignment.delete()
        self.assertTrue(self.refresh_availability(self.backup))


class TechnicianAvailabilityCommandTests(TestCase):
    def setUp(self):
        self.technician = User.objects.create_user(
            username='stale-availability-tech',
            password='pass',
            role='technician',
            status='active',
            is_available=False,
        )

    def test_command_is_dry_run_by_default_and_applies_only_when_requested(self):
        output = StringIO()
        call_command('reconcile_technician_availability', stdout=output)
        self.assertFalse(self.refresh_availability())
        self.assertIn('mismatched=1, changed=0', output.getvalue())

        output = StringIO()
        call_command('reconcile_technician_availability', '--apply', stdout=output)
        self.assertTrue(self.refresh_availability())
        self.assertIn('mismatched=1, changed=1', output.getvalue())

    def refresh_availability(self):
        self.technician.refresh_from_db()
        return self.technician.is_available
