from django.db import migrations, models
import users.models


class Migration(migrations.Migration):
    dependencies = [('users', '0033_disable_sms_options')]

    operations = [
        migrations.AddField(model_name='adminsettings', name='enable_in_app_notifications', field=models.BooleanField(default=True)),
        migrations.AddField(model_name='adminsettings', name='enable_email_notifications', field=models.BooleanField(default=True)),
        migrations.AddField(model_name='adminsettings', name='business_days', field=models.JSONField(default=users.models.default_business_days)),
        migrations.AddField(model_name='adminsettings', name='business_open_time', field=models.TimeField(default='08:00')),
        migrations.AddField(model_name='adminsettings', name='business_close_time', field=models.TimeField(default='17:00')),
        migrations.AddField(model_name='adminsettings', name='holiday_dates', field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name='adminsettings', name='maintenance_reminder_days', field=models.PositiveSmallIntegerField(default=7)),
        migrations.AddField(model_name='adminsettings', name='company_name', field=models.CharField(default='AFN Solar Power Engineering Services', max_length=255)),
        migrations.AddField(model_name='adminsettings', name='company_address', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='adminsettings', name='document_footer', field=models.TextField(blank=True, default='')),
        migrations.AddField(model_name='adminsettings', name='currency_code', field=models.CharField(default='PHP', max_length=3)),
        migrations.AddField(model_name='adminsettings', name='quotation_validity_days', field=models.PositiveSmallIntegerField(default=30)),
        migrations.AddField(model_name='adminsettings', name='default_warranty_days', field=models.PositiveIntegerField(default=365)),
        migrations.AddField(model_name='adminsettings', name='external_payment_notice', field=models.CharField(default='Payment is completed outside this system. Enter the confirmed amount before printing.', max_length=255)),
    ]
