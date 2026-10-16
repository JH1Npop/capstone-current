"""End-to-end API journeys: real roles drive real endpoints through each workflow, without shortcuts."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from notifications.models import Notification
from services.models import (
    MaintenanceSchedule,
    SalesRecord,
    ServiceRequest,
    ServiceStatusHistory,
    ServiceTicket,
    ServiceType,
    TechnicianSkill,
    TurnoverAcceptance,
)
from users.models import User

SITE = {'latitude': '14.576400', 'longitude': '121.085100'}


class EndToEndJourneyTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username='journey-admin', email='admin@journey.test', password='pass', role='admin')
        self.client_user = User.objects.create_user(username='journey-client', email='client@journey.test', password='pass', role='client', first_name='Jamie', last_name='Client')
        self.other_client = User.objects.create_user(username='journey-other', password='pass', role='client')
        self.tech = User.objects.create_user(username='journey-tech', password='pass', role='technician', first_name='Tess', last_name='Tech')
        self.other_tech = User.objects.create_user(username='journey-tech-2', password='pass', role='technician')
        self.cleaning = ServiceType.objects.create(
            name='Journey Panel Cleaning', estimated_duration=60, estimated_cost=Decimal('1500.00'),
            procedures=[{'title': 'Clean panels'}, {'title': 'Check output'}],
        )
        self.install = ServiceType.objects.create(
            name='Journey Solar Install', estimated_duration=240, estimated_cost=Decimal('90000.00'),
            requires_site_inspection=True, procedures=[{'title': 'Mount array'}],
        )
        for service in (self.cleaning, self.install):
            TechnicianSkill.objects.create(technician=self.tech, service_type=service)

    # ------------------------------------------------------------------ helpers
    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def ok(self, response, expected=(200, 201)):
        expected = expected if isinstance(expected, tuple) else (expected,)
        self.assertIn(response.status_code, expected, getattr(response, 'data', response.content))
        return response

    def create_request(self, service, description='Journey request'):
        response = self.ok(self.as_user(self.client_user).post('/api/services/service-requests/', {
            'service_type': service.id, 'description': description, 'priority': 'Normal',
            'location_address': '456 Journey Avenue', 'location_city': 'Pasig', 'location_province': 'Metro Manila',
            'preferred_date': (timezone.localdate() + timedelta(days=1)).isoformat(), **SITE,
        }, format='json'), 201)
        return ServiceRequest.objects.get(pk=response.data['id'])

    def approve(self, request_obj):
        self.ok(self.as_user(self.admin).post(f'/api/services/service-requests/{request_obj.id}/approve/', {}, format='json'))
        request_obj.refresh_from_db()
        return ServiceTicket.objects.filter(request=request_obj).latest('id')

    def assign(self, ticket, stage):
        self.ok(self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/assign/', {
            'technician_id': self.tech.id, 'dispatch_stage': stage,
            'scheduled_date': timezone.localdate().isoformat(),
        }, format='json'))
        ticket.refresh_from_db()
        return ticket

    def travel_and_arrive(self, ticket):
        tech = self.as_user(self.tech)
        self.ok(tech.post(f'/api/technician/jobs/{ticket.id}/start-navigation/', {}, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Navigating')
        self.ok(tech.post(f'/api/technician/jobs/{ticket.id}/arrive/', SITE, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Arrived on Site')

    def do_service_work(self, ticket, procedure_count):
        tech = self.as_user(self.tech)
        self.ok(tech.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'in_progress'}, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')
        self.ok(tech.post('/api/checklist/', {
            'jobId': ticket.id,
            'completed': {str(index): True for index in range(procedure_count)},
            'checklist_items': [{'index': index, 'label': f'Step {index + 1}', 'completed': True} for index in range(procedure_count)],
            'notes': 'All steps done.',
            'maintenance_required': True, 'maintenance_profile': 'standard_area', 'maintenance_notes': 'Routine follow-up.',
        }, format='json'))
        self.ok(tech.post(f'/api/services/service-tickets/{ticket.id}/complete_work/', {
            'completion_proof_images': ['https://example.com/proof/journey.jpg'],
            'completion_notes': 'Work finished and tested.',
        }, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Completed')
        self.assertIsNotNone(ticket.completed_date)

    def client_notified(self, contains):
        return Notification.objects.filter(user=self.client_user, message__icontains=contains).exists()

    # ------------------------------------------------------------------ major flows
    def test_major_flow_direct_service_from_request_to_sale(self):
        request_obj = self.create_request(self.cleaning)
        self.assertEqual(request_obj.status, 'Pending')

        ticket = self.approve(request_obj)
        self.assertEqual(request_obj.status, 'Approved')
        self.assertEqual(ticket.status, 'Not Started')

        ticket = self.assign(ticket, 'service')
        self.assertEqual(ticket.technician_id, self.tech.id)
        self.assertIsNotNone(ticket.assigned_at)

        self.travel_and_arrive(ticket)
        self.do_service_work(ticket, procedure_count=2)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.status, 'Completed')

        # Client rates the finished job.
        self.ok(self.as_user(self.client_user).post(f'/api/services/service-tickets/{ticket.id}/submit_feedback/', {
            'rating': 5, 'feedback': 'Great job.',
        }, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.client_rating, 5)

        # Office finalizes turnover, which moves the ticket past Completed.
        admin = self.as_user(self.admin)
        turnover = self.ok(admin.post('/api/services/turnover-acceptances/', {'ticket': ticket.id}, format='json'), 201)
        self.ok(admin.post(f"/api/services/turnover-acceptances/{turnover.data['id']}/finalize/", {
            'warranty_start_date': timezone.localdate().isoformat(), 'accepted_by_client_name': 'Jamie Client',
        }, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Turned Over / Accepted')
        self.assertEqual(TurnoverAcceptance.objects.get(ticket=ticket).status, 'finalized')

        # Sales record is prepared from the ticket, valued, and confirmed.
        prepared = self.ok(admin.post('/api/services/sales-records/prepare/', {'ticket_id': ticket.id}, format='json'), 201)
        record_id = prepared.data['id']
        if prepared.data.get('agreed_total') is None:
            self.ok(admin.patch(f'/api/services/sales-records/{record_id}/', {
                'agreed_total': '1500.00', 'currency_code': 'PHP', 'notes': 'Cleaning visit, no quotation needed.',
            }, format='json'))
        self.ok(admin.post(f'/api/services/sales-records/{record_id}/confirm/', {}, format='json'))
        self.assertEqual(SalesRecord.objects.get(pk=record_id).status, 'confirmed')

        # The client was told about each stage, and maintenance follows up the job.
        self.assertTrue(Notification.objects.filter(user=self.client_user).count() >= 3)
        self.assertTrue(MaintenanceSchedule.objects.filter(service_ticket=ticket).exists())

        # Analytics counts the handed-over job as completed work.
        overview = self.ok(admin.get('/api/admin/analytics/')).data
        self.assertGreaterEqual(overview['kpis']['completed_tickets'], 1)
        self.assertEqual(overview['kpis']['average_client_rating'], 5.0)
        sales = self.ok(admin.get('/api/admin/analytics/', {'workspace': 'sales'})).data
        self.assertEqual(sales['kpis']['confirmed_sales_count']['current'], 1)

        statuses = list(ServiceStatusHistory.objects.filter(ticket=ticket).values_list('status', flat=True))
        for expected in ['Navigating', 'Arrived on Site', 'In Progress', 'Completed', 'Turned Over / Accepted']:
            self.assertIn(expected, statuses)

    def test_major_flow_inspection_first_service(self):
        request_obj = self.create_request(self.install, 'Install a 5 kW system')
        ticket = self.approve(request_obj)

        ticket = self.assign(ticket, 'inspection')
        self.assertEqual(ticket.status, 'For Inspection')
        self.assertEqual(ticket.ticket_type, 'inspection')

        # Direct service dispatch is refused while the inspection is outstanding.
        refused = self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/assign/', {
            'technician_id': self.tech.id, 'dispatch_stage': 'service',
        }, format='json')
        self.assertGreaterEqual(refused.status_code, 400)

        self.travel_and_arrive(ticket)
        tech = self.as_user(self.tech)
        report = self.ok(tech.post('/api/services/inspections/', {
            'ticket': ticket.id, 'site_accessible': True, 'electrical_adequate': True,
            'safety_equipment_present': True, 'recommendation': 'Approved', 'checklist_items': [],
        }, format='json'), 201)
        self.ok(tech.post(f"/api/services/inspections/{report.data['id']}/complete/", {}, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Inspection Completed')

        self.ok(self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', {
            'decision': 'approve_service', 'scheduled_date': (timezone.localdate() + timedelta(days=1)).isoformat(),
        }, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Ready for Service')

        ticket = self.assign(ticket, 'service')
        self.travel_and_arrive(ticket)
        self.do_service_work(ticket, procedure_count=1)
        self.assertTrue(self.client_notified('inspection'))

    # ------------------------------------------------------------------ minor flows
    def test_minor_flow_reject_and_cancel_requests(self):
        rejected = self.create_request(self.cleaning, 'Out of area')
        missing_reason = self.as_user(self.admin).post(f'/api/services/service-requests/{rejected.id}/reject/', {}, format='json')
        self.assertEqual(missing_reason.status_code, 400)
        self.ok(self.as_user(self.admin).post(f'/api/services/service-requests/{rejected.id}/reject/', {'reason': 'Outside service area.'}, format='json'))
        rejected.refresh_from_db()
        self.assertIn(rejected.status, {'Cancelled', 'Rejected'})
        self.assertFalse(ServiceTicket.objects.filter(request=rejected).exists())

        cancelled = self.create_request(self.cleaning, 'Changed my mind')
        self.ok(self.as_user(self.client_user).post(f'/api/services/service-requests/{cancelled.id}/cancel/', {'reason': 'No longer needed.'}, format='json'))
        cancelled.refresh_from_db()
        self.assertEqual(cancelled.status, 'Cancelled')

    def test_minor_flow_reschedule_request_and_admin_reschedule(self):
        ticket = self.assign(self.approve(self.create_request(self.cleaning)), 'service')
        new_day = (timezone.localdate() + timedelta(days=5)).isoformat()
        technician_attempt = self.as_user(self.tech).post(f'/api/services/service-tickets/{ticket.id}/request_reschedule/', {
            'preferred_date': new_day, 'reason': 'Trying on behalf of the client.',
        }, format='json')
        self.assertEqual(technician_attempt.status_code, 403)
        self.ok(self.as_user(self.client_user).post(f'/api/services/service-tickets/{ticket.id}/request_reschedule/', {
            'preferred_date': new_day, 'reason': 'Something came up; please move the visit.',
        }, format='json'))
        ticket.refresh_from_db()
        self.assertTrue(ticket.reschedule_requested)

        self.ok(self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/reschedule/', {
            'scheduled_date': new_day, 'notes': 'Moved per client request.',
        }, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.scheduled_date.isoformat(), new_day)
        self.assertFalse(ticket.reschedule_requested)

    def test_minor_flow_access_boundaries(self):
        request_obj = self.create_request(self.cleaning)
        ticket = self.assign(self.approve(request_obj), 'service')

        other_client = self.as_user(self.other_client)
        self.assertEqual(other_client.get(f'/api/services/service-requests/{request_obj.id}/').status_code, 404)
        self.assertEqual(other_client.get(f'/api/services/service-tickets/{ticket.id}/').status_code, 404)

        other_tech = self.as_user(self.other_tech)
        self.assertEqual(other_tech.post(f'/api/technician/jobs/{ticket.id}/start-navigation/', {}, format='json').status_code, 404)

        # A technician cannot finish a job that was never started.
        early = self.as_user(self.tech).post(f'/api/services/service-tickets/{ticket.id}/complete_work/', {
            'completion_proof_images': ['https://example.com/p.jpg'],
        }, format='json')
        self.assertGreaterEqual(early.status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Not Started')

        # Clients cannot rate a job before it is finished.
        early_rating = self.as_user(self.client_user).post(f'/api/services/service-tickets/{ticket.id}/submit_feedback/', {'rating': 4}, format='json')
        self.assertGreaterEqual(early_rating.status_code, 400)

    def test_minor_flow_notifications_read_and_clear(self):
        self.approve(self.create_request(self.cleaning))
        client = self.as_user(self.client_user)
        unread = self.ok(client.get('/api/notifications/unread_count/')).data
        count = unread.get('count', unread.get('unread_count')) if isinstance(unread, dict) else unread
        self.assertGreaterEqual(int(count), 1)
        self.ok(client.post('/api/notifications/mark_all_read/', {}, format='json'))
        after = self.ok(client.get('/api/notifications/unread_count/')).data
        after_count = after.get('count', after.get('unread_count')) if isinstance(after, dict) else after
        self.assertEqual(int(after_count), 0)
