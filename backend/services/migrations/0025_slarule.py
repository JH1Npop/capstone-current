from django.db import migrations, models


DEFAULT_RULES = [
    ('approval_delay', 180, 480),
    ('assignment_delay', 120, 360),
    ('start_delay', 15, 60),
    ('execution_delay', 90, 120),
    ('reschedule_delay', 240, 720),
]


def seed_sla_rules(apps, schema_editor):
    SLARule = apps.get_model('services', 'SLARule')
    for key, warning_minutes, overdue_minutes in DEFAULT_RULES:
        SLARule.objects.get_or_create(
            key=key,
            defaults={
                'warning_minutes': warning_minutes,
                'overdue_minutes': overdue_minutes,
                'is_active': True,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0024_servicerequest_request_source'),
    ]

    operations = [
        migrations.CreateModel(
            name='SLARule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(choices=[('approval_delay', 'Approval delay'), ('assignment_delay', 'Assignment delay'), ('start_delay', 'Start delay'), ('execution_delay', 'Execution delay'), ('reschedule_delay', 'Reschedule delay')], max_length=40, unique=True)),
                ('warning_minutes', models.PositiveIntegerField()),
                ('overdue_minutes', models.PositiveIntegerField()),
                ('is_active', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['key'],
            },
        ),
        migrations.RunPython(seed_sla_rules, migrations.RunPython.noop),
    ]
