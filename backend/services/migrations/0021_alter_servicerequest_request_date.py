from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0020_inspectionchecklist_submitted_at_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='servicerequest',
            name='request_date',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
    ]
