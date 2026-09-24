from django.db import models
from django.conf import settings
from django.utils import timezone

from afn_service_management.fields import StructuredTextField
from .core import ServiceType, ServiceTicket, ServiceRequest
class ServiceAnalytics(models.Model):
    id = models.BigAutoField(db_column='service_analytics_id', primary_key=True)

    """Aggregated analytics data for services"""
    date = models.DateField()
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE, null=True, blank=True)

    # Descriptive metrics
    total_requests = models.IntegerField(default=0)
    completed_requests = models.IntegerField(default=0)
    pending_requests = models.IntegerField(default=0)
    cancelled_requests = models.IntegerField(default=0)

    # Performance metrics
    avg_response_time_hours = models.FloatField(default=0)  # Average time to assign technician
    avg_completion_time_hours = models.FloatField(default=0)  # Average time to complete
    technician_utilization_rate = models.FloatField(default=0)  # Percentage of time technicians are busy

    # Geographic metrics
    service_area_coverage = models.FloatField(default=0)  # Square km covered
    popular_locations = StructuredTextField(structure='list', default=list)  # Top service locations

    # Customer satisfaction (placeholder for future ratings)
    satisfaction_score = models.FloatField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['date', 'service_type']
        indexes = [
            models.Index(fields=['service_type', '-date']),
        ]
        ordering = ['-date']

    def __str__(self):
        service_name = self.service_type.name if self.service_type else "All Services"
        return f"{service_name} Analytics - {self.date}"


class TechnicianPerformance(models.Model):
    id = models.BigAutoField(db_column='technician_performance_id', primary_key=True)

    """Individual technician performance metrics"""
    technician = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, limit_choices_to={'role': 'technician'})
    date = models.DateField()

    # Work metrics
    tickets_assigned = models.IntegerField(default=0)
    tickets_completed = models.IntegerField(default=0)
    tickets_pending = models.IntegerField(default=0)

    # Time metrics
    total_work_hours = models.FloatField(default=0)
    avg_response_time_hours = models.FloatField(default=0)
    avg_completion_time_hours = models.FloatField(default=0)

    # Quality metrics
    customer_satisfaction = models.FloatField(default=0)
    rework_rate = models.FloatField(default=0)  # Percentage requiring rework

    # Efficiency metrics
    distance_traveled_km = models.FloatField(default=0)
    fuel_efficiency = models.FloatField(default=0)  # km per liter

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['technician', 'date']
        indexes = [
            models.Index(fields=['technician', '-date']),
        ]
        ordering = ['-date']

    def __str__(self):
        return f"{self.technician.username} Performance - {self.date}"


class DemandForecast(models.Model):
    id = models.BigAutoField(db_column='demand_forecast_id', primary_key=True)

    """Predictive demand forecasting"""
    FORECAST_PERIODS = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
    ]

    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE, related_name='service_demands')
    forecast_date = models.DateField()  # Date this forecast is for
    forecast_period = models.CharField(max_length=20, choices=FORECAST_PERIODS, default='daily')

    # Forecasted demand
    predicted_requests = models.IntegerField()
    # Legacy column retained for schema compatibility. New validated runs store
    # a 0-1 holdout validation score here, not a statistical confidence level.
    confidence_level = models.FloatField(default=0.8)

    # Factors influencing forecast
    weather_impact = models.FloatField(default=0)  # Unsupported; validated runs always keep this at zero.
    seasonal_trend = models.FloatField(default=0)  # Seasonal adjustment factor
    historical_average = models.IntegerField(default=0)  # Base historical average

    # Forecast accuracy tracking
    actual_requests = models.IntegerField(null=True, blank=True)  # Filled in after the date
    forecast_accuracy = models.FloatField(null=True, blank=True)  # Calculated accuracy

    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['service_type', 'forecast_date', 'forecast_period'],
                name='unique_demand_forecast_service_date_period',
            ),
        ]
        indexes = [
            models.Index(fields=['service_type', 'forecast_period', 'forecast_date']),
            models.Index(fields=['forecast_date']),
        ]
        ordering = ['-forecast_date']

    def __str__(self):
        return f"{self.service_type.name} forecast for {self.forecast_date} ({self.predicted_requests} requests)"


class ServiceTrend(models.Model):
    id = models.BigAutoField(db_column='service_trend_id', primary_key=True)

    """Trend analysis for service patterns"""
    TREND_TYPES = [
        ('seasonal', 'Seasonal'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('yearly', 'Yearly'),
    ]

    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE)
    trend_type = models.CharField(max_length=20, choices=TREND_TYPES)
    period_start = models.DateField()
    period_end = models.DateField()

    # Trend metrics
    average_requests = models.FloatField()
    peak_day = models.CharField(max_length=20, blank=True)  # e.g., "Monday", "Winter"
    peak_hour = models.IntegerField(null=True, blank=True)  # 0-23

    # Growth indicators
    growth_rate = models.FloatField(default=0)  # Percentage change
    trend_direction = models.CharField(max_length=20, default='stable')  # increasing, decreasing, stable

    # Statistical measures
    standard_deviation = models.FloatField(default=0)
    confidence_interval = StructuredTextField(structure='dict', default=dict)  # min/max confidence bounds

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['service_type', 'trend_type', 'period_start', 'period_end']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.service_type.name} {self.trend_type} trend ({self.period_start} to {self.period_end})"


