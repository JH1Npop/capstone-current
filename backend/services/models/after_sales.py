from django.db import models
from django.conf import settings
from django.utils import timezone

from .core import ServiceType, ServiceTicket, ServiceRequest
class AfterSalesCase(models.Model):
    id = models.BigAutoField(db_column='after_sales_case_id', primary_key=True)

    CASE_TYPE_CHOICES = [
        ('follow_up', 'Follow Up'),
        ('maintenance', 'Maintenance'),
        ('complaint', 'Complaint'),
        ('warranty', 'Warranty'),
        ('revisit', 'Revisit'),
        ('feedback', 'Feedback'),
    ]

    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]

    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    CREATION_SOURCE_CHOICES = [
        ('manual', 'Manual'),
        ('completion_flow', 'Completion Flow'),
        ('maintenance_alert', 'Maintenance Alert'),
    ]

    service_ticket = models.ForeignKey(ServiceTicket, on_delete=models.CASCADE, related_name='after_sales_cases')
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='after_sales_cases',
        limit_choices_to={'role': 'client'}
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_after_sales_cases',
        limit_choices_to={'role__in': ['superadmin', 'admin']},
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_after_sales_cases'
    )
    case_type = models.CharField(max_length=20, choices=CASE_TYPE_CHOICES, default='follow_up')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    creation_source = models.CharField(
        max_length=30,
        choices=CREATION_SOURCE_CHOICES,
        default='manual',
    )
    summary = models.CharField(max_length=255)
    details = models.TextField(blank=True, null=True)
    resolution_notes = models.TextField(blank=True, null=True)
    requires_revisit = models.BooleanField(default=False)
    customer_satisfaction = models.PositiveSmallIntegerField(blank=True, null=True)
    due_date = models.DateField(blank=True, null=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_case_type_display()} for ticket #{self.service_ticket_id}"

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['assigned_to', 'status']),
            models.Index(fields=['client', 'status']),
            models.Index(fields=['due_date', 'status']),
        ]


class AfterSalesCaseEvent(models.Model):
    EVENT_TYPE_CHOICES = [
        ('created', 'Created'),
        ('status_changed', 'Status Changed'),
        ('assigned', 'Assigned'),
        ('reassigned', 'Reassigned'),
        ('updated', 'Updated'),
    ]

    id = models.BigAutoField(db_column='after_sales_case_event_id', primary_key=True)
    case = models.ForeignKey(
        AfterSalesCase,
        on_delete=models.CASCADE,
        related_name='events',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='after_sales_case_events',
    )
    event_type = models.CharField(max_length=30, choices=EVENT_TYPE_CHOICES)
    from_status = models.CharField(max_length=20, blank=True, default='')
    to_status = models.CharField(max_length=20, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['case', '-created_at'], name='svc_afcase_evt_case_time_idx'),
            models.Index(fields=['event_type', '-created_at'], name='svc_afcase_evt_type_time_idx'),
        ]

    def __str__(self):
        return f"{self.get_event_type_display()} for after-sales case #{self.case_id}"


class MaintenanceSchedule(models.Model):
    id = models.BigAutoField(db_column='maintenance_schedule_id', primary_key=True)

    PROFILE_CHOICES = [
        ('commercial_area', 'Commercial Area'),
        ('dust_free_area', 'Dust-Free Area'),
        ('standard_area', 'Standard Area'),
    ]

    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('due_soon', 'Due Soon'),
        ('due', 'Due'),
        ('completed', 'Completed'),
        ('dismissed', 'Dismissed'),
    ]

    service_ticket = models.OneToOneField(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='maintenance_schedule'
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='maintenance_schedules',
        limit_choices_to={'role': 'client'}
    )
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE, related_name='maintenance_schedules')
    maintenance_profile = models.CharField(max_length=30, choices=PROFILE_CHOICES)
    interval_days = models.PositiveIntegerField()
    follow_up_window_days = models.PositiveIntegerField(default=7)
    last_service_date = models.DateField()
    next_due_date = models.DateField()
    notify_on_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    maintenance_notes = models.TextField(blank=True, null=True)
    due_soon_notified_at = models.DateTimeField(blank=True, null=True)
    three_day_notified_at = models.DateTimeField(blank=True, null=True)
    due_notified_at = models.DateTimeField(blank=True, null=True)
    client_notified_at = models.DateTimeField(blank=True, null=True)  # 7-day reminder
    client_three_day_notified_at = models.DateTimeField(blank=True, null=True)
    risk_level = models.CharField(max_length=20, default='normal')
    risk_score = models.FloatField(default=0)
    prediction_notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Maintenance for ticket #{self.service_ticket_id} due {self.next_due_date}"

    class Meta:
        ordering = ['next_due_date', 'id']
        indexes = [
            models.Index(fields=['status', 'next_due_date']),
            models.Index(fields=['client', 'status']),
            models.Index(fields=['service_type', 'status']),
        ]



class InstalledEquipment(models.Model):
    id = models.BigAutoField(db_column='installed_equipment_id', primary_key=True)
    ticket = models.ForeignKey(ServiceTicket, on_delete=models.SET_NULL, null=True, blank=True, related_name='installed_equipment')
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='installed_systems',
        limit_choices_to={'role': 'client'}
    )
    brand_model = models.CharField(max_length=255)
    equipment_type = models.CharField(max_length=100)
    serial_number = models.CharField(max_length=255, blank=True, null=True)
    capacity = models.CharField(max_length=100, blank=True, null=True)
    location = models.CharField(max_length=255, blank=True, null=True)
    warranty_start = models.DateField(null=True, blank=True)
    warranty_end = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.brand_model} ({self.equipment_type})"


