
from django.db import transaction
from django.db.models import Count, ExpressionWrapper, F, IntegerField, Sum
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as ApiValidationError
from rest_framework.response import Response
from django.utils import timezone

from .automation import (
    cancel_pending_reservation,
    create_pending_reservation,
    fulfill_pending_reservation,
)
from .models import (
    InventoryCategory,
    InventoryItem,
    InventoryTransaction,
    InventoryReservation,
    ServiceTypeInventoryRequirement,
)
from .serializers import (
    InventoryCategorySerializer, InventoryItemSerializer,
    InventoryTransactionSerializer, InventoryReservationSerializer,
    ServiceTypeInventoryRequirementSerializer,
)
from users.permissions import (
    IsAdmin, IsSupervisor, IsTechnician, IsClient,
    IsAdminOrSupervisor, IsAdminOrSupervisorOrTechnician,
    CanManageInventory
)
from notifications.notification_utils import send_user_notification


def raise_api_validation_error(exc):
    if hasattr(exc, 'message_dict'):
        raise ApiValidationError(exc.message_dict)
    raise ApiValidationError({'detail': list(getattr(exc, 'messages', [str(exc)]))})


class InventoryCategoryViewSet(viewsets.ModelViewSet):
    queryset = InventoryCategory.objects.annotate(
        item_count=Count('items', distinct=True),
        subcategory_count=Count('subcategories', distinct=True),
    ).order_by('name')
    serializer_class = InventoryCategorySerializer
    permission_classes = [CanManageInventory]

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            category = InventoryCategory.objects.select_for_update().get(pk=self.get_object().pk)
            if category.items.exists() or category.subcategories.exists():
                return Response(
                    {'detail': 'Move this category\'s items and subcategories before deleting it.'},
                    status=status.HTTP_409_CONFLICT,
                )
            return super().destroy(request, *args, **kwargs)


class InventoryItemViewSet(viewsets.ModelViewSet):
    queryset = InventoryItem.objects.select_related('category').order_by('id')
    serializer_class = InventoryItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'sku', 'description']

    def get_permissions(self):
        """Use the shared inventory permission for list and custom actions too."""
        return [CanManageInventory()]

    def get_queryset(self):
        queryset = InventoryItem.objects.select_related('category').order_by('id')

        # Filter by category
        category = self.request.query_params.get('category')
        if category:
            try:
                category = int(category)
            except (TypeError, ValueError):
                raise ApiValidationError({'category': 'Category must be an integer ID.'})
            queryset = queryset.filter(category_id=category)

        # Filter by status
        item_status = self.request.query_params.get('status')
        if item_status:
            queryset = queryset.filter(status=item_status)

        # Filter low stock items
        low_stock = self.request.query_params.get('low_stock')
        if low_stock == 'true':
            low_stock_ids = [item.id for item in queryset if item.is_low_stock]
            queryset = InventoryItem.objects.filter(id__in=low_stock_ids)

        return queryset

    def destroy(self, request, *args, **kwargs):
        with transaction.atomic():
            item = InventoryItem.objects.select_for_update().get(pk=self.get_object().pk)
            if (
                item.transactions.exists() or
                item.reservations.exists() or
                item.service_type_requirements.exists()
            ):
                return Response(
                    {
                        'detail': (
                            'This item has inventory history or service requirements and cannot be deleted. '
                            'Set its status to retired instead.'
                        )
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def low_stock(self, request):
        """Get items with low stock"""
        items = InventoryItem.objects.exclude(status='retired').annotate(
            available_percentage=ExpressionWrapper(
                (F('quantity') - F('reserved_quantity')) * 100,
                output_field=IntegerField(),
            ),
            low_stock_limit=ExpressionWrapper(
                F('minimum_stock') * F('low_stock_threshold'),
                output_field=IntegerField(),
            ),
        ).filter(
            minimum_stock__gt=0,
            available_percentage__lte=F('low_stock_limit'),
        )
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get inventory statistics"""
        active_items = InventoryItem.objects.exclude(status='retired')
        stock_metrics = active_items.annotate(
            available_units=ExpressionWrapper(
                F('quantity') - F('reserved_quantity'),
                output_field=IntegerField(),
            ),
            available_percentage=ExpressionWrapper(
                (F('quantity') - F('reserved_quantity')) * 100,
                output_field=IntegerField(),
            ),
            low_stock_limit=ExpressionWrapper(
                F('minimum_stock') * F('low_stock_threshold'),
                output_field=IntegerField(),
            ),
        )

        total_items = active_items.count()
        total_value = active_items.aggregate(
            total=Sum('total_value')
        )['total'] or 0

        low_stock_count = stock_metrics.filter(
            minimum_stock__gt=0,
            available_percentage__lte=F('low_stock_limit'),
        ).count()

        out_of_stock = stock_metrics.filter(available_units__lte=0).count()

        # By status — single query using values/annotate
        status_counts = {}
        for row in active_items.values('status').annotate(count=Count('id')):
            status_counts[row['status']] = row['count']

        # By category
        category_counts = active_items.values(
            'category__name'
        ).annotate(count=Count('id'))

        return Response({
            'total_items': total_items,
            'total_value': float(total_value),
            'low_stock_count': low_stock_count,
            'out_of_stock': out_of_stock,
            'status_counts': status_counts,
            'category_counts': list(category_counts)
        })


class InventoryTransactionViewSet(viewsets.ModelViewSet):
    queryset = InventoryTransaction.objects.all()
    serializer_class = InventoryTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageInventory()]
        return [CanManageInventory()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'technician':
            return InventoryTransaction.objects.filter(technician=user)
        return InventoryTransaction.objects.all()

    def perform_create(self, serializer):
        try:
            serializer.save(performed_by=self.request.user)
        except DjangoValidationError as exc:
            raise_api_validation_error(exc)

    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent transactions"""
        try:
            limit = int(request.query_params.get('limit', 20))
        except (TypeError, ValueError):
            return Response({'limit': 'Limit must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
        limit = max(1, min(limit, 100))
        transactions = self.get_queryset().order_by('-id')[:limit]
        serializer = self.get_serializer(transactions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_item(self, request):
        """Get transactions for a specific item — respects role-based filtering"""
        item_id = request.query_params.get('item_id')
        if not item_id:
            return Response({'error': 'item_id required'}, status=400)
        try:
            item_id = int(item_id)
        except (TypeError, ValueError):
            return Response(
                {'item_id': 'item_id must be an integer.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reuse get_queryset so technicians only see their own transactions
        transactions = self.get_queryset().filter(item_id=item_id)
        serializer = self.get_serializer(transactions, many=True)
        return Response(serializer.data)


class InventoryReservationViewSet(viewsets.ModelViewSet):
    queryset = InventoryReservation.objects.select_related(
        'item', 'technician', 'service_ticket',
        'service_ticket__request', 'service_ticket__request__service_type',
    ).order_by('-required_date', '-id')
    serializer_class = InventoryReservationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['create', 'update', 'partial_update', 'destroy', 'fulfill', 'cancel']:
            return [CanManageInventory()]
        return [CanManageInventory()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'technician':
            queryset = self.queryset.filter(technician=user)
        else:
            queryset = self.queryset

        item_id = self.request.query_params.get('item_id')
        if item_id:
            try:
                item_id = int(item_id)
            except (TypeError, ValueError):
                raise ApiValidationError({'item_id': 'item_id must be an integer.'})
            queryset = queryset.filter(item_id=item_id)

        reservation_status = self.request.query_params.get('status')
        if reservation_status:
            if reservation_status not in {'pending', 'fulfilled', 'cancelled'}:
                raise ApiValidationError({'status': 'Unknown reservation status.'})
            queryset = queryset.filter(status=reservation_status)

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reservation = create_pending_reservation(
                item=serializer.validated_data['item'],
                quantity=serializer.validated_data['quantity'],
                technician=serializer.validated_data['technician'],
                required_date=serializer.validated_data['required_date'],
                service_ticket=serializer.validated_data.get('service_ticket'),
                performed_by=request.user,
                notes=serializer.validated_data.get('notes') or 'Manual reservation',
            )
        except DjangoValidationError as exc:
            raise_api_validation_error(exc)
        output_serializer = self.get_serializer(reservation)
        headers = self.get_success_headers(output_serializer.data)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'])
    def fulfill(self, request, pk=None):
        """Approve a pending reservation and issue its held stock."""
        reservation = self.get_object()

        if reservation.status != 'pending':
            return Response({'error': 'Only pending reservations can be fulfilled.'}, status=400)

        reason = str(request.data.get('reason') or '').strip()
        if len(reason) > 2000:
            return Response(
                {'reason': 'Approval notes cannot exceed 2000 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issue_notes = f'Approved and issued reservation #{reservation.id}'
        if reason:
            issue_notes = f'{issue_notes}: {reason}'

        try:
            fulfilled = fulfill_pending_reservation(
                reservation,
                performed_by=request.user,
                notes=issue_notes,
            )
        except DjangoValidationError as exc:
            raise_api_validation_error(exc)
        if not fulfilled:
            return Response(
                {'error': 'Only pending reservations can be fulfilled.'},
                status=status.HTTP_409_CONFLICT,
            )
        ticket = reservation.service_ticket
        send_user_notification(
            user=reservation.technician,
            title=(
                f'Equipment Approved for Ticket #{ticket.id}'
                if ticket else
                'Equipment Request Approved'
            ),
            body=(
                f'{reservation.item.name} x{reservation.quantity} was approved and issued.'
                + (f' Note: {reason}' if reason else '')
            ),
            notification_type='success',
            ticket=ticket,
            request=ticket.request if ticket else None,
        )
        return Response({
            'status': 'Reservation approved and issued',
            'reservation': self.get_serializer(
                InventoryReservation.objects.select_related(
                    'item', 'technician', 'service_ticket',
                    'service_ticket__request', 'service_ticket__request__service_type',
                ).get(pk=reservation.pk)
            ).data,
        })

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Reject a pending reservation and release its held stock."""
        reservation = self.get_object()

        if reservation.status != 'pending':
            return Response({'error': 'Only pending reservations can be cancelled.'}, status=400)

        reason = str(request.data.get('reason') or '').strip()
        if len(reason) < 8:
            return Response(
                {'reason': 'Enter a clear rejection reason of at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(reason) > 2000:
            return Response(
                {'reason': 'The rejection reason cannot exceed 2000 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            cancelled = cancel_pending_reservation(
                reservation,
                performed_by=request.user,
                notes=f'Rejected reservation #{reservation.id}: {reason}',
            )
        except DjangoValidationError as exc:
            raise_api_validation_error(exc)
        if not cancelled:
            return Response(
                {'error': 'Only pending reservations can be cancelled.'},
                status=status.HTTP_409_CONFLICT,
            )
        ticket = reservation.service_ticket
        send_user_notification(
            user=reservation.technician,
            title=(
                f'Equipment Request Rejected for Ticket #{ticket.id}'
                if ticket else
                'Equipment Request Rejected'
            ),
            body=f'{reservation.item.name} x{reservation.quantity} was not approved. Reason: {reason}',
            notification_type='warning',
            ticket=ticket,
            request=ticket.request if ticket else None,
        )
        return Response({
            'status': 'Reservation rejected',
            'reservation': self.get_serializer(
                InventoryReservation.objects.select_related(
                    'item', 'technician', 'service_ticket',
                    'service_ticket__request', 'service_ticket__request__service_type',
                ).get(pk=reservation.pk)
            ).data,
        })

    @action(detail=False, methods=['post'], url_path='decide-ticket')
    def decide_ticket(self, request):
        """Apply item-level decisions to pending reservations for one ticket."""
        try:
            ticket_id = int(request.data.get('ticket_id'))
        except (TypeError, ValueError):
            return Response(
                {'ticket_id': 'A valid service ticket ID is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_decisions = request.data.get('decisions')
        legacy_decision = str(request.data.get('decision') or '').strip().lower()
        legacy_reason = str(request.data.get('reason') or '').strip()
        if raw_decisions is None:
            if legacy_decision not in {'approve', 'reject'}:
                return Response(
                    {'decision': 'Decision must be either approve or reject.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            raw_decisions = None
        elif not isinstance(raw_decisions, list) or not raw_decisions:
            return Response(
                {'decisions': 'Provide at least one equipment-line decision.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        parsed_decisions = {}
        if raw_decisions is not None:
            for index, raw_decision in enumerate(raw_decisions):
                if not isinstance(raw_decision, dict):
                    return Response(
                        {'decisions': f'Decision {index + 1} must be an object.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                try:
                    reservation_id = int(raw_decision.get('reservation_id'))
                except (TypeError, ValueError):
                    return Response(
                        {'decisions': f'Decision {index + 1} requires a valid reservation ID.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                decision = str(raw_decision.get('decision') or '').strip().lower()
                reason = str(raw_decision.get('reason') or '').strip()
                if decision not in {'approve', 'reject'}:
                    return Response(
                        {'decisions': f'Decision {index + 1} must be either approve or reject.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if reservation_id in parsed_decisions:
                    return Response(
                        {'decisions': f'Reservation #{reservation_id} has more than one decision.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if decision == 'reject' and len(reason) < 8:
                    return Response(
                        {'decisions': f'Enter a rejection reason of at least 8 characters for reservation #{reservation_id}.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if len(reason) > 2000:
                    return Response(
                        {'decisions': f'Decision notes for reservation #{reservation_id} cannot exceed 2000 characters.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                parsed_decisions[reservation_id] = {
                    'decision': decision,
                    'reason': reason,
                }
        else:
            if legacy_decision == 'reject' and len(legacy_reason) < 8:
                return Response(
                    {'reason': 'Enter a clear rejection reason of at least 8 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if len(legacy_reason) > 2000:
                return Response(
                    {'reason': 'Decision notes cannot exceed 2000 characters.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            pending_reservations = list(
                InventoryReservation.objects.select_for_update().select_related(
                    'item', 'technician', 'service_ticket',
                    'service_ticket__request', 'service_ticket__request__service_type',
                ).filter(
                    service_ticket_id=ticket_id,
                    status='pending',
                ).order_by('id')
            )
            if not pending_reservations:
                return Response(
                    {'error': 'This ticket has no pending equipment request to decide.'},
                    status=status.HTTP_409_CONFLICT,
                )

            ticket = pending_reservations[0].service_ticket
            if raw_decisions is None:
                reservations = pending_reservations
                parsed_decisions = {
                    reservation.id: {
                        'decision': legacy_decision,
                        'reason': legacy_reason,
                    }
                    for reservation in reservations
                }
            else:
                pending_by_id = {
                    reservation.id: reservation
                    for reservation in pending_reservations
                }
                missing_ids = sorted(set(parsed_decisions) - set(pending_by_id))
                if missing_ids:
                    return Response(
                        {
                            'error': (
                                'One or more equipment lines are no longer pending on this ticket. '
                                'Refresh and review the request again.'
                            ),
                            'reservation_ids': missing_ids,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                reservations = [
                    pending_by_id[reservation_id]
                    for reservation_id in parsed_decisions
                ]

            for reservation in reservations:
                line_decision = parsed_decisions[reservation.id]
                decision = line_decision['decision']
                reason = line_decision['reason']
                try:
                    if decision == 'approve':
                        notes = f'Approved and issued ticket equipment line for ticket #{ticket_id}'
                        if reason:
                            notes = f'{notes}: {reason}'
                        changed = fulfill_pending_reservation(
                            reservation,
                            performed_by=request.user,
                            notes=notes,
                        )
                    else:
                        changed = cancel_pending_reservation(
                            reservation,
                            performed_by=request.user,
                            notes=f'Rejected ticket equipment line for ticket #{ticket_id}: {reason}',
                        )
                except DjangoValidationError as exc:
                    raise_api_validation_error(exc)
                if not changed:
                    raise ApiValidationError({
                        'detail': 'The equipment request changed while it was being reviewed. Refresh and try again.',
                    })

            reservations_by_technician = {}
            for reservation in reservations:
                reservations_by_technician.setdefault(reservation.technician_id, []).append(reservation)

            for technician_reservations in reservations_by_technician.values():
                technician = technician_reservations[0].technician
                approved_summary = ', '.join(
                    f'{reservation.item.name} x{reservation.quantity}'
                    for reservation in technician_reservations
                    if parsed_decisions[reservation.id]['decision'] == 'approve'
                )
                rejected_summary = ', '.join(
                    (
                        f"{reservation.item.name} x{reservation.quantity} "
                        f"({parsed_decisions[reservation.id]['reason']})"
                    )
                    for reservation in technician_reservations
                    if parsed_decisions[reservation.id]['decision'] == 'reject'
                )
                if approved_summary and rejected_summary:
                    title = f'Equipment Partially Approved for Ticket #{ticket_id}'
                    body = f'Issued: {approved_summary}. Not approved: {rejected_summary}.'
                    notification_type = 'warning'
                elif approved_summary:
                    title = f'Equipment Approved for Ticket #{ticket_id}'
                    body = f'The equipment request was approved and issued: {approved_summary}.'
                    notification_type = 'success'
                else:
                    title = f'Equipment Request Rejected for Ticket #{ticket_id}'
                    body = f'The equipment request was not approved: {rejected_summary}.'
                    notification_type = 'warning'
                send_user_notification(
                    user=technician,
                    title=title,
                    body=body,
                    notification_type=notification_type,
                    ticket=ticket,
                    request=ticket.request,
                )

        updated_reservations = InventoryReservation.objects.select_related(
            'item', 'technician', 'service_ticket',
            'service_ticket__request', 'service_ticket__request__service_type',
        ).filter(pk__in=[reservation.pk for reservation in reservations]).order_by('id')
        approved_count = sum(
            1 for reservation in reservations
            if parsed_decisions[reservation.id]['decision'] == 'approve'
        )
        rejected_count = len(reservations) - approved_count
        return Response({
            'status': 'Ticket equipment decisions applied',
            'ticket_id': ticket_id,
            'reservation_count': len(reservations),
            'approved_count': approved_count,
            'rejected_count': rejected_count,
            'remaining_pending_count': InventoryReservation.objects.filter(
                service_ticket_id=ticket_id,
                status='pending',
            ).count(),
            'reservations': self.get_serializer(updated_reservations, many=True).data,
        })

    @action(detail=False, methods=['get'])
    def pending(self, request):
        """Get all pending reservations"""
        reservations = self.get_queryset().filter(status='pending')
        serializer = self.get_serializer(reservations, many=True)
        return Response(serializer.data)


class ServiceTypeInventoryRequirementViewSet(viewsets.ModelViewSet):
    queryset = ServiceTypeInventoryRequirement.objects.select_related('service_type', 'item')
    serializer_class = ServiceTypeInventoryRequirementSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageInventory()]
        return [CanManageInventory()]
