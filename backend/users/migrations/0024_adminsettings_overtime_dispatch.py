from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0023_user_profile_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminsettings',
            name='allow_overtime_dispatch',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='overtime_daily_capacity_minutes',
            field=models.PositiveSmallIntegerField(default=600),
        ),
    ]
