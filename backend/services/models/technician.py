from django.db import models
from django.conf import settings
from django.utils import timezone

from .core import ServiceType, ServiceTicket, ServiceRequest
class TechnicianSkill(models.Model):
    id = models.BigAutoField(db_column='technician_skill_id', primary_key=True)

    SKILL_LEVELS = [
        ('beginner', 'Beginner'),
        ('intermediate', 'Intermediate'),
        ('expert', 'Expert'),
    ]

    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'technician'}
    )
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE)
    skill_level = models.CharField(max_length=50, choices=SKILL_LEVELS)

    class Meta:
        unique_together = ('technician', 'service_type')

    def __str__(self):
        return f"{self.technician.username} - {self.service_type.name} ({self.skill_level})"


# Real-time tracking: Service Status Timeline

class ArrivalValidationLog(models.Model):
    id = models.BigAutoField(db_column='arrival_validation_log_id', primary_key=True)

    ACTION_CHOICES = [
        ('navigate', 'Navigate'),
        ('arrival_attempt', 'Arrival Attempt'),
        ('arrival_success', 'Arrival Success'),
        ('arrival_blocked', 'Arrival Blocked'),
        ('arrival_bypassed', 'Arrival Bypassed'),
        ('job_started', 'Job Started'),
        ('job_completed', 'Job Completed'),
    ]

    VALIDATION_RESULT_CHOICES = [
        ('passed', 'Passed'),
        ('failed', 'Failed'),
        ('bypassed', 'Bypassed'),
        ('not_required', 'Not Required'),
    ]

    ticket = models.ForeignKey(ServiceTicket, on_delete=models.CASCADE, related_name='arrival_logs')
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='arrival_validation_logs',
        limit_choices_to={'role': 'technician'},
    )
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='performed_arrival_logs',
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    technician_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    technician_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    service_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    service_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    distance_meters = models.FloatField(null=True, blank=True)
    validation_result = models.CharField(
        max_length=20,
        choices=VALIDATION_RESULT_CHOICES,
        default='not_required',
    )
    validation_enabled = models.BooleanField(
        default=True,
        help_text='Snapshot of whether location validation was enabled at time of action.',
    )
    radius_meters = models.PositiveSmallIntegerField(
        default=30,
        help_text='Snapshot of the allowed radius at time of action.',
    )
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Arrival Validation Log'
        verbose_name_plural = 'Arrival Validation Logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['ticket', '-created_at']),
            models.Index(fields=['technician', '-created_at']),
            models.Index(fields=['action', '-created_at']),
            models.Index(fields=['validation_result', '-created_at']),
        ]

    def __str__(self):
        return f'Ticket #{self.ticket_id} {self.action} at {self.created_at}'


# Pre-installation Technical Assessment

class TechnicianLocationHistory(models.Model):
    id = models.BigAutoField(db_column='technician_location_history_id', primary_key=True)

    """Track technician movements for history"""
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'technician'}
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    timestamp = models.DateTimeField(auto_now_add=True)
    accuracy = models.FloatField(default=0)  # GPS accuracy in meters

    def __str__(self):
        return f"{self.technician.username} at {self.timestamp}"

    class Meta:
        indexes = [
            models.Index(fields=['technician', '-timestamp']),
            models.Index(fields=['-timestamp']),
        ]


# Analytics Models for Descriptive and Predictive Analysis

