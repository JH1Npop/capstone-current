from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('services', '0055_unique_demand_forecast_period'),
    ]

    operations = [
        migrations.CreateModel(
            name='AfterSalesCaseEvent',
            fields=[
                ('id', models.BigAutoField(db_column='after_sales_case_event_id', primary_key=True, serialize=False)),
                ('event_type', models.CharField(choices=[('created', 'Created'), ('status_changed', 'Status Changed'), ('assigned', 'Assigned'), ('reassigned', 'Reassigned'), ('updated', 'Updated')], max_length=30)),
                ('from_status', models.CharField(blank=True, default='', max_length=20)),
                ('to_status', models.CharField(blank=True, default='', max_length=20)),
                ('notes', models.TextField(blank=True, default='')),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='after_sales_case_events', to=settings.AUTH_USER_MODEL)),
                ('case', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='services.aftersalescase')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
                'indexes': [
                    models.Index(fields=['case', '-created_at'], name='svc_afcase_evt_case_time_idx'),
                    models.Index(fields=['event_type', '-created_at'], name='svc_afcase_evt_type_time_idx'),
                ],
            },
        ),
    ]
