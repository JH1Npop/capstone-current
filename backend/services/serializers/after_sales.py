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

class AfterSalesCaseEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    def get_actor_name(self, obj):
        return client_technician_label(obj.actor) or 'System'

    class Meta:
        model = AfterSalesCaseEvent
        fields = [
            'id', 'event_type', 'from_status', 'to_status', 'notes',
            'metadata', 'actor', 'actor_name', 'created_at',
        ]
        read_only_fields = fields


class FollowUpCaseSerializer(serializers.ModelSerializer):
    ALLOWED_STATUS_TRANSITIONS = {
        'open': {'in_progress', 'resolved', 'closed'},
        'in_progress': {'open', 'resolved', 'closed'},
        'resolved': {'open', 'closed'},
        'closed': {'open'},
    }

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
    events = AfterSalesCaseEventSerializer(many=True, read_only=True)
    status_change_note = serializers.CharField(write_only=True, required=False, allow_blank=True)

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

    def validate(self, attrs):
        attrs = super().validate(attrs)
        service_ticket = attrs.get('service_ticket', getattr(self.instance, 'service_ticket', None))
        if self.instance and 'service_ticket' in attrs and attrs['service_ticket'].id != self.instance.service_ticket_id:
            raise serializers.ValidationError({'service_ticket': 'The case service ticket cannot be changed.'})

        assigned_to = attrs.get('assigned_to', getattr(self.instance, 'assigned_to', None))
        if assigned_to and (
            assigned_to.role not in {'admin', 'superadmin'}
            or assigned_to.status != 'active'
            or not assigned_to.is_active
        ):
            raise serializers.ValidationError({'assigned_to': 'Choose an active admin or superadmin.'})

        due_date = attrs.get('due_date', getattr(self.instance, 'due_date', None))
        status_value = attrs.get('status', getattr(self.instance, 'status', 'open'))
        status_change_note = str(attrs.get('status_change_note') or '').strip()
        if self.instance is None and status_value != 'open':
            raise serializers.ValidationError({
                'status': 'New after-sales cases must start as open.',
            })
        if self.instance and status_value != self.instance.status:
            allowed_statuses = self.ALLOWED_STATUS_TRANSITIONS.get(self.instance.status, set())
            if status_value not in allowed_statuses:
                raise serializers.ValidationError({
                    'status': f'Cannot move an after-sales case from {self.instance.status} to {status_value}.',
                })
            if self.instance.status in {'resolved', 'closed'} and status_value == 'open' and not status_change_note:
                raise serializers.ValidationError({
                    'status_change_note': 'A reason is required when reopening a case.',
                })
        if due_date and status_value in {'open', 'in_progress'} and due_date < timezone.localdate():
            raise serializers.ValidationError({'due_date': 'Open case due date cannot be in the past.'})

        resolution_notes = str(
            attrs.get('resolution_notes', getattr(self.instance, 'resolution_notes', None)) or ''
        ).strip()
        if status_value in {'resolved', 'closed'} and not resolution_notes:
            raise serializers.ValidationError({'resolution_notes': 'Resolution notes are required to resolve or close a case.'})

        if service_ticket and service_ticket.status not in {'Completed', 'Turned Over / Accepted'}:
            raise serializers.ValidationError({
                'service_ticket': 'After-sales cases can only be opened for completed tickets.',
            })

        satisfaction = attrs.get('customer_satisfaction', getattr(self.instance, 'customer_satisfaction', None))
        if satisfaction is not None and not 1 <= satisfaction <= 5:
            raise serializers.ValidationError({'customer_satisfaction': 'Satisfaction must be between 1 and 5.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('status_change_note', None)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        self.status_change_note = str(validated_data.pop('status_change_note', '') or '').strip()
        return super().update(instance, validated_data)

    class Meta:
        model = FollowUpCase
        fields = '__all__'
        read_only_fields = ['client', 'created_by', 'resolved_at', 'created_at', 'updated_at', 'creation_source']


# Auto-assignment serializer
