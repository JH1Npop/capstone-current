from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0049_alter_generateddocument_data_json_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicetype',
            name='requires_site_inspection',
            field=models.BooleanField(
                default=False,
                help_text='Require an inspection dispatch before service work can begin',
            ),
        ),
    ]
