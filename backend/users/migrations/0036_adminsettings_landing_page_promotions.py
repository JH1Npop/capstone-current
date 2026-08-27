from django.db import migrations, models
import users.models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0035_adminsettings_landing_page'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminsettings',
            name='landing_page_promotions',
            field=models.JSONField(blank=True, default=users.models.default_landing_page_promotions),
        ),
    ]
