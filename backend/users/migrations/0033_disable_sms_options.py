from django.db import migrations, models


def migrate_sms_preferences_to_email(apps, schema_editor):
    ClientProfile = apps.get_model('users', 'ClientProfile')
    ClientProfile.objects.filter(preferred_contact_method='sms').update(
        preferred_contact_method='email'
    )


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0032_alter_activitylog_metadata_and_more'),
    ]

    operations = [
        migrations.RunPython(
            migrate_sms_preferences_to_email,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='clientprofile',
            name='preferred_contact_method',
            field=models.CharField(
                choices=[('email', 'Email'), ('phone', 'Phone')],
                default='email',
                max_length=20,
            ),
        ),
        migrations.RemoveField(
            model_name='adminsettings',
            name='sms_notifications_enabled',
        ),
    ]
