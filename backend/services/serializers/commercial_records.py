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

class TechnicalDataSheetSerializer(serializers.ModelSerializer):
    purpose_of_going_solar = serializers.JSONField(required=False)
    load_schedule_json = serializers.JSONField(required=False)
    generator_details_json = serializers.JSONField(required=False)
    attachments_json = serializers.JSONField(required=False)
    prepared_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    def get_prepared_by_name(self, obj):
        return client_technician_label(obj.prepared_by) or ''

    def get_reviewed_by_name(self, obj):
        return client_technician_label(obj.reviewed_by) or ''

    def validate(self, attrs):
        if self.instance and self.instance.status == 'reviewed':
            raise serializers.ValidationError("Cannot update a Technical Data Sheet that has already been reviewed.")
        expected_types = {
            'purpose_of_going_solar': list,
            'load_schedule_json': list,
            'generator_details_json': dict,
            'attachments_json': dict,
        }
        for field, expected_type in expected_types.items():
            value = attrs.get(field, getattr(self.instance, field, expected_type()))
            if not isinstance(value, expected_type):
                raise serializers.ValidationError({
                    field: f'{field.replace("_", " ").capitalize()} must be a {expected_type.__name__}.',
                })
        return super().validate(attrs)

    class Meta:
        model = TechnicalDataSheet
        fields = '__all__'
        read_only_fields = ['prepared_by', 'reviewed_by', 'created_at', 'updated_at', 'submitted_at', 'reviewed_at']


class QuotationRecordSerializer(serializers.ModelSerializer):
    bill_of_materials = serializers.JSONField(required=False)

    def validate(self, attrs):
        if self.instance and self.instance.status in ['Accepted', 'Rejected']:
            raise serializers.ValidationError("Cannot update a Quotation Record that has already been accepted or rejected.")
        ticket = attrs.get('ticket', getattr(self.instance, 'ticket', None))
        client = attrs.get('client', getattr(self.instance, 'client', None))
        if ticket and client and ticket.request.client_id != client.id:
            raise serializers.ValidationError({
                'client': 'Quotation client must match the service ticket client.',
            })
        quotation_number = str(
            attrs.get('quotation_number', getattr(self.instance, 'quotation_number', '')) or ''
        ).strip().upper()
        if not quotation_number and ticket:
            quotation_number = f'QUO-{ticket.id:04d}'
        if not quotation_number:
            raise serializers.ValidationError({'quotation_number': 'Quotation number is required.'})
        duplicate = QuotationRecord.objects.filter(quotation_number__iexact=quotation_number)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError({'quotation_number': 'This quotation number is already in use.'})
        attrs['quotation_number'] = quotation_number
        validity_days = attrs.get('validity_days', getattr(self.instance, 'validity_days', 30))
        if validity_days is not None and not 1 <= validity_days <= 365:
            raise serializers.ValidationError({'validity_days': 'Validity must be between 1 and 365 days.'})
        bill_of_materials = attrs.get('bill_of_materials', getattr(self.instance, 'bill_of_materials', []))
        if not isinstance(bill_of_materials, list):
            raise serializers.ValidationError({'bill_of_materials': 'Bill of materials must be a list.'})
        if len(bill_of_materials) > 500:
            raise serializers.ValidationError({'bill_of_materials': 'Bill of materials cannot exceed 500 rows.'})
        if any(not isinstance(row, dict) for row in bill_of_materials):
            raise serializers.ValidationError({'bill_of_materials': 'Every bill-of-materials row must be an object.'})
        return super().validate(attrs)

    class Meta:
        model = QuotationRecord
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class SalesRecordLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesRecordLine
        fields = [
            'id', 'line_type', 'service_type', 'inventory_item', 'installed_equipment',
            'name', 'sku', 'quantity', 'unit', 'unit_price', 'line_total',
            'source_snapshot', 'sort_order',
        ]
        read_only_fields = fields


class SalesRecordSerializer(serializers.ModelSerializer):
    line_items = SalesRecordLineSerializer(many=True, read_only=True)
    client_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()
    service_summary = serializers.SerializerMethodField()
    quotation_number = serializers.CharField(source='quotation.quotation_number', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()
    agreed_total_source = serializers.SerializerMethodField()

    def get_client_name(self, obj):
        return client_technician_label(obj.client) or obj.client.username

    def get_ticket_code(self, obj):
        return f'TKT-{obj.ticket_id:04d}'

    def get_service_summary(self, obj):
        names = [
            item.service_type.name
            for item in obj.ticket.request.service_items.select_related('service_type').order_by('sort_order', 'id')
            if item.service_type_id
        ]
        if names:
            return ', '.join(names)
        return obj.ticket.request.service_type.name if obj.ticket.request.service_type_id else 'Service'

    def get_created_by_name(self, obj):
        return client_technician_label(obj.created_by) or ''

    def get_confirmed_by_name(self, obj):
        return client_technician_label(obj.confirmed_by) or ''

    def get_voided_by_name(self, obj):
        return client_technician_label(obj.voided_by) or ''

    def get_agreed_total_source(self, obj):
        snapshot = obj.source_snapshot if isinstance(obj.source_snapshot, dict) else {}
        agreed_value = snapshot.get('agreed_value')
        if isinstance(agreed_value, dict):
            source = agreed_value.get('source')
            if source in {'accepted_quotation', 'signed_contract'}:
                return source
        if obj.agreed_total is not None:
            return 'manual'
        return 'not_recorded'

    def validate_agreed_total(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Recorded contract value cannot be negative.')
        return value

    def validate_currency_code(self, value):
        code = str(value or '').strip().upper()
        if len(code) != 3 or not code.isalpha():
            raise serializers.ValidationError('Use a three-letter currency code such as PHP.')
        return code

    class Meta:
        model = SalesRecord
        fields = [
            'id', 'record_number', 'ticket', 'ticket_code', 'client', 'client_name',
            'quotation', 'quotation_number', 'service_summary', 'status', 'sale_date',
            'currency_code', 'agreed_total', 'agreed_total_source', 'notes', 'source_snapshot', 'line_items',
            'created_by', 'created_by_name', 'confirmed_by', 'confirmed_by_name',
            'confirmed_at', 'voided_by', 'voided_by_name', 'voided_at', 'void_reason',
            'replaces', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'record_number', 'ticket', 'client', 'quotation', 'status', 'sale_date',
            'source_snapshot', 'created_by', 'confirmed_by', 'confirmed_at', 'voided_by',
            'voided_at', 'void_reason', 'replaces', 'created_at', 'updated_at',
        ]



class GeneratedDocumentSerializer(serializers.ModelSerializer):
    document_code = serializers.SerializerMethodField()
    data_json = serializers.JSONField(required=False)
    source_snapshot_json = serializers.JSONField(required=False)
    generated_by_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()

    def get_generated_by_name(self, obj):
        return client_technician_label(obj.generated_by) or ''

    def get_ticket_code(self, obj):
        return f"TKT-{obj.ticket_id:04d}" if obj.ticket_id else ''

    def get_document_code(self, obj):
        return f'DOC-{obj.id:04d}'

    def validate(self, attrs):
        if self.instance and self.instance.status == 'finalized':
            raise serializers.ValidationError("Cannot update a Generated Document that has already been finalized.")
        for field in ('data_json', 'source_snapshot_json'):
            value = attrs.get(field, getattr(self.instance, field, {}))
            if not isinstance(value, dict):
                raise serializers.ValidationError({field: 'Value must be an object.'})
        return super().validate(attrs)

    class Meta:
        model = GeneratedDocument
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'generated_by']
