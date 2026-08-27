from django.contrib import admin
from .models import CustomerSupportCase, Message


@admin.register(CustomerSupportCase)
class CustomerSupportCaseAdmin(admin.ModelAdmin):
    list_display = ['subject', 'client', 'category', 'priority', 'status', 'updated_at']
    list_filter = ['category', 'priority', 'status', 'created_at']
    search_fields = ['subject', 'client__username', 'client__first_name', 'client__last_name', 'group_key']
    readonly_fields = ['group_key', 'created_at', 'updated_at', 'resolved_at']

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['sender', 'receiver', 'ticket', 'is_deleted', 'created_at']
    list_filter = ['is_deleted', 'created_at', 'ticket']
    search_fields = ['sender__username', 'receiver__username', 'message_text']
    readonly_fields = ['created_at', 'updated_at', 'edited_at', 'deleted_at']
