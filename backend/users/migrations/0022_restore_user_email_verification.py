from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0021_remove_user_email_verification_sent_at_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='email_verified',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='user',
            name='email_verification_sent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
