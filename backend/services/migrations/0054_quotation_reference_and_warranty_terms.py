from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('services', '0053_servicerequest_idempotency_key'),
    ]

    operations = [
        migrations.AddField(
            model_name='quotationrecord',
            name='quotation_number',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='quotationrecord',
            name='warranty_terms',
            field=models.TextField(blank=True, null=True),
        ),
    ]
