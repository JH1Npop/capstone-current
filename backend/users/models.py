from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from afn_service_management.fields import StructuredTextField


def default_landing_page_content():
    return {
        'eyebrow': 'Your Partner In',
        'headline': 'Solar, CCTV & Aircon',
        'highlight': 'Smart Solutions.',
        'description': 'We provide reliable, high-quality, and energy-efficient solutions for your home and business.',
        'primaryCtaLabel': 'Get Started',
        'secondaryCtaLabel': 'Our Services',
        'solarTitle': 'Solar Solutions',
        'solarDescription': 'High-quality solar systems for homes and businesses.',
        'cctvTitle': 'CCTV Systems',
        'cctvDescription': 'Advanced surveillance solutions for security.',
        'airconTitle': 'Aircon Solutions',
        'airconDescription': 'Energy-efficient cooling systems for comfort.',
        'whyTitle': 'Why Choose Us',
        'whySubtitle': 'Quality You Can Trust, Service You Can Rely On',
        'footerTitle': 'Ready to Upgrade Your Home or Business?',
        'footerDescription': 'Get a free consultation and discover the best solution.',
    }


def default_solar_calculator_settings():
    return {
        'enabled': True,
        'title': 'Estimate Your Solar System',
        'description': 'Get a preliminary panel and savings estimate based on your monthly electricity use.',
        'defaultPeakSunHours': 5,
        'defaultPerformanceRatio': 0.80,
        'defaultPanelWattage': 550,
        'defaultElectricityRate': 12,
        'defaultDesiredOffset': 100,
    }


def default_landing_page_promotions():
    return []

class User(AbstractUser):
    """Single user model with role-based organization."""

    id = models.BigAutoField(db_column='user_id', primary_key=True)

    ROLE_CHOICES = [
        ('superadmin', 'Superadmin'),
        ('admin', 'Admin'),
        ('technician', 'Technician'),
        ('client', 'Client'),
    ]

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='client')
    middle_name = models.CharField(max_length=150, blank=True, default='')
    phone = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text='Phone number (11 digits, format: +63 9XX XXX XXXX)',
    )
    landline = models.CharField(max_length=50, blank=True, null=True, help_text='Landline or alternative contact number')
    address = models.TextField(blank=True, null=True)
    profile_image = models.FileField(upload_to='profiles/', blank=True, null=True)

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
    ]
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='active')
    email_verified = models.BooleanField(default=True)
    email_verification_sent_at = models.DateTimeField(blank=True, null=True)
    pending_email = models.EmailField(blank=True, null=True)
    pending_email_verification_sent_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=['role', 'status']),
            models.Index(fields=['email']),
            models.Index(fields=['username']),
        ]

    def __init__(self, *args, **kwargs):
        self._pending_technician_profile_data = {}
        self._pending_management_profile_data = {}
        profile_fields = (
            'current_latitude',
            'current_longitude',
            'last_location_update',
            'is_available',
            'skill_level',
            'max_daily_assignments',
        )
        for field in profile_fields:
            if field in kwargs:
                self._pending_technician_profile_data[field] = kwargs.pop(field)
        if 'admin_scope' in kwargs:
            self._pending_management_profile_data['admin_scope'] = kwargs.pop('admin_scope')

        super().__init__(*args, **kwargs)

    def save(self, *args, **kwargs):
        profile_fields = {
            'current_latitude',
            'current_longitude',
            'last_location_update',
            'is_available',
            'skill_level',
            'max_daily_assignments',
        }

        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            user_update_fields = [f for f in update_fields if f not in profile_fields]
            if user_update_fields:
                kwargs['update_fields'] = user_update_fields
            else:
                kwargs.pop('update_fields', None)

        super().save(*args, **kwargs)

        if self._pending_technician_profile_data:
            profile = self._get_or_create_technician_profile()
            for field, value in self._pending_technician_profile_data.items():
                setattr(profile, field, value)
            profile.save()
            self._pending_technician_profile_data = {}
        if self._pending_management_profile_data:
            profile, _ = ManagementProfile.objects.get_or_create(user=self)
            for field, value in self._pending_management_profile_data.items():
                setattr(profile, field, value)
            profile.save()
            self._pending_management_profile_data = {}

    def clean(self):
        if self.phone:
            phone_digits = ''.join(filter(str.isdigit, str(self.phone)))
            if not 10 <= len(phone_digits) <= 15:
                from django.core.exceptions import ValidationError

                raise ValidationError({'phone': 'Phone number must contain 10 to 15 digits.'})

    def _get_technician_profile(self):
        try:
            return self.technician_profile
        except Exception:
            return None

    def _get_or_create_technician_profile(self):
        profile = self._get_technician_profile()
        if profile is None:
            profile = TechnicianProfile.objects.create(user=self)
        return profile

    @property
    def current_latitude(self):
        profile = self._get_technician_profile()
        return profile.current_latitude if profile else None

    @current_latitude.setter
    def current_latitude(self, value):
        profile = self._get_or_create_technician_profile()
        profile.current_latitude = value
        profile.save(update_fields=['current_latitude'])

    @property
    def current_longitude(self):
        profile = self._get_technician_profile()
        return profile.current_longitude if profile else None

    @current_longitude.setter
    def current_longitude(self, value):
        profile = self._get_or_create_technician_profile()
        profile.current_longitude = value
        profile.save(update_fields=['current_longitude'])

    @property
    def last_location_update(self):
        profile = self._get_technician_profile()
        return profile.last_location_update if profile else None

    @last_location_update.setter
    def last_location_update(self, value):
        profile = self._get_or_create_technician_profile()
        profile.last_location_update = value
        profile.save(update_fields=['last_location_update'])

    @property
    def is_available(self):
        profile = self._get_technician_profile()
        return profile.is_available if profile else True

    @is_available.setter
    def is_available(self, value):
        profile = self._get_or_create_technician_profile()
        profile.is_available = value
        profile.save(update_fields=['is_available'])

    @property
    def skill_level(self):
        profile = self._get_technician_profile()
        return profile.skill_level if profile else None

    @skill_level.setter
    def skill_level(self, value):
        profile = self._get_or_create_technician_profile()
        profile.skill_level = value
        profile.save(update_fields=['skill_level'])

    @property
    def max_daily_assignments(self):
        profile = self._get_technician_profile()
        return profile.max_daily_assignments if profile else None

    @max_daily_assignments.setter
    def max_daily_assignments(self, value):
        profile = self._get_or_create_technician_profile()
        profile.max_daily_assignments = value
        profile.save(update_fields=['max_daily_assignments'])

    @property
    def admin_scope(self):
        try:
            profile = self.management_profile
        except Exception:
            profile = None
        return profile.admin_scope if profile else 'general'

    @admin_scope.setter
    def admin_scope(self, value):
        if not self.pk:
            self._pending_management_profile_data['admin_scope'] = value
            return
        try:
            profile = self.management_profile
        except Exception:
            profile = ManagementProfile.objects.create(user=self)
        profile.admin_scope = value
        profile.save(update_fields=['admin_scope'])

    def __str__(self):
        return f'{self.username} ({self.role})'


class TechnicianProfile(models.Model):
    id = models.BigAutoField(db_column='technician_profile_id', primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='technician_profile')
    current_latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    current_longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    last_location_update = models.DateTimeField(blank=True, null=True)
    is_available = models.BooleanField(default=True)
    skill_level = models.CharField(
        max_length=20,
        choices=[('beginner', 'Beginner'), ('intermediate', 'Intermediate'), ('expert', 'Expert')],
        default='beginner',
    )
    preferred_work_areas = StructuredTextField(structure='list', default=list, blank=True)
    max_daily_assignments = models.PositiveSmallIntegerField(default=5)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Technician Profile'
        verbose_name_plural = 'Technician Profiles'
        indexes = [
            models.Index(fields=['is_available']),
            models.Index(fields=['skill_level']),
        ]

    def __str__(self):
        return f'{self.user.username} - technician profile'


class ClientProfile(models.Model):
    id = models.BigAutoField(db_column='client_profile_id', primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='client_profile')
    client_type = models.CharField(
        max_length=20,
        choices=[('individual', 'Individual'), ('business', 'Business'), ('corporate', 'Corporate')],
        default='individual',
    )
    company_name = models.CharField(max_length=255, blank=True, null=True)
    company_registration = models.CharField(max_length=100, blank=True, null=True)
    billing_address = models.TextField(blank=True, null=True)
    preferred_contact_method = models.CharField(
        max_length=20,
        choices=[('email', 'Email'), ('phone', 'Phone')],
        default='email',
    )
    credit_limit = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    account_balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Client Profile'
        verbose_name_plural = 'Client Profiles'
        indexes = [
            models.Index(fields=['client_type']),
        ]

    def __str__(self):
        return f'{self.user.username} - client profile'


class ManagementProfile(models.Model):
    id = models.BigAutoField(db_column='management_profile_id', primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='management_profile')
    admin_scope = models.CharField(
        max_length=50,
        choices=[
            ('service_follow_up', 'Service Follow-Up'),
            ('task_management', 'Task Management'),
            ('operations', 'Operations Management'),
            ('general', 'General Administration'),
        ],
        default='general',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Management Profile'
        verbose_name_plural = 'Management Profiles'

    def __str__(self):
        return f'{self.user.username} - management profile'


class UserCapabilityGrant(models.Model):
    """Grant capabilities to users."""

    id = models.BigAutoField(db_column='user_capability_grant_id', primary_key=True)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='capability_grants',
    )
    capability_code = models.CharField(max_length=100)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='granted_capability_records',
    )
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'User Capability Grant'
        verbose_name_plural = 'User Capability Grants'
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'capability_code'],
                name='unique_user_capability_grant',
            )
        ]
        ordering = ['user', 'capability_code']

    def __str__(self):
        return f'{self.user.username} -> {self.capability_code}'


def default_business_days():
    return [1, 2, 3, 4, 5]


class AdminSettings(models.Model):
    """Global administrative settings."""

    id = models.BigAutoField(db_column='admin_settings_id', primary_key=True)

    system_name = models.CharField(max_length=255, default='AFN Service Management')
    support_email = models.EmailField(default='support@afnservice.com')
    enable_notifications = models.BooleanField(default=True)
    enable_in_app_notifications = models.BooleanField(default=True)
    enable_email_notifications = models.BooleanField(default=True)
    auto_dispatch_enabled = models.BooleanField(default=False)
    allow_overtime_dispatch = models.BooleanField(default=False)
    overtime_daily_capacity_minutes = models.PositiveSmallIntegerField(default=600)
    default_time_zone = models.CharField(max_length=100, default='UTC')
    max_technician_assignments = models.PositiveSmallIntegerField(default=5)
    business_days = models.JSONField(default=default_business_days)
    business_open_time = models.TimeField(default='08:00')
    business_close_time = models.TimeField(default='17:00')
    holiday_dates = models.JSONField(default=list, blank=True)
    maintenance_reminder_days = models.PositiveSmallIntegerField(default=7)
    company_name = models.CharField(max_length=255, default='AFN Solar Power Engineering Services')
    company_address = models.TextField(blank=True, default='')
    document_footer = models.TextField(blank=True, default='')
    currency_code = models.CharField(max_length=3, default='PHP')
    quotation_validity_days = models.PositiveSmallIntegerField(default=30)
    default_warranty_days = models.PositiveIntegerField(default=365)
    external_payment_notice = models.CharField(
        max_length=255,
        default='Payment is completed outside this system. Enter the confirmed amount before printing.',
    )
    landing_page_content = models.JSONField(default=default_landing_page_content, blank=True)
    solar_calculator_settings = models.JSONField(default=default_solar_calculator_settings, blank=True)
    landing_page_promotions = models.JSONField(default=default_landing_page_promotions, blank=True)
    location_validation_enabled = models.BooleanField(default=True)
    arrival_radius_meters = models.PositiveSmallIntegerField(default=30)
    location_validation_disabled_reason = models.TextField(blank=True, default='')
    location_validation_updated_at = models.DateTimeField(null=True, blank=True)
    location_validation_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='location_validation_updates',
        limit_choices_to={'role__in': ['admin', 'superadmin']},
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='admin_settings_updates',
        limit_choices_to={'role__in': ['admin', 'superadmin']},
    )

    class Meta:
        verbose_name = 'Admin Settings'
        verbose_name_plural = 'Admin Settings'

    def __str__(self):
        return 'Admin Settings'


class LandingPageAsset(models.Model):
    """Managed images uploaded for public landing-page content."""

    id = models.BigAutoField(db_column='landing_page_asset_id', primary_key=True)
    file = models.FileField(upload_to='landing_page/')
    original_name = models.CharField(max_length=255, blank=True, default='')
    content_type = models.CharField(max_length=100, blank=True, default='')
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='landing_page_assets',
        limit_choices_to={'role__in': ['admin', 'superadmin']},
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.original_name or self.file.name


class ActivityLog(models.Model):
    """Admin-facing operational activity timeline."""

    id = models.BigAutoField(db_column='activity_log_id', primary_key=True)

    CATEGORY_CHOICES = [
        ('security', 'Security'),
        ('users', 'Users'),
        ('requests', 'Requests'),
        ('tickets', 'Tickets'),
        ('inventory', 'Inventory'),
        ('settings', 'Settings'),
        ('sla', 'SLA'),
        ('communication', 'Communication'),
        ('system', 'System'),
    ]

    ACTION_CHOICES = [
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('assign', 'Assign'),
        ('reschedule', 'Reschedule'),
        ('complete', 'Complete'),
        ('cancel', 'Cancel'),
        ('error', 'Error'),
        ('system', 'System'),
    ]

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='activity_logs',
    )
    actor_role = models.CharField(max_length=20, blank=True, default='')
    actor_display_name = models.CharField(max_length=150, blank=True, default='')
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='system')
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    target_app_label = models.CharField(max_length=100, blank=True, default='')
    target_model = models.CharField(max_length=100, blank=True, default='')
    target_id = models.PositiveIntegerField(null=True, blank=True)
    target_label = models.CharField(max_length=255, blank=True, default='')
    message = models.CharField(max_length=255)
    metadata = StructuredTextField(structure='dict', default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Activity Log'
        verbose_name_plural = 'Activity Logs'
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['category', 'created_at'], name='activity_category_time_idx'),
            models.Index(fields=['action', 'created_at'], name='activity_action_time_idx'),
            models.Index(fields=['target_model', 'target_id'], name='activity_target_idx'),
            models.Index(fields=['actor', 'created_at'], name='activity_actor_time_idx'),
        ]

    def __str__(self):
        return self.message


class ChangeLog(models.Model):
    """Immutable audit trail for critical data changes."""

    id = models.BigAutoField(db_column='change_log_id', primary_key=True)

    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
    ]

    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        related_name='change_logs',
        help_text='The model type that was changed',
    )
    object_id = models.PositiveIntegerField(help_text='The primary key of the changed record')
    content_object = GenericForeignKey('content_type', 'object_id')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    field_name = models.CharField(max_length=100, blank=True, default='')
    old_value = models.TextField(null=True, blank=True)
    new_value = models.TextField(null=True, blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='change_logs',
        help_text='The user who made this change',
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    summary = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        verbose_name = 'Change Log'
        verbose_name_plural = 'Change Logs'
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['changed_by', 'changed_at']),
            models.Index(fields=['action', 'changed_at']),
        ]

    def __str__(self):
        return f'{self.action} {self.content_type} #{self.object_id} - {self.field_name or "record"}'


Management = User
Technician = User
Client = User
