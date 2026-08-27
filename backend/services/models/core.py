from django.db import models
from django.conf import settings
from django.utils import timezone

from afn_service_management.fields import StructuredTextField

TIME_SLOT_CHOICES = [
    ('morning', 'Morning (8 AM - 11 AM)'),
    ('midday', 'Midday (11 AM - 2 PM)'),
    ('afternoon', 'Afternoon (2 PM - 5 PM)'),
    ('evening', 'Evening (5 PM - 8 PM)'),
]
class ServiceType(models.Model):
    id = models.BigAutoField(db_column='service_type_id', primary_key=True)

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    category = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text="Management-defined service category, e.g. Solar, Air Conditioning, FDAS.",
    )
    color = models.CharField(
        max_length=20,
        blank=True,
        default='#2563eb',
        help_text="Hex color used for service badges, calendars, and dashboards.",
    )
    icon = models.CharField(
        max_length=50,
        blank=True,
        default='',
        help_text="Optional UI icon key chosen by management.",
    )
    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Optional ordering hint for management-controlled service lists.",
    )
    estimated_duration = models.IntegerField(default=60)  # in minutes
    estimated_cost = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="Estimated cost for this service type",
    )
    max_daily_assignments = models.PositiveIntegerField(
        default=5,
        help_text="Maximum number of this service type a technician can be assigned per day",
    )
    procedures = StructuredTextField(
        structure='list',
        default=list, blank=True,
        help_text="Ordered list of procedure steps, e.g. [{'step': 1, 'title': '...', 'description': '...'}]",
    )
    required_equipment = StructuredTextField(
        structure='list',
        default=list, blank=True,
        help_text="List of required tools/equipment, e.g. [{'name': 'Drill', 'quantity': 1}]",
    )
    is_active = models.BooleanField(default=True)
    requires_site_inspection = models.BooleanField(
        default=False,
        help_text="Require an inspection dispatch before service work can begin",
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['display_order', 'name']



class ServiceRequest(models.Model):
    id = models.BigAutoField(db_column='service_request_id', primary_key=True)

    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('In Progress', 'In Progress'),
        ('Completed', 'Completed'),
        ('Cancelled', 'Cancelled'),
    ]

    PRIORITY_CHOICES = [
        ('Low', 'Low'),
        ('Normal', 'Normal'),
        ('High', 'High'),
        ('Urgent', 'Urgent'),
    ]

    REQUEST_SOURCE_CHOICES = [
        ('client_portal', 'Client Portal'),
        ('walk_in', 'Walk-in'),
        ('phone', 'Phone'),
        ('admin_created', 'Admin Created'),
    ]

    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        limit_choices_to={'role': 'client'}
    )
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE)
    description = models.TextField()
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default="Normal")
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="Pending")
    preferred_date = models.DateField(blank=True, null=True)
    preferred_time_slot = models.CharField(
        max_length=20,
        choices=TIME_SLOT_CHOICES,
        blank=True,
        null=True,
    )
    request_source = models.CharField(
        max_length=30,
        choices=REQUEST_SOURCE_CHOICES,
        default='client_portal',
    )
    scheduling_notes = models.TextField(blank=True, null=True)
    request_date = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    # Auto-ticket will be created when request is approved
    auto_ticket_created = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=['client_id', 'status']),
            models.Index(fields=['status', 'request_date']),
            models.Index(fields=['request_source', 'request_date']),
        ]
        ordering = ['-request_date']

    def __str__(self):
        client_name = self.client.get_full_name().strip() or self.client.username
        return f"{self.service_type.name} request by {client_name}"


class ServiceRequestService(models.Model):
    id = models.BigAutoField(db_column='service_request_service_id', primary_key=True)

    request = models.ForeignKey(ServiceRequest, on_delete=models.CASCADE, related_name='service_items')
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE, related_name='request_items')
    notes = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=50, choices=ServiceRequest.STATUS_CHOICES, default='Pending')
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['request', 'service_type'],
                name='unique_service_type_per_request',
            )
        ]

    def __str__(self):
        return f"Request #{self.request_id}: {self.service_type.name}"


class ServiceLocation(models.Model):
    id = models.BigAutoField(db_column='service_location_id', primary_key=True)

    request = models.OneToOneField(ServiceRequest, on_delete=models.CASCADE, related_name='location')
    address = models.TextField()
    city = models.CharField(max_length=100)
    province = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, blank=True, null=True)

    def __str__(self):
        return f"{self.address}, {self.city}"


class SolarEstimate(models.Model):
    MODE_CHOICES = [
        ('monthly', 'Monthly consumption'),
        ('appliances', 'Appliance load schedule'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted for review'),
        ('reviewed', 'Reviewed'),
        ('converted', 'Converted to service request'),
        ('expired', 'Expired'),
    ]

    id = models.BigAutoField(db_column='solar_estimate_id', primary_key=True)
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='solar_estimates',
        limit_choices_to={'role': 'client'},
    )
    service_request = models.OneToOneField(
        ServiceRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='solar_estimate',
    )
    calculation_mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='monthly')
    monthly_consumption = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    appliances = models.JSONField(default=list, blank=True)
    peak_sun_hours = models.DecimalField(max_digits=4, decimal_places=2, default=5)
    system_loss_percent = models.DecimalField(max_digits=5, decimal_places=2, default=20)
    panel_wattage = models.PositiveIntegerField(default=550)
    electricity_rate = models.DecimalField(max_digits=8, decimal_places=2, default=12)
    desired_offset_percent = models.DecimalField(max_digits=5, decimal_places=2, default=100)
    available_roof_area = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    selected_promotion = models.JSONField(default=dict, blank=True)
    result_snapshot = models.JSONField(default=dict, blank=True)
    calculation_version = models.CharField(max_length=20, default='1.0')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    submitted_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']
        indexes = [
            models.Index(fields=['client', 'status']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f"Solar estimate #{self.pk} for {self.client}"


class ServiceTicket(models.Model):
    id = models.BigAutoField(db_column='service_ticket_id', primary_key=True)

    STATUS_CHOICES = [
        ('Not Started', 'Not Started'),
        ('For Inspection', 'For Inspection'),
        ('Inspection Completed', 'Inspection Completed'),
        ('Ready for Service', 'Ready for Service'),
        ('Awaiting Materials', 'Awaiting Materials'),
        ('Navigating', 'Navigating'),
        ('Arrived on Site', 'Arrived on Site'),
        ('In Progress', 'In Progress'),
        ('Completed', 'Completed'),
        ('Turned Over / Accepted', 'Turned Over / Accepted'),
        ('On Hold', 'On Hold'),
        ('Cancelled', 'Cancelled'),
    ]

    PRIORITY_CHOICES = [
        ('Low', 'Low'),
        ('Normal', 'Normal'),
        ('High', 'High'),
        ('Urgent', 'Urgent'),
    ]

    WARRANTY_STATUS_CHOICES = [
        ('not_applicable', 'Not Applicable'),
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('void', 'Void'),
    ]

    TICKET_TYPE_CHOICES = [
        ('inspection', 'Inspection'),
        ('installation', 'Installation'),
    ]

    request = models.ForeignKey(ServiceRequest, on_delete=models.CASCADE)
    ticket_type = models.CharField(max_length=20, choices=TICKET_TYPE_CHOICES, default='installation')
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_tickets',
        limit_choices_to={'role': 'technician'}
    )
    assigned_admin = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_admin_tickets',
        limit_choices_to={'role__in': ['superadmin', 'admin']},
    )
    scheduled_date = models.DateField()
    scheduled_time = models.TimeField(null=True, blank=True)
    scheduled_time_slot = models.CharField(
        max_length=20,
        choices=TIME_SLOT_CHOICES,
        blank=True,
        null=True,
    )
    start_time = models.DateTimeField(null=True, blank=True)
    end_time = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="Not Started")
    priority = models.CharField(max_length=50, choices=PRIORITY_CHOICES, default="Normal")
    notes = models.TextField(blank=True, null=True)

    # Client feedback
    client_rating = models.IntegerField(null=True, blank=True, choices=[(i, i) for i in range(1, 6)])  # 1-5 stars
    client_feedback = models.TextField(blank=True, null=True)

    # For auto-assignment
    auto_assigned = models.BooleanField(default=False)
    assigned_at = models.DateTimeField(null=True, blank=True)
    smart_assignment_score = models.FloatField(blank=True, null=True)
    smart_assignment_summary = models.CharField(max_length=255, blank=True, null=True)

    # For auto-filling documents (Turnover Acceptance, Quotation, etc.)
    project_details = StructuredTextField(structure='dict', default=dict, blank=True)

    # Scheduling updates
    reschedule_requested = models.BooleanField(default=False)
    reschedule_reason = models.TextField(blank=True, null=True)
    reschedule_requested_at = models.DateTimeField(blank=True, null=True)

    # Warranty coverage
    warranty_status = models.CharField(
        max_length=20,
        choices=WARRANTY_STATUS_CHOICES,
        default='not_applicable',
    )
    warranty_period_days = models.PositiveIntegerField(blank=True, null=True)
    warranty_start_date = models.DateField(blank=True, null=True)
    warranty_end_date = models.DateField(blank=True, null=True)
    warranty_notes = models.TextField(blank=True, null=True)

    # Route information (optional, populated when technician assigned)
    route_geometry = StructuredTextField(structure='dict', null=True, blank=True)
    route_distance = models.FloatField(null=True, blank=True)  # meters
    route_duration = models.FloatField(null=True, blank=True)  # seconds

    # Job completion proof (images)
    completion_proof_images = StructuredTextField(
        structure='list',
        default=list,
        blank=True,
        help_text="List of image URLs uploaded as proof of job completion"
    )
    completion_notes = models.TextField(blank=True, null=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, null=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'scheduled_date']),
            models.Index(fields=['technician_id', 'status']),
            models.Index(fields=['assigned_admin_id', 'status']),
            models.Index(fields=['assigned_admin_id', 'created_at']),
            models.Index(fields=['completed_date']),
            models.Index(fields=['scheduled_date', 'scheduled_time']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['auto_assigned', 'assigned_at']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Ticket {self.id} for {self.request}"


class TicketCrewAssignment(models.Model):
    id = models.BigAutoField(db_column='ticket_crew_assignment_id', primary_key=True)

    ticket = models.ForeignKey(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='crew_assignments',
    )
    technician = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='crew_ticket_assignments',
        limit_choices_to={'role': 'technician'},
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['ticket', 'technician'],
                name='unique_ticket_crew_assignment',
            )
        ]

    def __str__(self):
        return f"Ticket #{self.ticket_id} crew: {self.technician.username}"



