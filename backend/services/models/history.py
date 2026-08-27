from django.db import models
from django.conf import settings
from django.utils import timezone

from .core import ServiceType, ServiceTicket, ServiceRequest
class ServiceStatusHistory(models.Model):
    id = models.BigAutoField(db_column='service_status_history_id', primary_key=True)

    """Tracks all status changes for audit trail"""
    ticket = models.ForeignKey(ServiceTicket, on_delete=models.CASCADE, related_name='status_history')
    status = models.CharField(max_length=50)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True
    )
    notes = models.TextField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Ticket {self.ticket.id} - {self.status} at {self.timestamp}"

    class Meta:
        indexes = [
            models.Index(fields=['ticket', '-timestamp']),
            models.Index(fields=['status', '-timestamp']),
        ]



