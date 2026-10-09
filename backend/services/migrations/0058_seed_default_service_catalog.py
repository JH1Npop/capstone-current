from django.db import migrations


CATALOG = [
    {
        'name': 'Solar Panel Installation', 'category': 'Solar',
        'description': 'Rooftop solar installation and commissioning.',
        'estimated_cost': '0.00', 'estimated_duration': 480, 'icon': 'solar',
        'color': '#f59e0b', 'display_order': 10,
        'procedures': [
            {'step': 1, 'title': 'Roof Assessment', 'description': 'Inspect the roof structure, measure dimensions, and identify optimal placement to avoid shading.'},
            {'step': 2, 'title': 'Mounting Rail Installation', 'description': 'Secure roof hooks to the rafters and install level aluminum mounting rails.'},
            {'step': 3, 'title': 'Wiring Preparation', 'description': 'Run protected DC cabling from the roof array to the inverter location.'},
            {'step': 4, 'title': 'Panel Mounting', 'description': 'Mount, connect, and clamp the solar panels to the rails.'},
            {'step': 5, 'title': 'Inverter Installation', 'description': 'Mount the inverter and connect its DC input and AC output safely.'},
            {'step': 6, 'title': 'System Testing', 'description': 'Configure the inverter and verify expected system output.'},
        ],
    },
    {
        'name': 'Solar Panel Maintenance', 'category': 'Solar',
        'description': 'Preventive maintenance, cleaning, and performance checks.',
        'estimated_cost': '0.00', 'estimated_duration': 180, 'icon': 'solar',
        'color': '#eab308', 'display_order': 20,
        'procedures': [
            {'step': 1, 'title': 'Performance Review', 'description': 'Review monitoring data for underperforming strings or panels.'},
            {'step': 2, 'title': 'Physical Inspection', 'description': 'Inspect panels for cracks, hot spots, delamination, and heavy soiling.', 'requires_photo': True},
            {'step': 3, 'title': 'Panel Cleaning', 'description': 'Clean panel surfaces using safe non-abrasive materials.'},
            {'step': 4, 'title': 'Mounting Check', 'description': 'Verify clamps, rails, and roof attachments remain secure.', 'requires_photo': True},
            {'step': 5, 'title': 'Electrical Verification', 'description': 'Inspect connectors and measure string voltages.'},
            {'step': 6, 'title': 'Inverter Dusting', 'description': 'Clean inverter heat sinks and cooling fans.'},
        ],
    },
    {
        'name': 'Solar Inverter Repair', 'category': 'Solar',
        'description': 'Inverter diagnostics, repair, and replacement support.',
        'estimated_cost': '0.00', 'estimated_duration': 240, 'icon': 'solar',
        'color': '#f97316', 'display_order': 30,
        'procedures': [
            {'step': 1, 'title': 'Safety Lockout', 'description': 'Disconnect AC and DC isolators before work begins.', 'requires_photo': True},
            {'step': 2, 'title': 'Error Code Analysis', 'description': 'Review active codes and fault history.'},
            {'step': 3, 'title': 'Electrical Testing', 'description': 'Measure DC input and AC output voltages.'},
            {'step': 4, 'title': 'Internal Inspection', 'description': 'Check for damaged components, wiring, and fuses.', 'requires_photo': True},
            {'step': 5, 'title': 'Component Replacement', 'description': 'Replace confirmed faulty components safely.'},
            {'step': 6, 'title': 'Recommissioning', 'description': 'Restart and verify stable power generation.', 'requires_photo': True},
        ],
    },
    {
        'name': 'CCTV Preventive Maintenance', 'category': 'CCTV',
        'description': 'Camera inspection, recorder cleanup, and health checks.',
        'estimated_cost': '0.00', 'estimated_duration': 120, 'icon': 'camera',
        'color': '#6366f1', 'display_order': 40,
        'procedures': [
            {'step': 1, 'title': 'Visual Inspection', 'description': 'Inspect cameras, housings, and mounts for damage.', 'requires_photo': True},
            {'step': 2, 'title': 'Cleaning Lenses', 'description': 'Clean lenses, domes, and infrared LEDs.'},
            {'step': 3, 'title': 'Checking Connections', 'description': 'Verify signal, network, and power connections.'},
            {'step': 4, 'title': 'DVR/NVR Assessment', 'description': 'Check recorder and storage health.'},
            {'step': 5, 'title': 'Field of View Verification', 'description': 'Confirm and adjust camera focus and coverage.'},
            {'step': 6, 'title': 'Power Supply Check', 'description': 'Test power supplies and backup power.'},
        ],
    },
    {
        'name': 'Fire Alarm Inspection', 'category': 'FDAS',
        'description': 'Inspection and testing of control panels, detectors, and sirens.',
        'estimated_cost': '0.00', 'estimated_duration': 150, 'icon': 'fire',
        'color': '#ef4444', 'display_order': 50,
        'procedures': [
            {'step': 1, 'title': 'System Overview', 'description': 'Check the control panel for alarm, supervisory, and trouble signals.'},
            {'step': 2, 'title': 'Testing Initiating Devices', 'description': 'Test detectors and manual initiating devices.'},
            {'step': 3, 'title': 'Testing Notification Appliances', 'description': 'Verify horns, strobes, and speakers.'},
            {'step': 4, 'title': 'Battery and Power Test', 'description': 'Test backup batteries under load.'},
            {'step': 5, 'title': 'Communication Check', 'description': 'Verify configured monitoring communication.'},
            {'step': 6, 'title': 'Documentation', 'description': 'Record tested devices, failures, and findings.', 'requires_photo': True},
        ],
    },
    {
        'name': 'Smoke Service', 'category': 'Smoke Service', 'description': '',
        'estimated_cost': '0.00', 'estimated_duration': 60, 'icon': 'smoke',
        'color': '#64748b', 'display_order': 60,
        'procedures': [
            {'step': 1, 'title': 'Initial Assessment', 'description': 'Identify the source or required smoke-control location.'},
            {'step': 2, 'title': 'Ventilation Check', 'description': 'Inspect ventilation and exhaust systems.'},
            {'step': 3, 'title': 'Detector Maintenance', 'description': 'Clean and recalibrate affected detectors.'},
            {'step': 4, 'title': 'System Testing', 'description': 'Use safe test smoke to verify system response.'},
            {'step': 5, 'title': 'Final Review', 'description': 'Document findings and restore normal operation.', 'requires_photo': True},
        ],
    },
    {
        'name': 'Air Conditioning Installation', 'category': 'Air Conditioning',
        'description': 'Split-type air conditioning service and installation.',
        'estimated_cost': '500.00', 'estimated_duration': 120, 'icon': 'aircon',
        'color': '#06b6d4', 'display_order': 70,
        'procedures': [
            {'step': 1, 'title': 'Site Assessment', 'description': 'Verify unit locations, ventilation, drainage, and structural support.'},
            {'step': 2, 'title': 'Unboxing and Inspection', 'description': 'Inspect the unit for physical damage.', 'requires_photo': True},
            {'step': 3, 'title': 'Mounting Indoor Unit', 'description': 'Install the bracket, piping opening, and indoor unit.', 'requires_photo': True},
            {'step': 4, 'title': 'Installing Outdoor Unit', 'description': 'Install the outdoor unit on a stable ventilated base.'},
            {'step': 5, 'title': 'Connecting Piping and Wiring', 'description': 'Connect refrigerant lines, drainage, and wiring.'},
            {'step': 6, 'title': 'Vacuuming and Testing', 'description': 'Vacuum the lines and perform leak testing.'},
            {'step': 7, 'title': 'Commissioning', 'description': 'Test performance and demonstrate operation.'},
        ],
    },
    {
        'name': 'Air Conditioning Maintenance', 'category': 'Air Conditioning',
        'description': 'Air conditioning maintenance, cleaning, and performance checking.',
        'estimated_cost': '0.00', 'estimated_duration': 120, 'icon': 'aircon',
        'color': '#06b6d4', 'display_order': 71,
        'procedures': [
            {'step': 1, 'title': 'Initial Performance Check', 'description': 'Record operating condition, temperature, and reported symptoms.'},
            {'step': 2, 'title': 'Filter and Coil Cleaning', 'description': 'Clean filters, evaporator, and condenser components.', 'requires_photo': True},
            {'step': 3, 'title': 'Drainage Inspection', 'description': 'Clear and verify the condensate drain.'},
            {'step': 4, 'title': 'Electrical Inspection', 'description': 'Inspect wiring, terminals, controls, and current draw.'},
            {'step': 5, 'title': 'Refrigerant and Leak Check', 'description': 'Check operating pressures and visible leak indicators.'},
            {'step': 6, 'title': 'Final Performance Test', 'description': 'Verify cooling, airflow, noise, and stable operation.', 'requires_photo': True},
        ],
    },
    {
        'name': 'General Services', 'category': 'General',
        'description': 'General maintenance and services',
        'estimated_cost': '0.00', 'estimated_duration': 60, 'icon': 'tool',
        'color': '#0f766e', 'display_order': 90,
        'procedures': [
            {'step': 1, 'title': 'Client Consultation', 'description': 'Confirm the requested work and expected outcome.'},
            {'step': 2, 'title': 'Site Preparation', 'description': 'Prepare and protect the work area.'},
            {'step': 3, 'title': 'Execution of Work', 'description': 'Perform the agreed work using appropriate practices.'},
            {'step': 4, 'title': 'Quality Assurance', 'description': 'Inspect the result against the agreed scope.'},
            {'step': 5, 'title': 'Site Cleanup', 'description': 'Clean the area and document completion.', 'requires_photo': True},
        ],
    },
]


def seed_default_service_catalog(apps, schema_editor):
    ServiceType = apps.get_model('services', 'ServiceType')
    if ServiceType.objects.exists():
        return
    for entry in CATALOG:
        ServiceType.objects.create(
            **entry,
            max_daily_assignments=5,
            required_equipment=[],
            requires_site_inspection=False,
            is_active=True,
        )


class Migration(migrations.Migration):
    dependencies = [('services', '0057_salesrecord_salesrecordline')]
    operations = [migrations.RunPython(seed_default_service_catalog, migrations.RunPython.noop)]
