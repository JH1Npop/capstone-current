from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0025_slarule'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='serviceticket',
            name='services_se_supervi_76c7e4_idx',
        ),
        migrations.RemoveIndex(
            model_name='serviceticket',
            name='services_se_supervi_45028b_idx',
        ),
        migrations.RenameField(
            model_name='serviceticket',
            old_name='supervisor',
            new_name='assigned_admin',
        ),
        migrations.AlterField(
            model_name='serviceticket',
            name='assigned_admin',
            field=models.ForeignKey(
                limit_choices_to={'role__in': ['superadmin', 'admin']},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_admin_tickets',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
