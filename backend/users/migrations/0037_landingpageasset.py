from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0036_adminsettings_landing_page_promotions'),
    ]

    operations = [
        migrations.CreateModel(
            name='LandingPageAsset',
            fields=[
                ('id', models.BigAutoField(db_column='landing_page_asset_id', primary_key=True, serialize=False)),
                ('file', models.FileField(upload_to='landing_page/')),
                ('original_name', models.CharField(blank=True, default='', max_length=255)),
                ('content_type', models.CharField(blank=True, default='', max_length=100)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('uploaded_by', models.ForeignKey(blank=True, limit_choices_to={'role__in': ['admin', 'superadmin']}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='landing_page_assets', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
