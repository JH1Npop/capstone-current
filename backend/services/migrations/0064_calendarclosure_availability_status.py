from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0063_calendarclosure'),
    ]

    operations = [
        migrations.AddField(
            model_name='calendarclosure',
            name='availability_status',
            field=models.CharField(
                choices=[('limited', 'Limited'), ('closed', 'Closed')],
                default='closed',
                max_length=20,
            ),
        ),
    ]
