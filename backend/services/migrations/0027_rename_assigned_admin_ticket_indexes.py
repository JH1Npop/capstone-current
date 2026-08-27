from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0026_rename_ticket_supervisor_to_assigned_admin'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='serviceticket',
            index=models.Index(
                fields=['assigned_admin_id', 'status'],
                name='services_se_assigne_9052a0_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='serviceticket',
            index=models.Index(
                fields=['assigned_admin_id', 'created_at'],
                name='services_se_assigne_55e7bc_idx',
            ),
        ),
    ]
