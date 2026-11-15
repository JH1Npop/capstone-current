"""After-sales cases and maintenance schedules: every status change, every refused one, and who may
do what. Detailed reminder and automation rules stay in test_maintenance_workflow.py.
"""

from ._imports import *  # noqa: F403,F405
from services.business_time import business_today
from services.serializers.after_sales import FollowUpCaseSerializer
from users.rbac import AFTER_SALES_CASES_VIEW, REPORTS_VIEW

CASE_STATUSES = ['open', 'in_progress', 'resolved', 'closed']
SCHEDULE_STATUSES = ['scheduled', 'due_soon', 'due', 'completed', 'dismissed']
ACTIVE_SCHEDULE = {'scheduled', 'due_soon', 'due'}


class AfterSalesFixture(APITestCase):
    def setUp(self):
        mk = User.objects.create_user
        self.client_user = mk(username='as-client', password='x', role='client')
        self.tech = mk(username='as-tech', password='x', role='technician', status='active')
        self.superadmin = mk(username='as-super', password='x', role='superadmin')
        self.service = ServiceType.objects.create(name='After-sales rules', estimated_duration=60)

    def ticket(self, status_value='Completed', warranty_active=False):
        req = ServiceRequest.objects.create(client=self.client_user, service_type=self.service, description='a', status='Completed')
        ticket = ServiceTicket.objects.create(
            request=req, technician=self.tech, scheduled_date=business_today(), status=status_value, completed_date=timezone.now(),
        )
        if warranty_active:
            ServiceTicket.objects.filter(pk=ticket.pk).update(
                warranty_status='active', warranty_start_date=business_today(), warranty_end_date=business_today() + timedelta(days=300),
            )
            ticket.refresh_from_db()
        return ticket

    def case(self, status_value='open', case_type='follow_up', ticket=None):
        return FollowUpCase.objects.create(
            service_ticket=ticket or self.ticket(), client=self.client_user, case_type=case_type, status=status_value,
            priority='normal', summary='Check the system', due_date=business_today() + timedelta(days=3),
            resolution_notes='Done.' if status_value in ('resolved', 'closed') else '',
        )

    def schedule(self, status_value='due', ticket=None):
        return MaintenanceSchedule.objects.create(
            service_ticket=ticket or self.ticket(), client=self.client_user, service_type=self.service,
            maintenance_profile='commercial_area', interval_days=90, follow_up_window_days=14,
            last_service_date=business_today() - timedelta(days=90), next_due_date=business_today() + timedelta(days=20),
            notify_on_date=business_today() + timedelta(days=6), status=status_value,
        )

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def patch_case(self, case, data, user=None):
        return self.as_(user or self.superadmin).patch(f'/api/services/follow-up-cases/{case.id}/', data, format='json')


class CaseStatusRuleTests(AfterSalesFixture):
    def test_every_case_status_change(self):
        allowed = FollowUpCaseSerializer.ALLOWED_STATUS_TRANSITIONS
        for source in CASE_STATUSES:
            for target in CASE_STATUSES:
                if source == target:
                    continue
                with self.subTest(source=source, target=target):
                    case = self.case(source)
                    response = self.patch_case(case, {
                        'status': target, 'resolution_notes': 'Checked and fixed on site.', 'status_change_note': 'Client called again.',
                    })
                    case.refresh_from_db()
                    if target in allowed[source]:
                        self.assertEqual(response.status_code, 200, response.data)
                        self.assertEqual(case.status, target)
                        self.assertTrue(AfterSalesCaseEvent.objects.filter(case=case, from_status=source, to_status=target).exists())
                    else:
                        self.assertEqual(response.status_code, 400)
                        self.assertEqual(case.status, source)

    def test_closing_needs_notes_and_reopening_needs_a_reason(self):
        case = self.case('open')
        case.resolution_notes = ''
        case.save(update_fields=['resolution_notes'])
        self.assertEqual(self.patch_case(case, {'status': 'resolved'}).status_code, 400)
        resolved = self.case('resolved')
        self.assertEqual(self.patch_case(resolved, {'status': 'open'}).status_code, 400)
        self.assertEqual(self.patch_case(resolved, {'status': 'open', 'status_change_note': 'Problem came back.'}).status_code, 200)

    def test_which_cases_can_be_opened_and_that_none_are_deleted(self):
        def open_case(ticket, case_type='follow_up', status_value='open'):
            return self.as_(self.superadmin).post('/api/services/follow-up-cases/', {
                'service_ticket': ticket.id, 'case_type': case_type, 'summary': 'Client reports an issue', 'priority': 'normal', 'status': status_value,
            }, format='json')

        self.assertEqual(open_case(self.ticket()).status_code, 201)
        self.assertEqual(open_case(self.ticket('In Progress')).status_code, 400, 'only finished jobs')
        self.assertEqual(open_case(self.ticket(), status_value='resolved').status_code, 400, 'cases start open')
        self.assertEqual(open_case(self.ticket(), case_type='warranty').status_code, 400, 'no active warranty')
        self.assertEqual(open_case(self.ticket(warranty_active=True), case_type='warranty').status_code, 201)
        case = self.case()
        self.assertEqual(self.as_(self.superadmin).delete(f'/api/services/follow-up-cases/{case.id}/').status_code, 405)


class MaintenanceCaseScheduleLinkTests(AfterSalesFixture):
    def test_resolving_the_case_starts_the_next_cycle(self):
        ticket = self.ticket()
        schedule = self.schedule('due', ticket=ticket)
        case = self.case('open', case_type='maintenance', ticket=ticket)
        self.assertEqual(self.patch_case(case, {'status': 'resolved', 'resolution_notes': 'Panels cleaned and tested.'}).status_code, 200)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, 'scheduled')
        self.assertEqual(schedule.last_service_date, business_today())
        self.assertEqual(schedule.next_due_date, business_today() + timedelta(days=schedule.interval_days))

    def test_closing_the_case_without_the_work_keeps_reminders_going(self):
        ticket = self.ticket()
        schedule = self.schedule('due', ticket=ticket)
        case = self.case('open', case_type='maintenance', ticket=ticket)
        self.assertEqual(self.patch_case(case, {'status': 'closed', 'resolution_notes': 'Client could not be reached.'}).status_code, 200)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, 'due')

    def test_a_completed_or_stopped_schedule_is_not_changed_from_a_case(self):
        ticket = self.ticket()
        schedule = self.schedule('completed', ticket=ticket)
        case = self.case('resolved', case_type='maintenance', ticket=ticket)
        self.assertEqual(self.patch_case(case, {'status': 'open', 'status_change_note': 'Client asked again.'}).status_code, 200)
        schedule.refresh_from_db()
        self.assertEqual(schedule.status, 'completed', 'completed is final')

        other_ticket = self.ticket()
        stopped = self.schedule('dismissed', ticket=other_ticket)
        other_case = self.case('open', case_type='maintenance', ticket=other_ticket)
        self.assertEqual(self.patch_case(other_case, {'status': 'resolved', 'resolution_notes': 'Done anyway.'}).status_code, 200)
        stopped.refresh_from_db()
        self.assertEqual(stopped.status, 'dismissed', 'resume a stopped schedule before completing it')


class MaintenanceScheduleActionTests(AfterSalesFixture):
    def act(self, schedule, action, data=None, user=None):
        return self.as_(user or self.superadmin).post(f'/api/services/maintenance-schedules/{schedule.id}/{action}/', data or {}, format='json')

    def test_every_action_on_every_schedule_status(self):
        later = (business_today() + timedelta(days=40)).isoformat()
        expected_ok = {
            'dismiss': ACTIVE_SCHEDULE,
            'resume': {'dismissed'},
            'reschedule': ACTIVE_SCHEDULE,
            'complete': ACTIVE_SCHEDULE,
        }
        for action, ok_statuses in expected_ok.items():
            for status_value in SCHEDULE_STATUSES:
                with self.subTest(action=action, status=status_value):
                    schedule = self.schedule(status_value)
                    data = {'reason': 'Office decision after a call.'}
                    if action == 'reschedule':
                        data['next_due_date'] = later
                    response = self.act(schedule, action, data)
                    self.assertEqual(response.status_code, 200 if status_value in ok_statuses else 400)

    def test_a_reason_is_required_and_dates_cannot_be_past(self):
        schedule = self.schedule('due')
        for action in ['dismiss', 'complete', 'reschedule']:
            self.assertEqual(self.act(schedule, action).status_code, 400)
        past = (business_today() - timedelta(days=1)).isoformat()
        self.assertEqual(self.act(schedule, 'reschedule', {'reason': 'Client asked.', 'next_due_date': past}).status_code, 400)

    def test_stopping_closes_the_open_maintenance_case(self):
        ticket = self.ticket()
        schedule = self.schedule('due', ticket=ticket)
        case = self.case('open', case_type='maintenance', ticket=ticket)
        self.assertEqual(self.act(schedule, 'dismiss', {'reason': 'Client sold the property.'}).status_code, 200)
        case.refresh_from_db()
        self.assertEqual(case.status, 'closed')
        self.assertIn('Client sold the property.', case.resolution_notes)


class AfterSalesRoleTests(AfterSalesFixture):
    ROLES = ['client', 'technician', 'after-sales viewer', 'admin', 'scoped admin', 'superadmin']
    EXPECTED = {
        'list cases':        [403, 403, 200, 200, 403, 200],
        'open case':         [403, 403, 403, 201, 403, 201],
        'update case':       [403, 403, 403, 200, 403, 200],
        'list schedules':    [403, 403, 200, 200, 403, 200],
        'list warranties':   [403, 403, 200, 200, 403, 200],
        'complete schedule': [403, 403, 403, 200, 403, 200],
    }

    def setUp(self):
        super().setUp()
        mk = User.objects.create_user
        self.users = {
            'client': self.client_user,
            'technician': self.tech,
            'after-sales viewer': mk(username='as-viewer', password='x', role='admin'),
            'admin': mk(username='as-admin', password='x', role='admin'),
            'scoped admin': mk(username='as-scoped', password='x', role='admin'),
            'superadmin': self.superadmin,
        }
        UserCapabilityGrant.objects.create(user=self.users['scoped admin'], capability_code=REPORTS_VIEW)
        UserCapabilityGrant.objects.create(user=self.users['after-sales viewer'], capability_code=AFTER_SALES_CASES_VIEW)

    def code(self, action, user):
        client = self.as_(user)
        if action == 'list cases':
            return client.get('/api/services/follow-up-cases/').status_code
        if action == 'open case':
            ticket = self.ticket()
            return self.as_(user).post('/api/services/follow-up-cases/', {
                'service_ticket': ticket.id, 'case_type': 'follow_up', 'summary': 'Role check', 'priority': 'normal',
            }, format='json').status_code
        if action == 'update case':
            case = self.case()
            return self.as_(user).patch(f'/api/services/follow-up-cases/{case.id}/', {'priority': 'high'}, format='json').status_code
        if action == 'list schedules':
            return client.get('/api/services/maintenance-schedules/').status_code
        if action == 'list warranties':
            return client.get('/api/services/maintenance-schedules/warranties/').status_code
        schedule = self.schedule('due')
        return self.as_(user).post(f'/api/services/maintenance-schedules/{schedule.id}/complete/', {'reason': 'Done on site.'}, format='json').status_code

    def test_each_role_on_each_action(self):
        for action, expected in self.EXPECTED.items():
            for role, code in zip(self.ROLES, expected):
                with self.subTest(action=action, role=role):
                    self.assertEqual(self.code(action, self.users[role]), code)
