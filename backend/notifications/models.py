from django.db import models
from django.conf import settings
from django.utils import timezone

class Notification(models.Model):
    id = models.BigAutoField(primary_key=True, db_column='notification_id')
    NOTIFICATION_TYPES = [
        ('ticket_assigned', 'Ticket Assigned'),
        ('status_update', 'Status Update'),
        ('reminder', 'Reminder'),
        ('urgent', 'Urgent Alert'),
        ('task_completed', 'Task Completed'),
        ('customer_inquiry', 'Customer Inquiry'),
        ('message', 'New Message'),
        ('info', 'Information'),
        ('success', 'Success'),
        ('warning', 'Warning'),
        ('error', 'Error'),
    ]
    
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    ticket = models.ForeignKey(
        'services.ServiceTicket',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    request = models.ForeignKey(
        'services.ServiceRequest',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='notifications'
    )
    message = models.TextField()
    title = models.CharField(max_length=255, blank=True)
    type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES, default='message')
    status = models.CharField(max_length=50, default="unread")  # unread/read
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    
    # Channel preferences
    send_email = models.BooleanField(default=True)
    email_sent = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.type} for {self.user.username}"
    
    def mark_as_read(self):
        self.status = 'read'
        self.read_at = timezone.now()
        self.save()
    
    class Meta:
        ordering = ['-created_at']

