from django.contrib import admin
from .models import ServiceHistory


@admin.register(ServiceHistory)
class ServiceHistoryAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'ticket', 'technician', 'service_type',
        'completion_date', 'service_duration', 'customer_rating'
    ]
    list_filter = ['service_type', 'completion_date']
    search_fields = ['ticket__id', 'technician__username', 'service_type__name']
    raw_id_fields = ['ticket', 'technician', 'service_type']
    date_hierarchy = 'completion_date'
    ordering = ['-completion_date']
