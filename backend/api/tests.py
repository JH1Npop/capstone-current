from datetime import timedelta

from django.utils import timezone
from django.test import override_settings
from django.core.files.storage import default_storage
from unittest.mock import patch
from services.tests.proof_fixtures import completion_photo
from services.views.technician import TechnicianJobsView
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

    def test_technician_checklist_rejects_unassigned_ticket_without_distinct_lock_query(self):
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Checklist access boundary request.',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='In Progress',
        )
        other_technician = User.objects.create_user(
            username='other-checklist-tech',
            password='Password123!',
            role='technician',
            status='active',
        )
        UserCapabilityGrant.objects.create(
            user=other_technician,
            capability_code=TECHNICIAN_CHECKLIST_VIEW,
        )
        self.client.force_authenticate(user=other_technician)

        response = self.client.post(
            '/api/checklist/',
            {
                'jobId': ticket.id,
                'completed': {'0': True},
            },
            format='json',
        )

        self.assertEqual(response.status_code, 404, response.data)
        self.assertFalse(InspectionChecklist.objects.filter(ticket=ticket).exists())

    def test_site_inspection_requires_explicit_answers_and_recommendation(self):
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Explicit inspection answers request.',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            ticket_type='inspection',
            status='For Inspection',
        )
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            '/api/services/inspections/',
            {'ticket': ticket.id, 'checklist_items': []},
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('site_accessible', response.data)
        self.assertIn('electrical_adequate', response.data)
        self.assertIn('safety_equipment_present', response.data)
        self.assertIn('recommendation', response.data)
        self.assertFalse(InspectionChecklist.objects.filter(ticket=ticket).exists())

    def test_site_inspection_requires_notes_for_negative_answers(self):
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Negative inspection findings request.',
            status='Approved',
        )
        # Reports are accepted only once the technician is on site.
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            ticket_type='inspection',
            status='Arrived on Site',
        )
        self.client.force_authenticate(user=self.technician)
        payload = {
            'ticket': ticket.id,
            'site_accessible': False,
            'electrical_adequate': False,
            'safety_equipment_present': False,
            'recommendation': 'Conditional',
            'checklist_items': [],
        }

        rejected = self.client.post('/api/services/inspections/', payload, format='json')
        payload.update({
            'site_accessible_notes': 'Rear access requires client clearance.',
            'electrical_notes': 'Distribution board needs a spare breaker.',
            'safety_hazards': 'Roof edge barrier must be installed.',
        })
        accepted = self.client.post('/api/services/inspections/', payload, format='json')

        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertIn('site_accessible_notes', rejected.data)
        self.assertIn('electrical_notes', rejected.data)
        self.assertIn('safety_hazards', rejected.data)
        self.assertEqual(accepted.status_code, 201, accepted.data)
        checklist = InspectionChecklist.objects.get(ticket=ticket)
        self.assertEqual(checklist.recommendation, 'Conditional')
        self.assertEqual(checklist.site_accessible_notes, 'Rear access requires client clearance.')

    def test_technician_job_exposes_distinct_checklist_configuration_for_each_service(self):
        self.client_user.phone = '+639171234567'
        self.client_user.save(update_fields=['phone'])
        self.technician.first_name = 'Field'
        self.technician.last_name = 'Technician'
        self.technician.save(update_fields=['first_name', 'last_name'])
        second_service = ServiceType.objects.create(
            name='Persistence Secondary Service',
            estimated_duration=45,
            procedures=[{'title': 'Test secondary controls', 'requires_photo': True}],
            required_equipment=[{'name': 'Clamp meter', 'quantity': 1}],
        )
        self.service_type.procedures = [{'title': 'Inspect primary equipment'}]
        self.service_type.required_equipment = [{'name': 'Inspection kit', 'quantity': 1}]
        self.service_type.save(update_fields=['procedures', 'required_equipment'])
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Multi-service checklist request.',
            status='Approved',
        )
        service_request.service_items.create(service_type=self.service_type, sort_order=0)
        service_request.service_items.create(service_type=second_service, sort_order=1)
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician,
            scheduled_date=timezone.localdate() + timedelta(days=1),
            status='Not Started',
        )
        InspectionChecklist.objects.create(
            ticket=ticket,
            checklist_items=[
                {'label': 'Inspect primary equipment', 'completed': True},
                {'label': 'Test secondary controls', 'completed': False},
            ],
            is_completed=False,
        )
        self.client.force_authenticate(user=self.technician)

        response = self.client.get(f'/api/technician/jobs/{ticket.id}/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            [service['name'] for service in response.data['service_types']],
            [self.service_type.name, second_service.name],
        )
        self.assertEqual(response.data['service_types'][0]['procedures'][0]['title'], 'Inspect primary equipment')
        self.assertEqual(response.data['service_types'][1]['procedures'][0]['title'], 'Test secondary controls')
        self.assertTrue(response.data['service_types'][1]['procedures'][0]['requires_photo'])
        self.assertEqual(response.data['service_types'][1]['required_equipment'][0]['name'], 'Clamp meter')
        self.assertEqual(response.data['request_description'], 'Multi-service checklist request.')
        self.assertEqual(response.data['client']['phone'], '+639171234567')
        self.assertEqual(response.data['lead_technician'], 'Field Technician')
        self.assertEqual(response.data['estimated_duration_minutes'], 105)
        self.assertEqual(response.data['checklist_completed_steps'], 1)
        self.assertEqual(response.data['checklist_total_steps'], 2)

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

        # Asking for equipment no longer pauses the job; the technician keeps working.
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')
        self.assertEqual(response.data['ticket_status'], 'In Progress')

    def _equipment_hold_fixture(self, status='In Progress', technician=None):
        category = InventoryCategory.objects.create(name=f'Hold Equipment {status}')
        item = InventoryItem.objects.create(
            name='Replacement Breaker',
            sku=f'HOLD-BREAKER-{status[:3].upper()}',
            category=category,
            item_type='equipment',
            quantity=3,
            reserved_quantity=0,
            minimum_stock=1,
        )
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Hold flow request.',
            status='In Progress',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=technician or self.technician,
            scheduled_date=timezone.localdate(),
            status=status,
            start_time=timezone.now() if status == 'In Progress' else None,
        )
        return item, ticket

    def test_equipment_request_can_pause_job_and_resume_without_new_arrival(self):
        item, ticket = self._equipment_hold_fixture()
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_parts/',
            {'item_id': item.id, 'quantity': 1, 'notes': 'Breaker tripped on test.', 'pause_job': True},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['ticket_status'], 'On Hold')
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'On Hold')
        self.assertTrue(InventoryReservation.objects.filter(service_ticket=ticket, item=item, status='pending').exists())
        self.assertTrue(ticket.status_history.filter(status='On Hold', notes__icontains='Replacement Breaker').exists())
        self.assertTrue(ticket.request.client.notifications.filter(message__icontains='temporarily on hold').exists())
        self.assertFalse(ticket.request.client.notifications.filter(message__icontains='paused for now').exists())

        resumed = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'in_progress'}, format='json')

        self.assertEqual(resumed.status_code, 200, resumed.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    def test_crew_member_cannot_pause_lead_job_and_nothing_is_reserved(self):
        from services.models import TicketCrewAssignment

        crew = User.objects.create_user(username='persist-crew', password='Password123!', role='technician', status='active')
        UserCapabilityGrant.objects.create(user=crew, capability_code=TECHNICIAN_JOBS_VIEW)
        item, ticket = self._equipment_hold_fixture()
        TicketCrewAssignment.objects.create(ticket=ticket, technician=crew)
        self.client.force_authenticate(user=crew)

        response = self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_parts/',
            {'item_id': item.id, 'quantity': 1, 'pause_job': True},
            format='json',
        )

        self.assertEqual(response.status_code, 403, response.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')
        self.assertFalse(InventoryReservation.objects.filter(service_ticket=ticket).exists())

    def test_rejected_equipment_leaves_job_in_progress(self):
        item, ticket = self._equipment_hold_fixture()
        self.client.force_authenticate(user=self.technician)
        self.client.post(
            f'/api/services/service-tickets/{ticket.id}/request_parts/',
            {'item_id': item.id, 'quantity': 1},
            format='json',
        )
        reservation = InventoryReservation.objects.get(service_ticket=ticket, item=item)

        self.client.force_authenticate(user=self.superadmin)
        rejected = self.client.post(
            f'/api/inventory/reservations/{reservation.id}/cancel/',
            {'reason': 'No breakers left in the warehouse.'},
            format='json',
        )

        self.assertEqual(rejected.status_code, 200, rejected.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    def test_technician_hold_requires_reason_lead_and_active_field_work(self):
        _, ticket = self._equipment_hold_fixture()
        _, not_started = self._equipment_hold_fixture(status='Not Started')
        self.client.force_authenticate(user=self.technician)

        missing_reason = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {'status': 'on_hold'}, format='json')
        wrong_state = self.client.post(
            f'/api/technician/jobs/{not_started.id}/status/',
            {'status': 'on_hold', 'reason': 'Waiting for client to arrive.'},
            format='json',
        )
        held = self.client.post(
            f'/api/technician/jobs/{ticket.id}/status/',
            {'status': 'on_hold', 'reason': 'Waiting for the client to unlock the roof.'},
            format='json',
        )

        self.assertEqual(missing_reason.status_code, 400)
        self.assertEqual(wrong_state.status_code, 400)
        self.assertEqual(held.status_code, 200, held.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'On Hold')
        self.assertTrue(ticket.status_history.filter(status='On Hold', notes__icontains='unlock the roof').exists())
        # Titled and linked so the badge and click route by title, never by the free-text reason.
        client_alert = ticket.request.client.notifications.get(message__icontains='paused for now')
        self.assertEqual((client_alert.title, client_alert.ticket_id), (f'Ticket #{ticket.id} Paused', ticket.id))
        admin_alert = self.superadmin.notifications.get(message__icontains='unlock the roof')
        self.assertEqual((admin_alert.title, admin_alert.ticket_id), (f'Ticket #{ticket.id} On Hold', ticket.id))

    def test_finish_job_accepts_phone_sized_photo_file_and_refuses_base64(self):
        import os as _os
        import struct
        import zlib

        from django.core.files.uploadedfile import SimpleUploadedFile

        def png_chunk(kind, body):
            return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))

        _, ticket = self._equipment_hold_fixture()
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(user=self.technician)

        refused = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {
            'status': 'completed', 'completion_proof_images': ['data:image/jpeg;base64,AAAA'],
        }, format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('image files', refused.data['error'])

        # Random pixels keep the PNG above 3 MB, beyond the 2.5 MB body limit that broke base64 photos.
        width = height = 1100
        rows = b''.join(b'\x00' + _os.urandom(width * 3) for _ in range(height))
        png = (
            b'\x89PNG\r\n\x1a\n'
            + png_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + png_chunk(b'IDAT', zlib.compress(rows))
            + png_chunk(b'IEND', b'')
        )
        self.assertGreater(len(png), 3 * 1024 * 1024)
        photo = SimpleUploadedFile('finished.png', png, content_type='image/png')

        response = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {
            'status': 'completed',
            'completion_notes': 'Installed and tested.',
            'completion_photo_files': photo,
            'inventory_usage': '[]',
        }, format='multipart')

        self.assertEqual(response.status_code, 200, response.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'Completed')
        self.assertEqual(len(ticket.completion_proof_images), 1)
        self.assertTrue(ticket.completion_proof_images[0].startswith('http'))
        self.assertNotIn('base64', ticket.completion_proof_images[0])

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
    def test_completion_rejects_untrusted_references_on_both_endpoints(self):
        _, ticket = self._equipment_hold_fixture()
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(user=self.technician)
        for endpoint in (f'/api/technician/jobs/{ticket.id}/status/',
                         f'/api/services/service-tickets/{ticket.id}/complete_work/'):
            for reference in ('https://example.com/not-a-photo', '/media/checklists/other-ticket.png',
                              {'url': 'https://example.com/fake.png'}, True):
                with self.subTest(endpoint=endpoint, reference=reference):
                    response = self.client.post(endpoint, {
                        'status': 'completed', 'completion_proof_images': [reference],
                    }, format='json')
                    self.assertEqual(response.status_code, 400, response.data)
                    ticket.refresh_from_db()
                    self.assertEqual(ticket.status, 'In Progress')
                    self.assertFalse(ticket.completion_proof_images)
        self.assertEqual(default_storage.listdir(''), ([], []))

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
    def test_failed_completion_cleans_uploads_and_rolls_back_both_endpoints(self):
        _, ticket = self._equipment_hold_fixture()
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(user=self.technician)
        directory = f'checklists/ticket-{ticket.id}'
        for endpoint in (f'/api/technician/jobs/{ticket.id}/status/',
                         f'/api/services/service-tickets/{ticket.id}/complete_work/'):
            with self.subTest(endpoint=endpoint):
                response = self.client.post(endpoint, {
                    'status': 'completed', 'completion_photo_files': completion_photo(),
                    'inventory_usage': '[{"reservation_id": 999999, "quantity_used": 1}]',
                }, format='multipart')
                self.assertEqual(response.status_code, 400, response.data)
                ticket.refresh_from_db()
                self.assertEqual(ticket.status, 'In Progress')
                self.assertFalse(ticket.completion_proof_images)
                self.assertFalse(ticket.status_history.filter(status='Completed').exists())
                self.assertEqual(default_storage.listdir(directory)[1], [])

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
    def test_storage_failure_cleans_previously_saved_completion_files(self):
        _, ticket = self._equipment_hold_fixture()
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(user=self.technician)
        real_save = default_storage.save
        saved_names = []

        def fail_second_save(*args, **kwargs):
            if saved_names:
                raise OSError('Simulated storage failure')
            name = real_save(*args, **kwargs)
            saved_names.append(name)
            return name

        with patch.object(default_storage, 'save', side_effect=fail_second_save):
            with self.assertRaises(OSError):
                self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {
                    'status': 'completed',
                    'completion_photo_files': [completion_photo(), completion_photo()],
                }, format='multipart')
        self.assertEqual(len(saved_names), 1)
        self.assertFalse(default_storage.exists(saved_names[0]))
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
    def test_completion_upload_finishes_storage_before_ticket_row_lock(self):
        _, ticket = self._equipment_hold_fixture()
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(user=self.technician)
        real_save = default_storage.save
        real_get_locked_job = TechnicianJobsView.get_locked_job
        events = []

        def record_save(*args, **kwargs):
            events.append('storage')
            return real_save(*args, **kwargs)

        def record_lock(view, *args, **kwargs):
            events.append('lock')
            return real_get_locked_job(view, *args, **kwargs)

        with patch.object(default_storage, 'save', side_effect=record_save), patch.object(
            TechnicianJobsView,
            'get_locked_job',
            autospec=True,
            side_effect=record_lock,
        ):
            response = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {
                'status': 'completed',
                'completion_photo_files': completion_photo(),
                'inventory_usage': '[]',
            }, format='multipart')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('storage', events)
        self.assertIn('lock', events)
        self.assertLess(events.index('storage'), events.index('lock'))

    @override_settings(STORAGES={'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'}})
    def test_completion_rejects_more_than_twenty_files_before_storage(self):
        _, ticket = self._equipment_hold_fixture()
        InspectionChecklist.objects.create(ticket=ticket, is_completed=True)
        self.client.force_authenticate(user=self.technician)

        with patch.object(default_storage, 'save', wraps=default_storage.save) as storage_save:
            response = self.client.post(f'/api/technician/jobs/{ticket.id}/status/', {
                'status': 'completed',
                'completion_photo_files': [completion_photo() for _ in range(21)],
                'inventory_usage': '[]',
            }, format='multipart')

        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('media_files', response.data)
        storage_save.assert_not_called()
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, 'In Progress')

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
    def test_superadmin_can_persist_and_remove_technician_skill(self):
        self.client.force_authenticate(user=self.superadmin)

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
