from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0003_alter_inventorycategory_id_alter_inventoryitem_id_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='inventoryitem',
            name='brand',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='capacity',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='model',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='size',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='inventoryitem',
            name='unit_of_measurement',
            field=models.CharField(blank=True, default='piece', help_text='Management-defined unit, e.g. piece, meter, set, roll.', max_length=50),
        ),
    ]
