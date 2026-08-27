from django.utils import timezone
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import (
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
from users.rbac import INVENTORY_MANAGE, INVENTORY_VIEW, PUBLIC_SITE_VIEW


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

    def test_configured_admin_without_inventory_capability_is_denied(self):
        user = self.create_user('content-only-admin', 'admin', PUBLIC_SITE_VIEW)
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_403_FORBIDDEN)

    def test_technician_keeps_read_only_inventory_access(self):
        user = self.create_user('inventory-technician', 'technician')
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.post(self.items_url, self.item_payload, format='json').status_code, status.HTTP_403_FORBIDDEN)

    def test_client_cannot_access_inventory(self):
        user = self.create_user('inventory-client-isolated', 'client')
        self.client.force_authenticate(user)

        self.assertEqual(self.client.get(self.items_url).status_code, status.HTTP_403_FORBIDDEN)


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
            {},
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
            {},
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
