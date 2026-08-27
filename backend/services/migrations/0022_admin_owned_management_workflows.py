from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('services', '0021_alter_servicerequest_request_date'),
    ]

    operations = [
        migrations.AlterField(
            model_name='aftersalescase',
            name='assigned_to',
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={'role__in': ['superadmin', 'admin']},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assigned_after_sales_cases',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='serviceticket',
            name='supervisor',
            field=models.ForeignKey(
                limit_choices_to={'role__in': ['superadmin', 'admin']},
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='supervised_tickets',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
