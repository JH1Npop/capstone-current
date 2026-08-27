from django.db import models
from django.conf import settings
from services.models import ServiceTicket

class CustomerSupportCase(models.Model):
    id = models.BigAutoField(primary_key=True, db_column='customer_support_case_id')
    CATEGORY_CHOICES = [
        ('general', 'General Inquiry'),
        ('billing', 'Billing Concern'),
        ('schedule', 'Schedule Concern'),
        ('technical', 'Technical Help'),
        ('complaint', 'Complaint'),
        ('warranty', 'Warranty Question'),
    ]
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_review', 'In Review'),
        ('resolved', 'Resolved'),
        ('closed', 'Closed'),
    ]

    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='customer_support_cases',
        limit_choices_to={'role': 'client'},
    )
    ticket = models.ForeignKey(
        ServiceTicket,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='support_cases'
    )
    group_key = models.CharField(max_length=80, unique=True)
    subject = models.CharField(max_length=160)
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='general')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']
        indexes = [
            models.Index(fields=['client', '-updated_at']),
            models.Index(fields=['status', '-updated_at']),
            models.Index(fields=['priority', '-updated_at']),
        ]

    def __str__(self):
        return f"{self.subject} ({self.client})"

class Message(models.Model):
    id = models.BigAutoField(primary_key=True, db_column='message_id')
    ROOM_TYPE_CHOICES = [
        ('direct', 'Direct'),
        ('group', 'Group'),
    ]

    ticket = models.ForeignKey(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='messages',
        null=True,
        blank=True,
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sent_messages'
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='received_messages'
    )
    room_type = models.CharField(max_length=20, choices=ROOM_TYPE_CHOICES, default='direct')
    group_key = models.CharField(max_length=50, blank=True, null=True)
    message_text = models.TextField(blank=True)
    image = models.FileField(upload_to='message_attachments/', blank=True, null=True)
    is_deleted = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        room = self.group_key or 'direct'
        ticket_label = f"Ticket {self.ticket_id}" if self.ticket_id else room
        return f"Message from {self.sender} to {self.receiver or room} for {ticket_label}"
