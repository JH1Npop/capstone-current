from django.conf import settings
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0029_remove_adminsettings_arrival_radius_meters_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='adminsettings',
            name='arrival_radius_meters',
            field=models.PositiveSmallIntegerField(default=30),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='location_validation_disabled_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='location_validation_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='location_validation_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='location_validation_updated_by',
            field=models.ForeignKey(blank=True, limit_choices_to={'role__in': ['admin', 'superadmin']}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='location_validation_updates', to=settings.AUTH_USER_MODEL),
        ),
    ]
