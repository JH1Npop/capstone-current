from django.db import migrations, models
import users.models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0034_admin_operational_settings'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminsettings',
            name='landing_page_content',
            field=models.JSONField(blank=True, default=users.models.default_landing_page_content),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='solar_calculator_settings',
            field=models.JSONField(blank=True, default=users.models.default_solar_calculator_settings),
        ),
    ]
