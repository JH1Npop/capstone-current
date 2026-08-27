from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('messages_app', '0005_alter_customersupportcase_id_alter_message_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='message',
            name='message_text',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='message',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='message',
            name='edited_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='message',
            name='image',
            field=models.FileField(blank=True, null=True, upload_to='message_attachments/'),
        ),
        migrations.AddField(
            model_name='message',
            name='is_deleted',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='message',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
