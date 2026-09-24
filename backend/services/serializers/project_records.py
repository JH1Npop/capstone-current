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

class InstalledEquipmentSerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        ticket = attrs.get('ticket', getattr(self.instance, 'ticket', None))
        client = attrs.get('client', getattr(self.instance, 'client', None))
        if ticket and client and ticket.request.client_id != client.id:
            raise serializers.ValidationError({
                'client': 'Equipment client must match the service ticket client.',
            })
        warranty_start = attrs.get('warranty_start', getattr(self.instance, 'warranty_start', None))
        warranty_end = attrs.get('warranty_end', getattr(self.instance, 'warranty_end', None))
        if warranty_start and warranty_end and warranty_end < warranty_start:
            raise serializers.ValidationError({'warranty_end': 'Warranty end cannot be before warranty start.'})
        return super().validate(attrs)

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
    def validate(self, attrs):
        location = attrs.get('location', getattr(self.instance, 'location', None))
        ticket = attrs.get('original_ticket', getattr(self.instance, 'original_ticket', None))
        if location and ticket and ticket.request_id != location.request_id:
            raise serializers.ValidationError({
                'original_ticket': 'Project ticket and service location must belong to the same request.',
            })
        for field in ('number_of_panels', 'number_of_inverters'):
            value = attrs.get(field, getattr(self.instance, field, None))
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'Value cannot be negative.'})
        return super().validate(attrs)

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
