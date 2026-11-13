"""Messages and support cases: who reads and writes which thread, and what can be changed.

Detailed behaviour (notifications, images, live updates) stays in messages_app/tests.py.
"""

from rest_framework.test import APITestCase

from messages_app.models import CustomerSupportCase, Message
from services.business_time import business_today
from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User, UserCapabilityGrant
from users.rbac import COMMUNICATIONS_STAFF_VIEW, REPORTS_VIEW


def rows(response):
    data = response.data
    return data.get('results', data) if isinstance(data, dict) else data


class MessageFixture(APITestCase):
    def setUp(self):
        mk = User.objects.create_user
        self.owner = mk(username='mr-owner', password='x', role='client')
        self.other_client = mk(username='mr-other', password='x', role='client')
        self.lead = mk(username='mr-lead', password='x', role='technician', status='active')
        self.crew = mk(username='mr-crew', password='x', role='technician', status='active')
        self.other_tech = mk(username='mr-tech2', password='x', role='technician', status='active')
        self.admin = mk(username='mr-admin', password='x', role='admin')
        self.superadmin = mk(username='mr-super', password='x', role='superadmin')
        service = ServiceType.objects.create(name='Message rules', estimated_duration=60)
        req = ServiceRequest.objects.create(client=self.owner, service_type=service, description='m', status='Completed')
        self.ticket = ServiceTicket.objects.create(request=req, technician=self.lead, status='Completed', scheduled_date=business_today())
        TicketCrewAssignment.objects.create(ticket=self.ticket, technician=self.crew)
        other_req = ServiceRequest.objects.create(client=self.other_client, service_type=service, description='o', status='Completed')
        self.other_ticket = ServiceTicket.objects.create(request=other_req, technician=self.other_tech, status='Completed', scheduled_date=business_today())

    def as_(self, user):
        self.client.force_authenticate(user)
        return self.client

    def post_ticket_message(self, user, ticket, text='Hello about the job.'):
        return self.as_(user).post('/api/messages/', {
            'room_type': 'group', 'ticket': ticket.id, 'group_key': f'after_sales_ticket_{ticket.id}', 'text': text,
        }, format='json')

    def open_case(self, user, subject='Inverter question'):
        return self.as_(user).post('/api/messages/support-cases/', {'subject': subject, 'category': 'general', 'priority': 'normal'}, format='json').data


class SupportThreadPrivacyTests(MessageFixture):
    def test_a_client_never_reads_another_clients_support_thread(self):
        # Make a client whose id starts with the owner's id (1 and 10, 2 and 20, ...).
        while True:
            lookalike = User.objects.create_user(username=f'mr-look{User.objects.count()}', password='x', role='client')
            if str(lookalike.id).startswith(str(self.owner.id)) and lookalike.id != self.owner.id:
                break
        their_case = self.open_case(lookalike, 'Private matter')
        self.as_(lookalike).post('/api/messages/', {'room_type': 'group', 'group_key': their_case['group_key'], 'text': 'My account number is 12345.'}, format='json')
        own_case = self.open_case(self.owner)
        self.as_(self.owner).post('/api/messages/', {'room_type': 'group', 'group_key': own_case['group_key'], 'text': 'My own question.'}, format='json')

        seen = [row['text'] for row in rows(self.as_(self.owner).get('/api/messages/'))]
        self.assertIn('My own question.', seen)
        self.assertNotIn('My account number is 12345.', seen)
        # And the client cannot write into it.
        response = self.as_(self.owner).post('/api/messages/', {'room_type': 'group', 'group_key': their_case['group_key'], 'text': 'Hi'}, format='json')
        self.assertEqual(response.status_code, 400)


class TicketThreadRuleTests(MessageFixture):
    def test_who_may_write_in_a_ticket_thread(self):
        self.assertEqual(self.post_ticket_message(self.owner, self.ticket).status_code, 201)
        self.assertEqual(self.post_ticket_message(self.lead, self.ticket).status_code, 201)
        self.assertEqual(self.post_ticket_message(self.crew, self.ticket).status_code, 201)
        self.assertEqual(self.post_ticket_message(self.superadmin, self.ticket).status_code, 201)
        self.assertEqual(self.post_ticket_message(self.other_client, self.ticket).status_code, 400)
        self.assertEqual(self.post_ticket_message(self.other_tech, self.ticket).status_code, 400)

    def test_who_reads_a_ticket_thread(self):
        self.post_ticket_message(self.owner, self.ticket, 'Panel 3 looks dusty.')
        for user, expected in [
            (self.owner, True), (self.lead, True), (self.crew, True), (self.superadmin, True),
            (self.other_client, False), (self.other_tech, False),
        ]:
            with self.subTest(user=user.username):
                seen = [row['text'] for row in rows(self.as_(user).get('/api/messages/'))]
                self.assertEqual('Panel 3 looks dusty.' in seen, expected)

    def test_clients_cannot_use_staff_threads(self):
        staff = self.as_(self.owner).post('/api/messages/', {'room_type': 'group', 'group_key': 'staff', 'text': 'Hi team'}, format='json')
        direct = self.as_(self.owner).post('/api/messages/', {'room_type': 'direct', 'receiver': self.lead.id, 'text': 'Hi'}, format='json')
        self.assertEqual((staff.status_code, direct.status_code), (403, 403))

    def test_only_the_sender_edits_or_unsends_and_only_text_or_image(self):
        message_id = self.post_ticket_message(self.owner, self.ticket).data['id']
        url = f'/api/messages/{message_id}/'
        self.assertEqual(self.as_(self.lead).patch(url, {'text': 'Changed'}, format='json').status_code, 403)
        self.assertEqual(self.as_(self.lead).delete(url).status_code, 403)
        self.assertEqual(self.as_(self.owner).patch(url, {'ticket': self.other_ticket.id}, format='json').status_code, 403)
        self.assertEqual(self.as_(self.owner).patch(url, {'text': 'Fixed typo.'}, format='json').status_code, 200)
        self.assertEqual(self.as_(self.owner).delete(url).status_code, 200)
        message = Message.objects.get(pk=message_id)
        self.assertTrue(message.is_deleted)
        self.assertEqual(message.message_text, '')
        self.assertEqual(self.as_(self.owner).patch(url, {'text': 'Back again'}, format='json').status_code, 403)


class SupportCaseRuleTests(MessageFixture):
    def test_only_the_office_with_support_management_changes_a_case(self):
        case = self.open_case(self.owner)
        url = f"/api/messages/support-cases/{case['id']}/"
        self.assertIn(self.as_(self.owner).patch(url, {'status': 'resolved'}, format='json').status_code, (400, 403))
        scoped = User.objects.create_user(username='mr-scoped', password='x', role='admin')
        UserCapabilityGrant.objects.create(user=scoped, capability_code=REPORTS_VIEW)
        self.assertEqual(self.as_(scoped).patch(url, {'status': 'resolved'}, format='json').status_code, 403)
        staff_only = User.objects.create_user(username='mr-staffonly', password='x', role='admin')
        UserCapabilityGrant.objects.create(user=staff_only, capability_code=COMMUNICATIONS_STAFF_VIEW)
        self.assertEqual(self.as_(staff_only).patch(url, {'status': 'resolved'}, format='json').status_code, 403)
        self.assertEqual(self.as_(self.superadmin).patch(url, {'status': 'in_review'}, format='json').status_code, 200)
        self.assertEqual(CustomerSupportCase.objects.get(pk=case['id']).status, 'in_review')

    def test_cases_are_visible_only_to_their_client_and_the_office(self):
        case = self.open_case(self.owner)
        url = f"/api/messages/support-cases/{case['id']}/"
        self.assertEqual(self.as_(self.owner).get(url).status_code, 200)
        self.assertEqual(self.as_(self.other_client).get(url).status_code, 404)
        self.assertIn(self.as_(self.lead).get(url).status_code, (403, 404))
        self.assertEqual(self.as_(self.superadmin).get(url).status_code, 200)

    def test_a_case_links_only_the_clients_own_job(self):
        response = self.as_(self.owner).post('/api/messages/support-cases/', {
            'subject': 'About someone else', 'category': 'general', 'priority': 'normal', 'ticket': self.other_ticket.id,
        }, format='json')
        self.assertEqual(response.status_code, 400)
