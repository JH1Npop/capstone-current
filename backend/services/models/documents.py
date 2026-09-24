from django.db import models
from django.conf import settings
from django.utils import timezone

from afn_service_management.fields import StructuredTextField
from .core import ServiceType, ServiceTicket, ServiceRequest, ServiceLocation
from .after_sales import MaintenanceSchedule, AfterSalesCase


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
