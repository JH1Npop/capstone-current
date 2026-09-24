from django.contrib import admin
from .models import (
    ServiceType, ServiceRequest, ServiceLocation, ServiceTicket,
    TechnicianSkill, ServiceStatusHistory, InspectionChecklist,
    TechnicianLocationHistory, AfterSalesCase, MaintenanceSchedule,
    TicketCrewAssignment, ServiceAnalytics, TechnicianPerformance,
    DemandForecast, ServiceTrend,
    SalesRecord, SalesRecordLine,
)


class SalesRecordLineInline(admin.TabularInline):
    model = SalesRecordLine
    extra = 0
    can_delete = False
    readonly_fields = [
        'line_type', 'service_type', 'inventory_item', 'installed_equipment', 'name',
        'sku', 'quantity', 'unit', 'unit_price', 'line_total', 'source_snapshot', 'sort_order',
    ]

    def has_add_permission(self, request, obj=None):
        return False


class ServiceLocationInline(admin.StackedInline):
    model = ServiceLocation
    extra = 0
    can_delete = False
    fk_name = 'request'
    fields = ('address', 'city', 'province', 'latitude', 'longitude')


class ServiceTicketInline(admin.TabularInline):
    model = ServiceTicket
    extra = 0
    fields = ('id', 'technician', 'assigned_admin', 'status', 'priority', 'scheduled_date', 'auto_assigned')
    readonly_fields = ('id',)
    show_change_link = True


class TicketCrewAssignmentInline(admin.TabularInline):
    model = TicketCrewAssignment
    extra = 0
    raw_id_fields = ['technician']
    readonly_fields = ['created_at']
    fields = ('technician', 'created_at')


class ServiceStatusHistoryInline(admin.TabularInline):
    model = ServiceStatusHistory
    extra = 0
    raw_id_fields = ['changed_by']
    readonly_fields = ['status', 'changed_by', 'notes', 'timestamp']
    fields = ('status', 'changed_by', 'notes', 'timestamp')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class InspectionChecklistInline(admin.StackedInline):
    model = InspectionChecklist
    extra = 0
    fk_name = 'ticket'
    readonly_fields = ('created_at', 'completed_at', 'submitted_at')
    fields = (
        'is_completed',
        'recommendation',
        'completed_by',
        'completed_at',
        'submitted_by',
        'submitted_at',
        'maintenance_required',
        'maintenance_profile',
        'maintenance_interval_days',
        'warranty_provided',
        'warranty_period_days',
        'follow_up_required',
        'follow_up_case_type',
        'follow_up_due_date',
        'follow_up_summary',
        'created_at',
    )


class AfterSalesCaseInline(admin.TabularInline):
    model = AfterSalesCase
    extra = 0
    raw_id_fields = ['client', 'assigned_to', 'created_by']
    readonly_fields = ['status', 'priority', 'case_type', 'creation_source', 'due_date', 'created_at']
    fields = ('case_type', 'status', 'priority', 'assigned_to', 'creation_source', 'due_date', 'created_at')
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False


class MaintenanceScheduleInline(admin.StackedInline):
    model = MaintenanceSchedule
    extra = 0
    fk_name = 'service_ticket'
    readonly_fields = ('created_at', 'updated_at')
    fields = (
        'client',
        'service_type',
        'maintenance_profile',
        'status',
        'interval_days',
        'next_due_date',
        'notify_on_date',
        'risk_level',
        'risk_score',
        'created_at',
        'updated_at',
    )


@admin.register(ServiceType)
class ServiceTypeAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'estimated_duration', 'estimated_cost', 'max_daily_assignments']
    search_fields = ['name']


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = ['id', 'client', 'service_type', 'priority', 'status', 'request_date']
    list_filter = ['status', 'priority', 'service_type']
    search_fields = ['client__username', 'description']
    raw_id_fields = ['client', 'service_type']
    inlines = [ServiceLocationInline, ServiceTicketInline]


@admin.register(ServiceLocation)
class ServiceLocationAdmin(admin.ModelAdmin):
    list_display = ['id', 'request', 'address', 'city', 'province', 'latitude', 'longitude']
    search_fields = ['address', 'city']
    raw_id_fields = ['request']


@admin.register(ServiceTicket)
class ServiceTicketAdmin(admin.ModelAdmin):
    list_display = ['id', 'request', 'technician', 'assigned_admin', 'status', 'priority', 'scheduled_date', 'auto_assigned', 'crew_size']
    list_filter = ['status', 'priority', 'auto_assigned', 'scheduled_date']
    search_fields = ['request__id', 'request__client__username', 'request__service_type__name', 'technician__username', 'assigned_admin__username']
    raw_id_fields = ['request', 'technician', 'assigned_admin']
    readonly_fields = ['assigned_at', 'smart_assignment_score', 'smart_assignment_summary', 'route_distance', 'route_duration', 'created_at', 'updated_at']
    inlines = [
        TicketCrewAssignmentInline,
        InspectionChecklistInline,
        MaintenanceScheduleInline,
        AfterSalesCaseInline,
        ServiceStatusHistoryInline,
    ]

    @admin.display(description='Crew')
    def crew_size(self, obj):
        return obj.crew_assignments.count()


@admin.register(SalesRecord)
class SalesRecordAdmin(admin.ModelAdmin):
    list_display = ['record_number', 'ticket', 'client', 'status', 'sale_date', 'agreed_total', 'currency_code']
    list_filter = ['status', 'sale_date', 'currency_code']
    search_fields = ['record_number', 'ticket__id', 'client__username', 'client__first_name', 'client__last_name']
    raw_id_fields = ['ticket', 'client', 'quotation', 'created_by', 'confirmed_by', 'voided_by', 'replaces']
    readonly_fields = [
        'record_number', 'ticket', 'client', 'quotation', 'status', 'sale_date',
        'currency_code', 'agreed_total', 'notes', 'source_snapshot', 'created_by',
        'confirmed_by', 'confirmed_at', 'voided_by', 'voided_at', 'void_reason',
        'replaces', 'created_at', 'updated_at',
    ]
    inlines = [SalesRecordLineInline]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(TechnicianSkill)
class TechnicianSkillAdmin(admin.ModelAdmin):
    list_display = ['id', 'technician', 'service_type', 'skill_level']
    list_filter = ['skill_level', 'service_type']
    raw_id_fields = ['technician', 'service_type']


@admin.register(ServiceStatusHistory)
class ServiceStatusHistoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'status', 'changed_by', 'timestamp']
    list_filter = ['status', 'timestamp']
    raw_id_fields = ['ticket', 'changed_by']
    readonly_fields = ['timestamp']

    def has_add_permission(self, request):
        return False


@admin.register(InspectionChecklist)
class InspectionChecklistAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'is_completed', 'recommendation', 'maintenance_required', 'warranty_provided', 'created_at', 'completed_at']
    list_filter = ['is_completed', 'recommendation', 'maintenance_required', 'warranty_provided']
    raw_id_fields = ['ticket', 'completed_by']
    readonly_fields = ['created_at']


@admin.register(TechnicianLocationHistory)
class TechnicianLocationHistoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'technician', 'latitude', 'longitude', 'timestamp', 'accuracy']
    list_filter = ['timestamp', 'technician']
    raw_id_fields = ['technician']
    readonly_fields = ['timestamp']


@admin.register(AfterSalesCase)
class AfterSalesCaseAdmin(admin.ModelAdmin):
    list_display = ['id', 'service_ticket', 'client', 'assigned_to', 'case_type', 'status', 'priority', 'creation_source', 'due_date', 'created_at']
    list_filter = ['case_type', 'status', 'priority', 'creation_source']
    search_fields = ['summary', 'client__username']
    raw_id_fields = ['service_ticket', 'client', 'assigned_to', 'created_by']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(MaintenanceSchedule)
class MaintenanceScheduleAdmin(admin.ModelAdmin):
    list_display = ['id', 'service_ticket', 'client', 'service_type', 'maintenance_profile', 'status', 'next_due_date', 'risk_level']
    list_filter = ['status', 'maintenance_profile', 'risk_level']
    search_fields = ['client__username', 'service_type__name']
    raw_id_fields = ['service_ticket', 'client', 'service_type']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(TicketCrewAssignment)
class TicketCrewAssignmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'technician', 'created_at']
    raw_id_fields = ['ticket', 'technician']
    readonly_fields = ['created_at']


@admin.register(ServiceAnalytics)
class ServiceAnalyticsAdmin(admin.ModelAdmin):
    list_display = ['id', 'date', 'service_type', 'total_requests', 'completed_requests', 'avg_completion_time_hours']
    list_filter = ['date', 'service_type']
    readonly_fields = ['created_at']


@admin.register(TechnicianPerformance)
class TechnicianPerformanceAdmin(admin.ModelAdmin):
    list_display = ['id', 'technician', 'date', 'tickets_assigned', 'tickets_completed', 'customer_satisfaction']
    list_filter = ['date']
    raw_id_fields = ['technician']
    readonly_fields = ['created_at']


@admin.register(DemandForecast)
class DemandForecastAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'service_type', 'forecast_date', 'forecast_period',
        'predicted_requests', 'confidence_level', 'generated_at'
    ]
    list_filter = ['forecast_period', 'forecast_date', 'service_type']
    search_fields = ['service_type__name']
    raw_id_fields = ['service_type']
    readonly_fields = ['generated_at']
    date_hierarchy = 'forecast_date'
    ordering = ['-forecast_date']


@admin.register(ServiceTrend)
class ServiceTrendAdmin(admin.ModelAdmin):
    list_display = ['id', 'service_type', 'trend_type', 'period_start', 'period_end', 'growth_rate', 'trend_direction']
    list_filter = ['trend_type', 'trend_direction']
    raw_id_fields = ['service_type']
    readonly_fields = ['created_at']
