import django.db.models.deletion
import services.models.sales
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0006_inventorycategory_inventory_category_name_ci_unique'),
        ('services', '0056_aftersalescaseevent'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SalesRecord',
            fields=[
                ('id', models.BigAutoField(db_column='sales_record_id', primary_key=True, serialize=False)),
                ('record_number', models.CharField(default=services.models.sales.generate_sales_record_number, max_length=32, unique=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('confirmed', 'Confirmed'), ('voided', 'Voided')], default='draft', max_length=20)),
                ('sale_date', models.DateField(blank=True, null=True)),
                ('currency_code', models.CharField(default='PHP', max_length=3)),
                ('agreed_total', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('source_snapshot', models.JSONField(blank=True, default=dict)),
                ('confirmed_at', models.DateTimeField(blank=True, null=True)),
                ('voided_at', models.DateTimeField(blank=True, null=True)),
                ('void_reason', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('client', models.ForeignKey(limit_choices_to={'role': 'client'}, on_delete=django.db.models.deletion.PROTECT, related_name='sales_records', to=settings.AUTH_USER_MODEL)),
                ('confirmed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='confirmed_sales_records', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_sales_records', to=settings.AUTH_USER_MODEL)),
                ('quotation', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sales_records', to='services.quotationrecord')),
                ('replaces', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='replacement', to='services.salesrecord')),
                ('ticket', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sales_records', to='services.serviceticket')),
                ('voided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='voided_sales_records', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='SalesRecordLine',
            fields=[
                ('id', models.BigAutoField(db_column='sales_record_line_id', primary_key=True, serialize=False)),
                ('line_type', models.CharField(choices=[('service', 'Service'), ('product', 'Product'), ('equipment', 'Installed Equipment'), ('other', 'Other')], max_length=20)),
                ('name', models.CharField(max_length=255)),
                ('sku', models.CharField(blank=True, default='', max_length=80)),
                ('quantity', models.DecimalField(decimal_places=3, default=1, max_digits=12)),
                ('unit', models.CharField(blank=True, default='', max_length=50)),
                ('unit_price', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('line_total', models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True)),
                ('source_snapshot', models.JSONField(blank=True, default=dict)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('installed_equipment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='services.installedequipment')),
                ('inventory_item', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='inventory.inventoryitem')),
                ('sales_record', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='line_items', to='services.salesrecord')),
                ('service_type', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='services.servicetype')),
            ],
            options={'ordering': ['sort_order', 'id']},
        ),
        migrations.AddIndex(model_name='salesrecord', index=models.Index(fields=['client', '-sale_date'], name='services_sa_client__c93c93_idx')),
        migrations.AddIndex(model_name='salesrecord', index=models.Index(fields=['status', '-created_at'], name='services_sa_status_bde24d_idx')),
        migrations.AddIndex(model_name='salesrecord', index=models.Index(fields=['ticket', 'status'], name='services_sa_ticket__b4a4f9_idx')),
        migrations.AddConstraint(model_name='salesrecord', constraint=models.UniqueConstraint(condition=models.Q(('status__in', ['draft', 'confirmed'])), fields=('ticket',), name='services_sales_record_one_active_per_ticket')),
        migrations.AddConstraint(model_name='salesrecord', constraint=models.CheckConstraint(condition=models.Q(('agreed_total__isnull', True), ('agreed_total__gte', 0), _connector='OR'), name='services_sales_record_total_gte_0')),
        migrations.AddConstraint(model_name='salesrecordline', constraint=models.CheckConstraint(condition=models.Q(('quantity__gt', 0)), name='services_sales_record_line_qty_gt_0')),
        migrations.AddConstraint(model_name='salesrecordline', constraint=models.CheckConstraint(condition=models.Q(('unit_price__isnull', True), ('unit_price__gte', 0), _connector='OR'), name='services_sales_record_line_price_gte_0')),
        migrations.AddConstraint(model_name='salesrecordline', constraint=models.CheckConstraint(condition=models.Q(('line_total__isnull', True), ('line_total__gte', 0), _connector='OR'), name='services_sales_record_line_total_gte_0')),
    ]
