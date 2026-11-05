import uuid
from pathlib import Path

from django.db import models
from django.conf import settings
from django.utils import timezone

from afn_service_management.fields import StructuredTextField
from .core import ServiceType, ServiceTicket, ServiceRequest, ServiceLocation
from .after_sales import MaintenanceSchedule, AfterSalesCase


def document_template_upload_path(instance, filename):
    """Opaque, version-owned path; callers never control the directory."""
    suffix = Path(filename).suffix.lower() if filename else '.docx'
    return f'document_templates/{instance.template_id}/{uuid.uuid4().hex}{suffix}'


def document_output_upload_path(instance, filename):
    suffix = Path(filename).suffix.lower() if filename else '.docx'
    owner = f'ticket-{instance.ticket_id}' if instance.ticket_id else f'instance-{instance.instance_id}'
    return f'generated_documents/{owner}/{uuid.uuid4().hex}{suffix}'


def document_attachment_upload_path(instance, filename):
    suffix = Path(filename).suffix.lower() if filename else ''
    return f'document_attachments/{instance.instance_id}/{uuid.uuid4().hex}{suffix}'


class TechnicalDataSheet(models.Model):
    id = models.BigAutoField(db_column='tds_id', primary_key=True)
    ticket = models.OneToOneField(ServiceTicket, on_delete=models.CASCADE, related_name='technical_data_sheet')
    
    status = models.CharField(
        max_length=20,
        choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('reviewed', 'Reviewed')],
        default='draft'
    )
    
    # Premise Details
    premise_type = models.CharField(max_length=100, blank=True, null=True)
    premise_category = models.CharField(max_length=100, blank=True, null=True)
    ownership_type = models.CharField(max_length=100, blank=True, null=True)
    private_or_government_type = models.CharField(max_length=100, blank=True, null=True)
    
    # Power Details
    primary_electric_supply = models.CharField(max_length=100, blank=True, null=True)
    ac_phase_power_supply = models.CharField(max_length=100, blank=True, null=True)
    solar_panel_installation_location = models.CharField(max_length=100, blank=True, null=True)
    rooftop_type = models.CharField(max_length=100, blank=True, null=True)
    
    # Electrical Consumption
    average_monthly_electric_bill = models.CharField(max_length=100, blank=True, null=True)
    electricity_required_hours_per_day = models.CharField(max_length=100, blank=True, null=True)
    brownout_frequency = models.CharField(max_length=100, blank=True, null=True)
    battery_preference = models.CharField(max_length=100, blank=True, null=True)
    purpose_of_going_solar = StructuredTextField(structure='list', default=list, blank=True)
    
    # JSON Fields for complex tables
    load_schedule_json = StructuredTextField(structure='list', default=list, blank=True)
    generator_details_json = StructuredTextField(structure='dict', default=dict, blank=True)
    attachments_json = StructuredTextField(structure='dict', default=dict, blank=True)
    
    # Client Confirmation
    client_confirmation_date = models.DateField(null=True, blank=True)
    client_confirmed_name = models.CharField(max_length=255, blank=True, null=True)
    
    # Metadata
    prepared_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prepared_tds'
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviewed_tds'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"TDS for Ticket #{self.ticket_id}"


# Pre-installation Inspection Checklist
class InspectionChecklist(models.Model):
    id = models.BigAutoField(db_column='inspection_checklist_id', primary_key=True)

    """Digital pre-installation inspection checklist"""
    MAINTENANCE_PROFILE_CHOICES = MaintenanceSchedule.PROFILE_CHOICES
    FOLLOW_UP_CASE_TYPE_CHOICES = [
        choice for choice in AfterSalesCase.CASE_TYPE_CHOICES
        if choice[0] != 'maintenance'
    ]

    ticket = models.OneToOneField(ServiceTicket, on_delete=models.CASCADE, related_name='inspection')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_inspections'
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='submitted_inspection_checklists',
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_completed = models.BooleanField(default=False)

    # Site Assessment
    site_accessible = models.BooleanField(default=False)
    site_accessible_notes = models.TextField(blank=True, null=True)

    # Electrical Check
    electrical_available = models.BooleanField(default=False)
    electrical_adequate = models.BooleanField(default=False)
    electrical_notes = models.TextField(blank=True, null=True)

    # Structural Check
    roof_condition = models.CharField(max_length=100, blank=True, null=True)
    structural_assessment = models.TextField(blank=True, null=True)

    # Safety Check
    safety_equipment_present = models.BooleanField(default=False)
    safety_hazards = models.TextField(blank=True, null=True)

    # Overall
    recommendation = models.CharField(max_length=100, blank=True, null=True)  # Approved, Conditional, Rejected
    additional_notes = models.TextField(blank=True, null=True)

    # Planned maintenance
    maintenance_required = models.BooleanField(default=False)
    maintenance_profile = models.CharField(
        max_length=30,
        choices=MAINTENANCE_PROFILE_CHOICES,
        blank=True,
        null=True
    )
    maintenance_interval_days = models.PositiveIntegerField(blank=True, null=True)
    maintenance_notes = models.TextField(blank=True, null=True)
    service_type_label = models.CharField(max_length=255, blank=True, null=True)
    procedure_source = models.CharField(max_length=30, blank=True, null=True)
    checklist_items = StructuredTextField(structure='list', default=list, blank=True)
    required_equipment_snapshot = StructuredTextField(structure='list', default=list, blank=True)
    proof_media = StructuredTextField(structure='list', default=list, blank=True)
    warranty_provided = models.BooleanField(default=False)
    warranty_period_days = models.PositiveIntegerField(blank=True, null=True)
    warranty_notes = models.TextField(blank=True, null=True)
    follow_up_required = models.BooleanField(default=False)
    follow_up_case_type = models.CharField(
        max_length=20,
        choices=FOLLOW_UP_CASE_TYPE_CHOICES,
        blank=True,
        null=True,
    )
    follow_up_due_date = models.DateField(blank=True, null=True)
    follow_up_summary = models.CharField(max_length=255, blank=True, null=True)
    follow_up_details = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Inspection for Ticket {self.ticket.id}"


class SolarCommissioningChecklist(models.Model):
    id = models.BigAutoField(db_column='solar_commissioning_checklist_id', primary_key=True)

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('completed', 'Completed'),
        ('finalized', 'Finalized'),
    ]

    ticket = models.OneToOneField(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='solar_commissioning_checklist',
    )
    site_name = models.CharField(max_length=255, blank=True, default='')
    inverter_type = models.CharField(max_length=255, blank=True, default='')
    system_designation = models.CharField(max_length=255, blank=True, default='')
    inverter_serial_number = models.CharField(max_length=255, blank=True, default='')
    commissioned_date = models.DateField(blank=True, null=True)
    irradiance = models.CharField(max_length=100, blank=True, default='')
    ambient_temperature = models.CharField(max_length=100, blank=True, default='')
    readings_json = StructuredTextField(structure='dict', default=dict, blank=True)
    checklist_items_json = StructuredTextField(structure='list', default=list, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='completed_solar_commissioning_checklists',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'commissioned_date']),
            models.Index(fields=['ticket']),
        ]
        ordering = ['-created_at']

    def __str__(self):
        return f"Solar commissioning for ticket #{self.ticket_id}"


class TurnoverAcceptance(models.Model):
    id = models.BigAutoField(db_column='turnover_acceptance_id', primary_key=True)

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('finalized', 'Finalized'),
        ('accepted', 'Accepted'),
    ]

    ticket = models.OneToOneField(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='turnover_acceptance',
    )
    generated_document = models.ForeignKey(
        'GeneratedDocument',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='turnover_acceptances'
    )
    turnover_date = models.DateField(blank=True, null=True)
    accepted_by_client_name = models.CharField(max_length=255, blank=True, default='')
    accepted_by_client_contact = models.CharField(max_length=255, blank=True, default='')
    warranty_start_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    finalized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='finalized_turnover_acceptances',
    )
    finalized_at = models.DateTimeField(null=True, blank=True)
    # The client's own confirmation in the portal after staff finalize the handover.
    client_confirmed_at = models.DateTimeField(null=True, blank=True)
    client_confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )
    client_confirmation_note = models.TextField(blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Turnover Acceptance for Ticket {self.ticket.id}"

    class Meta:
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['ticket']),
        ]
        ordering = ['-created_at']


class DocumentDefinition(models.Model):
    CATEGORY_CHOICES = [('core', 'Core workflow'), ('custom', 'Custom')]
    SOURCE_CHOICES = [('ticket', 'Service ticket'), ('client', 'Client'), ('project', 'Project')]

    code = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    category = models.CharField(max_length=16, choices=CATEGORY_CHOICES, default='custom')
    data_source = models.CharField(max_length=16, choices=SOURCE_CHOICES, default='ticket')
    core_workflow_binding = models.CharField(max_length=64, blank=True, default='')
    access_capabilities = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_document_definitions')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'name', 'id']

    def __str__(self):
        return self.name


class DocumentTemplate(models.Model):
    definition = models.ForeignKey(DocumentDefinition, on_delete=models.PROTECT, related_name='templates')
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default='')
    is_default = models.BooleanField(default=False)
    is_enabled = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_document_templates')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['definition__display_order', 'name', 'id']
        constraints = [
            models.UniqueConstraint(fields=['definition', 'name'], name='services_document_template_unique_name'),
            models.UniqueConstraint(fields=['definition'], condition=models.Q(is_default=True), name='services_document_template_one_default'),
        ]

    def __str__(self):
        return f'{self.definition.name} — {self.name}'


class DocumentTemplateVersion(models.Model):
    FORMAT_CHOICES = [('docx', 'DOCX'), ('pdf', 'PDF')]
    VALIDATION_CHOICES = [('pending', 'Pending'), ('valid', 'Valid'), ('invalid', 'Invalid')]
    PUBLICATION_CHOICES = [('draft', 'Draft'), ('active', 'Active'), ('retired', 'Retired')]
    READINESS_CHOICES = [
        ('saved', 'Saved'),
        ('ready_fill', 'Ready to fill'),
        ('ready_auto', 'Ready for automatic fill'),
        ('attention', 'Needs attention'),
    ]

    template = models.ForeignKey(DocumentTemplate, on_delete=models.PROTECT, related_name='versions')
    version_number = models.PositiveIntegerField()
    original_filename = models.CharField(max_length=255)
    file = models.FileField(upload_to=document_template_upload_path, max_length=500)
    file_format = models.CharField(max_length=8, choices=FORMAT_CHOICES, default='docx')
    mime_type = models.CharField(max_length=150, default='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    file_size = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64)
    placeholder_manifest = models.JSONField(default=dict, blank=True)
    validation_report = models.JSONField(default=dict, blank=True)
    validation_status = models.CharField(max_length=16, choices=VALIDATION_CHOICES, default='pending')
    readiness_status = models.CharField(max_length=16, choices=READINESS_CHOICES, default='saved')
    publication_status = models.CharField(max_length=16, choices=PUBLICATION_CHOICES, default='draft')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='uploaded_document_template_versions')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    activated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='activated_document_template_versions')
    activated_at = models.DateTimeField(null=True, blank=True)
    change_notes = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['template_id', '-version_number']
        constraints = [
            models.UniqueConstraint(fields=['template', 'version_number'], name='services_document_template_version_unique'),
            models.UniqueConstraint(fields=['template'], condition=models.Q(publication_status='active'), name='services_document_template_one_active_version'),
        ]

    def __str__(self):
        return f'{self.template} v{self.version_number}'


class DocumentTemplateField(models.Model):
    FIELD_TYPE_CHOICES = [
        ('text', 'Short text'),
        ('multiline', 'Multiline text'),
        ('date', 'Date'),
        ('number', 'Number'),
        ('currency', 'Currency'),
        ('checkbox', 'Checkbox'),
        ('dropdown', 'Dropdown'),
        ('signature', 'Signature placeholder'),
    ]
    FILL_METHOD_CHOICES = [('manual', 'Manual'), ('system', 'AFN data')]

    template_version = models.ForeignKey(DocumentTemplateVersion, on_delete=models.CASCADE, related_name='fillable_fields')
    field_key = models.SlugField(max_length=64)
    label = models.CharField(max_length=150)
    field_type = models.CharField(max_length=16, choices=FIELD_TYPE_CHOICES, default='text')
    fill_method = models.CharField(max_length=16, choices=FILL_METHOD_CHOICES, default='manual')
    source_key = models.CharField(max_length=100, blank=True, default='')
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    options = models.JSONField(default=list, blank=True)
    page_number = models.PositiveIntegerField(null=True, blank=True)
    placement = models.JSONField(default=dict, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'page_number', 'label', 'id']
        constraints = [
            models.UniqueConstraint(fields=['template_version', 'field_key'], name='services_document_template_field_unique_key'),
        ]
        indexes = [models.Index(fields=['template_version', 'page_number'])]

    def __str__(self):
        return f'{self.template_version}: {self.label}'


class DocumentFieldDefinition(models.Model):
    FIELD_TYPE_CHOICES = [
        ('text', 'Text'),
        ('multiline', 'Multiline text'),
        ('number', 'Number'),
        ('date', 'Date'),
        ('boolean', 'Boolean'),
        ('dropdown', 'Dropdown'),
    ]

    definition = models.ForeignKey(DocumentDefinition, on_delete=models.CASCADE, related_name='field_definitions')
    field_key = models.SlugField(max_length=64)
    label = models.CharField(max_length=150)
    field_type = models.CharField(max_length=16, choices=FIELD_TYPE_CHOICES, default='text')
    is_required = models.BooleanField(default=False)
    default_value = models.JSONField(null=True, blank=True)
    validation_config = models.JSONField(default=dict, blank=True)
    display_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['display_order', 'label', 'id']
        constraints = [models.UniqueConstraint(fields=['definition', 'field_key'], name='services_document_field_unique_key')]

    def __str__(self):
        return f'{self.definition.name}: {self.label}'


class DocumentInstance(models.Model):
    STATUS_CHOICES = [('draft', 'Draft'), ('generated', 'Generated'), ('archived', 'Archived')]

    definition = models.ForeignKey(DocumentDefinition, on_delete=models.PROTECT, related_name='instances')
    ticket = models.ForeignKey(ServiceTicket, null=True, blank=True, on_delete=models.PROTECT, related_name='custom_document_instances')
    client = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name='custom_document_instances')
    project = models.ForeignKey('SolarProjectProfile', null=True, blank=True, on_delete=models.PROTECT, related_name='document_instances')
    selected_template_version = models.ForeignKey(DocumentTemplateVersion, null=True, blank=True, on_delete=models.PROTECT, related_name='document_instances')
    custom_field_values = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='draft')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_document_instances')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-id']
        indexes = [models.Index(fields=['definition', 'ticket']), models.Index(fields=['definition', 'client'])]

    def __str__(self):
        return f'{self.definition.name} instance #{self.pk}'


class GeneratedDocument(models.Model):
    id = models.BigAutoField(db_column='generated_document_id', primary_key=True)

    DOCUMENT_TYPE_CHOICES = [
        ('field_service_report', 'Field Service Report'),
        ('turnover_acceptance', 'Turnover / Acceptance Form'),
        ('commissioning_checklist', 'PV Solar Site Commissioning Checklist'),
        ('technical_data_sheet', 'TDS - Technical Data Sheet'),
        ('installation_contract', 'Solar Installation Contract'),
        ('quotation_proposal', 'Quotation Proposal'),
    ]

    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('finalized', 'Finalized'),
    ]

    ticket = models.ForeignKey(
        ServiceTicket,
        on_delete=models.CASCADE,
        related_name='generated_documents',
    )
    document_type = models.CharField(max_length=64, choices=DOCUMENT_TYPE_CHOICES)
    title = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='draft')
    data_json = StructuredTextField(structure='dict', default=dict, blank=True)
    source_snapshot_json = StructuredTextField(structure='dict', default=dict, blank=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_service_documents',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['ticket', 'document_type'],
                name='services_generated_document_unique_ticket_type',
            ),
        ]
        indexes = [
            models.Index(fields=['ticket', 'document_type']),
            models.Index(fields=['document_type', '-updated_at']),
        ]
        ordering = ['document_type']

    def __str__(self):
        return f"{self.get_document_type_display()} - TKT-{self.ticket_id:04d}"


class DocumentOutput(models.Model):
    FORMAT_CHOICES = [('docx', 'DOCX'), ('pdf', 'PDF')]
    SOURCE_CHOICES = [('legacy', 'Legacy fallback'), ('dynamic', 'Active template')]
    STATUS_CHOICES = [('ready', 'Ready'), ('failed', 'Failed')]

    definition = models.ForeignKey(DocumentDefinition, on_delete=models.PROTECT, related_name='outputs')
    ticket = models.ForeignKey(ServiceTicket, null=True, blank=True, on_delete=models.PROTECT, related_name='document_outputs')
    instance = models.ForeignKey(DocumentInstance, null=True, blank=True, on_delete=models.PROTECT, related_name='outputs')
    template_version = models.ForeignKey(DocumentTemplateVersion, null=True, blank=True, on_delete=models.PROTECT, related_name='outputs')
    generated_document = models.ForeignKey(GeneratedDocument, null=True, blank=True, on_delete=models.SET_NULL, related_name='outputs')
    output_format = models.CharField(max_length=8, choices=FORMAT_CHOICES, default='docx')
    renderer_source = models.CharField(max_length=16, choices=SOURCE_CHOICES)
    file = models.FileField(upload_to=document_output_upload_path, max_length=500, blank=True)
    original_filename = models.CharField(max_length=255)
    file_size = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True, default='')
    source_snapshot = models.JSONField(default=dict)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='ready')
    error_summary = models.TextField(blank=True, default='')
    generated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='generated_document_outputs')
    generated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-generated_at', '-id']
        indexes = [models.Index(fields=['ticket', '-generated_at']), models.Index(fields=['instance', '-generated_at']), models.Index(fields=['definition', '-generated_at'])]

    def __str__(self):
        owner = f'TKT-{self.ticket_id:04d}' if self.ticket_id else f'instance #{self.instance_id}'
        return f'{self.definition.name} output for {owner}'


class DocumentAttachment(models.Model):
    instance = models.ForeignKey(DocumentInstance, on_delete=models.PROTECT, related_name='attachments')
    file = models.FileField(upload_to=document_attachment_upload_path, max_length=500)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=150)
    file_size = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64)
    description = models.CharField(max_length=255, blank=True, default='')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='uploaded_document_attachments')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-uploaded_at', '-id']
        indexes = [models.Index(fields=['instance', '-uploaded_at'])]

    def __str__(self):
        return self.original_filename


# Technician Location History for tracking

class QuotationRecord(models.Model):
    id = models.BigAutoField(db_column='quotation_id', primary_key=True)
    ticket = models.OneToOneField(ServiceTicket, on_delete=models.CASCADE, related_name='quotation')
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='quotations',
        limit_choices_to={'role': 'client'}
    )
    quotation_number = models.CharField(max_length=100, blank=True, null=True)
    total_amount = models.CharField(max_length=255, blank=True, null=True)
    downpayment_amount = models.CharField(max_length=255, blank=True, null=True)
    balance_amount = models.CharField(max_length=255, blank=True, null=True)
    deposit_policy = models.CharField(
        max_length=20,
        choices=ServiceType.DEPOSIT_POLICY_CHOICES,
        default='none',
        help_text="Snapshot of the service deposit rule when this quotation was created.",
    )
    deposit_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    required_deposit_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_terms = models.TextField(blank=True, null=True)
    warranty_terms = models.TextField(blank=True, null=True)
    validity_days = models.IntegerField(default=30)
    status = models.CharField(
        max_length=20,
        choices=[
            ('Draft', 'Draft'),
            ('Sent', 'Sent'),
            ('Accepted', 'Accepted'),
            ('Rejected', 'Rejected')
        ],
        default='Draft'
    )
    bill_of_materials = StructuredTextField(structure='list', default=list, blank=True)
    # Set when the client accepts or declines in the portal (staff may also record a decision).
    client_responded_at = models.DateTimeField(null=True, blank=True)
    client_response_note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Quotation for Ticket #{self.ticket_id} ({self.status})"

class InstallationContract(models.Model):
    id = models.BigAutoField(db_column='contract_id', primary_key=True)
    ticket = models.OneToOneField(ServiceTicket, on_delete=models.CASCADE, related_name='installation_contract')
    scope_of_work = models.TextField(blank=True, null=True)
    start_date = models.DateField(blank=True, null=True)
    estimated_completion_days = models.IntegerField(blank=True, null=True)
    total_contract_amount = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    payment_terms_upfront = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    payment_terms_completion = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    payment_terms_final = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    warranty_period = models.CharField(max_length=100, blank=True, null=True)
    status = models.CharField(
        max_length=20, 
        default='draft', 
        choices=[('draft', 'Draft'), ('finalized', 'Finalized'), ('signed', 'Signed')]
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Installation Contract for Ticket #{self.ticket_id}"


class SolarProjectProfile(models.Model):
    id = models.BigAutoField(db_column='project_profile_id', primary_key=True)
    location = models.OneToOneField(ServiceLocation, on_delete=models.CASCADE, related_name='solar_project_profile')
    original_ticket = models.OneToOneField(ServiceTicket, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_project_profile')
    
    system_capacity = models.CharField(max_length=100, blank=True, null=True)
    panel_brand = models.CharField(max_length=100, blank=True, null=True)
    number_of_panels = models.IntegerField(blank=True, null=True)
    inverter_brand = models.CharField(max_length=100, blank=True, null=True)
    number_of_inverters = models.IntegerField(blank=True, null=True)
    battery_brand = models.CharField(max_length=100, blank=True, null=True)
    mounting_structure = models.CharField(max_length=100, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Solar Profile for Location: {self.location}"

class FieldServiceReport(models.Model):
    id = models.BigAutoField(db_column='fsr_id', primary_key=True)
    ticket = models.ForeignKey(ServiceTicket, on_delete=models.CASCADE, related_name='field_service_reports')
    
    # Readings
    indoor_temp = models.CharField(max_length=50, blank=True, null=True)
    outdoor_temp = models.CharField(max_length=50, blank=True, null=True)
    ampere_reading = models.CharField(max_length=50, blank=True, null=True)
    voltage_reading = models.CharField(max_length=50, blank=True, null=True)
    
    # Before / After service readings
    before_service_readings = models.TextField(blank=True, null=True)
    after_service_readings = models.TextField(blank=True, null=True)
    
    brand_model = models.CharField(max_length=100, blank=True, null=True)
    serial_number = models.CharField(max_length=100, blank=True, null=True)
    
    recommendation = models.TextField(blank=True, null=True)
    
    # Client Acknowledgment
    client_acknowledged = models.BooleanField(default=False)
    client_signature_date = models.DateField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Field Service Report for Ticket #{self.ticket_id}"
