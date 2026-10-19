from decimal import Decimal, InvalidOperation, ROUND_HALF_UP


# 1.1: savings split into daytime self-use (full retail rate) and exported energy
# (net-metering credit), and appliances can run for part of their scheduled hours.
CALCULATION_VERSION = '1.1'
PANEL_AREA_SQUARE_METERS = Decimal('2.6')
BATTERY_DEPTH_OF_DISCHARGE = Decimal('0.8')
BATTERY_EFFICIENCY = Decimal('0.92')
INVERTER_HEADROOM = Decimal('1.2')
DEFAULT_DAYTIME_USAGE_PERCENT = Decimal('40')
DEFAULT_EXPORT_CREDIT_RATE = Decimal('5.5')


class SolarCalculationError(ValueError):
    def __init__(self, errors):
        super().__init__('Invalid solar calculation inputs.')
        self.errors = errors


def _decimal(value, field, *, minimum=None, maximum=None, required=True):
    if value in (None, ''):
        if required:
            raise SolarCalculationError({field: 'This value is required.'})
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise SolarCalculationError({field: 'Enter a valid number.'}) from exc
    if not number.is_finite():
        raise SolarCalculationError({field: 'Enter a finite number.'})
    if minimum is not None and number < Decimal(str(minimum)):
        raise SolarCalculationError({field: f'Must be at least {minimum}.'})
    if maximum is not None and number > Decimal(str(maximum)):
        raise SolarCalculationError({field: f'Must not exceed {maximum}.'})
    return number


def _rounded(value, places='0.01'):
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def _appliance_totals(appliances):
    if not isinstance(appliances, list) or not appliances:
        raise SolarCalculationError({'appliances': 'Add at least one appliance.'})

    day_energy = Decimal('0')
    night_energy = Decimal('0')
    connected_watts = Decimal('0')
    largest_surge_extra = Decimal('0')
    normalized = []
    row_errors = {}

    for index, item in enumerate(appliances):
        if not isinstance(item, dict):
            row_errors[str(index)] = 'Each appliance must be an object.'
            continue
        try:
            quantity = _decimal(item.get('quantity'), 'quantity', minimum=1, maximum=1000)
            wattage = _decimal(item.get('wattage'), 'wattage', minimum=1, maximum=100000)
            day_hours = _decimal(item.get('dayHours', 0), 'dayHours', minimum=0, maximum=24)
            night_hours = _decimal(item.get('nightHours', 0), 'nightHours', minimum=0, maximum=24)
            surge_factor = _decimal(item.get('surgeFactor', 1), 'surgeFactor', minimum=1, maximum=10)
            # Share of the scheduled hours the appliance actually draws power (compressors cycle).
            duty_cycle = _decimal(item.get('dutyCycle', 100), 'dutyCycle', minimum=1, maximum=100)
            if day_hours + night_hours > 24:
                raise SolarCalculationError({'hours': 'Day and night hours cannot exceed 24 in total.'})
        except SolarCalculationError as exc:
            row_errors[str(index)] = exc.errors
            continue

        watts = quantity * wattage
        surge_extra = (watts * surge_factor) - watts
        running_share = duty_cycle / Decimal('100')
        day_energy += watts * day_hours * running_share / Decimal('1000')
        night_energy += watts * night_hours * running_share / Decimal('1000')
        connected_watts += watts
        largest_surge_extra = max(largest_surge_extra, surge_extra)
        normalized.append({
            'name': str(item.get('name') or '').strip(),
            'quantity': _rounded(quantity),
            'wattage': _rounded(wattage),
            'dayHours': _rounded(day_hours),
            'nightHours': _rounded(night_hours),
            'surgeFactor': _rounded(surge_factor),
            'dutyCycle': _rounded(duty_cycle),
        })

    if row_errors:
        raise SolarCalculationError({'appliances': row_errors})
    if day_energy + night_energy <= 0:
        raise SolarCalculationError({'appliances': 'The appliance schedule must consume energy.'})

    return normalized, day_energy, night_energy, connected_watts, largest_surge_extra


def calculate_solar_estimate(inputs):
    mode = str(inputs.get('calculation_mode') or 'monthly').strip().lower()
    if mode not in {'monthly', 'appliances'}:
        raise SolarCalculationError({'calculation_mode': 'Choose monthly or appliances.'})

    appliances = []
    day_energy = night_energy = connected_watts = largest_surge_extra = Decimal('0')
    if mode == 'appliances':
        appliances, day_energy, night_energy, connected_watts, largest_surge_extra = _appliance_totals(
            inputs.get('appliances')
        )
        monthly_consumption = (day_energy + night_energy) * Decimal('30')
    else:
        monthly_consumption = _decimal(
            inputs.get('monthly_consumption'), 'monthly_consumption', minimum='0.01', maximum='1000000'
        )

    peak_sun_hours = _decimal(inputs.get('peak_sun_hours'), 'peak_sun_hours', minimum='0.1', maximum='12')
    system_loss = _decimal(inputs.get('system_loss_percent'), 'system_loss_percent', minimum=0, maximum=60)
    panel_wattage = _decimal(inputs.get('panel_wattage'), 'panel_wattage', minimum=100, maximum=1000)
    electricity_rate = _decimal(inputs.get('electricity_rate'), 'electricity_rate', minimum=0, maximum=1000)
    desired_offset = _decimal(
        inputs.get('desired_offset_percent'), 'desired_offset_percent', minimum=10, maximum=100
    )
    roof_area = _decimal(
        inputs.get('available_roof_area'), 'available_roof_area', minimum=0, maximum=1000000, required=False
    )
    export_credit = _decimal(
        inputs.get('export_credit_rate'), 'export_credit_rate', minimum=0, maximum=1000, required=False
    )
    export_credit = DEFAULT_EXPORT_CREDIT_RATE if export_credit is None else export_credit
    # An export credit never exceeds the retail rate it offsets.
    export_credit = min(export_credit, electricity_rate)
    if mode == 'appliances':
        total_energy = day_energy + night_energy
        daytime_usage = day_energy / total_energy * Decimal('100')
    else:
        daytime_usage = _decimal(
            inputs.get('daytime_usage_percent'), 'daytime_usage_percent', minimum=0, maximum=100, required=False
        )
        daytime_usage = DEFAULT_DAYTIME_USAGE_PERCENT if daytime_usage is None else daytime_usage

    performance_ratio = Decimal('1') - (system_loss / Decimal('100'))
    offset_ratio = desired_offset / Decimal('100')
    daily_consumption = monthly_consumption / Decimal('30')
    required_capacity = daily_consumption * offset_ratio / (peak_sun_hours * performance_ratio)
    raw_panels = required_capacity * Decimal('1000') / panel_wattage
    panel_count = int(raw_panels.to_integral_value(rounding='ROUND_CEILING'))
    installed_capacity = Decimal(panel_count) * panel_wattage / Decimal('1000')
    daily_generation = installed_capacity * peak_sun_hours * performance_ratio
    monthly_generation = daily_generation * Decimal('30')
    # Solar used while the sun is up replaces power bought at the full rate. The rest is
    # exported; with net metering it earns only the export credit, and only up to the
    # energy still bought from the grid. Without net metering, exports earn nothing.
    self_consumed = min(monthly_generation, monthly_consumption * daytime_usage / Decimal('100'))
    exported = monthly_generation - self_consumed
    credited_export = min(exported, monthly_consumption - self_consumed)
    savings_without_net_metering = self_consumed * electricity_rate
    monthly_savings = savings_without_net_metering + credited_export * export_credit
    roof_required = Decimal(panel_count) * PANEL_AREA_SQUARE_METERS
    inverter_capacity = (connected_watts + largest_surge_extra) / Decimal('1000') * INVERTER_HEADROOM
    battery_capacity = night_energy / BATTERY_DEPTH_OF_DISCHARGE / BATTERY_EFFICIENCY

    return {
        'calculationVersion': CALCULATION_VERSION,
        'monthlyConsumption': _rounded(monthly_consumption),
        'dailyConsumption': _rounded(daily_consumption),
        'requiredCapacity': _rounded(required_capacity),
        'panelCount': panel_count,
        'installedCapacity': _rounded(installed_capacity),
        'dailyGeneration': _rounded(daily_generation),
        'monthlyGeneration': _rounded(monthly_generation),
        'monthlySavings': _rounded(monthly_savings),
        'monthlySavingsWithoutNetMetering': _rounded(savings_without_net_metering),
        'selfConsumedEnergy': _rounded(self_consumed),
        'exportedEnergy': _rounded(exported),
        'daytimeUsagePercent': _rounded(daytime_usage),
        'exportCreditRate': _rounded(export_credit),
        'roofAreaRequired': _rounded(roof_required),
        'roofFits': None if roof_area in (None, 0) else roof_area >= roof_required,
        'inverterCapacity': _rounded(inverter_capacity),
        'batteryCapacity': _rounded(battery_capacity),
        'dayEnergy': _rounded(day_energy),
        'nightEnergy': _rounded(night_energy),
        'connectedWatts': _rounded(connected_watts),
        'normalizedAppliances': appliances,
        'assumptions': {
            'daysPerMonth': 30,
            'panelAreaSquareMeters': float(PANEL_AREA_SQUARE_METERS),
            'inverterHeadroom': float(INVERTER_HEADROOM),
            'batteryDepthOfDischarge': float(BATTERY_DEPTH_OF_DISCHARGE),
            'batteryEfficiency': float(BATTERY_EFFICIENCY),
        },
    }
