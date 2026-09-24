from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.utils import timezone
from rest_framework import serializers
from ..models import (
    ServiceType, SLARule, ServiceRequest, ServiceRequestService, ServiceLocation, SolarEstimate, ServiceTicket,
    AfterSalesCase as FollowUpCase, AfterSalesCaseEvent,
    TechnicianSkill, ServiceStatusHistory, InspectionChecklist, SolarCommissioningChecklist,
    TechnicianLocationHistory, ServiceAnalytics, TechnicianPerformance,
    GeneratedDocument,
    DemandForecast, ServiceTrend, MaintenanceSchedule,
    InstalledEquipment, QuotationRecord, TurnoverAcceptance, TechnicalDataSheet,
    InstallationContract, SolarProjectProfile, FieldServiceReport,
    SalesRecord, SalesRecordLine
)
from ..solar_calculator import CALCULATION_VERSION, SolarCalculationError, calculate_solar_estimate
from ..sla import (
    evaluate_service_request_sla,
    evaluate_service_ticket_sla,
    get_ticket_dispatch_state,
    serialize_sla_evaluation,
)
from ..user_display import client_technician_label

class ServiceTypeSerializer(serializers.ModelSerializer):
    procedures = serializers.JSONField(required=False)
    required_equipment = serializers.JSONField(required=False)
    inventory_requirements_count = serializers.SerializerMethodField()
    inventory_requirements = serializers.SerializerMethodField()
    request_count = serializers.SerializerMethodField()
    ticket_count = serializers.SerializerMethodField()
    usage_count = serializers.SerializerMethodField()

    def get_inventory_requirements_count(self, obj):
        return obj.inventory_requirements.count()

    def get_inventory_requirements(self, obj):
        return [
            {
                'id': requirement.id,
                'item_id': requirement.item_id,
                'item_name': requirement.item.name,
                'item_sku': requirement.item.sku,
                'quantity': requirement.quantity,
                'available_quantity': requirement.item.available_quantity,
                'auto_reserve': requirement.auto_reserve,
            }
            for requirement in obj.inventory_requirements.select_related('item').order_by('item__name', 'id')
        ]

    def get_request_count(self, obj):
        return ServiceRequest.objects.filter(service_type=obj).count()

    def get_ticket_count(self, obj):
        return ServiceTicket.objects.filter(request__service_type=obj).count()

    def get_usage_count(self, obj):
        return self.get_request_count(obj) + self.get_ticket_count(obj)

    def validate_name(self, value):
        name = str(value or '').strip()
        if not name:
            raise serializers.ValidationError('Service name is required.')

        existing = ServiceType.objects.filter(name__iexact=name)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError('A service with this name already exists.')

        return name

    def validate_estimated_duration(self, value):
        if int(value or 0) <= 0:
            raise serializers.ValidationError('Duration must be greater than zero minutes.')
        return value

    def validate_estimated_cost(self, value):
        if value < 0:
            raise serializers.ValidationError('Estimated cost cannot be negative.')
        return value

    def validate_color(self, value):
        color = str(value or '').strip()
        if not color:
            return '#2563eb'
        if not color.startswith('#') or len(color) not in {4, 7}:
            raise serializers.ValidationError('Enter a valid hex color, e.g. #2563eb.')
        allowed = set('0123456789abcdefABCDEF')
        if any(char not in allowed for char in color[1:]):
            raise serializers.ValidationError('Enter a valid hex color, e.g. #2563eb.')
        return color

    def validate_max_daily_assignments(self, value):
        if int(value or 0) <= 0:
            raise serializers.ValidationError('Max daily assignments must be at least 1.')
        return value

    def validate_procedures(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('Procedures must be a list of steps.')
        return value

    def validate_required_equipment(self, value):
        if value in (None, ''):
            return []
        if not isinstance(value, list):
            raise serializers.ValidationError('Required equipment must be a list.')
        return value

    class Meta:
        model = ServiceType
        fields = ['id', 'name', 'description', 'category', 'color', 'icon', 'display_order',
                  'estimated_duration', 'estimated_cost', 'max_daily_assignments',
                  'procedures', 'required_equipment', 'is_active',
                  'request_count', 'ticket_count', 'usage_count',
                  'inventory_requirements_count', 'inventory_requirements']


class ServiceLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceLocation
        fields = '__all__'


class SLARuleSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source='get_key_display', read_only=True)

    def validate(self, attrs):
        warning_minutes = attrs.get('warning_minutes', getattr(self.instance, 'warning_minutes', None))
        overdue_minutes = attrs.get('overdue_minutes', getattr(self.instance, 'overdue_minutes', None))
        if warning_minutes is not None and overdue_minutes is not None and warning_minutes >= overdue_minutes:
            raise serializers.ValidationError('Warning minutes must be less than overdue minutes.')
        return attrs

    class Meta:
        model = SLARule
        fields = ['id', 'key', 'label', 'warning_minutes', 'overdue_minutes', 'is_active', 'notes', 'updated_at']
        read_only_fields = ['key', 'updated_at']


class ServiceRequestServiceSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)

    class Meta:
        model = ServiceRequestService
        fields = ['id', 'service_type', 'service_type_name', 'notes', 'status', 'sort_order']


class SolarEstimateSerializer(serializers.ModelSerializer):
    estimate_code = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    service_request_status = serializers.CharField(source='service_request.status', read_only=True)

    class Meta:
        model = SolarEstimate
        fields = [
            'id', 'estimate_code', 'client', 'client_name', 'service_request', 'service_request_status',
            'calculation_mode', 'monthly_consumption', 'appliances', 'peak_sun_hours',
            'system_loss_percent', 'panel_wattage', 'electricity_rate',
            'desired_offset_percent', 'available_roof_area', 'selected_promotion',
            'result_snapshot', 'calculation_version', 'status', 'submitted_at',
            'converted_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'client', 'service_request', 'result_snapshot', 'calculation_version',
            'status', 'submitted_at', 'converted_at', 'created_at', 'updated_at',
        ]

    def get_client_name(self, obj):
        return obj.client.get_full_name().strip() or obj.client.username

    def get_estimate_code(self, obj):
        return f'EST-{obj.id:04d}'

    def validate_selected_promotion(self, value):
        if value in (None, ''):
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('Promotion metadata must be an object.')
        return value

    def validate(self, attrs):
        current = self.instance
        calculation_inputs = {
            field: attrs.get(field, getattr(current, field, None))
            for field in [
                'calculation_mode', 'monthly_consumption', 'appliances', 'peak_sun_hours',
                'system_loss_percent', 'panel_wattage', 'electricity_rate',
                'desired_offset_percent', 'available_roof_area',
            ]
        }
        try:
            attrs['result_snapshot'] = calculate_solar_estimate(calculation_inputs)
        except SolarCalculationError as exc:
            raise serializers.ValidationError(exc.errors) from exc
        attrs['calculation_version'] = CALCULATION_VERSION
        if calculation_inputs['calculation_mode'] == 'appliances':
            attrs['appliances'] = attrs['result_snapshot']['normalizedAppliances']
            attrs['monthly_consumption'] = attrs['result_snapshot']['monthlyConsumption']
        return attrs


class ServiceRequestSerializer(serializers.ModelSerializer):
    COORDINATE_QUANTIZER = Decimal('0.000001')

    location = ServiceLocationSerializer(read_only=True)
    client_name = serializers.SerializerMethodField()
    client_fullname = serializers.SerializerMethodField()
    client_phone = serializers.SerializerMethodField()
    client_email = serializers.SerializerMethodField()
    client_address = serializers.SerializerMethodField()
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    service_summary = serializers.SerializerMethodField()
    request_source_label = serializers.CharField(source='get_request_source_display', read_only=True)
    service_items = serializers.SerializerMethodField()
    service_type = serializers.PrimaryKeyRelatedField(queryset=ServiceType.objects.all(), required=False)
    service_types = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        allow_empty=False,
    )
    sla = serializers.SerializerMethodField()
    service = serializers.CharField(write_only=True, required=False, allow_blank=True)
    notes = serializers.CharField(write_only=True, required=False, allow_blank=True)
    lat = serializers.CharField(write_only=True, required=False, allow_blank=False)
    lng = serializers.CharField(write_only=True, required=False, allow_blank=False)
    locationDesc = serializers.CharField(write_only=True, required=False, allow_blank=True)
    location_address = serializers.CharField(write_only=True, required=False, allow_blank=True)
    location_city = serializers.CharField(write_only=True, required=False, allow_blank=True)
    location_province = serializers.CharField(write_only=True, required=False, allow_blank=True)
    latitude = serializers.CharField(write_only=True, required=False, allow_blank=False)
    longitude = serializers.CharField(write_only=True, required=False, allow_blank=False)

    def get_client_name(self, obj):
        return client_technician_label(obj.client) or ''

    def get_client_phone(self, obj):
        return obj.client.phone if obj.client else ''

    def get_client_email(self, obj):
        return obj.client.email if obj.client else ''

    def get_client_address(self, obj):
        return obj.client.address if obj.client else ''

    def _normalize_coordinate(self, value, *, field_name, minimum, maximum):
        if value in (None, ''):
            return None

        try:
            decimal_value = Decimal(str(value).strip())
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise serializers.ValidationError({field_name: 'Enter a valid coordinate.'}) from exc

        if decimal_value < Decimal(str(minimum)) or decimal_value > Decimal(str(maximum)):
            raise serializers.ValidationError({
                field_name: f'{field_name.replace("_", " ").capitalize()} must be between {minimum} and {maximum}.'
            })

        return decimal_value.quantize(self.COORDINATE_QUANTIZER, rounding=ROUND_HALF_UP)

    def _resolve_service_type(self, service_value):
        if service_value in (None, ''):
            return None

        service_value = str(service_value).strip()
        if not service_value:
            return None

        queryset = ServiceType.objects.filter(is_active=True)
        if service_value.isdigit():
            try:
                return queryset.get(pk=int(service_value))
            except ServiceType.DoesNotExist as exc:
                raise serializers.ValidationError({'service_type': 'Selected service type does not exist.'}) from exc

        service_type = queryset.filter(name__iexact=service_value).first()
        if service_type:
            return service_type

        raise serializers.ValidationError({'service_type': 'Selected service type does not exist.'})

    def _resolve_service_types(self, service_type_ids):
        if service_type_ids in (None, ''):
            return []

        normalized_ids = []
        for service_type_id in service_type_ids:
            try:
                normalized_id = int(service_type_id)
            except (TypeError, ValueError) as exc:
                raise serializers.ValidationError({'service_types': 'Choose valid services.'}) from exc
            if normalized_id not in normalized_ids:
                normalized_ids.append(normalized_id)

        service_types = list(ServiceType.objects.filter(id__in=normalized_ids, is_active=True))
        service_type_map = {service_type.id: service_type for service_type in service_types}
        missing_ids = [service_type_id for service_type_id in normalized_ids if service_type_id not in service_type_map]
        if missing_ids:
            raise serializers.ValidationError({'service_types': 'One or more selected services do not exist.'})
        return [service_type_map[service_type_id] for service_type_id in normalized_ids]

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        creating = self.instance is None

        if user and user.is_authenticated and user.role == 'client':
            attrs['client'] = user
            if creating:
                attrs['request_source'] = 'client_portal'
        elif creating and not attrs.get('client'):
            raise serializers.ValidationError({'client': 'A client is required.'})
        elif creating and not attrs.get('request_source'):
            attrs['request_source'] = 'admin_created'

        legacy_service = attrs.pop('service', None)
        if legacy_service:
            raise serializers.ValidationError({
                'service_type': 'Choose a service from the fixed service list instead of typing a custom service.'
            })

        requested_service_types = self._resolve_service_types(attrs.pop('service_types', None))
        if creating and requested_service_types and not attrs.get('service_type'):
            attrs['service_type'] = requested_service_types[0]

        if creating and not attrs.get('service_type'):
            raise serializers.ValidationError({'service_type': 'A service type is required.'})
        if attrs.get('service_type') and not attrs['service_type'].is_active:
            raise serializers.ValidationError({'service_type': 'This service is inactive and cannot be requested.'})
        if attrs.get('service_type'):
            service_items = []
            seen_ids = set()
            for service_type in [attrs['service_type'], *requested_service_types]:
                if service_type.id in seen_ids:
                    continue
                seen_ids.add(service_type.id)
                service_items.append(service_type)
            attrs['service_items_payload'] = service_items

        description = attrs.get('description')
        if not description:
            description = attrs.pop('notes', '').strip()
            if description:
                attrs['description'] = description
        else:
            attrs.pop('notes', None)

        if creating and not attrs.get('description'):
            raise serializers.ValidationError({'description': 'A description is required.'})

        preferred_date = attrs.get(
            'preferred_date',
            getattr(self.instance, 'preferred_date', None),
        )
        preferred_time_slot = attrs.get(
            'preferred_time_slot',
            getattr(self.instance, 'preferred_time_slot', None),
        )

        if preferred_date and preferred_date < timezone.localdate():
            raise serializers.ValidationError({
                'preferred_date': 'Preferred appointment date cannot be in the past.',
            })
        if preferred_time_slot and not preferred_date:
            raise serializers.ValidationError({
                'preferred_date': 'Choose an appointment date when selecting a time slot.',
            })

        latitude = attrs.pop('latitude', None)
        longitude = attrs.pop('longitude', None)
        lat = attrs.pop('lat', None)
        lng = attrs.pop('lng', None)
        location_address = attrs.pop('location_address', '').strip()
        location_desc = attrs.pop('locationDesc', '').strip()
        location_city = attrs.pop('location_city', '').strip()
        location_province = attrs.pop('location_province', '').strip()

        latitude_field = 'latitude' if latitude is not None else 'lat'
        longitude_field = 'longitude' if longitude is not None else 'lng'
        latitude = latitude if latitude is not None else lat
        longitude = longitude if longitude is not None else lng

        latitude = self._normalize_coordinate(
            latitude,
            field_name=latitude_field,
            minimum=-90,
            maximum=90,
        )
        longitude = self._normalize_coordinate(
            longitude,
            field_name=longitude_field,
            minimum=-180,
            maximum=180,
        )

        location_address = location_address or location_desc
        has_location_input = any([
            location_address,
            location_city,
            location_province,
            latitude is not None,
            longitude is not None,
        ])

        if (latitude is None) != (longitude is None):
            raise serializers.ValidationError({
                'latitude': 'Latitude and longitude must be provided together.',
                'longitude': 'Latitude and longitude must be provided together.',
            })

        if user and user.is_authenticated and user.role == 'client' and creating and not has_location_input:
            raise serializers.ValidationError({
                'location_address': 'A service location is required.',
                'latitude': 'A map location is required.',
                'longitude': 'A map location is required.',
            })

        if has_location_input:
            if not location_address:
                raise serializers.ValidationError({'location_address': 'A location note or address is required.'})
            if latitude is None or longitude is None:
                raise serializers.ValidationError({
                    'latitude': 'A map location is required.',
                    'longitude': 'A map location is required.',
                })

            attrs['location_payload'] = {
                'address': location_address,
                'city': location_city or 'Unspecified',
                'province': location_province or 'Unspecified',
                'latitude': latitude,
                'longitude': longitude,
            }

        return attrs

    def create(self, validated_data):
        location_payload = validated_data.pop('location_payload', None)
        service_items_payload = validated_data.pop('service_items_payload', None)
        request_obj = ServiceRequest.objects.create(**validated_data)
        self._sync_service_items(request_obj, service_items_payload)
        if location_payload:
            ServiceLocation.objects.update_or_create(
                request=request_obj,
                defaults=location_payload,
            )
        return request_obj

    def update(self, instance, validated_data):
        location_payload = validated_data.pop('location_payload', None)
        service_items_payload = validated_data.pop('service_items_payload', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if service_items_payload is not None:
            self._sync_service_items(instance, service_items_payload)

        if location_payload:
            ServiceLocation.objects.update_or_create(
                request=instance,
                defaults=location_payload,
            )

        return instance

    def _sync_service_items(self, request_obj, service_types):
        if not service_types:
            service_types = [request_obj.service_type]

        ServiceRequestService.objects.filter(request=request_obj).exclude(
            service_type__in=service_types
        ).delete()
        for index, service_type in enumerate(service_types):
            ServiceRequestService.objects.update_or_create(
                request=request_obj,
                service_type=service_type,
                defaults={
                    'sort_order': index,
                    'status': request_obj.status,
                },
            )

    def _get_service_item_data(self, obj):
        items = list(obj.service_items.select_related('service_type').order_by('sort_order', 'id'))
        if not items and obj.service_type_id:
            items = [
                ServiceRequestService(
                    request=obj,
                    service_type=obj.service_type,
                    status=obj.status,
                    sort_order=0,
                )
            ]
        return ServiceRequestServiceSerializer(items, many=True).data

    def get_service_items(self, obj):
        return self._get_service_item_data(obj)

    def get_service_summary(self, obj):
        names = [
            item['service_type_name']
            for item in self._get_service_item_data(obj)
            if item.get('service_type_name')
        ]
        return ', '.join(names) or (obj.service_type.name if obj.service_type_id else '')

    def get_sla(self, obj):
        return serialize_sla_evaluation(evaluate_service_request_sla(obj))

    def get_client_fullname(self, obj):
        if not obj.client:
            return ''
        return obj.client.get_full_name().strip() or obj.client.username

    class Meta:
        model = ServiceRequest
        fields = [
            'id', 'client', 'client_name', 'client_fullname', 'client_phone', 'client_email', 'client_address',
            'service_type', 'service_type_name',
            'service_types', 'service_items', 'service_summary',
            'description', 'priority', 'status', 'preferred_date',
            'preferred_time_slot', 'request_source', 'request_source_label',
            'scheduling_notes', 'request_date', 'updated_at',
            'auto_ticket_created', 'location', 'sla', 'service', 'notes', 'lat', 'lng',
            'locationDesc', 'location_address', 'location_city',
            'location_province', 'latitude', 'longitude'
        ]
        read_only_fields = ['request_date', 'updated_at', 'auto_ticket_created']
        extra_kwargs = {
            'client': {'required': False},
            'service_type': {'required': False},
            'description': {'required': False},
        }
