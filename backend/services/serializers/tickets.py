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
from ..job_progress import get_ticket_workflow_progress

from .field_operations import InspectionChecklistSerializer, ServiceStatusHistorySerializer
from .requests import ServiceRequestSerializer

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
        from ..sla import evaluate_service_ticket_sla, serialize_sla_evaluation
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
    workflow_progress = serializers.SerializerMethodField()
    workflow_progress_label = serializers.SerializerMethodField()
    workflow_progress_basis = serializers.SerializerMethodField()
    workflow_progress_paused = serializers.SerializerMethodField()
    workflow_progress_track = serializers.SerializerMethodField()
    workflow_progress_track_label = serializers.SerializerMethodField()

    def _workflow_progress(self, obj):
        cache_name = '_serialized_workflow_progress'
        if not hasattr(obj, cache_name):
            setattr(obj, cache_name, get_ticket_workflow_progress(obj))
        return getattr(obj, cache_name)

    def get_workflow_progress(self, obj):
        return self._workflow_progress(obj)['percent']

    def get_workflow_progress_label(self, obj):
        return self._workflow_progress(obj)['label']

    def get_workflow_progress_basis(self, obj):
        return self._workflow_progress(obj)['basis']

    def get_workflow_progress_paused(self, obj):
        return self._workflow_progress(obj)['is_paused']

    def get_workflow_progress_track(self, obj):
        return self._workflow_progress(obj)['track']

    def get_workflow_progress_track_label(self, obj):
        return self._workflow_progress(obj)['track_label']

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
