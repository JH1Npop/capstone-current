from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.utils import timezone
from rest_framework import serializers
from .models import (
    ServiceType, SLARule, ServiceRequest, ServiceRequestService, ServiceLocation, SolarEstimate, ServiceTicket,
    AfterSalesCase as FollowUpCase,
    TechnicianSkill, ServiceStatusHistory, InspectionChecklist, SolarCommissioningChecklist,
    TechnicianLocationHistory, ServiceAnalytics, TechnicianPerformance,
    GeneratedDocument,
    DemandForecast, ServiceTrend, MaintenanceSchedule,
    InstalledEquipment, QuotationRecord, TurnoverAcceptance, TechnicalDataSheet,
    InstallationContract, SolarProjectProfile, FieldServiceReport
)
from .solar_calculator import CALCULATION_VERSION, SolarCalculationError, calculate_solar_estimate
from .sla import (
    evaluate_service_request_sla,
    evaluate_service_ticket_sla,
    get_ticket_dispatch_state,
    serialize_sla_evaluation,
)
from .user_display import client_technician_label

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
    client_name = serializers.SerializerMethodField()
    service_request_status = serializers.CharField(source='service_request.status', read_only=True)

    class Meta:
        model = SolarEstimate
        fields = [
            'id', 'client', 'client_name', 'service_request', 'service_request_status',
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


class TechnicianSkillSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)

    def get_technician_name(self, obj):
        lab = client_technician_label(obj.technician)
        return lab if lab is not None else ''

    class Meta:
        model = TechnicianSkill
        fields = ['id', 'service_type', 'service_type_name', 'skill_level', 'technician_name', 'technician']
        read_only_fields = ['id', 'technician_name', 'technician']

    def validate(self, attrs):
        """Check for duplicate skills"""
        technician = self.context.get('request').user
        service_type = attrs.get('service_type')

        # If updating, allow same skill
        if self.instance:
            if self.instance.service_type == service_type and self.instance.technician == technician:
                return attrs

        # Check if this skill already exists for this technician
        if TechnicianSkill.objects.filter(technician=technician, service_type=service_type).exists():
            raise serializers.ValidationError(
                f"You already have this skill. Update the existing skill level instead."
            )

        return attrs


class ServiceStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    def get_changed_by_name(self, obj):
        return client_technician_label(obj.changed_by) or ''

    class Meta:
        model = ServiceStatusHistory
        fields = '__all__'


class InspectionChecklistSerializer(serializers.ModelSerializer):
    completed_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()

    def get_completed_by_name(self, obj):
        return client_technician_label(obj.completed_by) or ''

    def get_submitted_by_name(self, obj):
        return client_technician_label(obj.submitted_by) or ''

    def validate(self, attrs):
        attrs = super().validate(attrs)
        maintenance_required = attrs.get(
            'maintenance_required',
            getattr(self.instance, 'maintenance_required', False),
        )
        maintenance_profile = attrs.get(
            'maintenance_profile',
            getattr(self.instance, 'maintenance_profile', None),
        )
        maintenance_interval_days = attrs.get(
            'maintenance_interval_days',
            getattr(self.instance, 'maintenance_interval_days', None),
        )
        warranty_provided = attrs.get(
            'warranty_provided',
            getattr(self.instance, 'warranty_provided', False),
        )
        warranty_period_days = attrs.get(
            'warranty_period_days',
            getattr(self.instance, 'warranty_period_days', None),
        )
        proof_media = attrs.get(
            'proof_media',
            getattr(self.instance, 'proof_media', []),
        )
        follow_up_required = attrs.get(
            'follow_up_required',
            getattr(self.instance, 'follow_up_required', False),
        )
        follow_up_case_type = attrs.get(
            'follow_up_case_type',
            getattr(self.instance, 'follow_up_case_type', None),
        )
        follow_up_due_date = attrs.get(
            'follow_up_due_date',
            getattr(self.instance, 'follow_up_due_date', None),
        )
        follow_up_summary = attrs.get(
            'follow_up_summary',
            getattr(self.instance, 'follow_up_summary', None),
        )

        if maintenance_required and not maintenance_profile:
            raise serializers.ValidationError({
                'maintenance_profile': 'Select a maintenance profile when scheduled maintenance is required.',
            })

        if maintenance_interval_days is not None and int(maintenance_interval_days) <= 0:
            raise serializers.ValidationError({
                'maintenance_interval_days': 'Maintenance interval must be greater than zero.',
            })

        if warranty_provided and not warranty_period_days:
            raise serializers.ValidationError({
                'warranty_period_days': 'Provide a warranty period when warranty coverage is enabled.',
            })

        if warranty_period_days is not None and int(warranty_period_days) <= 0:
            raise serializers.ValidationError({
                'warranty_period_days': 'Warranty period must be greater than zero.',
            })

        if proof_media and not isinstance(proof_media, list):
            raise serializers.ValidationError({
                'proof_media': 'Proof media must be provided as a list.',
            })
        checklist_items = attrs.get(
            'checklist_items',
            getattr(self.instance, 'checklist_items', []),
        )
        required_equipment_snapshot = attrs.get(
            'required_equipment_snapshot',
            getattr(self.instance, 'required_equipment_snapshot', []),
        )

        if checklist_items and not isinstance(checklist_items, list):
            raise serializers.ValidationError({
                'checklist_items': 'Checklist items must be provided as a list.',
            })

        if required_equipment_snapshot and not isinstance(required_equipment_snapshot, list):
            raise serializers.ValidationError({
                'required_equipment_snapshot': 'Required equipment must be provided as a list.',
            })

        if follow_up_required and not follow_up_case_type:
            raise serializers.ValidationError({
                'follow_up_case_type': 'Select an after-sales case type when follow-up is required.',
            })

        if follow_up_required and not follow_up_summary:
            raise serializers.ValidationError({
                'follow_up_summary': 'Provide a short handoff summary for the after-sales team.',
            })

        if follow_up_case_type == 'maintenance':
            raise serializers.ValidationError({
                'follow_up_case_type': 'Use the maintenance section instead of creating a maintenance handoff here.',
            })

        if follow_up_case_type == 'warranty' and not warranty_provided:
            raise serializers.ValidationError({
                'follow_up_case_type': 'Warranty follow-up requires warranty coverage to be enabled first.',
            })

        if follow_up_due_date and follow_up_due_date < timezone.localdate():
            raise serializers.ValidationError({
                'follow_up_due_date': 'Follow-up due date cannot be in the past.',
            })

        return attrs

    class Meta:
        model = InspectionChecklist
        fields = '__all__'


class SolarCommissioningChecklistSerializer(serializers.ModelSerializer):
    completed_by_name = serializers.SerializerMethodField()

    def get_completed_by_name(self, obj):
        return client_technician_label(obj.completed_by) or ''

    def validate(self, attrs):
        if self.instance and self.instance.status == 'finalized':
            raise serializers.ValidationError("Cannot update a Solar Commissioning Checklist that is already finalized.")
        attrs = super().validate(attrs)
        checklist_items_json = attrs.get(
            'checklist_items_json',
            getattr(self.instance, 'checklist_items_json', []),
        )
        readings_json = attrs.get(
            'readings_json',
            getattr(self.instance, 'readings_json', {}),
        )

        if checklist_items_json and not isinstance(checklist_items_json, list):
            raise serializers.ValidationError({
                'checklist_items_json': 'Checklist items must be provided as a list.',
            })

        if readings_json and not isinstance(readings_json, dict):
            raise serializers.ValidationError({
                'readings_json': 'Readings must be provided as an object.',
            })

        return attrs

    class Meta:
        model = SolarCommissioningChecklist
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']

class TurnoverAcceptanceSerializer(serializers.ModelSerializer):
    finalized_by_name = serializers.SerializerMethodField()

    def get_finalized_by_name(self, obj):
        return client_technician_label(obj.finalized_by) or ''

    def validate(self, attrs):
        if self.instance and self.instance.status == 'accepted':
            raise serializers.ValidationError("Cannot update a Turnover Acceptance that has already been accepted.")
        return super().validate(attrs)

    class Meta:
        model = TurnoverAcceptance
        fields = '__all__'
        read_only_fields = ['finalized_by', 'finalized_at', 'created_at', 'updated_at', 'generated_document']


class TechnicalDataSheetSerializer(serializers.ModelSerializer):
    prepared_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    def get_prepared_by_name(self, obj):
        return client_technician_label(obj.prepared_by) or ''

    def get_reviewed_by_name(self, obj):
        return client_technician_label(obj.reviewed_by) or ''

    def validate(self, attrs):
        if self.instance and self.instance.status == 'reviewed':
            raise serializers.ValidationError("Cannot update a Technical Data Sheet that has already been reviewed.")
        return super().validate(attrs)

    class Meta:
        model = TechnicalDataSheet
        fields = '__all__'
        read_only_fields = ['prepared_by', 'reviewed_by', 'created_at', 'updated_at', 'submitted_at', 'reviewed_at']


class QuotationRecordSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        if self.instance and self.instance.status in ['Accepted', 'Rejected']:
            raise serializers.ValidationError("Cannot update a Quotation Record that has already been accepted or rejected.")
        return super().validate(attrs)

    class Meta:
        model = QuotationRecord
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']



class GeneratedDocumentSerializer(serializers.ModelSerializer):
    generated_by_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()

    def get_generated_by_name(self, obj):
        return client_technician_label(obj.generated_by) or ''

    def get_ticket_code(self, obj):
        return f"TKT-{obj.ticket_id:04d}" if obj.ticket_id else ''

    def validate(self, attrs):
        if self.instance and self.instance.status == 'finalized':
            raise serializers.ValidationError("Cannot update a Generated Document that has already been finalized.")
        return super().validate(attrs)

    class Meta:
        model = GeneratedDocument
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'generated_by']


class TechnicianLocationHistorySerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()

    def get_technician_name(self, obj):
        return client_technician_label(obj.technician) or ''

    class Meta:
        model = TechnicianLocationHistory
        fields = '__all__'


class ServiceTicketReportSerializer(serializers.ModelSerializer):
    """Serializer for Service Ticket Report with proper display names"""
    client = serializers.SerializerMethodField()
    client_fullname = serializers.SerializerMethodField()
    service = serializers.SerializerMethodField()
    priority = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    sla = serializers.SerializerMethodField()
    dispatch_status = serializers.SerializerMethodField()
    dispatch_label = serializers.SerializerMethodField()
    dispatch_action = serializers.SerializerMethodField()
    is_missed_dispatch = serializers.SerializerMethodField()
    missed_dispatch_at = serializers.SerializerMethodField()
    dispatch_overdue_days = serializers.SerializerMethodField()
    technician_id = serializers.SerializerMethodField()
    technician_fullname = serializers.SerializerMethodField()
    next_step = serializers.SerializerMethodField()

    def get_client(self, obj):
        if obj.request and obj.request.client:
            return client_technician_label(obj.request.client) or "-"
        """Return client username/ID"""
        return obj.request.client.username if obj.request and obj.request.client else "—"

    def get_client_fullname(self, obj):
        """Return client's full name"""
        if obj.request and obj.request.client:
            client = obj.request.client
            full_name = f"{client.first_name or ''} {client.last_name or ''}".strip()
            return full_name or client.username
        return "—"

    def get_service(self, obj):
        if not obj.request_id or not obj.request:
            return 'Unknown'
        items = list(obj.request.service_items.select_related('service_type').order_by('sort_order', 'id'))
        names = [item.service_type.name for item in items if item.service_type_id]
        return ', '.join(names) or (obj.request.service_type.name if obj.request.service_type_id else 'Unknown')

    def get_sla(self, obj):
        """Return SLA status"""
        from .sla import evaluate_service_ticket_sla, serialize_sla_evaluation
        sla_evaluation = evaluate_service_ticket_sla(obj)
        return serialize_sla_evaluation(sla_evaluation)

    def _dispatch_state(self, obj):
        return get_ticket_dispatch_state(obj)

    def get_dispatch_status(self, obj):
        return self._dispatch_state(obj)['status']

    def get_dispatch_label(self, obj):
        return self._dispatch_state(obj)['label']

    def get_dispatch_action(self, obj):
        return self._dispatch_state(obj)['action']

    def get_is_missed_dispatch(self, obj):
        return self._dispatch_state(obj)['is_missed_dispatch']

    def get_missed_dispatch_at(self, obj):
        return self._dispatch_state(obj)['missed_dispatch_at']

    def get_dispatch_overdue_days(self, obj):
        return self._dispatch_state(obj)['overdue_days']

    def get_technician_id(self, obj):
        """Return technician ID"""
        return obj.technician.id if obj.technician else None

    def get_technician_fullname(self, obj):
        """Return technician's full name or — if null"""
        lab = client_technician_label(obj.technician) if obj.technician else None
        return lab or "—"

    def get_next_step(self, obj):
        """Return next step based on ticket status"""
        dispatch_state = self._dispatch_state(obj)
        if dispatch_state['is_missed_dispatch']:
            return dispatch_state['action']
        if obj.status == 'Not Started':
            return "Assign technician"
        elif obj.status == 'In Progress':
            return "Complete work"
        elif obj.status == 'Completed':
            return "Awaiting feedback"
        elif obj.status == 'On Hold':
            return "Resolve hold issue"
        else:
            return "Review status"

    class Meta:
        model = ServiceTicket
        fields = [
            'id', 'created_at', 'updated_at', 'client', 'client_fullname', 'service', 'priority', 'status',
            'sla', 'dispatch_status', 'dispatch_label', 'dispatch_action', 'is_missed_dispatch',
            'missed_dispatch_at', 'dispatch_overdue_days', 'technician_id', 'technician_fullname',
            'next_step',
        ]


class ServiceTicketSerializer(serializers.ModelSerializer):
    ticket_code = serializers.SerializerMethodField()
    request_id = serializers.IntegerField(source='request.id', read_only=True)
    request_code = serializers.SerializerMethodField()
    request_details = ServiceRequestSerializer(source='request', read_only=True)
    technician_name = serializers.SerializerMethodField()
    technician_fullname = serializers.SerializerMethodField()
    client_id = serializers.SerializerMethodField()
    client_fullname = serializers.SerializerMethodField()
    assigned_by_id = serializers.SerializerMethodField()
    assigned_by_name = serializers.SerializerMethodField()
    assigned_by_role = serializers.SerializerMethodField()
    assigned_admin_id = serializers.IntegerField(source='assigned_admin.id', read_only=True, allow_null=True)
    assigned_admin_name = serializers.SerializerMethodField()
    admin_owner_id = serializers.IntegerField(source='assigned_admin.id', read_only=True, allow_null=True)
    admin_owner_name = serializers.SerializerMethodField()
    status_history = ServiceStatusHistorySerializer(many=True, read_only=True)
    inspection = InspectionChecklistSerializer(read_only=True)
    inventory_reservations = serializers.SerializerMethodField()
    crew_members = serializers.SerializerMethodField()
    sla = serializers.SerializerMethodField()
    dispatch_status = serializers.SerializerMethodField()
    dispatch_label = serializers.SerializerMethodField()
    inventory_reservations = serializers.SerializerMethodField()
    crew_members = serializers.SerializerMethodField()
    sla = serializers.SerializerMethodField()
    dispatch_status = serializers.SerializerMethodField()
    dispatch_label = serializers.SerializerMethodField()
    dispatch_action = serializers.SerializerMethodField()
    is_missed_dispatch = serializers.SerializerMethodField()
    missed_dispatch_at = serializers.SerializerMethodField()
    dispatch_overdue_days = serializers.SerializerMethodField()
    maintenance_schedule = serializers.SerializerMethodField()
    after_sales_cases = serializers.SerializerMethodField()
    installed_equipment = serializers.SerializerMethodField()
    field_service_reports = serializers.SerializerMethodField()

    def get_inventory_reservations(self, obj):
        reservations = sorted(obj.inventory_reservations.all(), key=lambda x: x.id)
        return [
            {
                'id': reservation.id,
                'item_id': reservation.item_id,
                'item_name': reservation.item.name,
                'item_sku': reservation.item.sku,
                'quantity': reservation.quantity,
                'status': reservation.status,
                'required_date': reservation.required_date,
                'technician_id': reservation.technician_id,
                'technician_name': (
                    (client_technician_label(reservation.technician) or '')
                    if reservation.technician_id
                    else ''
                ),
                'notes': reservation.notes,
            }
            for reservation in reservations
        ]

    def get_crew_members(self, obj):
        return [
            {
                'id': assignment.technician_id,
                'username': assignment.technician.username,
                'name': (
                    client_technician_label(assignment.technician)
                    or assignment.technician.username
                ),
            }
            for assignment in obj.crew_assignments.select_related('technician').order_by('created_at', 'id')
        ]

    def get_sla(self, obj):
        return serialize_sla_evaluation(evaluate_service_ticket_sla(obj))

    def _dispatch_state(self, obj):
        return get_ticket_dispatch_state(obj)

    def get_dispatch_status(self, obj):
        return self._dispatch_state(obj)['status']

    def get_dispatch_label(self, obj):
        return self._dispatch_state(obj)['label']

    def get_dispatch_action(self, obj):
        return self._dispatch_state(obj)['action']

    def get_is_missed_dispatch(self, obj):
        return self._dispatch_state(obj)['is_missed_dispatch']

    def get_missed_dispatch_at(self, obj):
        return self._dispatch_state(obj)['missed_dispatch_at']

    def get_dispatch_overdue_days(self, obj):
        return self._dispatch_state(obj)['overdue_days']

    def get_maintenance_schedule(self, obj):
        try:
            schedule = obj.maintenance_schedule
        except MaintenanceSchedule.DoesNotExist:
            return None

        return {
            'id': schedule.id,
            'maintenance_profile': schedule.maintenance_profile,
            'interval_days': schedule.interval_days,
            'next_due_date': schedule.next_due_date,
            'notify_on_date': schedule.notify_on_date,
            'status': schedule.status,
            'maintenance_notes': schedule.maintenance_notes,
            'risk_level': schedule.risk_level,
        }

    def get_after_sales_cases(self, obj):
        cases = sorted(obj.after_sales_cases.all(), key=lambda x: getattr(x, 'created_at', None), reverse=True)[:5]
        return [
            {
                'id': case.id,
                'case_type': case.case_type,
                'status': case.status,
                'priority': case.priority,
                'summary': case.summary,
                'due_date': case.due_date,
                'creation_source': case.creation_source,
            }
            for case in cases
        ]

    def get_installed_equipment(self, obj):
        return [
            {
                'id': equipment.id,
                'brand_model': equipment.brand_model,
                'equipment_type': equipment.equipment_type,
                'serial_number': equipment.serial_number,
                'capacity': equipment.capacity,
                'location': equipment.location,
                'warranty_start': equipment.warranty_start,
                'warranty_end': equipment.warranty_end,
            }
            for equipment in obj.installed_equipment.all().order_by('-created_at', '-id')
        ]

    def get_field_service_reports(self, obj):
        return [
            {
                'id': report.id,
                'brand_model': report.brand_model,
                'serial_number': report.serial_number,
                'recommendation': report.recommendation,
                'client_acknowledged': report.client_acknowledged,
            }
            for report in obj.field_service_reports.all().order_by('-created_at', '-id')
        ]

    def get_ticket_code(self, obj):
        return f"TKT-{obj.id:04d}"

    def get_request_code(self, obj):
        return f"REQ-{obj.request_id:04d}" if obj.request_id else ''

    def get_technician_name(self, obj):
        lab = client_technician_label(obj.technician) if obj.technician_id else None
        return lab if lab is not None else ''

    def get_technician_fullname(self, obj):
        lab = client_technician_label(obj.technician) if obj.technician_id else None
        return lab if lab is not None else ''

    def get_client_id(self, obj):
        return obj.request.client_id if obj.request_id and obj.request else None

    def get_client_fullname(self, obj):
        if not obj.request_id or not obj.request or not obj.request.client:
            return ''
        return obj.request.client.get_full_name().strip() or obj.request.client.username

    def _get_assignment_history(self, obj):
        histories = [h for h in obj.status_history.all() if h.notes and 'assigned' in h.notes.lower()]
        return sorted(histories, key=lambda x: getattr(x, 'timestamp', None), reverse=True)[0] if histories else None

    def get_assigned_by_id(self, obj):
        assignment_history = self._get_assignment_history(obj)
        return assignment_history.changed_by_id if assignment_history else None

    def get_assigned_by_name(self, obj):
        assignment_history = self._get_assignment_history(obj)
        actor = assignment_history.changed_by if assignment_history else None
        if not actor:
            return ''
        return actor.get_full_name().strip() or actor.username

    def get_assigned_by_role(self, obj):
        assignment_history = self._get_assignment_history(obj)
        actor = assignment_history.changed_by if assignment_history else None
        return getattr(actor, 'role', '') if actor else ''

    def get_assigned_admin_name(self, obj):
        return client_technician_label(obj.assigned_admin) or ''

    def get_admin_owner_name(self, obj):
        return self.get_assigned_admin_name(obj)

    class Meta:
        model = ServiceTicket
        fields = '__all__'
        read_only_fields = ['assigned_at', 'route_geometry', 'route_distance', 'route_duration']


class FollowUpCaseSerializer(serializers.ModelSerializer):
    case_code = serializers.SerializerMethodField()
    client_id = serializers.IntegerField(source='client.id', read_only=True)
    client_name = serializers.SerializerMethodField()
    client_full_name = serializers.SerializerMethodField()
    client_email = serializers.CharField(source='client.email', read_only=True)
    client_phone = serializers.CharField(source='client.phone', read_only=True)
    assigned_to_id = serializers.IntegerField(source='assigned_to.id', read_only=True, allow_null=True)
    assigned_to_name = serializers.SerializerMethodField()
    assigned_to_full_name = serializers.SerializerMethodField()
    assigned_admin_id = serializers.IntegerField(source='assigned_to.id', read_only=True, allow_null=True)
    assigned_admin_name = serializers.SerializerMethodField()
    assigned_admin_full_name = serializers.SerializerMethodField()
    admin_owner_id = serializers.IntegerField(source='assigned_to.id', read_only=True, allow_null=True)
    admin_owner_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    service_type_name = serializers.CharField(source='service_ticket.request.service_type.name', read_only=True)
    service_address = serializers.SerializerMethodField()
    ticket_id = serializers.IntegerField(source='service_ticket.id', read_only=True)
    ticket_code = serializers.SerializerMethodField()
    service_request_id = serializers.IntegerField(source='service_ticket.request.id', read_only=True)
    service_request_code = serializers.SerializerMethodField()
    ticket_status = serializers.CharField(source='service_ticket.status', read_only=True)
    ticket_completed_date = serializers.DateTimeField(source='service_ticket.completed_date', read_only=True)
    ticket_warranty_status = serializers.CharField(source='service_ticket.warranty_status', read_only=True)
    ticket_warranty_end_date = serializers.DateField(source='service_ticket.warranty_end_date', read_only=True)
    technician_id = serializers.IntegerField(source='service_ticket.technician.id', read_only=True, allow_null=True)
    technician_name = serializers.SerializerMethodField()

    def get_case_code(self, obj):
        return f"ASC-{obj.id:04d}"

    def get_client_name(self, obj):
        return client_technician_label(obj.client) or ''

    def get_assigned_to_name(self, obj):
        return client_technician_label(obj.assigned_to) or ''

    def get_assigned_admin_name(self, obj):
        return self.get_assigned_to_name(obj)

    def get_admin_owner_name(self, obj):
        return self.get_assigned_to_name(obj)

    def get_created_by_name(self, obj):
        return client_technician_label(obj.created_by) or ''
    technician_full_name = serializers.SerializerMethodField()
    creation_source_label = serializers.CharField(source='get_creation_source_display', read_only=True)

    def get_client_full_name(self, obj):
        return f"{obj.client.first_name} {obj.client.last_name}".strip() or obj.client.username

    def get_assigned_to_full_name(self, obj):
        if obj.assigned_to:
            return f"{obj.assigned_to.first_name} {obj.assigned_to.last_name}".strip() or obj.assigned_to.username
        return None

    def get_assigned_admin_full_name(self, obj):
        return self.get_assigned_to_full_name(obj)

    def get_technician_name(self, obj):
        st = getattr(obj, 'service_ticket', None)
        if not st or not st.technician_id:
            return None
        return client_technician_label(st.technician)

    def get_technician_full_name(self, obj):
        st = getattr(obj, 'service_ticket', None)
        if not st or not st.technician_id:
            return None
        return client_technician_label(st.technician)

    def get_service_address(self, obj):
        try:
            return obj.service_ticket.request.location.address
        except ServiceLocation.DoesNotExist:
            return obj.client.address or None

    def get_ticket_code(self, obj):
        return f"TKT-{obj.service_ticket_id:04d}" if obj.service_ticket_id else ''

    def get_service_request_code(self, obj):
        ticket = getattr(obj, 'service_ticket', None)
        return f"REQ-{ticket.request_id:04d}" if ticket and ticket.request_id else ''

    class Meta:
        model = FollowUpCase
        fields = '__all__'
        read_only_fields = ['client', 'created_by', 'resolved_at', 'created_at', 'updated_at', 'creation_source']


# Auto-assignment serializer
class AutoAssignSerializer(serializers.Serializer):
    """Serializer for auto-assignment request"""
    ticket_id = serializers.IntegerField()
    service_type_id = serializers.IntegerField()
    request_latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    request_longitude = serializers.DecimalField(max_digits=9, decimal_places=6)


# Analytics Serializers
class ServiceAnalyticsSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)

    class Meta:
        model = ServiceAnalytics
        fields = [
            'id', 'date', 'service_type', 'service_type_name',
            'total_requests', 'completed_requests', 'pending_requests', 'cancelled_requests',
            'avg_response_time_hours', 'avg_completion_time_hours', 'technician_utilization_rate',
            'service_area_coverage', 'popular_locations', 'satisfaction_score', 'created_at'
        ]


class TechnicianPerformanceSerializer(serializers.ModelSerializer):
    technician_name = serializers.SerializerMethodField()

    def get_technician_name(self, obj):
        return client_technician_label(obj.technician) or ''

    class Meta:
        model = TechnicianPerformance
        fields = [
            'id', 'technician', 'technician_name', 'date',
            'tickets_assigned', 'tickets_completed', 'tickets_pending',
            'total_work_hours', 'avg_response_time_hours', 'avg_completion_time_hours',
            'customer_satisfaction', 'rework_rate', 'distance_traveled_km', 'fuel_efficiency',
            'created_at'
        ]


class DemandForecastSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)

    class Meta:
        model = DemandForecast
        fields = [
            'id', 'service_type', 'service_type_name', 'forecast_date', 'forecast_period',
            'predicted_requests', 'confidence_level', 'weather_impact', 'seasonal_trend',
            'historical_average', 'actual_requests', 'forecast_accuracy', 'generated_at'
        ]


class ServiceTrendSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)

    class Meta:
        model = ServiceTrend
        fields = [
            'id', 'service_type', 'service_type_name', 'trend_type', 'period_start', 'period_end',
            'average_requests', 'peak_day', 'peak_hour', 'growth_rate', 'trend_direction',
            'standard_deviation', 'confidence_interval', 'created_at'
        ]

class InstalledEquipmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstalledEquipment
        fields = [
            'id', 'ticket', 'client', 'brand_model', 'equipment_type',
            'serial_number', 'capacity', 'location', 'warranty_start',
            'warranty_end', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

class InstallationContractSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        if self.instance and self.instance.status == 'signed':
            raise serializers.ValidationError("Cannot update an Installation Contract that has already been signed.")
        return super().validate(attrs)

    class Meta:
        model = InstallationContract
        fields = [
            'id', 'ticket', 'scope_of_work', 'start_date', 'estimated_completion_days',
            'total_contract_amount', 'payment_terms_upfront', 'payment_terms_completion',
            'payment_terms_final', 'warranty_period', 'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

class SolarProjectProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = SolarProjectProfile
        fields = '__all__'

class FieldServiceReportSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        if self.instance and self.instance.client_acknowledged:
            raise serializers.ValidationError("Cannot update a Field Service Report that has already been acknowledged by the client.")
        return super().validate(attrs)

    class Meta:
        model = FieldServiceReport
        fields = '__all__'
