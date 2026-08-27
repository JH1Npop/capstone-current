from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from inventory.models import InventoryCategory, InventoryItem, InventoryReservation, InventoryTransaction
from services.models import (
    InspectionChecklist,
    ServiceLocation,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
    TechnicianSkill,
)
from users.models import User, UserCapabilityGrant
from users.rbac import TECHNICIAN_CHECKLIST_VIEW, TECHNICIAN_JOBS_VIEW


class DataPersistenceSmokeTests(APITestCase):
    def setUp(self):
        self.service_type = ServiceType.objects.create(
            name='Persistence Smoke Service',
            estimated_duration=60,
            estimated_cost=100,
        )
        self.client_user = User.objects.create_user(
            username='persist-client',
            password='Password123!',
            role='client',
        )
        self.technician = User.objects.create_user(
            username='persist-tech',
            password='Password123!',
            role='technician',
            status='active',
        )
        UserCapabilityGrant.objects.create(
            user=self.technician,
            capability_code=TECHNICIAN_CHECKLIST_VIEW,
        )
        UserCapabilityGrant.objects.create(
            user=self.technician,
            capability_code=TECHNICIAN_JOBS_VIEW,
        )
        self.superadmin = User.objects.create_user(
            username='persist-superadmin',
            password='Password123!',
            role='superadmin',
        )
        self.admin_user = User.objects.create_user(
            username='persist-admin',
            password='Password123!',
            role='admin',
        )

    def test_client_service_request_payload_persists_request_and_location(self):
        preferred_date = timezone.localdate() + timedelta(days=2)
        self.client.force_authenticate(user=self.client_user)

        response = self.client.post(
            '/api/services/service-requests/',
            {
                'service_type': self.service_type.id,
                'description': 'Install and inspect the unit.',
                'priority': 'Normal',
                'preferred_date': preferred_date.isoformat(),
                'preferred_time_slot': 'morning',
                'scheduling_notes': 'Please call before arrival.',
                'location_address': '123 Smoke Test Street',
                'location_city': 'Manila',
                'location_province': 'Metro Manila',
                'latitude': '14.599500',
                'longitude': '120.984200',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        service_request = ServiceRequest.objects.get(pk=response.data['id'])
        self.assertEqual(service_request.client, self.client_user)
        self.assertEqual(service_request.status, 'Pending')
        self.assertEqual(service_request.service_type, self.service_type)
        self.assertEqual(service_request.description, 'Install and inspect the unit.')
        self.assertEqual(service_request.preferred_date, preferred_date)
        self.assertEqual(service_request.preferred_time_slot, 'morning')

        location = ServiceLocation.objects.get(request=service_request)
        self.assertEqual(location.address, '123 Smoke Test Street')
        self.assertEqual(location.city, 'Manila')
        self.assertEqual(location.province, 'Metro Manila')
        self.assertEqual(str(location.latitude), '14.599500')
        self.assertEqual(str(location.longitude), '120.984200')

    def test_technician_checklist_payload_persists_checklist_details(self):
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Checklist persistence request.',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
        )
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'serviceType': self.service_type.name,
                'completed': {'0': True, '1': True},
                'checklist_items': [
                    {'index': 0, 'label': 'Inspect site', 'completed': True},
                    {'index': 1, 'label': 'Confirm tools', 'completed': True},
                ],
                'required_equipment_snapshot': [{'name': 'Ladder', 'quantity': 1}],
                'procedure_source': 'dynamic',
                'notes': 'All checks passed.',
                'warranty_provided': True,
                'warranty_period_days': 30,
                'warranty_notes': 'Standard warranty.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        checklist = InspectionChecklist.objects.get(ticket=ticket)
        self.assertTrue(checklist.is_completed)
        self.assertEqual(checklist.completed_by, self.technician)
        self.assertEqual(checklist.submitted_by, self.technician)
        self.assertEqual(checklist.service_type_label, self.service_type.name)
        self.assertEqual(checklist.procedure_source, 'dynamic')
        self.assertEqual(checklist.checklist_items[0]['label'], 'Inspect site')
        self.assertEqual(checklist.required_equipment_snapshot[0]['name'], 'Ladder')
        self.assertTrue(checklist.warranty_provided)
        self.assertEqual(checklist.warranty_period_days, 30)

    def test_technician_additional_equipment_request_persists_inventory_reservation(self):
        category = InventoryCategory.objects.create(name='Smoke Equipment')
        item = InventoryItem.objects.create(
            name='Portable Ladder',
            sku='SMOKE-LADDER',
            category=category,
            item_type='equipment',
            quantity=5,
            reserved_quantity=0,
            minimum_stock=1,
        )
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Equipment request persistence.',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='In Progress',
        )
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_parts/',
            {
                'item_id': item.id,
                'quantity': 2,
                'notes': 'Ceiling access is higher than expected.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        reservation = InventoryReservation.objects.get(service_ticket=ticket, item=item)
        self.assertEqual(reservation.technician, self.technician)
        self.assertEqual(reservation.quantity, 2)
        self.assertEqual(reservation.status, 'pending')
        self.assertIn('Ceiling access is higher than expected.', reservation.notes)

        item.refresh_from_db()
        self.assertEqual(item.reserved_quantity, 2)
        self.assertTrue(
            InventoryTransaction.objects.filter(
                item=item,
                service_ticket=ticket,
                technician=self.technician,
                transaction_type='reservation',
                quantity=2,
            ).exists()
        )

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Awaiting Materials')

    def test_technician_can_request_multiple_equipment_items_before_work_starts(self):
        category = InventoryCategory.objects.create(name='Survey Equipment')
        ladder = InventoryItem.objects.create(
            name='Survey Ladder',
            sku='SURVEY-LADDER',
            category=category,
            item_type='equipment',
            quantity=5,
            reserved_quantity=0,
            minimum_stock=1,
        )
        harness = InventoryItem.objects.create(
            name='Safety Harness',
            sku='SURVEY-HARNESS',
            category=category,
            item_type='equipment',
            quantity=4,
            reserved_quantity=0,
            minimum_stock=1,
        )
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Pre-work survey equipment request.',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Arrived on Site',
        )
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_parts/',
            {
                'items': [
                    {'item_id': ladder.id, 'quantity': 1},
                    {'item_id': harness.id, 'quantity': 2},
                ],
                'notes': 'Survey found roof work is likely.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['reservations']), 2)
        self.assertTrue(
            InventoryReservation.objects.filter(
                service_ticket=ticket,
                item=ladder,
                quantity=1,
                status='pending',
            ).exists()
        )
        self.assertTrue(
            InventoryReservation.objects.filter(
                service_ticket=ticket,
                item=harness,
                quantity=2,
                status='pending',
            ).exists()
        )

        ladder.refresh_from_db()
        harness.refresh_from_db()
        self.assertEqual(ladder.reserved_quantity, 1)
        self.assertEqual(harness.reserved_quantity, 2)

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Arrived on Site')

    def test_technician_cannot_persist_own_skill_from_profile_page(self):
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            '/api/services/technician-skills/',
            {
                'service_type': self.service_type.id,
                'skill_level': 'expert',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(
            TechnicianSkill.objects.filter(
                technician=self.technician,
                service_type=self.service_type,
            ).exists()
        )
    def test_admin_can_persist_and_remove_technician_skill(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.post(
            '/api/services/technician-skills/',
            {
                'technician': self.technician.id,
                'service_type': self.service_type.id,
                'skill_level': 'expert',
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        skill = TechnicianSkill.objects.get(
            technician=self.technician,
            service_type=self.service_type,
        )
        self.assertEqual(skill.skill_level, 'expert')

        delete_response = self.client.delete(f'/api/services/technician-skills/{skill.id}/')
        self.assertEqual(delete_response.status_code, 204, delete_response.data)
        self.assertFalse(TechnicianSkill.objects.filter(pk=skill.pk).exists())

    def test_admin_cannot_manage_user_capabilities(self):
        self.client.force_authenticate(user=self.admin_user)

        response = self.client.put(
            f'/api/users/{self.technician.id}/capabilities/',
            {'capabilities': [TECHNICIAN_CHECKLIST_VIEW]},
            format='json',
        )

        self.assertEqual(response.status_code, 403, response.data)


class GeocodeValidationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='geocode-validation-user',
            password='Password123!',
            role='client',
        )
        self.client.force_authenticate(user=self.user)

    def test_search_rejects_non_integer_limit(self):
        response = self.client.get('/api/geocode/search/', {'q': 'Manila', 'limit': 'invalid'})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error'], 'limit must be an integer.')
