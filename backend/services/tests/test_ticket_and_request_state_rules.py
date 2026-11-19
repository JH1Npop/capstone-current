"""Every ticket and request state change, generated from the rules themselves.

* Every pair of ticket statuses through the office's manual status change: a pair outside
  ``ALLOWED_TICKET_TRANSITIONS`` is refused and leaves the ticket and its history unchanged; an
  allowed pair moves the ticket and records the reason (completion has its own documented checks).
* The guards that apply whichever action asks: no field work without a technician, no service work
  before a required inspection, no service work before a required deposit.
* Who may call each request and job action (client, technicians, office, superadmin).
* Request decisions only from the states the workflow allows.
"""

from ._imports import *  # noqa: F403,F405
from services.business_time import business_today
from services.models import InspectionChecklist
from services.views.helpers import ALLOWED_TICKET_TRANSITIONS, FIELD_WORK_STATUSES
from users.rbac import REPORTS_VIEW

STATUSES = list(ALLOWED_TICKET_TRANSITIONS)


class TicketFixture(APITestCase):
    def setUp(self):
        self.superadmin = User.objects.create_user(username='rules-super', password='x', role='superadmin')
        self.tech = User.objects.create_user(username='rules-tech', password='x', role='technician', status='active')
        self.client_user = User.objects.create_user(username='rules-client', password='x', role='client')
        self.service = ServiceType.objects.create(name='Rules service', estimated_duration=60)

    def ticket(self, *, status_value='Not Started', ticket_type='installation', technician=True, service=None, request_status='Approved'):
        req = ServiceRequest.objects.create(client=self.client_user, service_type=service or self.service, description='Rules', status=request_status)
        ServiceLocation.objects.create(request=req, address='Site', city='Cabuyao', province='Laguna', latitude=14.2786, longitude=121.125)
        # Each ticket gets its own lead: a lead can be in the field on only one job at a time
        # (validate_ticket_transition), and these tests leave many tickets in field states.
        lead = None
        if technician:
            lead = User.objects.create_user(
                username=f'rules-tech-{ServiceTicket.objects.count() + 1}', password='x', role='technician', status='active',
            )
        return ServiceTicket.objects.create(
            request=req, technician=lead, scheduled_date=business_today(),
            status=status_value, ticket_type=ticket_type,
        )

    def move(self, ticket, target, reason='Rules check'):
        self.client.force_authenticate(self.superadmin)
        response = self.client.post(f'/api/services/service-tickets/{ticket.id}/update_status/', {'status': target, 'reason': reason}, format='json')
        ticket.refresh_from_db()
        return response


class TicketTransitionMatrixTests(TicketFixture):
    def check_every_pair(self, ticket_type):
        for source in STATUSES:
            for target in STATUSES:
                if source == target:
                    continue
                with self.subTest(ticket_type=ticket_type, source=source, target=target):
                    ticket = self.ticket(status_value=source, ticket_type=ticket_type)
                    history_before = ServiceStatusHistory.objects.filter(ticket=ticket).count()
                    response = self.move(ticket, target)
                    if target not in ALLOWED_TICKET_TRANSITIONS[source]:
                        self.assertEqual(response.status_code, 400)
                        # A move to Completed meets the completion checks first; either way it is refused.
                        self.assertIn(response.data['error'], {
                            f'Cannot move ticket from {source} to {target}.',
                            'Complete the job checklist before closing this job.',
                            'An inspection visit ends when the inspection report is submitted, not with Finish Job.',
                        })
                        self.assertEqual(ticket.status, source)
                        self.assertEqual(ServiceStatusHistory.objects.filter(ticket=ticket).count(), history_before)
                    elif target == 'Completed':
                        # Completion has its own checks (below); the move is refused here without them.
                        self.assertEqual(response.status_code, 400)
                        self.assertEqual(ticket.status, source)
                    elif ticket_type == 'inspection' and source == 'Inspection Completed' and target != 'Cancelled':
                        # A reported visit leaves only through the office review or a cancel
                        # (flow explorer finding, 2026-11-18).
                        self.assertEqual(response.status_code, 400)
                        expected = 'office reviews it next' if target in FIELD_WORK_STATUSES else 'Use Review Inspection'
                        self.assertIn(expected, response.data['error'])
                        self.assertEqual(ticket.status, source)
                    else:
                        self.assertEqual(response.status_code, 200, response.data)
                        self.assertEqual(ticket.status, target)
                        latest = ServiceStatusHistory.objects.filter(ticket=ticket).latest('id')
                        self.assertEqual(latest.status, target)
                        self.assertIn('Rules check', latest.notes)

    def test_every_status_pair_for_service_tickets(self):
        self.check_every_pair('installation')

    def test_every_status_pair_for_inspection_visits(self):
        self.check_every_pair('inspection')

    def test_completion_needs_the_checklist_and_never_closes_an_inspection_visit(self):
        ticket = self.ticket(status_value='In Progress')
        refused = self.move(ticket, 'Completed')
        self.assertEqual(refused.data['error'], 'Complete the job checklist before closing this job.')
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.assertEqual(self.move(ticket, 'Completed').status_code, 200)
        ticket.request.refresh_from_db()
        self.assertEqual((ticket.status, ticket.request.status), ('Completed', 'Completed'))

        visit = self.ticket(status_value='Inspection Completed', ticket_type='inspection')
        refused = self.move(visit, 'Completed')
        self.assertEqual(refused.data['error'], 'An inspection visit ends when the inspection report is submitted, not with Finish Job.')

    def test_a_reason_and_a_real_status_are_required(self):
        ticket = self.ticket()
        self.assertEqual(self.move(ticket, 'Cancelled', reason='   ').data['error'], 'A reason (notes) is required for a manual ticket status change.')
        self.assertEqual(self.move(ticket, 'Teleported').data['error'], 'Unsupported ticket status.')
        self.assertEqual(ticket.status, 'Not Started')

    def test_cancelling_closes_the_request_too(self):
        ticket = self.ticket(status_value='In Progress')
        self.assertEqual(self.move(ticket, 'Cancelled').status_code, 200)
        ticket.request.refresh_from_db()
        self.assertEqual(ticket.request.status, 'Cancelled')


class TicketGuardTests(TicketFixture):
    def test_no_field_work_without_a_technician(self):
        for source in ['Not Started', 'Ready for Service', 'Awaiting Materials']:
            with self.subTest(source=source):
                ticket = self.ticket(status_value=source, technician=False)
                response = self.move(ticket, 'Navigating')
                self.assertEqual(response.data['error'], 'Assign a technician before moving this ticket into field work.')
                self.assertEqual(ticket.status, source)

    def test_a_required_inspection_cannot_be_skipped(self):
        inspected_service = ServiceType.objects.create(name='Needs inspection', estimated_duration=60, requires_site_inspection=True)
        message = 'This service needs a site inspection first. Dispatch the inspection visit before service work.'
        for source, target in [('Not Started', 'Ready for Service'), ('Not Started', 'Navigating'), ('Ready for Service', 'Navigating')]:
            with self.subTest(source=source, target=target):
                ticket = self.ticket(status_value=source, service=inspected_service)
                self.assertEqual(self.move(ticket, target).data['error'], message)
                self.assertEqual(ticket.status, source)

        # Once the inspection has reported, the same move is allowed.
        ticket = self.ticket(status_value='Ready for Service', service=inspected_service)
        ServiceStatusHistory.objects.create(ticket=ticket, status='Inspection Completed', changed_by=self.superadmin)
        self.assertEqual(self.move(ticket, 'Navigating').status_code, 200)
        # An inspection visit itself travels as usual.
        visit = self.ticket(status_value='For Inspection', ticket_type='inspection', service=inspected_service)
        self.assertEqual(self.move(visit, 'Navigating').status_code, 200)

    def test_a_required_deposit_blocks_service_work(self):
        deposit_service = ServiceType.objects.create(name='Needs deposit', estimated_duration=60, deposit_policy='percentage', deposit_value=30)
        for target in ['Ready for Service', 'Navigating']:
            with self.subTest(target=target):
                ticket = self.ticket(service=deposit_service)
                response = self.move(ticket, target)
                self.assertEqual(response.data['error'], 'This service requires a deposit. Send a quotation and record the client acceptance first.')
                self.assertEqual(ticket.status, 'Not Started')


class ActionRoleTests(TicketFixture):
    """Who may call each request and job action; codes are what the API answers."""

    ROLES = ['owner client', 'other client', 'lead tech', 'crew tech', 'other tech', 'admin', 'scoped admin', 'superadmin']
    EXPECTED = {
        'approve request':        [403, 403, 403, 403, 403, 200, 403, 200],
        'reject request':         [403, 403, 403, 403, 403, 200, 403, 200],
        'cancel pending request': [200, 403, 403, 403, 403, 200, 403, 200],
        'start navigation':       [403, 403, 200, 200, 404, 403, 403, 403],
        'arrive':                 [403, 403, 200, 200, 404, 403, 403, 403],
        'start work':             [403, 403, 200, 200, 404, 403, 403, 403],
        'put on hold':            [403, 403, 200, 403, 404, 403, 403, 403],
        'office status change':   [403, 403, 403, 403, 403, 200, 403, 200],
        'client reschedule ask':  [200, 404, 403, 403, 404, 403, 403, 403],
        'rate finished job':      [200, 404, 403, 403, 404, 403, 403, 403],
    }

    def setUp(self):
        super().setUp()
        mk = User.objects.create_user
        self.users = {
            'owner client': self.client_user,
            'other client': mk(username='rules-other', password='x', role='client'),
            'lead tech': self.tech,
            'crew tech': mk(username='rules-crew', password='x', role='technician', status='active'),
            'other tech': mk(username='rules-tech2', password='x', role='technician', status='active'),
            'admin': mk(username='rules-admin', password='x', role='admin'),
            'scoped admin': mk(username='rules-scoped', password='x', role='admin'),
            'superadmin': self.superadmin,
        }
        UserCapabilityGrant.objects.create(user=self.users['scoped admin'], capability_code=REPORTS_VIEW)

    def fresh(self, *, ticket_status=None, request_status='Approved'):
        ServiceTicket.objects.all().delete()
        ServiceRequest.objects.all().delete()
        later = business_today() + timedelta(days=30)
        req = ServiceRequest.objects.create(client=self.client_user, service_type=self.service, description='Roles', status=request_status, preferred_date=later)
        ServiceLocation.objects.create(request=req, address='Site', city='Cabuyao', province='Laguna', latitude=14.2, longitude=121.1)
        ticket = None
        if ticket_status:
            ticket = ServiceTicket.objects.create(request=req, technician=self.tech, scheduled_date=later, status=ticket_status)
            TicketCrewAssignment.objects.create(ticket=ticket, technician=self.users['crew tech'])
        return req, ticket

    def call(self, action, user):
        later = (business_today() + timedelta(days=40)).isoformat()
        plans = {
            'approve request': ({'request_status': 'Pending'}, lambda r, t: (f'/api/services/service-requests/{r.id}/approve/', {})),
            'reject request': ({'request_status': 'Pending'}, lambda r, t: (f'/api/services/service-requests/{r.id}/reject/', {'reason': 'Out of area for now.'})),
            'cancel pending request': ({'request_status': 'Pending'}, lambda r, t: (f'/api/services/service-requests/{r.id}/cancel/', {'reason': 'Changed my mind.'})),
            'start navigation': ({'ticket_status': 'Ready for Service'}, lambda r, t: (f'/api/technician/jobs/{t.id}/start-navigation/', {})),
            'arrive': ({'ticket_status': 'Navigating'}, lambda r, t: (f'/api/technician/jobs/{t.id}/arrive/', {'latitude': 14.2, 'longitude': 121.1})),
            'start work': ({'ticket_status': 'Arrived on Site'}, lambda r, t: (f'/api/technician/jobs/{t.id}/status/', {'status': 'in_progress'})),
            'put on hold': ({'ticket_status': 'In Progress'}, lambda r, t: (f'/api/technician/jobs/{t.id}/status/', {'status': 'on_hold', 'reason': 'Waiting for rain to stop.'})),
            'office status change': ({'ticket_status': 'Not Started'}, lambda r, t: (f'/api/services/service-tickets/{t.id}/update_status/', {'status': 'Cancelled', 'reason': 'Role check'})),
            'client reschedule ask': ({'ticket_status': 'Not Started'}, lambda r, t: (f'/api/services/service-tickets/{t.id}/request_reschedule/', {'reason': 'Out of town.', 'preferred_date': later, 'preferred_time_slot': 'morning'})),
            'rate finished job': ({'ticket_status': 'Completed', 'request_status': 'Completed'}, lambda r, t: (f'/api/services/service-tickets/{t.id}/submit_feedback/', {'rating': 5, 'feedback': 'Good.'})),
        }
        build, target = plans[action]
        req, ticket = self.fresh(**build)
        url, data = target(req, ticket)
        self.client.force_authenticate(user)
        return self.client.post(url, data, format='json').status_code

    def test_each_role_on_each_action(self):
        for action, expected in self.EXPECTED.items():
            for role, code in zip(self.ROLES, expected):
                with self.subTest(action=action, role=role):
                    self.assertEqual(self.call(action, self.users[role]), code)


class RequestDecisionStateTests(TicketFixture):
    def decide(self, request_obj, action, user, data=None):
        self.client.force_authenticate(user)
        response = self.client.post(f'/api/services/service-requests/{request_obj.id}/{action}/', data or {}, format='json')
        request_obj.refresh_from_db()
        return response

    def test_approve_and_reject_only_a_pending_request(self):
        for request_status in ['Approved', 'In Progress', 'Completed', 'Cancelled']:
            for action, data in [('approve', {}), ('reject', {'reason': 'Out of area for now.'})]:
                with self.subTest(request_status=request_status, action=action):
                    req = ServiceRequest.objects.create(client=self.client_user, service_type=self.service, description='State', status=request_status)
                    self.assertEqual(self.decide(req, action, self.superadmin, data).status_code, 400)
                    self.assertEqual(req.status, request_status)

    def test_approving_twice_creates_one_ticket(self):
        req = ServiceRequest.objects.create(client=self.client_user, service_type=self.service, description='Twice', status='Pending', preferred_date=business_today() + timedelta(days=30))
        ServiceLocation.objects.create(request=req, address='Site', city='Cabuyao', province='Laguna', latitude=14.2, longitude=121.1)
        self.assertEqual(self.decide(req, 'approve', self.superadmin).status_code, 200)
        self.assertEqual(self.decide(req, 'approve', self.superadmin).status_code, 400)
        self.assertEqual(ServiceTicket.objects.filter(request=req).count(), 1)

    def test_the_client_can_cancel_until_the_technician_sets_off(self):
        # Once the technician is on the way the client is told to call the office (409).
        for ticket_status, expected in [('Not Started', 200), ('Ready for Service', 200), ('Awaiting Materials', 200), ('Navigating', 409), ('Arrived on Site', 409), ('In Progress', 409), ('On Hold', 409)]:
            with self.subTest(ticket_status=ticket_status):
                ticket = self.ticket(status_value=ticket_status)
                response = self.decide(ticket.request, 'cancel', self.client_user, {'reason': 'No longer needed.'})
                self.assertEqual(response.status_code, expected, getattr(response, 'data', None))
                ticket.refresh_from_db()
                self.assertEqual(ticket.status == 'Cancelled', expected == 200)

    def test_the_office_can_still_cancel_a_paused_job(self):
        ticket = self.ticket(status_value='On Hold', request_status='In Progress')
        response = self.decide(ticket.request, 'cancel', self.superadmin, {'reason': 'Client called the office to stop.'})
        self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
        ticket.refresh_from_db()
        self.assertEqual((ticket.status, ticket.request.status), ('Cancelled', 'Cancelled'))


class CrewCompletionTests(TicketFixture):
    def test_only_the_lead_can_finish_a_job(self):
        crew = User.objects.create_user(username='rules-crew-finish', password='x', role='technician', status='active')
        ticket = self.ticket(status_value='In Progress')
        TicketCrewAssignment.objects.create(ticket=ticket, technician=crew)
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(crew)
        by_status = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'completed'}, format='json')
        by_finish = self.client.post(f'/api/services/service-tickets/{ticket.id}/complete_work/', {'completion_notes': 'Done.'}, format='multipart')
        self.assertEqual((by_status.status_code, by_finish.status_code), (403, 403))
        self.assertIn('Only the lead technician can complete this ticket.', str(by_status.data) + str(by_finish.data))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')
