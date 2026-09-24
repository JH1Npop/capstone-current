
from django.db import transaction
from django.db.models import Sum, Count
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
        items = [item for item in InventoryItem.objects.all() if item.is_low_stock]
        serializer = self.get_serializer(items, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def statistics(self, request):
        """Get inventory statistics"""
        from django.db.models import ExpressionWrapper, DecimalField

        total_items = InventoryItem.objects.count()
        total_value = InventoryItem.objects.aggregate(
            total=Sum('total_value')
        )['total'] or 0

        low_stock_count = sum(1 for item in InventoryItem.objects.all() if item.is_low_stock)

        out_of_stock = InventoryItem.objects.filter(quantity=0).count()

        # By status — single query using values/annotate
        status_counts = {}
        for row in InventoryItem.objects.values('status').annotate(count=Count('id')):
            status_counts[row['status']] = row['count']

        # By category
        category_counts = InventoryItem.objects.values(
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
        """Mark reservation as fulfilled and issue items"""
        reservation = self.get_object()

        if reservation.status != 'pending':
            return Response({'error': 'Only pending reservations can be fulfilled.'}, status=400)

        try:
            fulfilled = fulfill_pending_reservation(
                reservation,
                performed_by=request.user,
                notes=f"Fulfilling reservation #{reservation.id}",
            )
        except DjangoValidationError as exc:
            raise_api_validation_error(exc)
        if not fulfilled:
            return Response(
                {'error': 'Only pending reservations can be fulfilled.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({'status': 'Reservation fulfilled'})

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """Cancel reservation"""
        reservation = self.get_object()

        if reservation.status != 'pending':
            return Response({'error': 'Only pending reservations can be cancelled.'}, status=400)

        try:
            cancelled = cancel_pending_reservation(
                reservation,
                performed_by=request.user,
                notes=f"Cancelled reservation #{reservation.id}",
            )
        except DjangoValidationError as exc:
            raise_api_validation_error(exc)
        if not cancelled:
            return Response(
                {'error': 'Only pending reservations can be cancelled.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response({'status': 'Reservation cancelled'})

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
