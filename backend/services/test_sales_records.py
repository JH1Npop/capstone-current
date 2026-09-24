from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from inventory.models import InventoryCategory, InventoryItem, InventoryTransaction
from services.models import (
    InstalledEquipment,
    InstallationContract,
    QuotationRecord,
    SalesRecord,
    ServiceRequest,
    ServiceTicket,
    ServiceType,
)
from users.models import User, UserCapabilityGrant
from users.rbac import DOCUMENTS_MANAGE, DOCUMENTS_VIEW


class SalesRecordFlowTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='sales-client', password='pass', role='client', first_name='Sales', last_name='Client'
        )
        self.other_client = User.objects.create_user(
            username='other-sales-client', password='pass', role='client'
        )
        self.manager = User.objects.create_user(username='sales-manager', password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=self.manager, capability_code=DOCUMENTS_MANAGE)
        self.viewer = User.objects.create_user(username='sales-viewer', password='pass', role='admin')
        UserCapabilityGrant.objects.create(user=self.viewer, capability_code=DOCUMENTS_VIEW)
        self.technician = User.objects.create_user(username='sales-tech', password='pass', role='technician')

        self.service_type = ServiceType.objects.create(
            name='Solar installation sales flow', estimated_duration=240, estimated_cost='25000.00'
        )
        self.request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Install a connected system.',
            status='Completed',
        )
        self.ticket = ServiceTicket.objects.create(
            request=self.request,
            scheduled_date=timezone.localdate(),
            status='Completed',
            completed_date=timezone.now(),
            warranty_status='active',
            warranty_start_date=timezone.localdate(),
            warranty_end_date=timezone.localdate() + timedelta(days=365),
        )
        self.quotation = QuotationRecord.objects.create(
            ticket=self.ticket,
            client=self.client_user,
            quotation_number='QUO-SALES-001',
            total_amount='PHP 100,000.00',
            status='Accepted',
            bill_of_materials=[{
                'description': '550 W solar panel',
                'sku': 'PV-550',
                'unit': 'piece',
                'qty': '2',
                'unitPrice': '25000',
                'amount': '50000',
            }],
        )
        category = InventoryCategory.objects.create(name='Sales flow products')
        self.item = InventoryItem.objects.create(
            name='550 W solar panel',
            sku='PV-SALES-550',
            category=category,
            item_type='equipment',
            unit_of_measurement='piece',
            quantity=10,
            minimum_stock=1,
        )
        self.issue = InventoryTransaction.objects.create(
            item=self.item,
            transaction_type='issue',
            quantity=2,
            service_ticket=self.ticket,
            performed_by=self.manager,
            notes='Installed for connected sales-record test.',
        )
        self.equipment = InstalledEquipment.objects.create(
            ticket=self.ticket,
            client=self.client_user,
            equipment_type='Solar panel array',
            brand_model='Example PV 550',
            serial_number='PV-SERIAL-001',
            warranty_start=timezone.localdate(),
            warranty_end=timezone.localdate() + timedelta(days=365),
        )

    def prepare(self):
        self.client.force_authenticate(self.manager)
        return self.client.post(
            '/api/services/sales-records/prepare/',
            {'ticket_id': self.ticket.id},
            format='json',
        )

    def test_prepare_connects_ticket_quotation_inventory_equipment_and_warranty(self):
        response = self.prepare()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['client'], self.client_user.id)
        self.assertEqual(response.data['quotation'], self.quotation.id)
        self.assertEqual(response.data['agreed_total'], '100000.00')
        self.assertEqual(response.data['agreed_total_source'], 'accepted_quotation')
        self.assertEqual(response.data['source_snapshot']['agreed_value']['source'], 'accepted_quotation')
        self.assertEqual(response.data['status'], 'draft')
        self.assertTrue(response.data['record_number'].startswith('SAL-'))
        self.assertEqual(response.data['source_snapshot']['inventory_issues'][0]['transaction_id'], self.issue.id)
        self.assertEqual(response.data['source_snapshot']['installed_equipment'][0]['id'], self.equipment.id)
        self.assertEqual(response.data['source_snapshot']['ticket']['warranty_status'], 'active')
        self.assertEqual(
            {line['line_type'] for line in response.data['line_items']},
            {'service', 'product'},
        )
        product = next(line for line in response.data['line_items'] if line['line_type'] == 'product')
        self.assertEqual(product['source_snapshot']['source'], 'accepted_quotation_bom')

        blocked_value_edit = self.client.patch(
            f"/api/services/sales-records/{response.data['id']}/",
            {'agreed_total': '1.00'},
            format='json',
        )
        self.assertEqual(blocked_value_edit.status_code, status.HTTP_409_CONFLICT)

    def test_manual_value_requires_missing_connected_source_and_reason(self):
        self.quotation.status = 'Draft'
        self.quotation.save(update_fields=['status'])
        prepared = self.prepare()
        record_id = prepared.data['id']

        self.assertIsNone(prepared.data['agreed_total'])
        self.assertEqual(prepared.data['agreed_total_source'], 'not_recorded')

        missing_value = self.client.post(
            f'/api/services/sales-records/{record_id}/confirm/', {}, format='json'
        )
        self.assertEqual(missing_value.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('agreed_total', missing_value.data)

        missing_reason = self.client.patch(
            f'/api/services/sales-records/{record_id}/',
            {'agreed_total': '90000.00', 'currency_code': 'PHP'},
            format='json',
        )
        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('notes', missing_reason.data)

        saved = self.client.patch(
            f'/api/services/sales-records/{record_id}/',
            {
                'agreed_total': '90000.00',
                'currency_code': 'PHP',
                'notes': 'Legacy completed work has no accepted quotation or signed contract.',
            },
            format='json',
        )
        self.assertEqual(saved.status_code, status.HTTP_200_OK, saved.data)
        self.assertEqual(saved.data['agreed_total_source'], 'manual')
        self.assertEqual(saved.data['source_snapshot']['agreed_value']['source'], 'manual')

        confirmed = self.client.post(
            f'/api/services/sales-records/{record_id}/confirm/', {}, format='json'
        )
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK, confirmed.data)
        self.assertEqual(confirmed.data['agreed_total'], '90000.00')

    def test_signed_contract_value_is_connected_and_read_only(self):
        self.quotation.status = 'Draft'
        self.quotation.save(update_fields=['status'])
        InstallationContract.objects.create(
            ticket=self.ticket,
            total_contract_amount='95000.00',
            status='signed',
        )

        prepared = self.prepare()

        self.assertEqual(prepared.status_code, status.HTTP_201_CREATED, prepared.data)
        self.assertEqual(prepared.data['agreed_total'], '95000.00')
        self.assertEqual(prepared.data['agreed_total_source'], 'signed_contract')
        blocked = self.client.patch(
            f"/api/services/sales-records/{prepared.data['id']}/",
            {'agreed_total': '1.00'},
            format='json',
        )
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)

    def test_prepare_is_retry_safe_and_requires_completed_ticket(self):
        first = self.prepare()
        second = self.prepare()
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['id'], second.data['id'])

        self.ticket.status = 'In Progress'
        self.ticket.save(update_fields=['status'])
        SalesRecord.objects.all().delete()
        blocked = self.prepare()
        self.assertEqual(blocked.status_code, status.HTTP_409_CONFLICT)

    def test_document_viewer_cannot_prepare_or_confirm(self):
        self.client.force_authenticate(self.viewer)
        response = self.client.post(
            '/api/services/sales-records/prepare/', {'ticket_id': self.ticket.id}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_confirmation_is_immutable_and_client_scoped(self):
        prepared = self.prepare()
        record_id = prepared.data['id']
        self.quotation.total_amount = 'PHP 110,000.00'
        self.quotation.save(update_fields=['total_amount'])
        confirmed = self.client.post(f'/api/services/sales-records/{record_id}/confirm/', {}, format='json')
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK, confirmed.data)
        self.assertEqual(confirmed.data['status'], 'confirmed')
        self.assertEqual(confirmed.data['agreed_total'], '110000.00')

        blocked_edit = self.client.patch(
            f'/api/services/sales-records/{record_id}/', {'agreed_total': '1.00'}, format='json'
        )
        self.assertEqual(blocked_edit.status_code, status.HTTP_409_CONFLICT)
        repeated_confirm = self.client.post(
            f'/api/services/sales-records/{record_id}/confirm/', {}, format='json'
        )
        self.assertEqual(repeated_confirm.status_code, status.HTTP_409_CONFLICT)

        self.client.force_authenticate(self.client_user)
        own_records = self.client.get('/api/services/sales-records/')
        self.assertEqual(own_records.status_code, status.HTTP_200_OK)
        own_rows = own_records.data.get('results', own_records.data)
        self.assertEqual([row['id'] for row in own_rows], [record_id])
        self.assertNotIn('payment_status', own_rows[0])

        self.client.force_authenticate(self.other_client)
        other_records = self.client.get('/api/services/sales-records/')
        other_rows = other_records.data.get('results', other_records.data)
        self.assertEqual(other_rows, [])

        self.client.force_authenticate(self.technician)
        technician_records = self.client.get('/api/services/sales-records/')
        technician_rows = technician_records.data.get('results', technician_records.data)
        self.assertEqual(technician_rows, [])

    def test_void_requires_reason_and_allows_linked_replacement(self):
        prepared = self.prepare()
        record_id = prepared.data['id']
        self.client.post(f'/api/services/sales-records/{record_id}/confirm/', {}, format='json')

        missing_reason = self.client.post(
            f'/api/services/sales-records/{record_id}/void/', {}, format='json'
        )
        self.assertEqual(missing_reason.status_code, status.HTTP_400_BAD_REQUEST)
        voided = self.client.post(
            f'/api/services/sales-records/{record_id}/void/',
            {'reason': 'Correct the confirmed product quantity.'},
            format='json',
        )
        self.assertEqual(voided.status_code, status.HTTP_200_OK)
        self.assertEqual(voided.data['status'], 'voided')

        replacement = self.prepare()
        self.assertEqual(replacement.status_code, status.HTTP_201_CREATED)
        self.assertEqual(replacement.data['replaces'], record_id)
        self.assertNotEqual(replacement.data['record_number'], prepared.data['record_number'])
