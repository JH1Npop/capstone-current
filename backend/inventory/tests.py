from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import (
    EquipmentReturnRequest,
    InventoryCategory,
    InventoryItem,
    InventoryReservation,
    InventoryTransaction,
    ServiceTypeInventoryRequirement,
)
from services.models import (
    InspectionChecklist,
    ServiceLocation,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
    TechnicianSkill,
)
from users.models import User, UserCapabilityGrant
from users.rbac import (
    INVENTORY_MANAGE,
    INVENTORY_VIEW,
    PUBLIC_SITE_VIEW,
    TECHNICIAN_INVENTORY_VIEW,
    TECHNICIAN_DASHBOARD_VIEW,
    TECHNICIAN_PROFILE_VIEW,
)


class InventoryCapabilityTests(APITestCase):
    def setUp(self):
        self.category = InventoryCategory.objects.create(name='Solar Equipment')
        self.item = InventoryItem.objects.create(
            name='550 W Panel', sku='PV-550', category=self.category,
            item_type='equipment', quantity=10, minimum_stock=2, status='available',
        )
        self.items_url = '/api/inventory/items/'
        self.item_payload = {
            'name': 'Hybrid Inverter',
            'sku': 'INV-HYBRID-01',
            'category': self.category.id,
            'item_type': 'equipment',
            'quantity': 2,
            'minimum_stock': 1,
            'status': 'available',
        }

    def create_user(self, username, role, capability=None):
        user = User.objects.create_user(username=username, password='pass', role=role)
        if capability:
            UserCapabilityGrant.objects.create(user=user, capability_code=capability)
        return user

    def test_view_only_admin_can_read_but_cannot_write_inventory(self):
        user = self.create_user('inventory-viewer', 'admin', INVENTORY_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(self.items_url, self.item_payload, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_inventory_manager_can_read_and_write_inventory(self):
        user = self.create_user('inventory-manager', 'admin', INVENTORY_MANAGE)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_200_OK)
        response = self.client.post(self.items_url, self.item_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_custom_item_creation_normalizes_sku_and_records_opening_balance(self):
        user = self.create_user('custom-inventory-manager', 'admin', INVENTORY_MANAGE)
        self.client.force_authenticate(user)

        response = self.client.post(
            self.items_url,
            {
                **self.item_payload,
                'name': '  Custom Cable  ',
                'sku': '  cable-custom-01  ',
                'item_type': 'consumable',
                'unit_of_measurement': 'coil',
                'quantity': 12,
                'warehouse_location': 'Rack C-2',
                'supplier': 'Local Supplier',
                'low_stock_threshold': 25,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        item = InventoryItem.objects.get(pk=response.data['id'])
        self.assertEqual(item.name, 'Custom Cable')
        self.assertEqual(item.sku, 'CABLE-CUSTOM-01')
        self.assertEqual(item.item_type, 'consumable')
        self.assertEqual(item.unit_of_measurement, 'coil')
        self.assertEqual(item.quantity, 12)
        self.assertEqual(item.stock_status, 'in_stock')
        opening = item.transactions.get()
        self.assertEqual(opening.transaction_type, 'adjustment')
        self.assertEqual(opening.quantity, 12)
        self.assertEqual(opening.notes, 'Opening inventory balance')
        self.assertEqual(opening.performed_by, user)

    def test_item_creation_requires_unique_case_insensitive_sku(self):
        user = self.create_user('sku-inventory-manager', 'admin', INVENTORY_MANAGE)
        self.client.force_authenticate(user)

        blank_response = self.client.post(
            self.items_url,
            {**self.item_payload, 'sku': ''},
            format='json',
        )
        duplicate_response = self.client.post(
            self.items_url,
            {**self.item_payload, 'sku': 'pv-550'},
            format='json',
        )

        self.assertEqual(blank_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_categories_are_explicitly_manageable_and_case_insensitive_unique(self):
        user = self.create_user('category-inventory-manager', 'admin', INVENTORY_MANAGE)
        self.client.force_authenticate(user)
        categories_url = '/api/inventory/categories/'

        create_response = self.client.post(
            categories_url,
            {'name': '  Electrical Supplies  ', 'description': 'Cables and breakers'},
            format='json',
        )
        duplicate_response = self.client.post(
            categories_url,
            {'name': 'electrical supplies'},
            format='json',
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED, create_response.data)
        self.assertEqual(create_response.data['name'], 'Electrical Supplies')
        self.assertEqual(duplicate_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_category_parent_cycle_is_rejected(self):
        user = self.create_user('category-cycle-manager', 'admin', INVENTORY_MANAGE)
        child = InventoryCategory.objects.create(name='Child Category', parent=self.category)
        self.client.force_authenticate(user)

        response = self.client.patch(
            f'/api/inventory/categories/{self.category.id}/',
            {'parent': child.id},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_configured_admin_without_inventory_capability_is_denied(self):
        user = self.create_user('content-only-admin', 'admin', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_technician_keeps_read_only_inventory_access(self):
        user = self.create_user('inventory-technician', 'technician')
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(self.items_url, self.item_payload, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_explicitly_scoped_technician_requires_inventory_capability(self):
        user = self.create_user(
            'scoped-inventory-technician',
            'technician',
            TECHNICIAN_PROFILE_VIEW,
        )
        self.client.force_authenticate(user=user)
        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_403_FORBIDDEN)

        UserCapabilityGrant.objects.create(
            user=user,
            capability_code=TECHNICIAN_INVENTORY_VIEW,
        )
        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_200_OK)

    def test_technician_dashboard_hides_low_stock_without_inventory_capability(self):
        self.item.quantity = 0
        self.item.save(update_fields=['quantity'])
        user = self.create_user(
            'dashboard-only-technician',
            'technician',
            TECHNICIAN_DASHBOARD_VIEW,
        )
        self.client.force_authenticate(user=user)

        restricted = self.client.get('/api/dashboard/stats/', {'role': 'technician'})
        self.assertEqual(restricted.status_code, status.HTTP_200_OK)
        self.assertEqual(restricted.data['low_stock_alerts'], [])

        UserCapabilityGrant.objects.create(
            user=user,
            capability_code=TECHNICIAN_INVENTORY_VIEW,
        )
        allowed = self.client.get('/api/dashboard/stats/', {'role': 'technician'})
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertEqual([item['id'] for item in allowed.data['low_stock_alerts']], [self.item.id])

    def test_client_cannot_access_inventory(self):
        user = self.create_user('inventory-client-isolated', 'client')
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.get(f'{self.items_url}low_stock/').status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.get(f'{self.items_url}statistics/').status_code,
            status.HTTP_403_FORBIDDEN,
        )


class AutoInventoryWorkflowTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='inventory-admin',
            password='pass',
            role='admin',
        )
        self.client_user = User.objects.create_user(
            username='inventory-client',
            password='pass',
            role='client',
        )
        self.technician_user = User.objects.create_user(
            username='inventory-tech',
            password='pass',
            role='technician',
            status='active',
            is_available=True,
            current_latitude='14.560000',
            current_longitude='121.020000',
        )
        self.crew_technician = User.objects.create_user(
            username='inventory-crew-tech',
            password='pass',
            role='technician',
            status='active',
            is_available=True,
            current_latitude='14.561000',
            current_longitude='121.021000',
        )
        self.category = InventoryCategory.objects.create(
            name='Service Parts',
            description='Default service parts',
        )
        self.inventory_item = InventoryItem.objects.create(
            name='Replacement Sensor',
            sku='SENSOR-01',
            category=self.category,
            item_type='part',
            quantity=10,
            minimum_stock=2,
            status='available',
        )
        self.service_type = ServiceType.objects.create(
            name='Sensor Maintenance',
            description='Maintenance service needing sensors',
            estimated_duration=90,
        )
        TechnicianSkill.objects.create(
            technician=self.technician_user,
            service_type=self.service_type,
            skill_level='expert',
        )
        TechnicianSkill.objects.create(
            technician=self.crew_technician,
            service_type=self.service_type,
            skill_level='intermediate',
        )
        ServiceTypeInventoryRequirement.objects.create(
            service_type=self.service_type,
            item=self.inventory_item,
            quantity=2,
            auto_reserve=True,
            notes='Standard replacement stock',
        )
        self.request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Maintenance request',
            priority='Normal',
            status='Approved',
            auto_ticket_created=True,
        )
        ServiceLocation.objects.create(
            request=self.request_obj,
            address='400 Inventory Street',
            city='Pasig',
            province='Metro Manila',
            latitude='14.572000',
            longitude='121.049000',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request_obj,
            scheduled_date=timezone.localdate(),
            status='Not Started',
            priority='Normal',
        )

    def assign_ticket(self):
        self.client.force_authenticate(user=self.admin_user)
        return self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {'technician_id': self.technician_user.id},
            format='json',
        )

    def test_assigning_ticket_auto_reserves_inventory(self):
        response = self.assign_ticket()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation = InventoryReservation.objects.get(service_ticket=self.ticket)
        self.inventory_item.refresh_from_db()

        self.assertEqual(reservation.technician, self.technician_user)
        self.assertEqual(reservation.quantity, 2)
        self.assertEqual(reservation.status, 'pending')
        self.assertEqual(self.inventory_item.reserved_quantity, 2)
        self.assertEqual(len(response.data['inventory_summary']['reservations']), 1)
        self.assertEqual(
            InventoryTransaction.objects.filter(
                service_ticket=self.ticket,
                transaction_type='reservation',
            ).count(),
            1,
        )

    def test_assigning_ticket_can_use_custom_dispatch_equipment_plan(self):
        extra_item = InventoryItem.objects.create(
            name='Mounting Bracket',
            sku='BRACKET-001',
            category=self.category,
            item_type='material',
            quantity=6,
            minimum_stock=1,
            status='available',
        )
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {
                'technician_id': self.technician_user.id,
                'equipment_reservations': [
                    {'item': self.inventory_item.id, 'quantity': 1},
                    {'item': extra_item.id, 'quantity': 3},
                ],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservations = {
            reservation.item_id: reservation
            for reservation in InventoryReservation.objects.filter(service_ticket=self.ticket)
        }
        self.inventory_item.refresh_from_db()
        extra_item.refresh_from_db()

        self.assertEqual(reservations[self.inventory_item.id].quantity, 1)
        self.assertEqual(reservations[extra_item.id].quantity, 3)
        self.assertEqual(self.inventory_item.reserved_quantity, 1)
        self.assertEqual(extra_item.reserved_quantity, 3)

    def test_assigning_ticket_with_crew_keeps_inventory_reserved_under_lead(self):
        self.client.force_authenticate(user=self.admin_user)
        response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/assign/',
            {
                'technician_id': self.technician_user.id,
                'crew_ids': [self.crew_technician.id],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        reservation = InventoryReservation.objects.get(service_ticket=self.ticket)

        self.assertEqual(reservation.technician, self.technician_user)
        self.assertTrue(
            self.ticket.crew_assignments.filter(technician=self.crew_technician).exists()
        )

    def test_cancelling_request_releases_reserved_inventory(self):
        assign_response = self.assign_ticket()
        self.assertEqual(assign_response.status_code, status.HTTP_200_OK)

        self.client.force_authenticate(user=self.admin_user)
        cancel_response = self.client.post(
            f'/api/services/service-requests/{self.request_obj.id}/cancel/',
            {'reason': 'Client no longer needs the scheduled work.'},
            format='json',
        )

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        reservation = InventoryReservation.objects.get(service_ticket=self.ticket)
        self.inventory_item.refresh_from_db()

        self.assertEqual(reservation.status, 'cancelled')
        self.assertEqual(self.inventory_item.reserved_quantity, 0)
        self.assertTrue(
            InventoryTransaction.objects.filter(
                service_ticket=self.ticket,
                transaction_type='cancellation',
            ).exists()
        )

    def test_completing_ticket_issues_reserved_inventory(self):
        assign_response = self.assign_ticket()
        self.assertEqual(assign_response.status_code, status.HTTP_200_OK)

        self.ticket.status = 'Arrived on Site'
        self.ticket.save(update_fields=['status'])

        self.client.force_authenticate(user=self.technician_user)
        start_response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/start_work/',
            {},
            format='json',
        )
        self.assertEqual(start_response.status_code, status.HTTP_200_OK)
        InspectionChecklist.objects.create(
            ticket=self.ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )

        complete_response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/complete_work/',
            {
                'completion_proof_images': [
                    'data:image/jpeg;base64,inventory-completion-proof',
                ],
            },
            format='json',
        )

        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        reservation = InventoryReservation.objects.get(service_ticket=self.ticket)
        self.inventory_item.refresh_from_db()

        self.assertEqual(reservation.status, 'fulfilled')
        self.assertEqual(self.inventory_item.quantity, 8)
        self.assertEqual(self.inventory_item.reserved_quantity, 0)
        self.assertTrue(
            InventoryTransaction.objects.filter(
                service_ticket=self.ticket,
                transaction_type='issue',
            ).exists()
        )

    def test_completion_can_issue_confirmed_partial_inventory_usage(self):
        assign_response = self.assign_ticket()
        self.assertEqual(assign_response.status_code, status.HTTP_200_OK)

        self.ticket.status = 'Arrived on Site'
        self.ticket.save(update_fields=['status'])

        reservation = InventoryReservation.objects.get(service_ticket=self.ticket)
        self.client.force_authenticate(user=self.technician_user)
        self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/start_work/',
            {},
            format='json',
        )
        InspectionChecklist.objects.create(
            ticket=self.ticket,
            is_completed=True,
            completed_at=timezone.now(),
            completed_by=self.technician_user,
        )

        complete_response = self.client.post(
            f'/api/services/service-tickets/{self.ticket.id}/complete_work/',
            {
                'completion_proof_images': [
                    'data:image/jpeg;base64,partial-inventory-completion-proof',
                ],
                'inventory_usage': [
                    {'reservation_id': reservation.id, 'quantity_used': 1},
                ],
            },
            format='json',
        )

        self.assertEqual(complete_response.status_code, status.HTTP_200_OK)
        reservation.refresh_from_db()
        self.inventory_item.refresh_from_db()

        self.assertEqual(reservation.status, 'fulfilled')
        self.assertEqual(reservation.quantity, 1)
        self.assertEqual(self.inventory_item.quantity, 9)
        self.assertEqual(self.inventory_item.reserved_quantity, 0)
        self.assertTrue(
            InventoryTransaction.objects.filter(
                service_ticket=self.ticket,
                transaction_type='cancellation',
            ).exists()
        )

    def test_ticket_equipment_reconciliation_returns_only_outstanding_issued_stock(self):
        self.ticket.technician = self.technician_user
        self.ticket.status = 'Completed'
        self.ticket.completed_date = timezone.now()
        self.ticket.save(update_fields=['technician', 'status', 'completed_date'])
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='issue',
            quantity=2,
            technician=self.technician_user,
            service_ticket=self.ticket,
            notes='Issued for field work',
            performed_by=self.admin_user,
        )
        url = f'/api/services/service-tickets/{self.ticket.id}/equipment-reconciliation/'
        self.client.force_authenticate(user=self.technician_user)

        before = self.client.get(url)
        self.assertEqual(before.status_code, status.HTTP_200_OK, before.data)
        self.assertEqual(before.data['items'][0]['issued_quantity'], 2)
        self.assertEqual(before.data['items'][0]['returnable_quantity'], 2)

        response = self.client.post(
            url,
            {
                'returns': [{'item_id': self.inventory_item.id, 'quantity': 1}],
                'notes': 'Unused sensor returned sealed and undamaged.',
                'condition': 'sealed',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['items'][0]['returned_quantity'], 0)
        self.assertEqual(response.data['items'][0]['pending_quantity'], 1)
        self.assertEqual(response.data['items'][0]['returnable_quantity'], 1)
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 8)
        return_request = EquipmentReturnRequest.objects.get(service_ticket=self.ticket)
        self.assertEqual(return_request.status, 'pending')
        self.assertEqual(return_request.submitted_by, self.technician_user)

        self.client.force_authenticate(user=self.admin_user)
        verified = self.client.post(
            url,
            {
                'action': 'verify',
                'return_request_id': return_request.id,
                'reviewed_condition': 'sealed',
                'review_notes': 'Warehouse counted one sealed sensor.',
            },
            format='json',
        )

        self.assertEqual(verified.status_code, status.HTTP_200_OK, verified.data)
        self.assertEqual(verified.data['items'][0]['returned_quantity'], 1)
        self.assertEqual(verified.data['items'][0]['pending_quantity'], 0)
        self.assertEqual(verified.data['items'][0]['returnable_quantity'], 1)
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 9)
        return_request.refresh_from_db()
        self.assertEqual(return_request.status, 'verified')
        self.assertEqual(return_request.reviewed_by, self.admin_user)
        returned = InventoryTransaction.objects.get(
            service_ticket=self.ticket,
            transaction_type='return',
        )
        self.assertEqual(returned.technician, self.technician_user)
        self.assertEqual(returned.performed_by, self.admin_user)
        self.assertIn('Warehouse counted', returned.notes)

    def test_ticket_equipment_reconciliation_rejects_over_return_and_missing_note(self):
        self.ticket.technician = self.technician_user
        self.ticket.status = 'Completed'
        self.ticket.completed_date = timezone.now()
        self.ticket.save(update_fields=['technician', 'status', 'completed_date'])
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='issue',
            quantity=2,
            technician=self.technician_user,
            service_ticket=self.ticket,
            performed_by=self.admin_user,
        )
        url = f'/api/services/service-tickets/{self.ticket.id}/equipment-reconciliation/'
        self.client.force_authenticate(user=self.technician_user)

        missing_note = self.client.post(
            url,
            {
                'returns': [{'item_id': self.inventory_item.id, 'quantity': 1}],
                'condition': 'sealed',
            },
            format='json',
        )
        over_return = self.client.post(
            url,
            {
                'returns': [{'item_id': self.inventory_item.id, 'quantity': 3}],
                'notes': 'Attempted warehouse return.',
                'condition': 'sealed',
            },
            format='json',
        )

        self.assertEqual(missing_note.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(over_return.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Only 2 unit(s)', over_return.data['returns'])
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 8)
        self.assertFalse(InventoryTransaction.objects.filter(
            service_ticket=self.ticket,
            transaction_type='return',
        ).exists())

    def test_rejected_equipment_return_does_not_restore_stock(self):
        self.ticket.technician = self.technician_user
        self.ticket.status = 'Completed'
        self.ticket.completed_date = timezone.now()
        self.ticket.save(update_fields=['technician', 'status', 'completed_date'])
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='issue',
            quantity=2,
            technician=self.technician_user,
            service_ticket=self.ticket,
            performed_by=self.admin_user,
        )
        url = f'/api/services/service-tickets/{self.ticket.id}/equipment-reconciliation/'
        self.client.force_authenticate(user=self.technician_user)
        submitted = self.client.post(
            url,
            {
                'returns': [{'item_id': self.inventory_item.id, 'quantity': 1}],
                'condition': 'damaged',
                'notes': 'Unit casing was damaged during transport.',
            },
            format='json',
        )
        return_request = EquipmentReturnRequest.objects.get(service_ticket=self.ticket)

        self.client.force_authenticate(user=self.admin_user)
        rejected = self.client.post(
            url,
            {
                'action': 'reject',
                'return_request_id': return_request.id,
                'reviewed_condition': 'damaged',
                'review_notes': 'Warehouse confirmed damage; routed to discrepancy handling.',
            },
            format='json',
        )

        self.assertEqual(submitted.status_code, status.HTTP_201_CREATED, submitted.data)
        self.assertEqual(rejected.status_code, status.HTTP_200_OK, rejected.data)
        self.assertEqual(rejected.data['items'][0]['returnable_quantity'], 2)
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 8)
        self.assertFalse(InventoryTransaction.objects.filter(
            service_ticket=self.ticket,
            transaction_type='return',
        ).exists())

    def test_client_cannot_reconcile_ticket_equipment(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get(
            f'/api/services/service-tickets/{self.ticket.id}/equipment-reconciliation/'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_editing_transaction_metadata_does_not_apply_stock_movement_again(self):
        transaction = InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='issue',
            quantity=2,
            performed_by=self.admin_user,
        )
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 8)

        transaction.notes = 'Corrected reference note'
        transaction.save()

        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 8)

    def test_transaction_stock_fields_are_immutable_after_creation(self):
        transaction = InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='reservation',
            quantity=2,
            performed_by=self.admin_user,
        )

        transaction.quantity = 3

        with self.assertRaises(ValidationError):
            transaction.save()

        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.reserved_quantity, 2)

    def test_issue_cannot_consume_stock_reserved_for_another_workflow(self):
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='reservation',
            quantity=8,
            performed_by=self.admin_user,
        )

        with self.assertRaises(ValidationError):
            InventoryTransaction.objects.create(
                item=self.inventory_item,
                transaction_type='issue',
                quantity=3,
                performed_by=self.admin_user,
            )

        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 10)
        self.assertEqual(self.inventory_item.reserved_quantity, 8)

    def test_adjustment_cannot_reduce_stock_below_reserved_quantity(self):
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='reservation',
            quantity=4,
            performed_by=self.admin_user,
        )

        with self.assertRaises(ValidationError):
            InventoryTransaction.objects.create(
                item=self.inventory_item,
                transaction_type='adjustment',
                quantity=3,
                performed_by=self.admin_user,
            )

        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 10)
        self.assertEqual(self.inventory_item.reserved_quantity, 4)

    def test_transaction_api_validates_quantities_and_allows_zero_adjustment(self):
        self.client.force_authenticate(user=self.admin_user)
        transactions_url = '/api/inventory/transactions/'

        negative_response = self.client.post(
            transactions_url,
            {
                'item': self.inventory_item.id,
                'transaction_type': 'issue',
                'quantity': -1,
            },
            format='json',
        )
        zero_issue_response = self.client.post(
            transactions_url,
            {
                'item': self.inventory_item.id,
                'transaction_type': 'issue',
                'quantity': 0,
            },
            format='json',
        )
        unexplained_adjustment_response = self.client.post(
            transactions_url,
            {
                'item': self.inventory_item.id,
                'transaction_type': 'adjustment',
                'quantity': 5,
            },
            format='json',
        )
        zero_adjustment_response = self.client.post(
            transactions_url,
            {
                'item': self.inventory_item.id,
                'transaction_type': 'adjustment',
                'quantity': 0,
                'notes': 'Confirmed empty during cycle count',
            },
            format='json',
        )

        self.assertEqual(negative_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(zero_issue_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(unexplained_adjustment_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(zero_adjustment_response.status_code, status.HTTP_201_CREATED)
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 0)

    def test_transaction_and_reservation_records_are_append_only_over_api(self):
        transaction = InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='purchase',
            quantity=1,
            performed_by=self.admin_user,
        )
        reservation = InventoryReservation.objects.create(
            item=self.inventory_item,
            technician=self.technician_user,
            quantity=1,
            required_date=timezone.localdate(),
        )
        self.client.force_authenticate(user=self.admin_user)

        transaction_url = f'/api/inventory/transactions/{transaction.id}/'
        reservation_url = f'/api/inventory/reservations/{reservation.id}/'
        transaction_response = self.client.get(transaction_url)
        reservation_response = self.client.get(reservation_url)
        self.assertEqual(transaction_response.data['transaction_code'], f'ITX-{transaction.id:06d}')
        self.assertEqual(reservation_response.data['reservation_code'], f'RSV-{reservation.id:06d}')
        self.assertEqual(
            self.client.patch(transaction_url, {'notes': 'rewrite'}, format='json').status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(transaction_url).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.patch(reservation_url, {'status': 'fulfilled'}, format='json').status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(reservation_url).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def test_item_quantity_cannot_be_rewritten_through_item_update(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f'/api/inventory/items/{self.inventory_item.id}/',
            {'quantity': 999},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory_item.refresh_from_db()
        self.assertEqual(self.inventory_item.quantity, 10)

    def test_item_with_reserved_stock_cannot_be_retired(self):
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='reservation',
            quantity=2,
            performed_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.patch(
            f'/api/inventory/items/{self.inventory_item.id}/',
            {'status': 'retired'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory_item.refresh_from_db()
        self.assertNotEqual(self.inventory_item.status, 'retired')

    def test_retired_item_cannot_be_added_to_new_service_requirement(self):
        retired_item = InventoryItem.objects.create(
            name='Retired Sensor',
            sku='RETIRED-SENSOR-01',
            category=self.category,
            item_type='part',
            quantity=0,
            status='retired',
        )
        another_service = ServiceType.objects.create(
            name='Retired Stock Test Service',
            description='Validates catalog lifecycle rules',
            estimated_duration=30,
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            '/api/inventory/service-type-requirements/',
            {
                'service_type': another_service.id,
                'item': retired_item.id,
                'quantity': 1,
                'auto_reserve': True,
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_items_with_history_and_nonempty_categories_cannot_be_deleted(self):
        InventoryTransaction.objects.create(
            item=self.inventory_item,
            transaction_type='purchase',
            quantity=1,
            performed_by=self.admin_user,
        )
        self.client.force_authenticate(user=self.admin_user)

        item_response = self.client.delete(
            f'/api/inventory/items/{self.inventory_item.id}/',
        )
        category_response = self.client.delete(
            f'/api/inventory/categories/{self.category.id}/',
        )

        self.assertEqual(item_response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(category_response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(InventoryItem.objects.filter(pk=self.inventory_item.pk).exists())
        self.assertTrue(InventoryCategory.objects.filter(pk=self.category.pk).exists())

    def test_recent_transactions_rejects_invalid_limit_and_caps_large_limit(self):
        self.client.force_authenticate(user=self.admin_user)

        invalid_response = self.client.get('/api/inventory/transactions/recent/?limit=bad')
        capped_response = self.client.get('/api/inventory/transactions/recent/?limit=1000')

        self.assertEqual(invalid_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(capped_response.status_code, status.HTTP_200_OK)

    def test_inventory_filter_ids_return_validation_errors(self):
        self.client.force_authenticate(user=self.admin_user)

        item_response = self.client.get('/api/inventory/items/?category=not-an-id')
        transaction_response = self.client.get(
            '/api/inventory/transactions/by_item/?item_id=not-an-id',
        )

        self.assertEqual(item_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(transaction_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pending_reservations_are_scoped_to_the_authenticated_technician(self):
        own_reservation = InventoryReservation.objects.create(
            item=self.inventory_item,
            technician=self.technician_user,
            quantity=1,
            required_date=timezone.localdate(),
        )
        InventoryReservation.objects.create(
            item=self.inventory_item,
            technician=self.crew_technician,
            quantity=1,
            required_date=timezone.localdate(),
        )
        self.client.force_authenticate(user=self.technician_user)

        response = self.client.get('/api/inventory/reservations/pending/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row['id'] for row in response.data], [own_reservation.id])

    def test_admin_can_filter_reservations_by_item_with_ticket_context(self):
        reservation = InventoryReservation.objects.create(
            item=self.inventory_item,
            technician=self.technician_user,
            service_ticket=self.ticket,
            quantity=2,
            required_date=timezone.localdate(),
        )
        other_item = InventoryItem.objects.create(
            name='Other filter item',
            sku='OTHER-FILTER-01',
            category=self.category,
            item_type='part',
            quantity=3,
        )
        InventoryReservation.objects.create(
            item=other_item,
            technician=self.technician_user,
            quantity=1,
            required_date=timezone.localdate(),
        )
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.get(
            '/api/inventory/reservations/',
            {'item_id': self.inventory_item.id},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = response.data.get('results', response.data)
        self.assertEqual([row['id'] for row in rows], [reservation.id])
        self.assertEqual(rows[0]['item_sku'], self.inventory_item.sku)
        self.assertEqual(rows[0]['ticket_code'], f'TKT-{self.ticket.id:04d}')
