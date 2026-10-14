from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0039_user_mfa_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='technicianprofile',
            name='last_seen_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
