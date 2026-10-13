from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0058_seed_default_service_catalog'),
    ]

    operations = [
        migrations.AddField(
            model_name='maintenanceschedule',
            name='client_due_notified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
