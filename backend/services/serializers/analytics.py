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

class AutoAssignSerializer(serializers.Serializer):
    """Serializer for auto-assignment request"""
    ticket_id = serializers.IntegerField()
    service_type_id = serializers.IntegerField()
    request_latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    request_longitude = serializers.DecimalField(max_digits=9, decimal_places=6)


# Analytics Serializers
class ServiceAnalyticsSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    popular_locations = serializers.JSONField(read_only=True)

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
    validation_score = serializers.FloatField(source='confidence_level', read_only=True)

    class Meta:
        model = DemandForecast
        fields = [
            'id', 'service_type', 'service_type_name', 'forecast_date', 'forecast_period',
            'predicted_requests', 'validation_score', 'weather_impact', 'seasonal_trend',
            'historical_average', 'actual_requests', 'forecast_accuracy', 'generated_at'
        ]


class ServiceTrendSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    confidence_interval = serializers.JSONField(read_only=True)

    class Meta:
        model = ServiceTrend
        fields = [
            'id', 'service_type', 'service_type_name', 'trend_type', 'period_start', 'period_end',
            'average_requests', 'peak_day', 'peak_hour', 'growth_rate', 'trend_direction',
            'standard_deviation', 'confidence_interval', 'created_at'
        ]
