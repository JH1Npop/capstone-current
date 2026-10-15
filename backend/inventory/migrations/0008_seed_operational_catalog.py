from decimal import Decimal

from django.db import migrations


CATEGORIES = {
    'Solar Components': 'Solar modules, inverters, and accessories.',
    'Security Systems': 'CCTV cameras, recorders, and accessories.',
    'Fire Safety': 'Fire alarm detectors, modules, and control equipment.',
    'HVAC': 'Air conditioning equipment and installation accessories.',
    'Electrical Consumables': 'Common cabling and connectors for field work.',
}

ITEMS = [
    ('Solar Components', 'Solar Panel 550W', 'SOL-550W', 'equipment', 57, 50, 'Rack A1', '12850.00', 'HelioTech Supply'),
    ('Solar Components', 'Hybrid Inverter 5kW', 'INV-5KW-HYB', 'equipment', 3, 3, 'Rack A3', '48500.00', 'HelioTech Supply'),
    ('Electrical Consumables', 'MC4 Connector Set', 'MC4-SET', 'consumable', 28, 50, 'Bin E2', '180.00', 'GridLine Trading'),
    ('Security Systems', 'CCTV Dome Camera 4MP', 'CCTV-4MP-DOME', 'equipment', 3, 8, 'Rack B2', '3250.00', 'SecureVision'),
    ('Security Systems', 'NVR 8-Channel', 'NVR-8CH', 'equipment', 6, 10, 'Rack B5', '7800.00', 'SecureVision'),
    ('Fire Safety', 'Smoke Detector Addressable', 'FIRE-SD-ADDR', 'equipment', 36, 10, 'Rack C1', '950.00', 'FireSafe Systems'),
    ('Fire Safety', 'Fire Alarm Control Module', 'FIRE-MOD-CTRL', 'equipment', 12, 4, 'Rack C3', '4200.00', 'FireSafe Systems'),
    ('HVAC', 'Split Type AC 1.5HP', 'AC-1.5HP', 'equipment', 7, 2, 'Rack D1', '28600.00', 'CoolFlow Distributors'),
    ('HVAC', 'Copper Tubing Set 1/4-3/8', 'HVAC-COPPER-SET', 'part', 6, 6, 'Rack D4', '1450.00', 'CoolFlow Distributors'),
]

SERVICE_TEMPLATES = {
    'Solar Panel Installation': {
        'procedures': [
            {'step': 1, 'title': 'Roof Assessment', 'description': 'Inspect the roof structure, dimensions, shading, access, and safe panel placement.'},
            {'step': 2, 'title': 'Mounting Rail Installation', 'description': 'Secure roof hooks and install level mounting rails.', 'requires_photo': True},
            {'step': 3, 'title': 'Wiring Preparation', 'description': 'Run protected DC cabling from the array to the inverter location.'},
            {'step': 4, 'title': 'Panel Mounting', 'description': 'Mount, connect, and clamp the solar panels to the rails.', 'requires_photo': True},
            {'step': 5, 'title': 'Inverter Installation', 'description': 'Mount the inverter and safely connect DC input and AC output.'},
            {'step': 6, 'title': 'System Testing', 'description': 'Configure the inverter and verify expected system output.', 'requires_photo': True},
        ],
        'required_equipment': ['Safety harness', 'Multimeter', 'Torque wrench', 'Insulated hand tools'],
    },
    'Solar Preventive Maintenance': {
        'procedures': [
            {'step': 1, 'title': 'Performance Review', 'description': 'Review monitoring data and identify underperforming strings or panels.'},
            {'step': 2, 'title': 'Physical Inspection', 'description': 'Inspect panels for cracks, hot spots, delamination, and heavy soiling.', 'requires_photo': True},
            {'step': 3, 'title': 'Panel Cleaning', 'description': 'Clean panel surfaces using safe non-abrasive materials.'},
            {'step': 4, 'title': 'Mounting Check', 'description': 'Verify clamps, rails, and roof attachments remain secure.', 'requires_photo': True},
            {'step': 5, 'title': 'Electrical Verification', 'description': 'Inspect connectors and measure string voltages.'},
            {'step': 6, 'title': 'Inverter Cleaning', 'description': 'Clean inverter heat sinks and cooling fans, then verify operation.'},
        ],
        'required_equipment': ['Safety harness', 'Soft cleaning brush', 'Multimeter', 'Thermal camera'],
    },
    'Field Service Diagnostic': {
        'procedures': [
            {'step': 1, 'title': 'Confirm Reported Issue', 'description': 'Review the client concern, affected equipment, and service history.'},
            {'step': 2, 'title': 'Safety and Site Assessment', 'description': 'Check access, hazards, isolation requirements, and equipment condition.', 'requires_photo': True},
            {'step': 3, 'title': 'Diagnostic Testing', 'description': 'Perform appropriate visual, electrical, and functional tests.'},
            {'step': 4, 'title': 'Identify Root Cause', 'description': 'Record findings, failed components, and recommended corrective work.'},
            {'step': 5, 'title': 'Client Handover', 'description': 'Explain the diagnosis and capture supporting evidence and next steps.', 'requires_photo': True},
        ],
        'required_equipment': ['Multimeter', 'Insulated hand tools', 'Diagnostic tester', 'Personal protective equipment'],
    },
}

SERVICE_REQUIREMENTS = {
    'Solar Panel Installation': [
        ('SOL-550W', 8, 'Default module allocation for a standard residential installation.'),
        ('INV-5KW-HYB', 1, 'One inverter for a standard residential installation.'),
        ('MC4-SET', 8, 'Connector allocation for standard panel stringing.'),
    ],
}


def seed_operational_catalog(apps, schema_editor):
    InventoryCategory = apps.get_model('inventory', 'InventoryCategory')
    InventoryItem = apps.get_model('inventory', 'InventoryItem')
    InventoryTransaction = apps.get_model('inventory', 'InventoryTransaction')
    ServiceRequirement = apps.get_model('inventory', 'ServiceTypeInventoryRequirement')
    ServiceType = apps.get_model('services', 'ServiceType')

    categories = {}
    for name, description in CATEGORIES.items():
        category = InventoryCategory.objects.filter(name__iexact=name).first()
        if category is None:
            category = InventoryCategory.objects.create(name=name, description=description)
        categories[name] = category

    items = {}
    for category_name, name, sku, item_type, quantity, minimum_stock, location, price, supplier in ITEMS:
        item = InventoryItem.objects.filter(sku__iexact=sku).first()
        if item is None:
            unit_price = Decimal(price)
            item = InventoryItem.objects.create(
                name=name,
                sku=sku,
                description=f'Operational catalog item for {category_name.lower()}.',
                category=categories[category_name],
                item_type=item_type,
                unit_of_measurement='piece',
                quantity=quantity,
                minimum_stock=minimum_stock,
                reserved_quantity=0,
                warehouse_location=location,
                unit_price=unit_price,
                total_value=unit_price * quantity,
                status='available' if quantity else 'out_of_stock',
                supplier=supplier,
                low_stock_threshold=40,
                notes='Seeded from the verified local operational catalog.',
            )
            InventoryTransaction.objects.create(
                item=item,
                transaction_type='purchase',
                quantity=quantity,
                reference_number='OPENING-CATALOG',
                notes='Opening balance seeded from the verified local operational catalog.',
            )
        items[sku] = item

    for service_name, template in SERVICE_TEMPLATES.items():
        service = ServiceType.objects.filter(name__iexact=service_name).first()
        if service is None:
            continue
        updates = {}
        if not service.procedures:
            updates['procedures'] = template['procedures']
        if not service.required_equipment:
            updates['required_equipment'] = template['required_equipment']
        if updates:
            ServiceType.objects.filter(pk=service.pk).update(**updates)

    for service_name, requirements in SERVICE_REQUIREMENTS.items():
        service = ServiceType.objects.filter(name__iexact=service_name).first()
        if service is None:
            continue
        for sku, quantity, notes in requirements:
            item = items.get(sku) or InventoryItem.objects.filter(sku__iexact=sku).first()
            if item is not None:
                ServiceRequirement.objects.get_or_create(
                    service_type=service,
                    item=item,
                    defaults={'quantity': quantity, 'auto_reserve': True, 'notes': notes},
                )


class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0007_equipmentreturnrequest_equipmentreturnrequestitem'),
        ('services', '0059_maintenanceschedule_client_due_notified_at'),
    ]
    operations = [
        migrations.RunPython(seed_operational_catalog, migrations.RunPython.noop),
    ]
