from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0030_maintenance_three_day_reminder'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicetype',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
