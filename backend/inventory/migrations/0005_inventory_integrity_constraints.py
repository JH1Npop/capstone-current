from django.db import migrations, models


GENERATED_ALIGNMENT_NOTE = 'Auto-aligned with AC Service volume'
VALID_RESERVATION_STATUSES = ['pending', 'fulfilled', 'cancelled']


def prepare_existing_inventory_data(apps, schema_editor):
    """Normalize one known legacy import, then refuse unsafe constraint creation."""
    InventoryItem = apps.get_model('inventory', 'InventoryItem')
    InventoryReservation = apps.get_model('inventory', 'InventoryReservation')
    InventoryTransaction = apps.get_model('inventory', 'InventoryTransaction')
    Requirement = apps.get_model('inventory', 'ServiceTypeInventoryRequirement')

    generated_negative_issues = InventoryTransaction.objects.filter(
        transaction_type='issue',
        quantity__lt=0,
        notes=GENERATED_ALIGNMENT_NOTE,
    )
    for transaction in generated_negative_issues.iterator():
        InventoryTransaction.objects.filter(pk=transaction.pk).update(
            quantity=abs(transaction.quantity),
        )

    invalid_counts = {
        'items': InventoryItem.objects.filter(
            models.Q(quantity__lt=0)
            | models.Q(minimum_stock__lt=0)
            | models.Q(reserved_quantity__lt=0)
            | models.Q(reserved_quantity__gt=models.F('quantity'))
            | models.Q(low_stock_threshold__lt=0)
            | models.Q(low_stock_threshold__gt=100)
            | models.Q(unit_price__lt=0)
            | models.Q(total_value__lt=0)
        ).count(),
        'transactions': InventoryTransaction.objects.filter(
            models.Q(quantity__lt=0)
            | (models.Q(quantity=0) & ~models.Q(transaction_type='adjustment'))
        ).count(),
        'reservations': InventoryReservation.objects.filter(
            models.Q(quantity__lte=0)
            | ~models.Q(status__in=VALID_RESERVATION_STATUSES)
        ).count(),
        'requirements': Requirement.objects.filter(quantity__lte=0).count(),
    }
    invalid_counts = {name: count for name, count in invalid_counts.items() if count}
    if invalid_counts:
        details = ', '.join(f'{name}={count}' for name, count in invalid_counts.items())
        raise RuntimeError(
            'Inventory integrity migration stopped because unsupported legacy data '
            f'must be reviewed manually: {details}.'
        )


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0004_inventoryitem_spec_fields'),
    ]

    operations = [
        migrations.RunPython(prepare_existing_inventory_data, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='inventoryreservation',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending'),
                    ('fulfilled', 'Fulfilled'),
                    ('cancelled', 'Cancelled'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(quantity__gte=0),
                name='inventory_item_quantity_gte_0',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(minimum_stock__gte=0),
                name='inventory_item_min_stock_gte_0',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(reserved_quantity__gte=0),
                name='inventory_item_reserved_gte_0',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(reserved_quantity__lte=models.F('quantity')),
                name='inventory_item_reserved_lte_qty',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(low_stock_threshold__gte=0, low_stock_threshold__lte=100),
                name='inventory_item_threshold_0_100',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(unit_price__gte=0),
                name='inventory_item_unit_price_gte_0',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.CheckConstraint(
                condition=models.Q(total_value__gte=0),
                name='inventory_item_total_value_gte_0',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryreservation',
            constraint=models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name='inventory_reservation_quantity_gt_0',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryreservation',
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=VALID_RESERVATION_STATUSES),
                name='inventory_reservation_valid_status',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventorytransaction',
            constraint=models.CheckConstraint(
                condition=(
                    models.Q(transaction_type='adjustment', quantity__gte=0)
                    | models.Q(
                        transaction_type__in=[
                            'purchase',
                            'issue',
                            'return',
                            'transfer',
                            'reservation',
                            'cancellation',
                        ],
                        quantity__gt=0,
                    )
                ),
                name='inventory_transaction_valid_qty',
            ),
        ),
        migrations.AddConstraint(
            model_name='servicetypeinventoryrequirement',
            constraint=models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name='inventory_requirement_quantity_gt_0',
            ),
        ),
    ]
