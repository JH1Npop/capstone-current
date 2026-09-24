import django.db.models.functions.text
from django.db import migrations, models


def normalize_and_validate_category_names(apps, schema_editor):
    InventoryCategory = apps.get_model('inventory', 'InventoryCategory')
    normalized_names = {}
    updates = []

    for category in InventoryCategory.objects.order_by('pk').iterator():
        normalized_name = (category.name or '').strip()
        if not normalized_name:
            raise RuntimeError(
                f'Inventory category #{category.pk} has an empty name and must be reviewed.'
            )

        duplicate_id = normalized_names.get(normalized_name.casefold())
        if duplicate_id:
            raise RuntimeError(
                'Inventory category names must be unique ignoring case. '
                f'Review categories #{duplicate_id} and #{category.pk} before migrating.'
            )

        normalized_names[normalized_name.casefold()] = category.pk
        if normalized_name != category.name:
            updates.append((category.pk, normalized_name))

    for category_id, normalized_name in updates:
        InventoryCategory.objects.filter(pk=category_id).update(name=normalized_name)


def normalize_and_validate_item_skus(apps, schema_editor):
    InventoryItem = apps.get_model('inventory', 'InventoryItem')
    normalized_skus = {}
    updates = []

    for item in InventoryItem.objects.order_by('pk').iterator():
        normalized_sku = (item.sku or '').strip().upper()
        if not normalized_sku:
            raise RuntimeError(
                f'Inventory item #{item.pk} has an empty SKU and must be reviewed.'
            )

        duplicate_id = normalized_skus.get(normalized_sku.casefold())
        if duplicate_id:
            raise RuntimeError(
                'Inventory SKUs must be unique ignoring case. '
                f'Review items #{duplicate_id} and #{item.pk} before migrating.'
            )

        normalized_skus[normalized_sku.casefold()] = item.pk
        if normalized_sku != item.sku:
            updates.append((item.pk, normalized_sku))

    for item_id, normalized_sku in updates:
        InventoryItem.objects.filter(pk=item_id).update(sku=normalized_sku)


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0005_inventory_integrity_constraints'),
    ]

    operations = [
        migrations.RunPython(
            normalize_and_validate_category_names,
            migrations.RunPython.noop,
        ),
        migrations.RunPython(
            normalize_and_validate_item_skus,
            migrations.RunPython.noop,
        ),
        migrations.AddConstraint(
            model_name='inventorycategory',
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower('name'),
                name='inventory_category_name_ci_unique',
            ),
        ),
        migrations.AddConstraint(
            model_name='inventoryitem',
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower('sku'),
                name='inventory_item_sku_ci_unique',
            ),
        ),
    ]
