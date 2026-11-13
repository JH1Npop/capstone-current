"""Every job type x every stage x every way to cancel or say "no".

Job types: direct service, direct service with a deposit, inspection first, inspection first with a deposit.
Each job is driven through the real API (client books, office approves, technicians travel and work, the
client answers the quotation, the office records the deposit), and at every stage each cancel path is tried
inside a savepoint that is rolled back, so the next path starts from the same stage:

* client cancels the request; office cancels the request; office rejects it; office dismisses the ticket;
  office cancels at the inspection review.

Allowed or refused by the documented rules, and after a cancel: request and ticket closed, technicians
released and told, the client told, a deposit decision asked for only when money was received, and
nothing further can happen on the job (travel, reschedule, dispatch, quotation answer, another cancel).
"""

from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.db import transaction
from rest_framework.test import APITestCase

from notifications.models import Notification
from services.business_time import business_today
from services.deposits import received_deposit_amount
from services.models import (
    FieldServiceReport, InspectionChecklist, QuotationRecord, ServiceRequest, ServiceTicket, ServiceType,
    TechnicianSkill, TicketCrewAssignment,
)
from services.views.document_locks import cancelled_job_message
from users.models import User

from .proof_fixtures import completion_photo

SITE = {'latitude': '14.278600', 'longitude': '121.125000'}
FIELD_STAGES = {'navigating', 'arrived', 'in_progress', 'on_hold'}

SERVICE_TAIL = ['svc_assigned', 'svc_navigating', 'svc_arrived', 'svc_in_progress', 'svc_on_hold', 'completed']
INSPECTION_HEAD = ['pending', 'approved', 'insp_assigned', 'insp_navigating', 'insp_arrived', 'insp_in_progress', 'insp_on_hold', 'insp_completed']
JOB_TYPES = {
    'direct': dict(inspection=False, deposit=False, path=['pending', 'approved'] + SERVICE_TAIL, branches={}),
    'direct with deposit': dict(
        inspection=False, deposit=True,
        path=['pending', 'approved', 'quote_sent', 'quote_accepted', 'deposit_partial', 'deposit_paid'] + SERVICE_TAIL,
        branches={'quote_sent': 'quote_declined'},
    ),
    'inspection first': dict(
        inspection=True, deposit=False,
        path=INSPECTION_HEAD + ['quote_sent', 'quote_accepted', 'ready_for_service'] + SERVICE_TAIL,
        branches={'quote_sent': 'quote_declined', 'quote_accepted': 'awaiting_materials'},
    ),
    'inspection first with deposit': dict(
        inspection=True, deposit=True,
        path=INSPECTION_HEAD + ['quote_sent', 'quote_accepted', 'deposit_partial', 'deposit_paid', 'ready_for_service'] + SERVICE_TAIL,
        branches={'quote_sent': 'quote_declined'},
    ),
}
CANCEL_PATHS = ['client cancels', 'office cancels request', 'office rejects', 'office dismisses ticket', 'office cancels at inspection review']


class JobWalker(APITestCase):
    def setUp(self):
        # Many jobs share a few dates here; the shared daily appointment limit is not what is tested.
        patcher = mock.patch('services.scheduling_policy.DEFAULT_APPOINTMENT_DAILY_CAPACITY', 100000)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.office = User.objects.create_user(username='cm-office', password='x', role='superadmin')

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def ok(self, response, label):
        self.assertIn(response.status_code, (200, 201), f'{label}: {response.status_code} {getattr(response, "data", "")}')
        return response

    def new_job(self, type_name):
        spec = JOB_TYPES[type_name]
        key = len(User.objects.all())
        service = ServiceType.objects.create(
            name=f'CM {type_name} {key}', estimated_duration=60, estimated_cost=Decimal('10000'), max_daily_assignments=99,
            requires_site_inspection=spec['inspection'], procedures=[{'title': 'Do the work'}],
            deposit_policy='fixed' if spec['deposit'] else 'none', deposit_value=Decimal('2000') if spec['deposit'] else 0,
        )
        job = {
            'type': type_name,
            'client': User.objects.create_user(username=f'cm-client{key}', password='x', role='client'),
            'lead': User.objects.create_user(username=f'cm-lead{key}', password='x', role='technician', status='active'),
            'crew': User.objects.create_user(username=f'cm-crew{key}', password='x', role='technician', status='active'),
            'service': service, 'request': None, 'ticket': None, 'quote': None,
        }
        for tech in (job['lead'], job['crew']):
            TechnicianSkill.objects.create(technician=tech, service_type=service)
        return job

    # ── one step per stage ──
    def step(self, job, stage):
        lead, client, office = job['lead'], job['client'], self.office
        ticket_id = job['ticket'].id if job['ticket'] else None
        if stage == 'pending':
            response = self.ok(self.as_(client).post('/api/services/service-requests/', {
                'service_type': job['service'].id, 'description': 'Matrix job', 'priority': 'Normal',
                'location_address': '1 Matrix Lane', 'location_city': 'Cabuyao', 'location_province': 'Laguna',
                'preferred_date': (business_today() + timedelta(days=2)).isoformat(), **SITE,
            }, format='json'), 'book')
            job['request'] = ServiceRequest.objects.get(pk=response.data['id'])
        elif stage == 'approved':
            self.ok(self.as_(office).post(f"/api/services/service-requests/{job['request'].id}/approve/", {}, format='json'), 'approve')
            job['ticket'] = ServiceTicket.objects.get(request=job['request'])
        elif stage in ('insp_assigned', 'svc_assigned'):
            self.ok(self.as_(office).post(f'/api/services/service-tickets/{ticket_id}/assign/', {
                'technician_id': lead.id, 'crew_ids': [job['crew'].id],
                'dispatch_stage': 'inspection' if stage == 'insp_assigned' else 'service',
                'scheduled_date': business_today().isoformat(),
            }, format='json'), stage)
        elif stage.endswith('_navigating'):
            self.ok(self.as_(lead).post(f'/api/technician/jobs/{ticket_id}/start-navigation/', {}, format='json'), stage)
        elif stage.endswith('_arrived'):
            self.ok(self.as_(lead).post(f'/api/technician/jobs/{ticket_id}/arrive/', SITE, format='json'), stage)
        elif stage.endswith('_in_progress'):
            self.ok(self.as_(lead).post(f'/api/technician/jobs/{ticket_id}/status/', {'status': 'in_progress'}, format='json'), stage)
        elif stage.endswith('_on_hold'):
            self.ok(self.as_(lead).post(f'/api/technician/jobs/{ticket_id}/status/', {'status': 'on_hold', 'reason': 'Heavy rain.'}, format='json'), stage)
        elif stage == 'insp_completed':
            tech = self.as_(lead)
            self.ok(tech.post(f'/api/technician/jobs/{ticket_id}/status/', {'status': 'in_progress'}, format='json'), 'resume')
            report = self.ok(tech.post('/api/services/inspections/', {
                'ticket': ticket_id, 'site_accessible': True, 'electrical_adequate': True,
                'safety_equipment_present': True, 'recommendation': 'Approved', 'checklist_items': [],
            }, format='json'), 'inspection report')
            self.ok(tech.post(f"/api/services/inspections/{report.data['id']}/complete/", {}, format='json'), 'inspection complete')
        elif stage == 'quote_sent':
            response = self.ok(self.as_(office).post('/api/services/quotations/', {
                'ticket': ticket_id, 'client': client.id, 'total_amount': 'PHP 10,000.00', 'status': 'Sent',
            }, format='json'), 'quotation')
            job['quote'] = QuotationRecord.objects.get(pk=response.data['id'])
        elif stage in ('quote_accepted', 'quote_declined'):
            decision = 'accept' if stage == 'quote_accepted' else 'decline'
            self.ok(self.as_(client).post(f"/api/services/quotations/{job['quote'].id}/respond/", {'decision': decision, 'note': 'Too expensive.'}, format='json'), stage)
        elif stage in ('deposit_partial', 'deposit_paid'):
            self.ok(self.as_(office).post(f"/api/services/quotations/{job['quote'].id}/deposit-payments/", {
                'amount': '500' if stage == 'deposit_partial' else '1500', 'paid_on': business_today().isoformat(), 'method': 'cash',
            }, format='json'), stage)
        elif stage in ('ready_for_service', 'awaiting_materials'):
            self.ok(self.as_(office).post(f'/api/services/service-tickets/{ticket_id}/inspection_decision/', {
                'decision': 'approve_service' if stage == 'ready_for_service' else 'awaiting_materials',
                'notes': 'Reviewed.', 'scheduled_date': (business_today() + timedelta(days=1)).isoformat(),
            }, format='json'), stage)
        elif stage == 'completed':
            tech = self.as_(lead)
            self.ok(tech.post(f'/api/technician/jobs/{ticket_id}/status/', {'status': 'in_progress'}, format='json'), 'resume')
            self.ok(tech.post('/api/checklist/', {
                'jobId': ticket_id, 'completed': {'0': True},
                'checklist_items': [{'index': 0, 'label': 'Do the work', 'completed': True}], 'notes': 'Done.',
            }, format='json'), 'checklist')
            self.ok(tech.post(f'/api/services/service-tickets/{ticket_id}/complete_work/', {
                'completion_photo_files': completion_photo(), 'completion_notes': 'Done.',
            }, format='multipart'), 'complete')
        else:
            raise AssertionError(f'unknown stage {stage}')


class CancelMatrixTests(JobWalker):
    def cancel(self, job, how):
        req, ticket = job['request'], job['ticket']
        if how == 'client cancels':
            return self.as_(job['client']).post(f'/api/services/service-requests/{req.id}/cancel/', {'reason': 'Changed my mind.'}, format='json')
        if how == 'office cancels request':
            return self.as_(self.office).post(f'/api/services/service-requests/{req.id}/cancel/', {'reason': 'Client phoned.'}, format='json')
        if how == 'office rejects':
            return self.as_(self.office).post(f'/api/services/service-requests/{req.id}/reject/', {'reason': 'Outside the area.'}, format='json')
        if ticket is None:
            return None
        if how == 'office dismisses ticket':
            return self.as_(self.office).post(f'/api/services/service-tickets/{ticket.id}/update_status/', {'status': 'Cancelled', 'reason': 'Client backed out: phoned.'}, format='json')
        return self.as_(self.office).post(f'/api/services/service-tickets/{ticket.id}/inspection_decision/', {'decision': 'cancel', 'notes': 'Roof not feasible.'}, format='json')

    def expected_code(self, stage, how, ticket_status):
        if how == 'office cancels at inspection review':
            return 200 if ticket_status == 'Inspection Completed' else 400
        if stage == 'completed':
            return 400
        if how == 'office rejects':
            return 200 if stage == 'pending' else 400
        if how == 'client cancels' and stage.split('_', 1)[-1] in FIELD_STAGES:
            return 409
        return 200

    def check_cancel_paths(self, job, stage):
        for how in CANCEL_PATHS:
            sid = transaction.savepoint()
            try:
                job['ticket'] = ServiceTicket.objects.filter(request=job['request']).first()
                ticket_before = job['ticket']
                team = [] if ticket_before is None else [u for u in (job['lead'], job['crew']) if (
                    ticket_before.technician_id == u.id or TicketCrewAssignment.objects.filter(ticket=ticket_before, technician=u).exists()
                )]
                money_in = received_deposit_amount(job['quote']) if job['quote'] else 0
                marks = {u.pk: Notification.objects.filter(user=u).count() for u in (job['client'], job['lead'], job['crew'], self.office)}
                response = self.cancel(job, how)
                if response is None:
                    continue
                with self.subTest(job=job['type'], stage=stage, cancel=how):
                    expected = self.expected_code(stage, how, ticket_before.status if ticket_before else None)
                    self.assertEqual(response.status_code, expected, response.data)
                    if expected == 409:
                        self.assertEqual(response.data['code'], 'cancellation_requires_office')
                    if expected != 200:
                        continue
                    self.check_closed_job(job, how, team, money_in, marks)
            finally:
                transaction.savepoint_rollback(sid)

    def new_titles(self, user, marks):
        return list(Notification.objects.filter(user=user).order_by('id').values_list('title', flat=True))[marks[user.pk]:]

    def check_closed_job(self, job, how, team, money_in, marks):
        req = ServiceRequest.objects.get(pk=job['request'].pk)
        ticket = ServiceTicket.objects.filter(request=req).first()
        self.assertEqual(req.status, 'Cancelled')
        if ticket:
            self.assertEqual(ticket.status, 'Cancelled')
        # The client is told, in words that say what happened.
        self.assertTrue(
            any(('Cancelled' in title) or ('Rejected' in title) for title in self.new_titles(job['client'], marks)),
            self.new_titles(job['client'], marks),
        )
        # Every technician on the job is released and told.
        for tech in team:
            tech.refresh_from_db()
            self.assertTrue(tech.is_available, tech.username)
            titles = self.new_titles(tech, marks)
            self.assertTrue(any(('Cancelled' in t) or ('Inspection Decision' in t) for t in titles), (tech.username, titles))
        # The office is asked about the deposit only when money was received.
        deposit_notices = [t for t in self.new_titles(self.office, marks) if t.startswith('Deposit decision needed')]
        self.assertEqual(len(deposit_notices), 1 if money_in > 0 else 0)
        # Nothing further happens on the job.
        again = self.as_(job['client']).post(f'/api/services/service-requests/{req.id}/cancel/', {'reason': 'Again.'}, format='json')
        self.assertEqual(again.status_code, 400)
        if job['quote'] is not None:
            quote = QuotationRecord.objects.get(pk=job['quote'].pk)
            if quote.status == 'Sent':
                answer = self.as_(job['client']).post(f'/api/services/quotations/{quote.id}/respond/', {'decision': 'accept'}, format='json')
                self.assertEqual(answer.status_code, 409)
        if ticket is None:
            return
        travel = self.as_(job['lead']).post(f'/api/technician/jobs/{ticket.id}/start-navigation/', {}, format='json')
        self.assertIn(travel.status_code, (404, 409))   # 404: never assigned; 409: "the office cancelled ..."
        reschedule = self.as_(job['client']).post(f'/api/services/service-tickets/{ticket.id}/request_reschedule/', {
            'reason': 'Later please.', 'preferred_date': (business_today() + timedelta(days=5)).isoformat(),
        }, format='json')
        self.assertEqual(reschedule.status_code, 400)
        dispatch = self.as_(self.office).post(f'/api/services/service-tickets/{ticket.id}/assign/', {
            'technician_id': job['lead'].id, 'dispatch_stage': 'service', 'scheduled_date': business_today().isoformat(),
        }, format='json')
        self.assertEqual(dispatch.status_code, 400)

    def walk(self, type_name):
        spec = JOB_TYPES[type_name]
        job = self.new_job(type_name)
        for stage in spec['path']:
            self.step(job, stage)
            self.check_cancel_paths(job, stage)
            branch = spec['branches'].get(stage)
            if branch:
                sid = transaction.savepoint()
                try:
                    self.step(job, branch)
                    self.check_cancel_paths(job, branch)
                finally:
                    transaction.savepoint_rollback(sid)

    def test_direct_service(self):
        self.walk('direct')

    def test_direct_service_with_deposit(self):
        self.walk('direct with deposit')

    def test_inspection_first(self):
        self.walk('inspection first')

    def test_inspection_first_with_deposit(self):
        self.walk('inspection first with deposit')


class CancelledJobForTechniciansTests(JobWalker):
    """After the office cancels mid-job, every change a technician tries gets one plain answer."""

    def test_every_technician_action_on_a_cancelled_job(self):
        job = self.new_job('inspection first')
        for stage in ['pending', 'approved', 'insp_assigned', 'insp_navigating', 'insp_arrived']:
            self.step(job, stage)
        ticket = job['ticket']
        InspectionChecklist.objects.get_or_create(ticket=ticket)
        report = FieldServiceReport.objects.create(ticket=ticket)
        self.ok(self.as_(self.office).post(f'/api/services/service-tickets/{ticket.id}/update_status/', {
            'status': 'Cancelled', 'reason': 'Client backed out: phoned.',
        }, format='json'), 'dismiss')
        # Lead and crew are both told, in plain words.
        for tech in (job['lead'], job['crew']):
            self.assertTrue(Notification.objects.filter(user=tech, title=f'Ticket #{ticket.id} Cancelled').exists(), tech.username)
        self.assertTrue(Notification.objects.filter(user=job['client'], title=f'Ticket #{ticket.id} Cancelled').exists())

        inspection_id = ticket.inspection.id
        attempts = {
            'start travel': lambda c: c.post(f'/api/technician/jobs/{ticket.id}/start-navigation/', {}, format='json'),
            'arrive': lambda c: c.post(f'/api/technician/jobs/{ticket.id}/arrive/', SITE, format='json'),
            'start work': lambda c: c.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'in_progress'}, format='json'),
            'put on hold': lambda c: c.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'on_hold', 'reason': 'x'}, format='json'),
            'upload proof': lambda c: c.post(f'/api/services/service-tickets/{ticket.id}/upload_photos/', {'photos': completion_photo()}, format='multipart'),
            'request equipment': lambda c: c.post(f'/api/services/service-tickets/{ticket.id}/request_parts/', {'parts': 'Breaker', 'notes': 'x'}, format='json'),
            'finish job': lambda c: c.post(f'/api/services/service-tickets/{ticket.id}/complete_work/', {'completion_photo_files': completion_photo(), 'completion_notes': 'd'}, format='multipart'),
            'inspection report': lambda c: c.patch(f'/api/services/inspections/{inspection_id}/', {'additional_notes': 'late'}, format='json'),
            'complete inspection': lambda c: c.post(f'/api/services/inspections/{inspection_id}/complete/', {}, format='json'),
            'new field service report': lambda c: c.post('/api/services/field-service-reports/', {'ticket': ticket.id, 'brand_model': 'x'}, format='json'),
            'edit field service report': lambda c: c.patch(f'/api/services/field-service-reports/{report.id}/', {'brand_model': 'y'}, format='json'),
            'new data sheet': lambda c: c.post('/api/services/technical-data-sheets/', {'ticket': ticket.id}, format='json'),
            'new commissioning checklist': lambda c: c.post('/api/services/solar-commissioning-checklists/', {'ticket': ticket.id}, format='json'),
        }
        message = cancelled_job_message(ticket)
        for tech in (job['lead'], job['crew']):
            client = self.as_(tech)
            for name, attempt in attempts.items():
                with self.subTest(technician=tech.username, action=name):
                    response = attempt(client)
                    self.assertEqual(response.status_code, 409, response.data)
                    self.assertEqual(response.data.get('error') or response.data.get('detail'), message)
            # Reading the job and its documents still works.
            self.assertEqual(client.get(f'/api/technician/jobs/{ticket.id}/').status_code, 200)
            self.assertEqual(client.get(f'/api/services/field-service-reports/{report.id}/').status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Cancelled')
        self.assertFalse(FieldServiceReport.objects.filter(ticket=ticket).exclude(pk=report.pk).exists())

    def test_another_technician_learns_nothing_about_the_cancelled_job(self):
        job = self.new_job('direct')
        for stage in ['pending', 'approved', 'svc_assigned']:
            self.step(job, stage)
        ticket = job['ticket']
        self.ok(self.as_(self.office).post(f'/api/services/service-tickets/{ticket.id}/update_status/', {
            'status': 'Cancelled', 'reason': 'Client backed out: phoned.',
        }, format='json'), 'dismiss')
        outsider = User.objects.create_user(username='cm-outsider', password='x', role='technician', status='active')
        response = self.as_(outsider).post('/api/services/field-service-reports/', {'ticket': ticket.id, 'brand_model': 'x'}, format='json')
        self.assertIn(response.status_code, (400, 403))
        self.assertNotIn('cancelled', str(response.data).lower())
