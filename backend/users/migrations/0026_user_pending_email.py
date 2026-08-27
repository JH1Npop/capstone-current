from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0025_activitylog_actor_display_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='pending_email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='pending_email_verification_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
