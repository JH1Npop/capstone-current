from django.contrib import admin
from .models import TicketProgress


@admin.register(TicketProgress)
class TicketProgressAdmin(admin.ModelAdmin):
    list_display = ['id', 'ticket', 'updated_by', 'progress_status', 'updated_at']
    list_filter = ['progress_status', 'updated_at']
    search_fields = ['ticket__id', 'updated_by__username', 'comment']
    raw_id_fields = ['ticket', 'updated_by']
    date_hierarchy = 'updated_at'
    readonly_fields = ['updated_at']
    ordering = ['-updated_at']
