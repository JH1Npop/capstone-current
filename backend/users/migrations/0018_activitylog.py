from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0017_remove_legacy_management_roles'),
    ]

    operations = [
        migrations.CreateModel(
            name='ActivityLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('actor_role', models.CharField(blank=True, default='', max_length=20)),
                ('category', models.CharField(choices=[('security', 'Security'), ('users', 'Users'), ('requests', 'Requests'), ('tickets', 'Tickets'), ('inventory', 'Inventory'), ('settings', 'Settings'), ('sla', 'SLA'), ('communication', 'Communication'), ('system', 'System')], default='system', max_length=30)),
                ('action', models.CharField(choices=[('login', 'Login'), ('logout', 'Logout'), ('create', 'Create'), ('update', 'Update'), ('delete', 'Delete'), ('assign', 'Assign'), ('reschedule', 'Reschedule'), ('complete', 'Complete'), ('cancel', 'Cancel'), ('error', 'Error'), ('system', 'System')], max_length=30)),
                ('target_app_label', models.CharField(blank=True, default='', max_length=100)),
                ('target_model', models.CharField(blank=True, default='', max_length=100)),
                ('target_id', models.PositiveIntegerField(blank=True, null=True)),
                ('target_label', models.CharField(blank=True, default='', max_length=255)),
                ('message', models.CharField(max_length=255)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activity_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Activity Log',
                'verbose_name_plural': 'Activity Logs',
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.AddIndex(
            model_name='activitylog',
            index=models.Index(fields=['category', 'created_at'], name='activity_category_time_idx'),
        ),
        migrations.AddIndex(
            model_name='activitylog',
            index=models.Index(fields=['action', 'created_at'], name='activity_action_time_idx'),
        ),
        migrations.AddIndex(
            model_name='activitylog',
            index=models.Index(fields=['target_model', 'target_id'], name='activity_target_idx'),
        ),
        migrations.AddIndex(
            model_name='activitylog',
            index=models.Index(fields=['actor', 'created_at'], name='activity_actor_time_idx'),
        ),
    ]
