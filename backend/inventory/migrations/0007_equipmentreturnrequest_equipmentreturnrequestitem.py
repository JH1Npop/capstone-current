import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0006_inventorycategory_inventory_category_name_ci_unique'),
        ('services', '0057_salesrecord_salesrecordline'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EquipmentReturnRequest',
            fields=[
                ('id', models.BigAutoField(db_column='equipment_return_request_id', primary_key=True, serialize=False)),
                ('condition', models.CharField(choices=[('sealed', 'Sealed / unused'), ('usable', 'Opened but usable'), ('damaged', 'Damaged'), ('incomplete', 'Incomplete')], max_length=20)),
                ('notes', models.TextField()),
                ('status', models.CharField(choices=[('pending', 'Pending verification'), ('verified', 'Verified and returned'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('reviewed_condition', models.CharField(blank=True, choices=[('sealed', 'Sealed / unused'), ('usable', 'Opened but usable'), ('damaged', 'Damaged'), ('incomplete', 'Incomplete')], default='', max_length=20)),
                ('review_notes', models.TextField(blank=True, default='')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_equipment_returns', to=settings.AUTH_USER_MODEL)),
                ('service_ticket', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='equipment_return_requests', to='services.serviceticket')),
                ('submitted_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='submitted_equipment_returns', to=settings.AUTH_USER_MODEL)),
                ('technician', models.ForeignKey(limit_choices_to={'role': 'technician'}, on_delete=django.db.models.deletion.PROTECT, related_name='equipment_return_requests', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='EquipmentReturnRequestItem',
            fields=[
                ('id', models.BigAutoField(db_column='equipment_return_request_item_id', primary_key=True, serialize=False)),
                ('quantity', models.PositiveIntegerField()),
                ('item', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='equipment_return_request_items', to='inventory.inventoryitem')),
                ('return_request', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='inventory.equipmentreturnrequest')),
            ],
            options={'ordering': ['id']},
        ),
        migrations.AddConstraint(
            model_name='equipmentreturnrequest',
            constraint=models.CheckConstraint(condition=models.Q(('status__in', ['pending', 'verified', 'rejected'])), name='equipment_return_request_valid_status'),
        ),
        migrations.AddConstraint(
            model_name='equipmentreturnrequestitem',
            constraint=models.UniqueConstraint(fields=('return_request', 'item'), name='equipment_return_request_unique_item'),
        ),
        migrations.AddConstraint(
            model_name='equipmentreturnrequestitem',
            constraint=models.CheckConstraint(condition=models.Q(('quantity__gt', 0)), name='equipment_return_request_item_qty_gt_0'),
        ),
    ]
