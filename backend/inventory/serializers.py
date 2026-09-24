
from rest_framework import serializers
from django.db import transaction
from .models import (
    InventoryCategory,
    InventoryItem,
    InventoryTransaction,
    InventoryReservation,
    ServiceTypeInventoryRequirement,
)


class InventoryCategorySerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(read_only=True)
    subcategory_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = InventoryCategory
        fields = ['id', 'name', 'description', 'parent', 'item_count', 'subcategory_count']

    def validate_name(self, value):
        name = str(value or '').strip()
        if not name:
            raise serializers.ValidationError('Category name is required.')
        duplicate = InventoryCategory.objects.filter(name__iexact=name)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError('A category with this name already exists.')
        return name

    def validate_parent(self, parent):
        if not parent or not self.instance:
            return parent
        if parent.pk == self.instance.pk:
            raise serializers.ValidationError('A category cannot be its own parent.')
        ancestor = parent
        visited = set()
        while ancestor and ancestor.pk not in visited:
            if ancestor.pk == self.instance.pk:
                raise serializers.ValidationError('Category nesting cannot contain a cycle.')
            visited.add(ancestor.pk)
            ancestor = ancestor.parent
        return parent


class InventoryItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    available_quantity = serializers.ReadOnlyField()
    is_low_stock = serializers.ReadOnlyField()
    stock_status = serializers.ReadOnlyField()

    class Meta:
        model = InventoryItem
        fields = '__all__'
        read_only_fields = ['reserved_quantity', 'total_value', 'last_notification_sent']

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError('Stock quantity cannot be negative.')
        if self.instance is not None:
            raise serializers.ValidationError('Use an inventory transaction to change stock quantity.')
        return value

    def validate_name(self, value):
        name = str(value or '').strip()
        if not name:
            raise serializers.ValidationError('Item name is required.')
        return name

    def validate_sku(self, value):
        sku = str(value or '').strip().upper()
        if not sku:
            raise serializers.ValidationError('SKU is required.')
        duplicate = InventoryItem.objects.filter(sku__iexact=sku)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError('An inventory item with this SKU already exists.')
        return sku

    def validate_unit_of_measurement(self, value):
        unit = str(value or '').strip()
        if not unit:
            raise serializers.ValidationError('Unit of measurement is required.')
        return unit

    def validate_minimum_stock(self, value):
        if value < 0:
            raise serializers.ValidationError('Minimum stock cannot be negative.')
        return value

    def validate_low_stock_threshold(self, value):
        if not 0 <= value <= 100:
            raise serializers.ValidationError('Low-stock threshold must be between 0 and 100.')
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError('Unit price cannot be negative.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        status_value = attrs.get('status', getattr(self.instance, 'status', 'available'))
        if status_value == 'retired' and self.instance and self.instance.reserved_quantity > 0:
            raise serializers.ValidationError({
                'status': 'Release or fulfill reserved stock before retiring this item.'
            })
        purchase_date = attrs.get('purchase_date', getattr(self.instance, 'purchase_date', None))
        warranty_expiry = attrs.get('warranty_expiry', getattr(self.instance, 'warranty_expiry', None))
        if purchase_date and warranty_expiry and warranty_expiry < purchase_date:
            raise serializers.ValidationError({
                'warranty_expiry': 'Warranty expiry cannot be earlier than the purchase date.'
            })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        opening_quantity = validated_data.pop('quantity', 0)
        item = InventoryItem(quantity=0, **validated_data)
        item.save(notify_low_stock=False)

        request = self.context.get('request')
        performed_by = request.user if request and request.user.is_authenticated else None
        InventoryTransaction.objects.create(
            item=item,
            transaction_type='adjustment',
            quantity=opening_quantity,
            reference_number=f'OPENING-{item.pk}',
            notes='Opening inventory balance',
            performed_by=performed_by,
        )
        item.refresh_from_db()
        return item


class InventoryTransactionSerializer(serializers.ModelSerializer):
    transaction_code = serializers.SerializerMethodField()
    item_name = serializers.CharField(source='item.name', read_only=True)
    technician_name = serializers.SerializerMethodField()
    performed_by_name = serializers.SerializerMethodField()

    def _display_name(self, user):
        if not user:
            return ''
        full_name = user.get_full_name().strip()
        return full_name or user.username

    def get_technician_name(self, obj):
        return self._display_name(obj.technician)

    def get_performed_by_name(self, obj):
        return self._display_name(obj.performed_by)

    def get_transaction_code(self, obj):
        return f'ITX-{obj.id:06d}'

    def validate(self, attrs):
        attrs = super().validate(attrs)
        transaction_type = attrs.get(
            'transaction_type',
            getattr(self.instance, 'transaction_type', None),
        )
        quantity = attrs.get('quantity', getattr(self.instance, 'quantity', None))

        if quantity is None:
            raise serializers.ValidationError({'quantity': 'Quantity is required.'})
        if quantity < 0 or (transaction_type != 'adjustment' and quantity == 0):
            raise serializers.ValidationError({
                'quantity': 'Quantity must be greater than zero, except a zero stock adjustment is allowed.'
            })
        if transaction_type == 'adjustment' and not (attrs.get('notes') or '').strip():
            raise serializers.ValidationError({
                'notes': 'A reason is required for manual stock adjustments.'
            })

        if not self.instance:
            return attrs

        immutable_fields = ['item', 'transaction_type', 'quantity']
        changed_fields = [
            field
            for field in immutable_fields
            if field in attrs and attrs[field] != getattr(self.instance, field)
        ]
        if changed_fields:
            raise serializers.ValidationError({
                field: 'This field cannot be changed after the transaction is created.'
                for field in changed_fields
            })
        return attrs

    class Meta:
        model = InventoryTransaction
        fields = '__all__'
        read_only_fields = ['performed_by', 'transaction_date']


class InventoryReservationSerializer(serializers.ModelSerializer):
    reservation_code = serializers.SerializerMethodField()
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    technician_name = serializers.CharField(source='technician.username', read_only=True)
    ticket_code = serializers.SerializerMethodField()

    def get_reservation_code(self, obj):
        return f'RSV-{obj.id:06d}'

    def get_ticket_code(self, obj):
        return f'TKT-{obj.service_ticket_id:04d}' if obj.service_ticket_id else None

    def validate(self, attrs):
        attrs = super().validate(attrs)
        quantity = int(attrs.get('quantity', getattr(self.instance, 'quantity', 0)) or 0)
        if quantity <= 0:
            raise serializers.ValidationError({'quantity': 'Quantity must be greater than zero.'})

        item = attrs.get('item') or getattr(self.instance, 'item', None)
        status_value = attrs.get('status', getattr(self.instance, 'status', 'pending'))
        if item and status_value == 'pending':
            currently_reserved = getattr(self.instance, 'quantity', 0) if getattr(self.instance, 'status', 'pending') == 'pending' else 0
            if quantity > (item.available_quantity + currently_reserved):
                raise serializers.ValidationError({
                    'quantity': f'Only {item.available_quantity + currently_reserved} unit(s) are available for reservation.',
                })

        return attrs

    class Meta:
        model = InventoryReservation
        fields = '__all__'
        read_only_fields = ['status', 'created_at']


class ServiceTypeInventoryRequirementSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    available_quantity = serializers.IntegerField(source='item.available_quantity', read_only=True)

    def validate_quantity(self, value):
        if int(value) <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        item = attrs.get('item', getattr(self.instance, 'item', None))
        item_is_changing = not self.instance or (
            'item' in attrs and attrs['item'].pk != self.instance.item_id
        )
        if item and item.status == 'retired' and item_is_changing:
            raise serializers.ValidationError({
                'item': 'Retired inventory items cannot be added to service templates.'
            })
        return attrs

    class Meta:
        model = ServiceTypeInventoryRequirement
        fields = '__all__'
