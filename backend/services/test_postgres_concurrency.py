from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection
from django.test import TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient

from inventory.automation import (
    cancel_pending_reservation,
    create_pending_reservation,
    fulfill_pending_reservation,
)
from inventory.models import InventoryCategory, InventoryItem, InventoryReservation, InventoryTransaction
from services.models import ServiceRequest, ServiceTicket, ServiceType, TicketCrewAssignment
from users.models import User


@skipUnlessDBFeature('has_select_for_update')
class PostgreSQLConcurrencyContractTests(TransactionTestCase):
    """Runs only on a backend with real row-lock support (the staging gate uses PostgreSQL)."""

    reset_sequences = True

    def setUp(self):
        if connection.vendor != 'postgresql':
            self.skipTest('PostgreSQL is required for row-lock concurrency evidence.')
        self.admin = User.objects.create_user(username='concurrency-admin', password='pass', role='admin')
        self.client_user = User.objects.create_user(username='concurrency-client', password='pass', role='client')
        self.technician = User.objects.create_user(username='concurrency-tech', password='pass', role='technician')
        self.service_type = ServiceType.objects.create(name='Concurrency Service')

    def _run_competing(self, worker):
        barrier = Barrier(2)

        def wrapped():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return worker()
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(wrapped) for _ in range(2)]
            return [future.result(timeout=30) for future in futures]

    def test_competing_approvals_create_exactly_one_ticket(self):
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Competing approval test',
            status='Pending',
        )

        def approve():
            api = APIClient()
            api.force_authenticate(user=User.objects.get(pk=self.admin.pk))
            return api.post(
                f'/api/services/service-requests/{service_request.pk}/approve/',
                {},
                format='json',
            ).status_code

        statuses = sorted(self._run_competing(approve))

        self.assertEqual(statuses, [200, 400])
        self.assertEqual(ServiceTicket.objects.filter(request=service_request).count(), 1)
        service_request.refresh_from_db()
        self.assertEqual(service_request.status, 'Approved')

    def test_competing_stock_receipts_do_not_lose_an_update(self):
        category = InventoryCategory.objects.create(name='Concurrency Parts')
        item = InventoryItem.objects.create(
            name='Concurrent Fuse',
            sku='CONC-FUSE-001',
            category=category,
            item_type='part',
            quantity=0,
            minimum_stock=0,
        )

        def receive_stock():
            transaction = InventoryTransaction.objects.create(
                item=InventoryItem.objects.get(pk=item.pk),
                transaction_type='purchase',
                quantity=1,
                performed_by=User.objects.get(pk=self.admin.pk),
                notes='PostgreSQL concurrency probe',
            )
            return transaction.pk

        transaction_ids = self._run_competing(receive_stock)

        item.refresh_from_db()
        self.assertEqual(item.quantity, 2)
        self.assertEqual(len(set(transaction_ids)), 2)
        self.assertEqual(InventoryTransaction.objects.filter(item=item, transaction_type='purchase').count(), 2)

    def test_competing_reservations_cannot_overbook_stock(self):
        category = InventoryCategory.objects.create(name='Reservation Parts')
        item = InventoryItem.objects.create(
            name='Reserved Rail',
            sku='CONC-RAIL-001',
            category=category,
            item_type='part',
            quantity=5,
            minimum_stock=0,
        )

        def reserve_stock():
            try:
                reservation = create_pending_reservation(
                    item=InventoryItem.objects.get(pk=item.pk),
                    quantity=4,
                    technician=User.objects.get(pk=self.technician.pk),
                    required_date=timezone.localdate(),
                    service_ticket=None,
                    performed_by=User.objects.get(pk=self.admin.pk),
                    notes='PostgreSQL reservation race probe',
                )
                return ('created', reservation.pk)
            except ValidationError:
                return ('rejected', None)

        outcomes = self._run_competing(reserve_stock)

        item.refresh_from_db()
        self.assertEqual(sorted(outcome for outcome, _pk in outcomes), ['created', 'rejected'])
        self.assertEqual(item.reserved_quantity, 4)
        self.assertEqual(InventoryReservation.objects.filter(item=item, status='pending').count(), 1)

    def _create_nullable_ticket_reservation(self, *, sku):
        category, _created = InventoryCategory.objects.get_or_create(name='Nullable Ticket Parts')
        item = InventoryItem.objects.create(
            name=f'Nullable Ticket Item {sku}',
            sku=sku,
            category=category,
            item_type='part',
            quantity=5,
            minimum_stock=0,
        )
        reservation = create_pending_reservation(
            item=item,
            quantity=2,
            technician=self.technician,
            required_date=timezone.localdate(),
            service_ticket=None,
            performed_by=self.admin,
            notes='PostgreSQL nullable-join row-lock probe',
        )
        return item, reservation

    def test_fulfilling_reservation_locks_only_reservation_row(self):
        item, reservation = self._create_nullable_ticket_reservation(sku='NULL-FULFILL-001')

        changed = fulfill_pending_reservation(
            reservation,
            performed_by=self.admin,
            notes='Fulfilled by PostgreSQL lock-scope probe',
        )

        self.assertTrue(changed)
        reservation.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(reservation.status, 'fulfilled')
        self.assertEqual(item.quantity, 3)
        self.assertEqual(item.reserved_quantity, 0)

    def test_cancelling_reservation_locks_only_reservation_row(self):
        item, reservation = self._create_nullable_ticket_reservation(sku='NULL-CANCEL-001')

        changed = cancel_pending_reservation(
            reservation,
            performed_by=self.admin,
            notes='Cancelled by PostgreSQL lock-scope probe',
        )

        self.assertTrue(changed)
        reservation.refresh_from_db()
        item.refresh_from_db()
        self.assertEqual(reservation.status, 'cancelled')
        self.assertEqual(item.quantity, 5)
        self.assertEqual(item.reserved_quantity, 0)

    def test_crew_ticket_upload_lock_does_not_apply_for_update_to_distinct(self):
        lead = User.objects.create_user(
            username='concurrency-lead-tech',
            password='pass',
            role='technician',
        )
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Crew upload lock probe',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=lead,
            scheduled_date=timezone.localdate(),
            status='In Progress',
        )
        TicketCrewAssignment.objects.create(
            ticket=ticket,
            technician=self.technician,
            assigned_by=self.admin,
        )

        api = APIClient()
        api.force_authenticate(user=self.technician)
        response = api.post(
            f'/api/services/service-tickets/{ticket.pk}/upload_photos/',
            {},
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data.get('error'),
            'At least one photo or video proof entry is required',
        )
