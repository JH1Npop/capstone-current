from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0027_rename_assigned_admin_ticket_indexes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='serviceticket',
            name='status',
            field=models.CharField(
                choices=[
                    ('Not Started', 'Not Started'),
                    ('For Inspection', 'For Inspection'),
                    ('Inspection Completed', 'Inspection Completed'),
                    ('Ready for Service', 'Ready for Service'),
                    ('Awaiting Materials', 'Awaiting Materials'),
                    ('In Progress', 'In Progress'),
                    ('Completed', 'Completed'),
                    ('On Hold', 'On Hold'),
                    ('Cancelled', 'Cancelled'),
                ],
                default='Not Started',
                max_length=50,
            ),
        ),
    ]
