from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('services', '0060_client_quotation_handover_and_payments'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicetype',
            name='deposit_policy',
            field=models.CharField(
                choices=[
                    ('none', 'No deposit required'),
                    ('percentage', 'Percentage of quotation'),
                    ('fixed', 'Fixed amount'),
                ],
                default='none',
                help_text='Default deposit rule copied into new quotations for this service.',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='servicetype',
            name='deposit_value',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Percentage or fixed PHP amount, depending on deposit_policy.',
                max_digits=12,
            ),
        ),
        migrations.AddField(
            model_name='quotationrecord',
            name='deposit_policy',
            field=models.CharField(
                choices=[
                    ('none', 'No deposit required'),
                    ('percentage', 'Percentage of quotation'),
                    ('fixed', 'Fixed amount'),
                ],
                default='none',
                help_text='Snapshot of the service deposit rule when this quotation was created.',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='quotationrecord',
            name='deposit_value',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name='quotationrecord',
            name='required_deposit_amount',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name='salespayment',
            name='sales_record',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='payments',
                to='services.salesrecord',
            ),
        ),
        migrations.AddField(
            model_name='salespayment',
            name='quotation',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='deposit_payments',
                to='services.quotationrecord',
            ),
        ),
        migrations.AddConstraint(
            model_name='salespayment',
            constraint=models.CheckConstraint(
                condition=models.Q(sales_record__isnull=False) | models.Q(quotation__isnull=False),
                name='services_sales_payment_has_owner',
            ),
        ),
    ]
