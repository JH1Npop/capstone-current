"""
Comprehensive tests for auto-dispatch and SLA enforcement features.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from unittest.mock import patch, MagicMock

from services.models import (
    ServiceType, ServiceRequest, ServiceLocation, ServiceTicket,
    TechnicianSkill, TicketCrewAssignment
)
from services.auto_dispatch import (
    find_best_technician,
    auto_assign_technician,
    should_attempt_auto_dispatch,
    reassign_if_needed,
)
from services.sla import (
    evaluate_service_request_sla,
    evaluate_service_ticket_sla,
    check_and_escalate_sla_breaches,
    check_sla_warnings,
    SLA_STATE_HEALTHY,
    SLA_STATE_WARNING,
    SLA_STATE_OVERDUE,
    SLA_STATE_INACTIVE,
    SLA_STATE_PAUSED,
)
from users.models import AdminSettings

User = get_user_model()


class AutoDispatchTests(TestCase):
    """Test the auto-dispatch functionality."""

    def setUp(self):
        """Set up test data."""
        # Create service type
        self.ac_service = ServiceType.objects.create(
            name="AC Service",
            estimated_duration=120
        )

        # Create a client
        self.client_user = User.objects.create_user(
            username='testclient',
            password='pass123',
            role='client',
            status='active'
        )

        # Create technicians
        self.tech_expert = User.objects.create_user(
            username='tech_expert',
            password='pass123',
            role='technician',
            current_latitude=Decimal('14.5995'),
            current_longitude=Decimal('120.9842'),
            is_available=True,
            status='active'
        )

        self.tech_busy = User.objects.create_user(
            username='tech_busy',
            password='pass123',
            role='technician',
            current_latitude=Decimal('14.5995'),
            current_longitude=Decimal('120.9842'),
            is_available=False,  # Not available
            status='active'
        )

        # Create skills
        TechnicianSkill.objects.create(
            technician=self.tech_expert,
            service_type=self.ac_service,
            skill_level='expert'
        )

        TechnicianSkill.objects.create(
            technician=self.tech_busy,
            service_type=self.ac_service,
            skill_level='expert'
        )

        # Create a service request
        self.request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.ac_service,
            description="AC repair needed",
            status='Pending',
            preferred_date=timezone.localdate() + timedelta(days=1),
        )

        # Create location
        self.location = ServiceLocation.objects.create(
            request=self.request,
            address="123 Main St",
            city="Manila",
            latitude=Decimal('14.5995'),
            longitude=Decimal('120.9842'),
        )

        # Create ticket
        self.ticket = ServiceTicket.objects.create(
            request=self.request,
            status='Not Started',
            priority='Normal',
            scheduled_date=timezone.localdate() + timedelta(days=1),
        )

        AdminSettings.objects.create(
            auto_dispatch_enabled=True,
            max_technician_assignments=5,
        )

    def test_find_best_technician_single_candidate(self):
        """Test finding best technician when only one is available."""
        result = find_best_technician(self.ticket)

        self.assertIsNotNone(result)
        self.assertEqual(result['technician'].username, 'tech_expert')
        self.assertGreater(result['score'], 0)

    def test_find_best_technician_skips_unavailable(self):
        """Test that unavailable technicians are skipped."""
        # Make expert unavailable
        self.tech_expert.is_available = False
        self.tech_expert.save()

        result = find_best_technician(self.ticket)

        # Should not find a match
        self.assertIsNone(result)

    def test_find_best_technician_skips_wrong_skill(self):
        """Test that technicians without required skills are skipped."""
        # Create a technician with wrong skill
        other_service = ServiceType.objects.create(
            name="Plumbing",
            estimated_duration=60
        )

        other_tech = User.objects.create_user(
            username='plumber',
            password='pass123',
            role='technician',
            current_latitude=Decimal('14.5995'),
            current_longitude=Decimal('120.9842'),
            is_available=True,
            status='active'
        )

        TechnicianSkill.objects.create(
            technician=other_tech,
            service_type=other_service,
            skill_level='expert'
        )

        # Only tech_expert should be found
        result = find_best_technician(self.ticket)

        self.assertIsNotNone(result)
        self.assertEqual(result['technician'].username, 'tech_expert')

    def test_find_best_technician_skips_when_service_duration_exceeds_workday(self):
        """Test that daily capacity is based on scheduled service duration."""
        long_service = ServiceType.objects.create(
            name="Long Installation",
            estimated_duration=420,
        )
        long_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=long_service,
            description="Long job",
            status='Approved',
            preferred_date=self.ticket.scheduled_date,
        )
        ServiceLocation.objects.create(
            request=long_request,
            address="456 Main St",
            city="Manila",
            latitude=Decimal('14.5995'),
            longitude=Decimal('120.9842'),
        )
        ServiceTicket.objects.create(
            request=long_request,
            technician=self.tech_expert,
            status='Not Started',
            scheduled_date=self.ticket.scheduled_date,
        )

        result = find_best_technician(self.ticket)

        self.assertIsNone(result)

    def test_find_best_technician_allows_configured_overtime_capacity(self):
        """Test that overtime setting can raise the daily duration limit."""
        settings = AdminSettings.objects.first()
        settings.allow_overtime_dispatch = True
        settings.overtime_daily_capacity_minutes = 600
        settings.save(update_fields=['allow_overtime_dispatch', 'overtime_daily_capacity_minutes'])

        long_service = ServiceType.objects.create(
            name="Long Overtime Installation",
            estimated_duration=420,
        )
        long_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=long_service,
            description="Long job",
            status='Approved',
            preferred_date=self.ticket.scheduled_date,
        )
        ServiceLocation.objects.create(
            request=long_request,
            address="456 Main St",
            city="Manila",
            latitude=Decimal('14.5995'),
            longitude=Decimal('120.9842'),
        )
        ServiceTicket.objects.create(
            request=long_request,
            technician=self.tech_expert,
            status='Not Started',
            scheduled_date=self.ticket.scheduled_date,
        )

        result = find_best_technician(self.ticket)

        self.assertIsNotNone(result)
        self.assertEqual(result['technician'], self.tech_expert)

    def test_find_best_technician_splits_multi_day_service_duration(self):
        """Test that a long service can fit across multiple scheduled days."""
        self.ac_service.estimated_duration = 960
        self.ac_service.save(update_fields=['estimated_duration'])

        result = find_best_technician(self.ticket)

        self.assertIsNotNone(result)
        self.assertEqual(result['technician'], self.tech_expert)
        self.assertEqual(result['scheduled_days_required'], 2)

    def test_find_best_technician_counts_existing_multi_day_allocations(self):
        """Test that long existing jobs reserve capacity on following days."""
        long_service = ServiceType.objects.create(
            name="Two Day Installation",
            estimated_duration=960,
        )
        long_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=long_service,
            description="Two day job",
            status='Approved',
            preferred_date=self.ticket.scheduled_date,
        )
        ServiceLocation.objects.create(
            request=long_request,
            address="456 Main St",
            city="Manila",
            latitude=Decimal('14.5995'),
            longitude=Decimal('120.9842'),
        )
        ServiceTicket.objects.create(
            request=long_request,
            technician=self.tech_expert,
            status='Not Started',
            scheduled_date=self.ticket.scheduled_date,
        )
        self.ticket.scheduled_date = self.ticket.scheduled_date + timedelta(days=1)
        self.ticket.save(update_fields=['scheduled_date'])

        result = find_best_technician(self.ticket)

        self.assertIsNone(result)

    def test_auto_assign_technician_success(self):
        """Test successful auto-assignment of technician."""
        result = auto_assign_technician(self.ticket)

        self.assertTrue(result)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.technician.username, 'tech_expert')
        self.assertTrue(self.ticket.auto_assigned)
        self.assertIsNotNone(self.ticket.assigned_at)
        self.assertIsNotNone(self.ticket.smart_assignment_score)

    def test_auto_assign_technician_already_assigned(self):
        """Test that auto-assignment is skipped if already assigned."""
        # Pre-assign
        self.ticket.technician = self.tech_expert
        self.ticket.save()

        result = auto_assign_technician(self.ticket)

        self.assertFalse(result)

    def test_auto_assign_sets_primary_technician_without_extra_crew_assignment(self):
        """Test that auto-assignment stores the selected tech as the primary technician."""
        auto_assign_technician(self.ticket)

        self.ticket.refresh_from_db()
        crew = TicketCrewAssignment.objects.filter(ticket=self.ticket)
        self.assertEqual(self.ticket.technician.username, 'tech_expert')
        self.assertEqual(crew.count(), 0)

    def test_should_attempt_auto_dispatch_true_when_unassigned(self):
        """Test that auto-dispatch is attempted for unassigned tickets."""
        result = should_attempt_auto_dispatch(self.ticket)
        self.assertTrue(result)

    def test_should_attempt_auto_dispatch_false_when_assigned(self):
        """Test that auto-dispatch is not attempted when already assigned."""
        self.ticket.technician = self.tech_expert
        self.ticket.save()

        result = should_attempt_auto_dispatch(self.ticket)
        self.assertFalse(result)

    def test_should_attempt_auto_dispatch_false_for_completed(self):
        """Test that auto-dispatch is not attempted for completed tickets."""
        self.ticket.status = 'Completed'
        self.ticket.save()

        result = should_attempt_auto_dispatch(self.ticket)
        self.assertFalse(result)

    def test_should_attempt_auto_dispatch_false_without_location(self):
        """Test that auto-dispatch is not attempted without location."""
        # Create ticket without location
        request_no_loc = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.ac_service,
            description="No location",
            status='Pending',
        )

        ticket_no_loc = ServiceTicket.objects.create(
            request=request_no_loc,
            status='Not Started',
            scheduled_date=timezone.localdate() + timedelta(days=1),
        )

        result = should_attempt_auto_dispatch(ticket_no_loc)
        self.assertFalse(result)


class SLAEvaluationTests(TestCase):
    """Test SLA evaluation functions."""

    def setUp(self):
        """Set up test data."""
        self.service = ServiceType.objects.create(
            name="Test Service",
            estimated_duration=60
        )

        self.client = User.objects.create_user(
            username='client',
            password='pass123',
            role='client',
            status='active'
        )

        self.tech = User.objects.create_user(
            username='tech',
            password='pass123',
            role='technician',
            current_latitude=Decimal('14.5995'),
            current_longitude=Decimal('120.9842'),
            is_available=True,
            status='active'
        )

        self.request = ServiceRequest.objects.create(
            client=self.client,
            service_type=self.service,
            description="Test",
            status='Pending',
            preferred_date=timezone.localdate() + timedelta(days=1),
        )

        self.location = ServiceLocation.objects.create(
            request=self.request,
            address="123 Main",
            city="Manila",
            latitude=Decimal('14.5995'),
            longitude=Decimal('120.9842'),
        )

    def test_evaluate_request_sla_pending(self):
        """Test SLA evaluation for pending request."""
        now = timezone.now()
        evaluation = evaluate_service_request_sla(self.request, now=now)

        self.assertEqual(evaluation['state'], SLA_STATE_HEALTHY)
        self.assertEqual(evaluation['rule'], 'approval_delay')

    def test_evaluate_request_sla_completed(self):
        """Test SLA evaluation for completed request."""
        self.request.status = 'Completed'
        self.request.save()

        evaluation = evaluate_service_request_sla(self.request)

        self.assertEqual(evaluation['state'], SLA_STATE_PAUSED)

    def test_evaluate_ticket_sla_unassigned(self):
        """Test SLA evaluation for unassigned ticket."""
        ticket = ServiceTicket.objects.create(
            request=self.request,
            status='Not Started',
            scheduled_date=timezone.localdate() + timedelta(days=1),
        )

        now = timezone.now()
        evaluation = evaluate_service_ticket_sla(ticket, now=now)

        self.assertEqual(evaluation['state'], SLA_STATE_HEALTHY)
        self.assertEqual(evaluation['rule'], 'assignment_delay')

    def test_evaluate_ticket_sla_in_progress(self):
        """Test SLA evaluation for in-progress ticket."""
        ticket = ServiceTicket.objects.create(
            request=self.request,
            technician=self.tech,
            status='In Progress',
            scheduled_date=timezone.localdate(),
            start_time=timezone.now() - timedelta(minutes=10),
        )

        evaluation = evaluate_service_ticket_sla(ticket)

        self.assertEqual(evaluation['state'], SLA_STATE_HEALTHY)
        self.assertEqual(evaluation['rule'], 'execution_delay')


class SLAEscalationTests(TestCase):
    """Test SLA escalation and enforcement."""

    def setUp(self):
        """Set up test data."""
        self.service = ServiceType.objects.create(
            name="Test Service",
            estimated_duration=60
        )

        self.admin = User.objects.create_user(
            username='admin',
            password='pass123',
            role='admin',
            status='active'
        )

        self.supervisor = User.objects.create_user(
            username='supervisor',
            password='pass123',
            role='admin',
            status='active'
        )

        self.client = User.objects.create_user(
            username='client',
            password='pass123',
            role='client',
            status='active'
        )

        self.tech = User.objects.create_user(
            username='tech',
            password='pass123',
            role='technician',
            current_latitude=Decimal('14.5995'),
            current_longitude=Decimal('120.9842'),
            is_available=True,
            status='active'
        )

        # Enable admin settings
        AdminSettings.objects.create(
            auto_dispatch_enabled=False,
        )

    @patch('notifications.sla_notifications.notify_admins_sla_breach')
    def test_check_sla_breaches_finds_overdue_request(self, mock_notify):
        """Test that overdue requests are detected."""
        # Create old pending request (simulates overdue approval)
        request = ServiceRequest.objects.create(
            client=self.client,
            service_type=self.service,
            description="Old request",
            status='Pending',
            request_date=timezone.now() - timedelta(hours=10),  # 10 hours old
        )

        ServiceLocation.objects.create(
            request=request,
            address="123 Main",
            city="Manila",
        )

        escalations = check_and_escalate_sla_breaches()

        # Should detect overdue approval
        self.assertGreater(escalations.get('approval_overdue', 0), 0)

    def test_check_sla_warnings_detects_approaching_breach(self):
        """Test that approaching SLA breaches are detected."""
        # Create request that's approaching warning time
        request = ServiceRequest.objects.create(
            client=self.client,
            service_type=self.service,
            description="Recent request",
            status='Pending',
            request_date=timezone.now() - timedelta(hours=3),  # 3 hours old (approaching warning)
        )

        ServiceLocation.objects.create(
            request=request,
            address="123 Main",
            city="Manila",
        )

        warnings = check_sla_warnings()

        # Should detect approaching breach
        self.assertGreater(warnings.get('approval_warning', 0), 0)


class AdminSettingsAutoDispatchTests(TestCase):
    """Test auto-dispatch with AdminSettings."""

    def setUp(self):
        """Set up test data."""
        self.service = ServiceType.objects.create(
            name="Test Service",
        )

        self.client = User.objects.create_user(
            username='client',
            password='pass123',
            role='client',
        )

        self.tech = User.objects.create_user(
            username='tech',
            password='pass123',
            role='technician',
            current_latitude=Decimal('14.5995'),
            current_longitude=Decimal('120.9842'),
            is_available=True,
            status='active'
        )

        TechnicianSkill.objects.create(
            technician=self.tech,
            service_type=self.service,
            skill_level='expert'
        )

        self.request = ServiceRequest.objects.create(
            client=self.client,
            service_type=self.service,
            description="Test",
            status='Pending',
        )

        ServiceLocation.objects.create(
            request=self.request,
            address="123 Main",
            city="Manila",
            latitude=Decimal('14.5995'),
            longitude=Decimal('120.9842'),
        )

    def test_auto_dispatch_respects_admin_setting(self):
        """Test that auto-dispatch respects AdminSettings flag."""
        # Create settings with auto_dispatch disabled
        AdminSettings.objects.create(auto_dispatch_enabled=False)

        ticket = ServiceTicket.objects.create(
            request=self.request,
            status='Not Started',
            scheduled_date=timezone.localdate() + timedelta(days=1),
        )

        # Manual call should still work
        result = auto_assign_technician(ticket)
        self.assertTrue(result)

        # Reset
        ticket.technician = None
        ticket.save()

        # Now enable auto-dispatch
        settings = AdminSettings.objects.first()
        settings.auto_dispatch_enabled = True
        settings.save()

        # Should still work
        result = auto_assign_technician(ticket)
        self.assertTrue(result)
