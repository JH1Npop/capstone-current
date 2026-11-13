"""Inventory: every stock movement rule, every job status for equipment requests, the office
decision, and who may do what. Detailed ledger and return rules stay in inventory/tests.py.
"""

from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryCategory, InventoryItem, InventoryReservation, InventoryTransaction
from services.business_time import business_today
from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User, UserCapabilityGrant
from users.rbac import INVENTORY_VIEW, REPORTS_VIEW

OPEN_FOR_REQUESTS = ['Not Started', 'For Inspection', 'Inspection Completed', 'Ready for Service', 'Awaiting Materials',
                     'Navigating', 'Arrived on Site', 'In Progress', 'On Hold']
CLOSED = ['Completed', 'Turned Over / Accepted', 'Cancelled']


class InventoryFixture(APITestCase):
    def setUp(self):
        mk = User.objects.create_user
        self.users = {
            'client': mk(username='ir-client', password='x', role='client'),
            'lead tech': mk(username='ir-lead', password='x', role='technician', status='active'),
            'crew tech': mk(username='ir-crew', password='x', role='technician', status='active'),
            'other tech': mk(username='ir-tech2', password='x', role='technician', status='active'),
            'inventory viewer': mk(username='ir-viewer', password='x', role='admin'),
            'admin': mk(username='ir-admin', password='x', role='admin'),
            'scoped admin': mk(username='ir-scoped', password='x', role='admin'),
            'superadmin': mk(username='ir-super', password='x', role='superadmin'),
        }
        UserCapabilityGrant.objects.create(user=self.users['scoped admin'], capability_code=REPORTS_VIEW)
        UserCapabilityGrant.objects.create(user=self.users['inventory viewer'], capability_code=INVENTORY_VIEW)
        self.category = InventoryCategory.objects.create(name='Rules stock')
        self.service = ServiceType.objects.create(name='Inventory rules', estimated_duration=60)

    def as_(self, who):
        self.client.force_authenticate(self.users[who])
        return self.client

    def item(self, quantity=10):
        number = InventoryItem.objects.count()
        response = self.as_('superadmin').post('/api/inventory/items/', {
            'name': f'Rule item {number}', 'sku': f'RULE-{number}', 'category': self.category.id,
            'item_type': 'equipment', 'unit_of_measurement': 'piece', 'quantity': quantity, 'minimum_stock': 1,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return InventoryItem.objects.get(pk=response.data['id'])

    def move(self, item, kind, quantity, notes='Counted on the shelf.', who='superadmin'):
        return self.as_(who).post('/api/inventory/transactions/', {
            'item': item.id, 'transaction_type': kind, 'quantity': quantity, 'notes': notes,
        }, format='json')

    def ticket(self, status_value='In Progress'):
        req = ServiceRequest.objects.create(client=self.users['client'], service_type=self.service, description='i', status='Approved')
        ticket = ServiceTicket.objects.create(request=req, technician=self.users['lead tech'], scheduled_date=business_today(), status=status_value)
        TicketCrewAssignment.objects.create(ticket=ticket, technician=self.users['crew tech'])
        return ticket

    def request_parts(self, ticket, item, quantity=1, who='lead tech'):
        return self.as_(who).post(f'/api/services/service-tickets/{ticket.id}/request_parts/', {
            'items': [{'item_id': item.id, 'quantity': quantity}], 'notes': 'Needed on site.',
        }, format='json')

    def decide(self, ticket, reservation, decision, reason='', who='superadmin'):
        return self.as_(who).post('/api/inventory/reservations/decide-ticket/', {
            'ticket_id': ticket.id, 'decisions': [{'reservation_id': reservation.id, 'decision': decision, 'reason': reason}],
        }, format='json')


class StockMovementRuleTests(InventoryFixture):
    def test_movement_amounts_reasons_and_available_stock(self):
        item = self.item(10)
        self.assertTrue(InventoryTransaction.objects.filter(item=item, transaction_type='adjustment', reference_number__startswith='OPENING').exists())
        self.assertEqual(self.move(item, 'issue', 11).status_code, 400)
        self.assertEqual(self.move(item, 'purchase', 0).status_code, 400)
        self.assertEqual(self.move(item, 'purchase', -2).status_code, 400)
        self.assertEqual(self.move(item, 'purchase', 2, notes='').status_code, 400)
        self.assertEqual(self.move(item, 'adjustment', 0).status_code, 201, 'an empty shelf can be counted')
        self.assertEqual(self.move(item, 'purchase', 5).status_code, 201)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 5)

    def test_quantity_changes_only_through_movements_and_history_is_kept(self):
        item = self.item(5)
        self.assertEqual(self.as_('superadmin').patch(f'/api/inventory/items/{item.id}/', {'quantity': 999}, format='json').status_code, 400)
        transaction_row = InventoryTransaction.objects.filter(item=item).first()
        self.assertEqual(self.as_('superadmin').patch(f'/api/inventory/transactions/{transaction_row.id}/', {'notes': 'x'}, format='json').status_code, 405)
        self.assertEqual(self.as_('superadmin').delete(f'/api/inventory/transactions/{transaction_row.id}/').status_code, 405)
        self.assertEqual(self.as_('superadmin').delete(f'/api/inventory/categories/{self.category.id}/').status_code, 409)
        # An item whose only history is its opening balance can still be deleted (created by mistake);
        # once stock has moved, it can only be retired.
        mistake = self.item(3)
        self.assertEqual(self.as_('superadmin').delete(f'/api/inventory/items/{mistake.id}/').status_code, 204)
        self.assertEqual(self.move(item, 'purchase', 1).status_code, 201)
        self.assertEqual(self.as_('superadmin').delete(f'/api/inventory/items/{item.id}/').status_code, 409)
        item.refresh_from_db()
        self.assertEqual(item.quantity, 6)

    def test_reserved_stock_is_protected(self):
        item = self.item(5)
        self.assertEqual(self.request_parts(self.ticket(), item, 3).status_code, 200)
        item.refresh_from_db()
        self.assertEqual((item.quantity, item.reserved_quantity), (5, 3))
        self.assertEqual(self.move(item, 'adjustment', 1).status_code, 400, 'below reserved stock')
        self.assertEqual(self.move(item, 'issue', 3).status_code, 400, 'only 2 are available')
        self.assertEqual(self.as_('superadmin').patch(f'/api/inventory/items/{item.id}/', {'status': 'retired'}, format='json').status_code, 400)

    def test_a_retired_item_cannot_be_requested_or_added_to_a_service_template(self):
        retired = self.item(0)
        self.assertEqual(self.as_('superadmin').patch(f'/api/inventory/items/{retired.id}/', {'status': 'retired'}, format='json').status_code, 200)
        self.assertEqual(self.request_parts(self.ticket(), retired).status_code, 400)
        template = self.as_('superadmin').post('/api/inventory/service-type-requirements/', {'service_type': self.service.id, 'item': retired.id, 'quantity': 1}, format='json')
        self.assertEqual(template.status_code, 400)


class EquipmentRequestRuleTests(InventoryFixture):
    def test_requests_in_every_job_status(self):
        for ticket_status in OPEN_FOR_REQUESTS + CLOSED:
            with self.subTest(ticket_status=ticket_status):
                ticket = self.ticket(ticket_status)
                response = self.request_parts(ticket, self.item(5))
                # A cancelled job answers the technician "the office cancelled ..." (409); other closed jobs 400.
                expected = 200 if ticket_status in OPEN_FOR_REQUESTS else (409 if ticket_status == 'Cancelled' else 400)
                self.assertEqual(response.status_code, expected)
                self.assertEqual(ServiceTicket.objects.get(pk=ticket.pk).status, ticket_status, 'a request never changes the job status')

    def test_who_may_request_and_what(self):
        ticket = self.ticket()
        self.assertEqual(self.request_parts(ticket, self.item(5), who='crew tech').status_code, 200)
        self.assertEqual(self.request_parts(ticket, self.item(5), who='other tech').status_code, 404)
        self.assertEqual(self.request_parts(ticket, self.item(5), who='client').status_code, 403)
        self.assertEqual(self.request_parts(ticket, self.item(5), 0).status_code, 400)
        self.assertEqual(self.request_parts(ticket, self.item(5), 999).status_code, 400)

    def test_the_office_decision(self):
        item = self.item(5)
        ticket = self.ticket()
        self.request_parts(ticket, item, 3)
        reservation = InventoryReservation.objects.get(service_ticket=ticket)
        self.assertEqual(self.decide(ticket, reservation, 'reject', reason='no').status_code, 400, 'a rejection needs 8+ characters')
        self.assertEqual(self.decide(ticket, reservation, 'approve').status_code, 200)
        item.refresh_from_db()
        self.assertEqual((item.quantity, item.reserved_quantity), (2, 0), 'issued: reservation released and stock removed')
        self.assertEqual(self.decide(ticket, reservation, 'approve').status_code, 409, 'decided only once')

        rejected_item = self.item(5)
        other_ticket = self.ticket()
        self.request_parts(other_ticket, rejected_item, 2)
        rejected = InventoryReservation.objects.get(service_ticket=other_ticket)
        self.assertEqual(self.decide(other_ticket, rejected, 'reject', reason='Out of stock at the supplier.').status_code, 200)
        rejected_item.refresh_from_db()
        self.assertEqual((rejected_item.quantity, rejected_item.reserved_quantity), (5, 0), 'rejected: released, stock unchanged')


class InventoryRoleTests(InventoryFixture):
    ROLES = ['client', 'lead tech', 'crew tech', 'other tech', 'inventory viewer', 'admin', 'scoped admin', 'superadmin']
    EXPECTED = {
        'list items':        [403, 200, 200, 200, 200, 200, 403, 200],
        'create item':       [403, 403, 403, 403, 403, 201, 403, 201],
        'post movement':     [403, 403, 403, 403, 403, 201, 403, 201],
        'list movements':    [403, 200, 200, 200, 200, 200, 403, 200],
        'list reservations': [403, 200, 200, 200, 200, 200, 403, 200],
        'decide':            [403, 403, 403, 403, 403, 200, 403, 200],
    }

    def code(self, action, who):
        if action == 'list items':
            return self.as_(who).get('/api/inventory/items/').status_code
        if action == 'create item':
            return self.as_(who).post('/api/inventory/items/', {
                'name': f'New {who}', 'sku': f'NEW-{who}', 'category': self.category.id, 'item_type': 'equipment',
                'unit_of_measurement': 'piece', 'quantity': 1, 'minimum_stock': 0,
            }, format='json').status_code
        if action == 'post movement':
            item = self.item(5)
            return self.move(item, 'purchase', 1, who=who).status_code
        if action == 'list movements':
            return self.as_(who).get('/api/inventory/transactions/').status_code
        if action == 'list reservations':
            return self.as_(who).get('/api/inventory/reservations/').status_code
        item = self.item(5)
        ticket = self.ticket()
        self.request_parts(ticket, item)
        reservation = InventoryReservation.objects.get(service_ticket=ticket)
        return self.decide(ticket, reservation, 'approve', who=who).status_code

    def test_each_role_on_each_action(self):
        for action, expected in self.EXPECTED.items():
            for role, code in zip(self.ROLES, expected):
                with self.subTest(action=action, role=role):
                    self.assertEqual(self.code(action, role), code)

    def test_technicians_see_only_their_own_movements_and_reservations(self):
        ticket = self.ticket()
        self.request_parts(ticket, self.item(5), who='lead tech')
        self.request_parts(ticket, self.item(5), who='crew tech')

        def rows(who, path):
            data = self.as_(who).get(path).data
            return data.get('results', data) if isinstance(data, dict) else data

        self.assertEqual(len(rows('lead tech', '/api/inventory/reservations/')), 1)
        self.assertEqual(len(rows('crew tech', '/api/inventory/reservations/')), 1)
        self.assertEqual(len(rows('other tech', '/api/inventory/reservations/')), 0)
        self.assertEqual(len(rows('other tech', '/api/inventory/transactions/')), 0)
        self.assertEqual(len(rows('superadmin', '/api/inventory/reservations/')), 2)
