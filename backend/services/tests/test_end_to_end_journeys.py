"""End-to-end API journeys: real roles drive real endpoints through each workflow, without shortcuts."""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from notifications.models import Notification
from services.models import (
    InspectionChecklist,
    MaintenanceSchedule,
    QuotationRecord,
    SalesRecord,
    ServiceRequest,
    ServiceStatusHistory,
    ServiceTicket,
    ServiceType,
    TechnicianSkill,
    TurnoverAcceptance,
)
from users.models import User
from .proof_fixtures import completion_photo

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
            'completion_photo_files': completion_photo(),
            'completion_notes': 'Work finished and tested.',
        }, format='multipart'))
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

        # Completing the job already drafted the sales record; prepare returns that draft.
        self.assertTrue(SalesRecord.objects.filter(ticket=ticket, status='draft').exists())
        prepared = self.ok(admin.post('/api/services/sales-records/prepare/', {'ticket_id': ticket.id}, format='json'), 200)
        record_id = prepared.data['id']
        if prepared.data.get('agreed_total') is None:
            self.ok(admin.patch(f'/api/services/sales-records/{record_id}/', {
                'agreed_total': '1500.00', 'currency_code': 'PHP', 'notes': 'Cleaning visit, no quotation needed.',
            }, format='json'))
        self.ok(admin.post(f'/api/services/sales-records/{record_id}/confirm/', {}, format='json'))
        self.assertEqual(SalesRecord.objects.get(pk=record_id).status, 'confirmed')

        # The office records the client's payment; the sale is then fully paid.
        self.ok(admin.post(f'/api/services/sales-records/{record_id}/payments/', {
            'amount': '1500.00', 'paid_on': timezone.localdate().isoformat(), 'method': 'gcash', 'reference': 'GC-123',
        }, format='json'), 201)
        self.assertEqual(self.ok(admin.get(f'/api/services/sales-records/{record_id}/')).data['payment_status'], 'paid')

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

        decision = {'decision': 'approve_service', 'scheduled_date': (timezone.localdate() + timedelta(days=1)).isoformat()}
        # Service cannot be scheduled until the client accepts a quotation.
        blocked = self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', decision, format='json')
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data['code'], 'quotation_not_accepted')
        quotation = self.ok(self.as_user(self.admin).post('/api/services/quotations/', {
            'ticket': ticket.id, 'client': self.client_user.id, 'total_amount': 'PHP 90,000.00', 'status': 'Sent',
        }, format='json'), 201)
        self.assertTrue(self.client_notified('quotation'))
        self.ok(self.as_user(self.client_user).post(f"/api/services/quotations/{quotation.data['id']}/respond/", {'decision': 'accept'}, format='json'))
        self.ok(self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', decision, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Ready for Service')

        ticket = self.assign(ticket, 'service')
        self.travel_and_arrive(ticket)
        self.do_service_work(ticket, procedure_count=1)
        self.assertTrue(self.client_notified('inspection'))

    def submit_inspection_report(self, ticket, expected=(200, 201)):
        tech = self.as_user(self.tech)
        return self.ok(tech.post('/api/services/inspections/', {
            'ticket': ticket.id, 'site_accessible': True, 'electrical_adequate': True,
            'safety_equipment_present': True, 'recommendation': 'Approved', 'checklist_items': [],
            'additional_notes': 'Concrete roof, east-facing, clear of shade.',
        }, format='json'), expected)

    def accept_quotation(self, ticket, number):
        QuotationRecord.objects.create(ticket=ticket, client=self.client_user, quotation_number=number, status='Accepted')

    def test_inspection_report_requires_travel_and_arrival(self):
        ticket = self.assign(self.approve(self.create_request(self.install)), 'inspection')

        before_travel = self.submit_inspection_report(ticket, expected=400)
        self.assertIn('Arrive on site', str(before_travel.data))
        self.ok(self.as_user(self.tech).post(f'/api/technician/jobs/{ticket.id}/start-navigation/', {}, format='json'))
        self.submit_inspection_report(ticket, expected=400)
        self.assertFalse(InspectionChecklist.objects.filter(ticket=ticket).exists())

        self.ok(self.as_user(self.tech).post(f'/api/technician/jobs/{ticket.id}/arrive/', SITE, format='json'))
        report = self.submit_inspection_report(ticket, expected=201)
        self.ok(self.as_user(self.tech).post(f"/api/services/inspections/{report.data['id']}/complete/", {}, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Inspection Completed')
        # Titled, ticket-linked alerts route the client to the request and the office to the review.
        self.assertTrue(Notification.objects.filter(user=self.client_user, title='Inspection Completed', ticket=ticket).exists())
        self.assertTrue(Notification.objects.filter(
            user=self.admin, title=f'Inspection Report Submitted for Ticket #{ticket.id}', ticket=ticket,
        ).exists())

    def test_inspection_visit_cannot_be_finished_as_completed_job(self):
        ticket = self.assign(self.approve(self.create_request(self.install)), 'inspection')
        self.travel_and_arrive(ticket)
        tech = self.as_user(self.tech)
        self.ok(tech.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'in_progress'}, format='json'))
        # Simulate legacy data where the report is marked done while the ticket is still in progress.
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True, recommendation='Approved')

        finish = tech.post(f'/api/technician/jobs/{ticket.id}/status/', {
            'status': 'completed', 'completion_proof_images': ['https://example.com/proof.jpg'],
        }, format='json')
        legacy_finish = tech.post(f'/api/services/service-tickets/{ticket.id}/complete_work/', {
            'completion_proof_images': ['https://example.com/proof.jpg'],
        }, format='json')

        self.assertEqual(finish.status_code, 400, finish.data)
        self.assertIn('inspection report', finish.data['error'])
        self.assertEqual(legacy_finish.status_code, 400, legacy_finish.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')
        self.assertEqual(ticket.ticket_type, 'inspection')

    def test_inspection_decision_notifies_inspector_and_keeps_site_evidence(self):
        ticket = self.assign(self.approve(self.create_request(self.install)), 'inspection')
        self.travel_and_arrive(ticket)
        report = self.submit_inspection_report(ticket, expected=201)
        tech = self.as_user(self.tech)
        self.ok(tech.post(f'/api/services/service-tickets/{ticket.id}/upload_photos/', {
            'photos': ['https://example.com/inspection-roof.jpg'],
        }, format='json'))
        self.ok(tech.post(f"/api/services/inspections/{report.data['id']}/complete/", {}, format='json'))
        self.accept_quotation(ticket, 'QUO-EVIDENCE-01')

        self.ok(self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', {
            'decision': 'approve_service', 'scheduled_date': (timezone.localdate() + timedelta(days=1)).isoformat(),
        }, format='json'))

        self.assertTrue(Notification.objects.filter(
            user=self.tech, title=f'Inspection Decision for Ticket #{ticket.id}',
        ).exists())
        findings = ServiceStatusHistory.objects.get(ticket=ticket, notes__startswith='Inspection findings:')
        self.assertIn('Concrete roof, east-facing', findings.notes)
        self.assertIn('Recommendation: Approved', findings.notes)
        self.assertIn('Site photos kept: 1', findings.notes)

        ticket = self.assign(ticket, 'service')
        self.travel_and_arrive(ticket)
        self.do_service_work(ticket, procedure_count=1)

        checklist = InspectionChecklist.objects.get(ticket=ticket)
        self.assertEqual(checklist.additional_notes, 'All steps done.')
        inspection_photos = [entry for entry in checklist.proof_media if entry.get('phase') == 'inspection']
        self.assertEqual([entry['url'] for entry in inspection_photos], ['https://example.com/inspection-roof.jpg'])
        self.assertTrue(checklist.site_accessible)
        self.assertEqual(checklist.recommendation, 'Approved')

    def test_service_specific_inspection_checks_are_required_and_kept(self):
        self.install.inspection_procedures = [
            {'title': 'Roof can carry the array', 'description': 'Check purlins.'},
            {'title': 'Meter base accepts net metering'},
        ]
        self.install.save(update_fields=['inspection_procedures'])
        ticket = self.assign(self.approve(self.create_request(self.install)), 'inspection')
        self.travel_and_arrive(ticket)
        tech = self.as_user(self.tech)

        job = self.ok(tech.get(f'/api/technician/jobs/{ticket.id}/')).data
        self.assertEqual(
            [check['title'] for check in job['service_types'][0]['inspection_procedures']],
            ['Roof can carry the array', 'Meter base accepts net metering'],
        )

        base = {
            'ticket': ticket.id, 'site_accessible': True, 'electrical_adequate': True,
            'safety_equipment_present': True, 'recommendation': 'Conditional',
        }
        missing = tech.post('/api/services/inspections/', {**base, 'checklist_items': []}, format='json')
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(len(missing.data['checklist_items']), 2)

        no_without_note = tech.post('/api/services/inspections/', {**base, 'checklist_items': [
            {'service_type_id': self.install.id, 'title': 'Roof can carry the array', 'answer': False},
            {'service_type_id': self.install.id, 'title': 'Meter base accepts net metering', 'answer': True},
        ]}, format='json')
        self.assertEqual(no_without_note.status_code, 400)
        self.assertIn('Explain the problem', str(no_without_note.data['checklist_items']))

        report = self.ok(tech.post('/api/services/inspections/', {**base, 'checklist_items': [
            {'service_type_id': self.install.id, 'title': 'Roof can carry the array', 'answer': False, 'notes': 'Rusted purlins on the east side.'},
            {'service_type_id': self.install.id, 'title': 'Meter base accepts net metering', 'answer': 'true'},
            {'service_type_id': self.install.id, 'title': 'Unconfigured extra check', 'answer': True},
        ]}, format='json'), 201)
        self.assertEqual(report.data['checklist_items'], [
            {'service_type_id': self.install.id, 'service_name': self.install.name, 'title': 'Roof can carry the array',
             'answer': False, 'notes': 'Rusted purlins on the east side.'},
            {'service_type_id': self.install.id, 'service_name': self.install.name, 'title': 'Meter base accepts net metering',
             'answer': True, 'notes': ''},
        ])
        self.ok(tech.post(f"/api/services/inspections/{report.data['id']}/complete/", {}, format='json'))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Inspection Completed')

        self.accept_quotation(ticket, 'QUO-CHECKS-01')
        self.ok(self.as_user(self.admin).post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', {
            'decision': 'approve_service', 'scheduled_date': (timezone.localdate() + timedelta(days=1)).isoformat(),
        }, format='json'))
        findings = ServiceStatusHistory.objects.get(ticket=ticket, notes__startswith='Inspection findings:').notes
        self.assertIn('Roof can carry the array: No (Rusted purlins on the east side.)', findings)
        self.assertIn('Meter base accepts net metering: Yes', findings)

    def test_admin_service_api_saves_normalized_inspection_checks(self):
        admin = self.as_user(self.admin)
        response = self.ok(admin.put(f'/api/admin/services/{self.install.id}/', {
            'inspection_procedures': [
                {'title': '  Roof can carry the array ', 'description': 'Check purlins.'},
                'Shade-free array area',
                {'title': '   '},
            ],
        }, format='json'))

        self.assertEqual(response.data['inspection_procedures'], [
            {'title': 'Roof can carry the array', 'description': 'Check purlins.'},
            {'title': 'Shade-free array area', 'description': ''},
        ])
        self.install.refresh_from_db()
        self.assertEqual(len(self.install.inspection_procedures), 2)
        too_many = admin.put(f'/api/admin/services/{self.install.id}/', {
            'inspection_procedures': [{'title': f'Check {index}'} for index in range(31)],
        }, format='json')
        self.assertEqual(too_many.status_code, 400)

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

        # Both are stored as Cancelled; the client can still tell an office rejection from a withdrawal.
        client = self.as_user(self.client_user)
        self.assertEqual(
            self.ok(client.get(f'/api/services/service-requests/{rejected.id}/')).data['closure'],
            {'kind': 'rejected', 'reason': 'Outside service area.'},
        )
        self.assertEqual(
            self.ok(client.get(f'/api/services/service-requests/{cancelled.id}/')).data['closure']['kind'],
            'cancelled_by_client',
        )

    def test_technician_with_open_work_cannot_be_deactivated(self):
        ticket = self.assign(self.approve(self.create_request(self.cleaning)), 'service')
        # Account management belongs to a superadmin (or an admin granted user management).
        admin = self.as_user(User.objects.create_user(username='journey-superadmin', password='pass', role='superadmin'))

        for response in (
            admin.delete(f'/api/admin/technicians/{self.tech.id}/'),
            admin.put(f'/api/admin/technicians/{self.tech.id}/', {'status': 'inactive'}, format='json'),
            admin.put(f'/api/admin/technicians/{self.tech.id}/', {'role': 'client'}, format='json'),
            admin.put(f'/api/admin/users/{self.tech.id}/', {'status': 'inactive'}, format='json'),
            admin.put(f'/api/admin/users/{self.tech.id}/', {'role': 'client'}, format='json'),
            admin.put(f'/api/admin/users/{self.tech.id}/', {'role': 'admin'}, format='json'),
            admin.delete(f'/api/admin/users/{self.tech.id}/'),
        ):
            self.assertEqual(response.status_code, 409, response.data)
            self.assertEqual(response.data['open_tickets'], [f'TKT-{ticket.id:04d}'])
        self.tech.refresh_from_db()
        self.assertEqual((self.tech.status, self.tech.is_active), ('active', True))
        self.assertEqual(self.tech.role, 'technician')

        ServiceTicket.objects.filter(pk=ticket.pk).update(status='Cancelled')
        self.ok(admin.delete(f'/api/admin/technicians/{self.tech.id}/'))
        self.tech.refresh_from_db()
        self.assertEqual(self.tech.status, 'inactive')

    def test_request_exposes_whether_its_service_requires_inspection(self):
        request_obj = self.create_request(self.install)
        data = self.ok(self.as_user(self.admin).get(f'/api/services/service-requests/{request_obj.id}/')).data
        self.assertTrue(data['service_requires_site_inspection'])
        self.assertIsNone(data['closure'])

    def test_secondary_service_requires_inspection_for_approval_and_dispatch(self):
        from services.models import ServiceRequestService

        request_obj = self.create_request(self.cleaning)
        ServiceRequestService.objects.create(request=request_obj, service_type=self.install, sort_order=1)
        admin = self.as_user(self.admin)
        data = self.ok(admin.get(f'/api/services/service-requests/{request_obj.id}/')).data
        self.assertTrue(data['service_requires_site_inspection'])
        self.ok(admin.post(f'/api/services/service-requests/{request_obj.id}/approve/', {
            'require_inspection': False,
        }, format='json'))
        ticket = ServiceTicket.objects.get(request=request_obj)
        self.assertEqual((ticket.status, ticket.ticket_type), ('For Inspection', 'inspection'))
        refused = admin.post(f'/api/services/service-tickets/{ticket.id}/assign/', {
            'technician_id': self.tech.id, 'dispatch_stage': 'service',
            'scheduled_date': timezone.localdate().isoformat(),
        }, format='json')
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assign(ticket, 'inspection')

    def test_technician_role_can_change_after_open_assignments_are_reassigned(self):
        ticket = self.assign(self.approve(self.create_request(self.cleaning)), 'service')
        ServiceTicket.objects.filter(pk=ticket.pk).update(technician=self.other_tech)
        admin = self.as_user(User.objects.create_user(username='role-superadmin', password='pass', role='superadmin'))
        self.ok(admin.put(f'/api/admin/users/{self.tech.id}/', {'role': 'client'}, format='json'))
        self.tech.refresh_from_db()
        self.assertEqual(self.tech.role, 'client')

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
