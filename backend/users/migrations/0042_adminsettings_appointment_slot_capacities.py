from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0041_adminsettings_require_quotation_acceptance'),
    ]

    operations = [
        migrations.AddField(
            model_name='adminsettings',
            name='morning_appointment_capacity',
            field=models.PositiveSmallIntegerField(default=3),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='midday_appointment_capacity',
            field=models.PositiveSmallIntegerField(default=3),
        ),
        migrations.AddField(
            model_name='adminsettings',
            name='afternoon_appointment_capacity',
            field=models.PositiveSmallIntegerField(default=3),
        ),
    ]
