import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('services', '0062_servicetype_inspection_procedures'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CalendarClosure',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('time_slot', models.CharField(choices=[('all_day', 'All day'), ('morning', 'Morning (8 AM - 11 AM)'), ('midday', 'Midday (11 AM - 2 PM)'), ('afternoon', 'Afternoon (2 PM - 5 PM)')], default='all_day', max_length=20)),
                ('reason', models.CharField(max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('reopened_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_calendar_closures', to=settings.AUTH_USER_MODEL)),
                ('reopened_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reopened_calendar_closures', to=settings.AUTH_USER_MODEL)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_calendar_closures', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['date', 'time_slot', 'id'],
                'indexes': [models.Index(fields=['is_active', 'date'], name='calclosure_active_date_idx')],
                'constraints': [models.UniqueConstraint(fields=('date', 'time_slot'), name='unique_calendar_closure_slot')],
            },
        ),
    ]
