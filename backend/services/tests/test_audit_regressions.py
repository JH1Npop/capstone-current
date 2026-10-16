"""Regression tests for defects found in the 2026-10-15 whole-system audit."""
import re
from datetime import timedelta
from decimal import Decimal

from django.core import mail
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryCategory, InventoryItem
from services.maintenance import _send_client_maintenance_email
from services.models import (
    MaintenanceSchedule,
    ServiceLocation,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
    TechnicalDataSheet,
    TechnicianSkill,
)
from users.models import User
from users.views.helpers import delete_expired_unverified_clients


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class AuditRegressionTests(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(
            username='audit-sa', password='Password123!', role='superadmin', email='sa@example.com',
        )
        self.client_user = User.objects.create_user(
            username='audit-client', password='Password123!', role='client', email='client@example.com',
        )
        self.service = ServiceType.objects.create(name='Audit Service', estimated_duration=60)
        self.technician = User.objects.create_user(
            username='audit-tech', password='Password123!', role='technician',
            current_latitude=Decimal('14.5'), current_longitude=Decimal('121.0'),
        )
        TechnicianSkill.objects.create(technician=self.technician, service_type=self.service, skill_level='expert')
        self.service_request = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service, description='Audit work', status='Approved',
            preferred_date=timezone.localdate() + timedelta(days=1),
        )
        ServiceLocation.objects.create(
            request=self.service_request, address='Site', city='City', province='Province',
            latitude=Decimal('14.5'), longitude=Decimal('121.0'),
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.service_request, status='Not Started',
            scheduled_date=timezone.localdate() + timedelta(days=1),
        )
        category = InventoryCategory.objects.create(name='Audit Category')
        self.item = InventoryItem.objects.create(name='Audit Panel', sku='AUD-1', category=category, quantity=10)

    def test_unverified_client_with_service_history_is_not_purged(self):
        User.objects.filter(pk=self.client_user.pk).update(
            email_verified=False, email_verification_sent_at=timezone.now() - timedelta(hours=48),
        )
        bare = User.objects.create_user(username='bare-client', password='Password123!', role='client', email='bare@example.com')
        User.objects.filter(pk=bare.pk).update(
            email_verified=False, email_verification_sent_at=timezone.now() - timedelta(hours=48),
        )

        self.assertEqual(delete_expired_unverified_clients(), 1)
        self.assertTrue(User.objects.filter(pk=self.client_user.pk).exists())
        self.assertTrue(ServiceTicket.objects.filter(pk=self.ticket.pk).exists())
        self.assertFalse(User.objects.filter(pk=bare.pk).exists())

    def test_service_type_in_use_cannot_be_deleted_through_catalog_endpoint(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.delete(f'/api/services/service-types/{self.service.id}/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(ServiceTicket.objects.filter(pk=self.ticket.pk).exists())

    def test_client_maintenance_reminder_is_sent(self):
        schedule = MaintenanceSchedule.objects.create(
            service_ticket=self.ticket, client=self.client_user, service_type=self.service,
            maintenance_profile='standard_area', interval_days=120,
            last_service_date=timezone.localdate() - timedelta(days=120),
            next_due_date=timezone.localdate(), notify_on_date=timezone.localdate() - timedelta(days=7),
        )

        self.assertTrue(_send_client_maintenance_email(schedule))
        self.assertEqual(len(mail.outbox), 1)

    def test_email_change_requires_current_password(self):
        self.client.force_authenticate(self.client_user)
        response = self.client.patch('/api/users/me/', {'email': 'new@example.com'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.client_user.refresh_from_db()
        self.assertIsNone(self.client_user.pending_email)

    def test_email_change_link_cannot_reset_password(self):
        self.client.force_authenticate(self.client_user)
        response = self.client.patch(
            '/api/users/me/',
            {'email': 'new@example.com', 'current_password': 'Password123!'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        change_mail = [message for message in mail.outbox if 'new@example.com' in message.to][-1]
        uid, token = re.search(r'uid=([^&\s]+)&token=([^&\s]+)', change_mail.body).groups()
        self.client.force_authenticate(None)

        reset = self.client.post('/api/users/password_reset_confirm/', {
            'uid': uid, 'token': token,
            'new_password': 'TakenOver!2026x', 'password_confirm': 'TakenOver!2026x',
        }, format='json')

        self.assertEqual(reset.status_code, status.HTTP_400_BAD_REQUEST)
        self.client_user.refresh_from_db()
        self.assertTrue(self.client_user.check_password('Password123!'))

    def test_rejected_equipment_plan_leaves_ticket_unassigned(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {'technician_id': self.technician.id, 'equipment_reservations': [{'item': self.item.id, 'quantity': 0}]},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.technician_id)

    def test_generic_ticket_edit_cannot_reassign_technician(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.patch(
            f'/api/services/service-tickets/{self.ticket.id}/',
            {'technician': self.technician.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.technician_id)

    def test_client_cannot_request_reschedule_while_technician_is_en_route(self):
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(status='Navigating', technician=self.technician)
        self.client.force_authenticate(self.client_user)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/request_reschedule/',
            {'reason': 'Busy'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_completed_ticket_cannot_be_rescheduled(self):
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(status='Completed')
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/reschedule/',
            {'scheduled_date': (timezone.localdate() + timedelta(days=3)).isoformat(), 'notes': 'Move'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_calendar_omits_rejected_requests(self):
        rejected = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service, description='Rejected', status='Cancelled',
            preferred_date=timezone.localdate() + timedelta(days=2),
        )
        self.client.force_authenticate(self.superadmin)
        response = self.client.get('/api/admin/calendar/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(rejected.id, [event.get('request_id') for event in response.data['events']])

    def test_anonymous_service_catalog_hides_stock_details(self):
        self.service.inventory_requirements.create(item=self.item, quantity=2)
        response = self.client.get('/api/services/service-types/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        row = next(entry for entry in rows if entry['id'] == self.service.id)
        self.assertEqual(row['inventory_requirements'], [])
        self.assertIsNone(row['request_count'])

    def test_client_sees_planned_materials_without_sku_or_stock(self):
        self.service.inventory_requirements.create(item=self.item, quantity=2)
        self.client.force_authenticate(self.client_user)
        response = self.client.get('/api/services/service-types/')

        rows = response.data['results'] if isinstance(response.data, dict) else response.data
        requirement = next(entry for entry in rows if entry['id'] == self.service.id)['inventory_requirements'][0]
        self.assertEqual(requirement['item_name'], 'Audit Panel')
        self.assertNotIn('item_sku', requirement)
        self.assertNotIn('available_quantity', requirement)

    def test_nearby_technicians_endpoint_responds(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.get(
            '/api/services/technician-locations/nearby_technicians/',
            {'latitude': '14.5', 'longitude': '121.0'},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([entry['id'] for entry in response.data], [self.technician.id])

    def test_technician_cannot_mark_data_sheet_reviewed(self):
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(technician=self.technician)
        sheet = TechnicalDataSheet.objects.create(ticket=self.ticket)
        self.client.force_authenticate(self.technician)
        response = self.client.patch(
            f'/api/services/technical-data-sheets/{sheet.id}/',
            {'status': 'reviewed'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sheet.refresh_from_db()
        self.assertEqual(sheet.status, 'draft')

    # --- Decisions taken after the audit -----------------------------------

    def test_sla_escalation_does_not_auto_assign_when_auto_dispatch_is_disabled(self):
        from users.models import AdminSettings
        from services.sla import _escalate_assignment_overdue
        import logging

        AdminSettings.objects.create(auto_dispatch_enabled=False)
        _escalate_assignment_overdue(self.ticket, {'minutes_overdue': 30}, logging.getLogger(__name__))

        self.ticket.refresh_from_db()
        self.assertIsNone(self.ticket.technician_id)

    def test_auto_dispatch_sends_required_inspection_visit_first(self):
        from services.auto_dispatch import auto_assign_technician

        ServiceType.objects.filter(pk=self.service.pk).update(requires_site_inspection=True)
        self.ticket.refresh_from_db()

        self.assertTrue(auto_assign_technician(self.ticket))
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.ticket_type, 'inspection')
        self.assertEqual(self.ticket.status, 'For Inspection')

    def test_checklist_completion_requires_every_configured_step(self):
        ServiceType.objects.filter(pk=self.service.pk).update(procedures=[
            {'step': 1, 'title': 'Isolate power'},
            {'step': 2, 'title': 'Mount panels'},
        ])
        ServiceTicket.objects.filter(pk=self.ticket.pk).update(technician=self.technician)
        self.client.force_authenticate(self.technician)

        short = self.client.post('/api/checklist/', {
            'jobId': self.ticket.id,
            'checklist_items': [{'index': 0, 'label': 'Isolate power', 'completed': True}],
            'after_sales_decision': 'none',
        }, format='json')
        full = self.client.post('/api/checklist/', {
            'jobId': self.ticket.id,
            'checklist_items': [
                {'index': 0, 'label': 'Isolate power', 'completed': True},
                {'index': 1, 'label': 'Mount panels', 'completed': True},
            ],
            'after_sales_decision': 'none',
        }, format='json')

        self.assertEqual(short.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(full.status_code, status.HTTP_200_OK)
        checklist = self.ticket.inspection
        checklist.refresh_from_db()
        self.assertTrue(checklist.is_completed)
        # Service checklists do not fabricate site-inspection answers.
        self.assertFalse(checklist.safety_equipment_present)
        self.assertNotEqual(checklist.recommendation, 'Approved')

    def test_notification_email_is_sent_only_after_commit(self):
        from notifications.notification_utils import send_user_notification

        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            send_user_notification(user=self.client_user, title='Queued', body='After commit only')
        self.assertEqual(len(mail.outbox), 0)
        for callback in callbacks:
            callback()
        self.assertEqual(len(mail.outbox), 1)

    def test_assigned_ready_ticket_scheduled_ahead_is_not_overdue(self):
        from services.sla import evaluate_service_ticket_sla

        ServiceTicket.objects.filter(pk=self.ticket.pk).update(
            status='Ready for Service',
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=5),
            updated_at=timezone.now() - timedelta(days=4),
        )
        self.ticket.refresh_from_db()

        self.assertNotEqual(evaluate_service_ticket_sla(self.ticket)['state'], 'overdue')

    def test_rescheduled_ticket_is_flagged_on_calendar(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/reschedule/',
            {'scheduled_date': (timezone.localdate() + timedelta(days=3)).isoformat(), 'notes': 'Client asked'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        calendar = self.client.get('/api/admin/calendar/')
        event = next(entry for entry in calendar.data['events'] if entry.get('ticket_id') == self.ticket.id)
        self.assertTrue(event['is_rescheduled'])

    def test_admin_can_set_and_see_site_inspection_requirement(self):
        self.client.force_authenticate(self.superadmin)
        created = self.client.post('/api/admin/services/', {
            'name': 'Solar Install Probe', 'estimated_duration': 240, 'estimated_cost': 0,
            'max_daily_assignments': 2, 'requires_site_inspection': True,
        }, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertTrue(created.data['requires_site_inspection'])

        service_id = created.data['id']
        updated = self.client.put(f'/api/admin/services/{service_id}/', {
            'name': 'Solar Install Probe', 'estimated_duration': 240, 'requires_site_inspection': False,
        }, format='json')
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertFalse(ServiceType.objects.get(pk=service_id).requires_site_inspection)

        ServiceType.objects.filter(pk=service_id).update(requires_site_inspection=True)
        copy = self.client.post(f'/api/admin/services/{service_id}/duplicate/', {}, format='json')
        self.assertTrue(copy.data['requires_site_inspection'])

    def test_inspection_stage_dispatch_marks_ticket_as_inspection_visit(self):
        ServiceType.objects.filter(pk=self.service.pk).update(requires_site_inspection=True)
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {'technician_id': self.technician.id, 'dispatch_stage': 'inspection'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, 'For Inspection')
        self.assertEqual(self.ticket.ticket_type, 'inspection')

    def test_approving_a_service_that_requires_inspection_starts_with_inspection(self):
        ServiceType.objects.filter(pk=self.service.pk).update(requires_site_inspection=True)
        pending = ServiceRequest.objects.create(
            client=self.client_user, service_type=self.service, description='New install', status='Pending',
            preferred_date=timezone.localdate() + timedelta(days=2),
        )
        ServiceLocation.objects.create(request=pending, address='b', city='c', province='p',
                                       latitude=Decimal('14.5'), longitude=Decimal('121.0'))
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(f'/api/services/service-requests/{pending.id}/approve/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket = ServiceTicket.objects.get(request=pending)
        self.assertEqual(ticket.status, 'For Inspection')
        self.assertEqual(ticket.ticket_type, 'inspection')

    def test_service_without_inspection_requirement_is_unchanged(self):
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {'technician_id': self.technician.id, 'dispatch_stage': 'service'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.ticket_type, 'installation')
        self.assertNotEqual(self.ticket.status, 'For Inspection')

    def test_ticket_payload_exposes_service_inspection_requirement_for_dispatch_board(self):
        ServiceType.objects.filter(pk=self.service.pk).update(requires_site_inspection=True)
        self.client.force_authenticate(self.superadmin)
        response = self.client.get(f'/api/services/service-tickets/{self.ticket.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['request_details']['service_requires_site_inspection'])
