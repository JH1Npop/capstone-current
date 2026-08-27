from django.db import migrations, models


SERVICE_DEFAULTS = {
    'Solar Panel Installation': {'category': 'Solar', 'color': '#f59e0b', 'icon': 'solar', 'display_order': 10},
    'Solar Panel Maintenance': {'category': 'Solar', 'color': '#eab308', 'icon': 'solar', 'display_order': 20},
    'Solar Inverter Repair': {'category': 'Solar', 'color': '#f97316', 'icon': 'solar', 'display_order': 30},
    'CCTV Preventive Maintenance': {'category': 'CCTV', 'color': '#6366f1', 'icon': 'camera', 'display_order': 40},
    'Fire Alarm Inspection': {'category': 'FDAS', 'color': '#ef4444', 'icon': 'fire', 'display_order': 50},
    'Smoke Service': {'category': 'Smoke Service', 'color': '#64748b', 'icon': 'smoke', 'display_order': 60},
    'General Services': {'category': 'General', 'color': '#0f766e', 'icon': 'tool', 'display_order': 90},
}


def apply_service_defaults(apps, schema_editor):
    ServiceType = apps.get_model('services', 'ServiceType')

    for name, defaults in SERVICE_DEFAULTS.items():
        ServiceType.objects.filter(name=name).update(**defaults)

    combined_ac = ServiceType.objects.filter(name='AC Service & Installation').first()
    if combined_ac:
        combined_ac.category = 'Air Conditioning'
        combined_ac.color = '#06b6d4'
        combined_ac.icon = 'aircon'
        combined_ac.display_order = 70
        combined_ac.is_active = False
        combined_ac.save(update_fields=['category', 'color', 'icon', 'display_order', 'is_active'])

        base_values = {
            'description': combined_ac.description or 'Air conditioning service.',
            'estimated_duration': combined_ac.estimated_duration,
            'estimated_cost': combined_ac.estimated_cost,
            'max_daily_assignments': combined_ac.max_daily_assignments,
            'procedures': combined_ac.procedures,
            'required_equipment': combined_ac.required_equipment,
            'requires_site_inspection': combined_ac.requires_site_inspection,
            'is_active': True,
            'category': 'Air Conditioning',
            'color': '#06b6d4',
            'icon': 'aircon',
        }
        ServiceType.objects.get_or_create(
            name='Air Conditioning Installation',
            defaults={**base_values, 'display_order': 70},
        )
        ServiceType.objects.get_or_create(
            name='Air Conditioning Maintenance',
            defaults={
                **base_values,
                'description': 'Air conditioning maintenance, cleaning, and performance checking.',
                'estimated_duration': 120,
                'estimated_cost': 0,
                'display_order': 71,
            },
        )


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0051_solarestimate'),
    ]

    operations = [
        migrations.AddField(
            model_name='servicetype',
            name='category',
            field=models.CharField(blank=True, default='', help_text='Management-defined service category, e.g. Solar, Air Conditioning, FDAS.', max_length=100),
        ),
        migrations.AddField(
            model_name='servicetype',
            name='color',
            field=models.CharField(blank=True, default='#2563eb', help_text='Hex color used for service badges, calendars, and dashboards.', max_length=20),
        ),
        migrations.AddField(
            model_name='servicetype',
            name='display_order',
            field=models.PositiveIntegerField(default=0, help_text='Optional ordering hint for management-controlled service lists.'),
        ),
        migrations.AddField(
            model_name='servicetype',
            name='icon',
            field=models.CharField(blank=True, default='', help_text='Optional UI icon key chosen by management.', max_length=50),
        ),
        migrations.AlterModelOptions(
            name='servicetype',
            options={'ordering': ['display_order', 'name']},
        ),
        migrations.RunPython(apply_service_defaults, migrations.RunPython.noop),
    ]
