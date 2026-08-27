from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0023_servicerequestservice'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicerequest',
            name='request_source',
            field=models.CharField(
                choices=[
                    ('client_portal', 'Client Portal'),
                    ('walk_in', 'Walk-in'),
                    ('phone', 'Phone'),
                    ('admin_created', 'Admin Created'),
                ],
                default='client_portal',
                max_length=30,
            ),
        ),
        migrations.AddIndex(
            model_name='servicerequest',
            index=models.Index(fields=['request_source', 'request_date'], name='services_se_request_b828c5_idx'),
        ),
    ]
