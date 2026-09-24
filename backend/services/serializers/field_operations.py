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
    checklist_items = serializers.JSONField(required=False)
    required_equipment_snapshot = serializers.JSONField(required=False)
    proof_media = serializers.JSONField(required=False)
    completed_by_name = serializers.SerializerMethodField()
    submitted_by_name = serializers.SerializerMethodField()

    def get_completed_by_name(self, obj):
        return client_technician_label(obj.completed_by) or ''

    def get_submitted_by_name(self, obj):
        return client_technician_label(obj.submitted_by) or ''

    def validate(self, attrs):
        attrs = super().validate(attrs)
        ticket = attrs.get('ticket', getattr(self.instance, 'ticket', None))
        is_site_inspection = bool(ticket and ticket.ticket_type == 'inspection')

        if self.instance is None and is_site_inspection:
            required_answers = {
                'site_accessible': 'Confirm whether the site is accessible.',
                'electrical_adequate': 'Confirm whether the electrical supply is adequate.',
                'safety_equipment_present': 'Confirm whether the required safety equipment is present.',
                'recommendation': 'Choose an overall inspection recommendation.',
            }
            missing_answers = {
                field: message
                for field, message in required_answers.items()
                if field not in self.initial_data or self.initial_data.get(field) in (None, '')
            }
            if missing_answers:
                raise serializers.ValidationError(missing_answers)

        if is_site_inspection:
            site_accessible = attrs.get('site_accessible', getattr(self.instance, 'site_accessible', None))
            site_accessible_notes = str(attrs.get('site_accessible_notes', getattr(self.instance, 'site_accessible_notes', '')) or '').strip()
            electrical_adequate = attrs.get('electrical_adequate', getattr(self.instance, 'electrical_adequate', None))
            electrical_notes = str(attrs.get('electrical_notes', getattr(self.instance, 'electrical_notes', '')) or '').strip()
            safety_equipment_present = attrs.get('safety_equipment_present', getattr(self.instance, 'safety_equipment_present', None))
            safety_hazards = str(attrs.get('safety_hazards', getattr(self.instance, 'safety_hazards', '')) or '').strip()
            recommendation = str(attrs.get('recommendation', getattr(self.instance, 'recommendation', '')) or '').strip()

            inspection_errors = {}
            if site_accessible is False and not site_accessible_notes:
                inspection_errors['site_accessible_notes'] = 'Explain why the site is not accessible.'
            if electrical_adequate is False and not electrical_notes:
                inspection_errors['electrical_notes'] = 'Describe the electrical issue.'
            if safety_equipment_present is False and not safety_hazards:
                inspection_errors['safety_hazards'] = 'Describe missing safety equipment or site hazards.'
            if recommendation and recommendation not in {'Approved', 'Conditional', 'Rejected'}:
                inspection_errors['recommendation'] = 'Choose Approved, Conditional, or Rejected.'
            if inspection_errors:
                raise serializers.ValidationError(inspection_errors)

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
    readings_json = serializers.JSONField(required=False)
    checklist_items_json = serializers.JSONField(required=False)
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
