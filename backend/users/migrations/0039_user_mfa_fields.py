from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0038_adminsettings_landing_page_projects'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='mfa_confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='mfa_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='user',
            name='mfa_recovery_code_hashes',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='user',
            name='mfa_secret_encrypted',
            field=models.TextField(blank=True, default=''),
        ),
    ]
