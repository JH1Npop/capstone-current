from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('services', '0054_quotation_reference_and_warranty_terms'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='demandforecast',
            constraint=models.UniqueConstraint(
                fields=('service_type', 'forecast_date', 'forecast_period'),
                name='unique_demand_forecast_service_date_period',
            ),
        ),
    ]
