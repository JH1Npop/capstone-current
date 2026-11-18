"""Flow explorer: random walks through every job type, trying every event by every role.

Each walk books a job of one of the four types (direct, direct with deposit, inspection first,
inspection first with deposit) and then fires random events from the full catalogue below, allowed
or not, by the client, the lead, a crew member, a technician who is not on the job, and the office.
After every event the rules that must always hold are checked:

  no-crash          no event answers 5xx;
  refused-clean     a refused single-call event changes nothing;
  request-sync      the request status matches its ticket status;
  closed-stays      a closed ticket never moves again (except Completed -> Turned Over);
  field-needs-tech  field work (travel, on site, working) always has a lead technician;
  availability      each technician's "available" flag matches their open field work;
  history           every ticket status change leaves a history line with a note;
  closed-flags      a closed ticket has no open reschedule request;
  outsiders         a crew member cannot pause, a technician not on the job cannot travel;
  no-dead-end       from every new state, an open job can still be finished (driven to Completed
                    inside a rolled-back savepoint by the forward actions a real office and crew use).

Walks are seeded, so a failure prints the seed and the exact event sequence to replay.
FLOW_EXPLORER_WALKS / FLOW_EXPLORER_STEPS / FLOW_EXPLORER_SEED widen or replay a run.
"""

import os
import random
from collections import Counter
from datetime import timedelta
from decimal import Decimal

from django.db import transaction

from services.business_time import business_today
from services.deposits import quotation_deposit_summary
from services.models import InspectionChecklist, QuotationRecord, ServiceStatusHistory, ServiceTicket
from services.views.helpers import TICKET_REQUEST_STATUS_MAP, get_expected_technician_availability
from users.models import User

from .proof_fixtures import completion_photo
from .test_job_type_cancel_matrix import JOB_TYPES, SITE, JobWalker

CLOSED = {'Completed', 'Turned Over / Accepted', 'Cancelled'}
FIELD = {'Navigating', 'Arrived on Site', 'In Progress'}
WALKS = int(os.environ.get('FLOW_EXPLORER_WALKS', '12'))
STEPS = int(os.environ.get('FLOW_EXPLORER_STEPS', '30'))
BASE_SEED = int(os.environ.get('FLOW_EXPLORER_SEED', '20261118'))


class FlowExplorerTests(JobWalker):
    # ── people ──
    def new_explorer_job(self, type_name):
        job = self.new_job(type_name)
        key = User.objects.count()
        job['spare'] = User.objects.create_user(username=f'fx-spare{key}', password='x', role='technician', status='active')
        job['stranger'] = User.objects.create_user(username=f'fx-stranger{key}', password='x', role='technician', status='active')
        from services.models import TechnicianSkill
        TechnicianSkill.objects.create(technician=job['spare'], service_type=job['service'])
        return job

    def refresh(self, job):
        if job['request'] is not None:
            job['request'].refresh_from_db()
            job['ticket'] = ServiceTicket.objects.filter(request=job['request']).first()
        job['quote'] = QuotationRecord.objects.filter(ticket=job['ticket']).first() if job['ticket'] else None

    def lead_of(self, job):
        ticket = job['ticket']
        return ticket.technician if ticket and ticket.technician_id else job['lead']

    # ── the event catalogue: name -> (single call?, function) ──
    def events(self):
        today = business_today()
        T = lambda job: f"/api/services/service-tickets/{job['ticket'].id}"
        R = lambda job: f"/api/services/service-requests/{job['request'].id}"
        J = lambda job: f"/api/technician/jobs/{job['ticket'].id}"
        office = self.office

        def office_status(new_status, reason='Office decision for the explorer.'):
            return lambda job: self.as_(office).post(f'{T(job)}/update_status/', {'status': new_status, 'reason': reason}, format='json')

        def tech_status(who, value, **extra):
            return lambda job: self.as_(who(job)).post(f'{J(job)}/status/', {'status': value, **extra}, format='json')

        def assign(stage, who='lead'):
            def run(job):
                data = {
                    'technician_id': job[who].id, 'dispatch_stage': stage,
                    'scheduled_date': today.isoformat(),
                }
                if who == 'lead':
                    data['crew_ids'] = [job['crew'].id]
                return self.as_(office).post(f'{T(job)}/assign/', data, format='json')
            return run

        def inspection_report(job):
            lead = self.as_(self.lead_of(job))
            report = InspectionChecklist.objects.filter(ticket=job['ticket']).first()
            if report is None:
                created = lead.post('/api/services/inspections/', {
                    'ticket': job['ticket'].id, 'site_accessible': True, 'electrical_adequate': True,
                    'safety_equipment_present': True, 'recommendation': 'Approved', 'checklist_items': [],
                }, format='json')
                if created.status_code not in (200, 201):
                    return created
                report_id = created.data['id']
            else:
                report_id = report.id
            return lead.post(f'/api/services/inspections/{report_id}/complete/', {}, format='json')

        def complete(job):
            lead = self.as_(self.lead_of(job))
            lead.post('/api/checklist/', {
                'jobId': job['ticket'].id, 'completed': {'0': True},
                'checklist_items': [{'index': 0, 'label': 'Do the work', 'completed': True}], 'notes': 'Done.',
            }, format='json')
            return lead.post(f'{T(job)}/complete_work/', {
                'completion_photo_files': completion_photo(), 'completion_notes': 'Done.',
            }, format='multipart')

        def quote_send(job):
            return self.as_(office).post('/api/services/quotations/', {
                'ticket': job['ticket'].id, 'client': job['client'].id, 'total_amount': 'PHP 10,000.00', 'status': 'Sent',
            }, format='json')

        def quote_resend(job):
            return self.as_(office).patch(f"/api/services/quotations/{job['quote'].id}/", {
                'status': 'Sent', 'total_amount': 'PHP 9,500.00',
            }, format='json')

        def quote_answer(decision):
            return lambda job: self.as_(job['client']).post(
                f"/api/services/quotations/{job['quote'].id}/respond/",
                {'decision': decision, 'note': 'Explorer answer.'}, format='json')

        def deposit(amount_fn):
            def run(job):
                amount = amount_fn(job)
                return self.as_(office).post(f"/api/services/quotations/{job['quote'].id}/deposit-payments/", {
                    'amount': str(amount), 'paid_on': today.isoformat(), 'method': 'cash',
                }, format='json')
            return run

        remaining = lambda job: quotation_deposit_summary(job['quote'])['deposit_remaining_amount'] or Decimal('1')

        def inspection_decision(decision):
            return lambda job: self.as_(office).post(f'{T(job)}/inspection_decision/', {
                'decision': decision, 'notes': 'Explorer review.',
                'scheduled_date': (today + timedelta(days=1)).isoformat(),
            }, format='json')

        needs = {'ticket': lambda job: job['ticket'] is not None, 'quote': lambda job: job['quote'] is not None,
                 'request': lambda job: job['request'] is not None}
        lead = self.lead_of
        crew = lambda job: job['crew']
        return {
            # client
            'client cancels': (True, needs['request'], lambda job: self.as_(job['client']).post(f'{R(job)}/cancel/', {'reason': 'Changed my mind.'}, format='json')),
            'client asks to reschedule': (True, needs['ticket'], lambda job: self.as_(job['client']).post(f'{T(job)}/request_reschedule/', {'reason': 'Out of town.'}, format='json')),
            'client accepts quote': (True, needs['quote'], quote_answer('accept')),
            'client declines quote': (True, needs['quote'], quote_answer('decline')),
            # office: request
            'office approves': (True, needs['request'], lambda job: self.as_(office).post(f'{R(job)}/approve/', {}, format='json')),
            'office rejects': (True, needs['request'], lambda job: self.as_(office).post(f'{R(job)}/reject/', {'reason': 'Outside the area.'}, format='json')),
            'office cancels request': (True, needs['request'], lambda job: self.as_(office).post(f'{R(job)}/cancel/', {'reason': 'Client phoned.'}, format='json')),
            # office: dispatch and schedule
            'office assigns inspection': (True, needs['ticket'], assign('inspection')),
            'office assigns service': (True, needs['ticket'], assign('service')),
            'office reassigns to spare': (True, needs['ticket'], assign('service', who='spare')),
            'office reschedules': (True, needs['ticket'], lambda job: self.as_(office).post(f'{T(job)}/reschedule/', {'scheduled_date': (today + timedelta(days=3)).isoformat(), 'notes': 'Moved.'}, format='json')),
            'office keeps current date': (True, needs['ticket'], lambda job: self.as_(office).post(f'{T(job)}/decline_reschedule/', {'notes': 'Fully booked.'}, format='json')),
            # office: status overrides
            'office pauses job': (True, needs['ticket'], office_status('On Hold')),
            'office confirms arrival': (True, needs['ticket'], office_status('Arrived on Site')),
            'office sets ready for service': (True, needs['ticket'], office_status('Ready for Service')),
            'office sets in progress': (True, needs['ticket'], office_status('In Progress')),
            'office dismisses ticket': (True, needs['ticket'], office_status('Cancelled', 'Office cancelled: explorer.')),
            # office: inspection review
            'office approves inspection': (True, needs['ticket'], inspection_decision('approve_service')),
            'office awaits materials': (True, needs['ticket'], inspection_decision('awaiting_materials')),
            'office cancels at inspection': (True, needs['ticket'], inspection_decision('cancel')),
            # office: money
            'office sends quote': (True, needs['ticket'], quote_send),
            'office resends quote': (True, needs['quote'], quote_resend),
            'office records part deposit': (True, needs['quote'], deposit(lambda job: Decimal('500'))),
            'office records full deposit': (True, needs['quote'], deposit(remaining)),
            'office settles deposit (refunded)': (True, needs['quote'], lambda job: self.as_(office).post(f"/api/services/quotations/{job['quote'].id}/settle-deposit/", {'outcome': 'refunded', 'note': 'GCash refund.'}, format='json')),
            # lead technician
            'lead starts travel': (True, needs['ticket'], lambda job: self.as_(lead(job)).post(f'{J(job)}/start-navigation/', {}, format='json')),
            'lead arrives': (True, needs['ticket'], lambda job: self.as_(lead(job)).post(f'{J(job)}/arrive/', SITE, format='json')),
            'lead starts work': (True, needs['ticket'], tech_status(lead, 'in_progress')),
            'lead pauses': (True, needs['ticket'], tech_status(lead, 'on_hold', reason='Heavy rain.')),
            'lead reports inspection': (False, needs['ticket'], inspection_report),
            'lead finishes job': (False, needs['ticket'], complete),
            # people who must be refused
            'crew tries to pause': (True, needs['ticket'], tech_status(crew, 'on_hold', reason='Crew pause.')),
            'outsider tries to travel': (True, needs['ticket'], lambda job: self.as_(job['stranger']).post(f'{J(job)}/start-navigation/', {}, format='json')),
        }

    # Forward actions, in the order an office and crew would use them to finish a job.
    FORWARD = [
        'office approves', 'lead starts work', 'lead arrives', 'lead starts travel', 'lead reports inspection',
        'lead finishes job', 'office approves inspection', 'office assigns service', 'office assigns inspection',
        'client accepts quote', 'office records full deposit', 'office sends quote', 'office resends quote',
    ]
    MUST_REFUSE = {'crew tries to pause', 'outsider tries to travel'}
    CLOSING = {'client cancels', 'office rejects', 'office cancels request', 'office dismisses ticket', 'office cancels at inspection'}

    def forward_once(self, job, catalogue):
        """Apply the first forward action that moves the job; (name, response) or (None, None)."""
        signature = self.signature(job)
        for name in self.FORWARD:
            _single, applicable, run = catalogue[name]
            if not applicable(job):
                continue
            sid = transaction.savepoint()
            response = run(job)
            if response.status_code < 400 and self.signature(job) != signature:
                transaction.savepoint_commit(sid)
                return name, response
            transaction.savepoint_rollback(sid)
            self.refresh(job)
        return None, None

    # ── state ──
    def signature(self, job):
        self.refresh(job)
        ticket, quote = job['ticket'], job['quote']
        return (
            job['request'].status if job['request'] else None,
            ticket.status if ticket else None,
            ticket.ticket_type if ticket else None,
            ticket.technician_id if ticket else None,
            bool(ticket and ticket.reschedule_requested),
            ticket.scheduled_date if ticket else None,
            quote.status if quote else None,
            quotation_deposit_summary(quote)['deposit_paid_amount'] if quote else None,
        )

    def abstract(self, job, signature):
        # The dead-end check is memoized on what matters for finishing, not on ids or dates.
        req, status, kind, tech, flag, _date, quote, paid = signature
        return (job['type'], req, status, kind, tech is not None, flag, quote, paid)

    # ── rules ──
    def check_rules(self, job, before, after, name, response, single, trail):
        where = f"[{job['type']}] after {name!r}\n  trail: {' -> '.join(trail)}"
        code = getattr(response, 'status_code', None)
        self.assertFalse(code is not None and code >= 500, f'no-crash: {code} {where}')
        if single and code is not None and code >= 400:
            self.assertEqual(before, after, f'refused-clean: {code} {getattr(response, "data", "")} {where}')
        if name in self.MUST_REFUSE:
            self.assertTrue(code is None or code >= 400, f'outsiders: {name} answered {code} {where}')

        ticket, req = job['ticket'], job['request']
        if ticket is not None:
            expected_request = 'Completed' if ticket.status == 'Turned Over / Accepted' else TICKET_REQUEST_STATUS_MAP.get(ticket.status)
            self.assertEqual(req.status, expected_request, f'request-sync: ticket {ticket.status} but request {req.status} {where}')
            if before[1] in CLOSED and before[1] != 'Completed':
                self.assertEqual(ticket.status, before[1], f'closed-stays: {before[1]} -> {ticket.status} {where}')
            if before[1] == 'Completed':
                self.assertIn(ticket.status, {'Completed', 'Turned Over / Accepted'}, f'closed-stays {where}')
            if ticket.status in FIELD:
                self.assertIsNotNone(ticket.technician_id, f'field-needs-tech: {ticket.status} {where}')
            if ticket.status in CLOSED:
                self.assertFalse(ticket.reschedule_requested, f'closed-flags {where}')
            if before[1] != after[1] and after[1] is not None and before[1] is not None:
                latest = ServiceStatusHistory.objects.filter(ticket=ticket, status=ticket.status).order_by('-id').first()
                self.assertIsNotNone(latest, f'history: no line for {ticket.status} {where}')
                self.assertTrue((latest.notes or '').strip(), f'history: blank note for {ticket.status} {where}')
        for tech in (job['lead'], job['crew'], job['spare']):
            tech.refresh_from_db()
            self.assertEqual(tech.is_available, get_expected_technician_availability(tech),
                             f'availability: {tech.username} is_available={tech.is_available} {where}')

    def can_finish(self, job, catalogue, trail):
        """Drive the job forward inside a rolled-back savepoint; return the path or raise on a dead end."""
        sid = transaction.savepoint()
        path = []
        try:
            for _ in range(30):
                signature = self.signature(job)
                if signature[1] in {'Completed', 'Turned Over / Accepted'}:
                    return path
                if signature[0] == 'Cancelled' or signature[1] == 'Cancelled':
                    return path  # closed by an earlier event; nothing to finish
                refusals = []
                for name in self.FORWARD:
                    _single, applicable, run = catalogue[name]
                    if not applicable(job):
                        continue
                    response = run(job)
                    if response.status_code < 400 and self.signature(job) != signature:
                        path.append(name)
                        break
                    detail = getattr(response, 'data', None)
                    if isinstance(detail, dict):
                        detail = detail.get('error') or detail.get('detail') or detail
                    refusals.append(f'{name}: {response.status_code} {str(detail)[:160]}')
                else:
                    self.fail(
                        f"no-dead-end: [{job['type']}] stuck at request={signature[0]} ticket={signature[1]} "
                        f"type={signature[2]} quote={signature[6]} paid={signature[7]}\n"
                        f"  trail: {' -> '.join(trail)}\n  forward tried: {' -> '.join(path) or '(nothing moved)'}\n"
                        f"  refused: " + '\n           '.join(refusals)
                    )
            self.fail(f"no-dead-end: [{job['type']}] did not finish in 30 forward steps\n  trail: {' -> '.join(trail)}\n  forward: {' -> '.join(path)}")
        finally:
            transaction.savepoint_rollback(sid)
            self.refresh(job)

    def test_random_walks_keep_every_rule_and_never_strand_a_job(self):
        catalogue = self.events()
        names = sorted(catalogue)
        open_names = [name for name in names if name not in self.CLOSING]
        coverage = Counter()
        checked = set()
        for walk in range(WALKS):
            seed = BASE_SEED + walk
            rng = random.Random(seed)
            type_name = sorted(JOB_TYPES)[walk % len(JOB_TYPES)]
            with self.subTest(seed=seed, job_type=type_name):
                sid = transaction.savepoint()
                try:
                    job = self.new_explorer_job(type_name)
                    self.step(job, 'pending')
                    trail = [f'seed {seed}', 'client books']
                    for _ in range(STEPS):
                        before = self.signature(job)
                        key = self.abstract(job, before)
                        if key not in checked and before[1] not in CLOSED and before[0] != 'Cancelled':
                            self.can_finish(job, catalogue, trail)
                            checked.add(key)
                        if rng.random() < 0.5:
                            # Move the job on, so walks reach the deep states (field work, review, money).
                            name, response = self.forward_once(job, catalogue)
                            if name is None:
                                continue
                            single = catalogue[name][0]
                        else:
                            # Any event by anyone; closing events are drawn less often so walks go deep.
                            name = rng.choice(names if rng.random() < 0.25 else open_names)
                            single, applicable, run = catalogue[name]
                            if not applicable(job):
                                continue
                            response = run(job)
                        after = self.signature(job)
                        outcome = 'ok' if response.status_code < 400 else 'refused'
                        coverage[(before[1] or 'no ticket', name, outcome)] += 1
                        trail.append(f'{name} ({response.status_code})')
                        self.check_rules(job, before, after, name, response, single, trail)
                finally:
                    transaction.savepoint_rollback(sid)

        statuses = {status for status, _name, _outcome in coverage}
        moves = sum(1 for (_s, _n, outcome) in coverage if outcome == 'ok')
        print(f'\nflow explorer: {WALKS} walks x {STEPS} steps, {sum(coverage.values())} events, '
              f'{len(coverage)} distinct (status, event, outcome), {moves} distinct accepted moves, '
              f'{len(checked)} states checked for dead ends, statuses reached: {sorted(statuses)}')
