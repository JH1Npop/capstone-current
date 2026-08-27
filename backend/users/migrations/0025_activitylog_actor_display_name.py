from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0024_adminsettings_overtime_dispatch'),
    ]

    operations = [
        migrations.AddField(
            model_name='activitylog',
            name='actor_display_name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
    ]
