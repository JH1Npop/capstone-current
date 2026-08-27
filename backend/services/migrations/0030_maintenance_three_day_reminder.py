from datetime import timedelta

from django.db import migrations, models


def update_existing_reminder_windows(apps, schema_editor):
    MaintenanceSchedule = apps.get_model('services', 'MaintenanceSchedule')
    for schedule in MaintenanceSchedule.objects.exclude(status__in=['completed', 'dismissed']):
        schedule.follow_up_window_days = 7
        schedule.notify_on_date = schedule.next_due_date - timedelta(days=7)
        schedule.save(update_fields=['follow_up_window_days', 'notify_on_date', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0029_remove_serviceticket_services_se_assigne_9052a0_idx_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='maintenanceschedule',
            name='follow_up_window_days',
            field=models.PositiveIntegerField(default=7),
        ),
        migrations.AddField(
            model_name='maintenanceschedule',
            name='client_three_day_notified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='maintenanceschedule',
            name='three_day_notified_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(update_existing_reminder_windows, migrations.RunPython.noop),
    ]
