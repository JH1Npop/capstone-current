from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('services', '0052_service_customization_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicerequest',
            name='idempotency_key',
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
        migrations.AddConstraint(
            model_name='servicerequest',
            constraint=models.UniqueConstraint(
                fields=('client', 'idempotency_key'),
                name='unique_service_request_idempotency_key_per_client',
            ),
        ),
    ]
