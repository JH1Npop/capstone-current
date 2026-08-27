from django.db import models
from django.conf import settings
from django.utils import timezone

class SLARule(models.Model):
    id = models.BigAutoField(db_column='sla_rule_id', primary_key=True)

    RULE_CHOICES = [
        ('approval_delay', 'Approval delay'),
        ('assignment_delay', 'Assignment delay'),
        ('start_delay', 'Start delay'),
        ('execution_delay', 'Execution delay'),
        ('reschedule_delay', 'Reschedule delay'),
        ('inspection_delay', 'Inspection delay'),
        ('service_ready_delay', 'Service ready delay'),
    ]

    key = models.CharField(max_length=40, choices=RULE_CHOICES, unique=True)
    warning_minutes = models.PositiveIntegerField()
    overdue_minutes = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.get_key_display()} SLA"

    class Meta:
        ordering = ['key']



