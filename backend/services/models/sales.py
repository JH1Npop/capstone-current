import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


def generate_sales_record_number():
    return f"SAL-{timezone.now():%Y}-{uuid.uuid4().hex[:8].upper()}"


class SalesRecord(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('confirmed', 'Confirmed'),
        ('voided', 'Voided'),
    ]

    id = models.BigAutoField(primary_key=True, db_column='sales_record_id')
    record_number = models.CharField(max_length=32, unique=True, default=generate_sales_record_number)
    ticket = models.ForeignKey(
        'services.ServiceTicket',
        on_delete=models.PROTECT,
        related_name='sales_records',
    )
    client = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='sales_records',
        limit_choices_to={'role': 'client'},
    )
    quotation = models.ForeignKey(
        'services.QuotationRecord',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales_records',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    sale_date = models.DateField(null=True, blank=True)
    currency_code = models.CharField(max_length=3, default='PHP')
    agreed_total = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    source_snapshot = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_sales_records',
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='confirmed_sales_records',
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='voided_sales_records',
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.TextField(blank=True, default='')
    replaces = models.OneToOneField(
        'self',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='replacement',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['client', '-sale_date']),
            models.Index(fields=['status', '-created_at']),
            models.Index(fields=['ticket', 'status']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['ticket'],
                condition=Q(status__in=['draft', 'confirmed']),
                name='services_sales_record_one_active_per_ticket',
            ),
            models.CheckConstraint(
                condition=Q(agreed_total__isnull=True) | Q(agreed_total__gte=0),
                name='services_sales_record_total_gte_0',
            ),
        ]

    def __str__(self):
        return self.record_number


class SalesRecordLine(models.Model):
    LINE_TYPE_CHOICES = [
        ('service', 'Service'),
        ('product', 'Product'),
        ('equipment', 'Installed Equipment'),
        ('other', 'Other'),
    ]

    id = models.BigAutoField(primary_key=True, db_column='sales_record_line_id')
    sales_record = models.ForeignKey(SalesRecord, on_delete=models.CASCADE, related_name='line_items')
    line_type = models.CharField(max_length=20, choices=LINE_TYPE_CHOICES)
    service_type = models.ForeignKey(
        'services.ServiceType', on_delete=models.SET_NULL, null=True, blank=True,
    )
    inventory_item = models.ForeignKey(
        'inventory.InventoryItem', on_delete=models.SET_NULL, null=True, blank=True,
    )
    installed_equipment = models.ForeignKey(
        'services.InstalledEquipment', on_delete=models.SET_NULL, null=True, blank=True,
    )
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=80, blank=True, default='')
    quantity = models.DecimalField(max_digits=12, decimal_places=3, default=1)
    unit = models.CharField(max_length=50, blank=True, default='')
    unit_price = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    line_total = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    source_snapshot = models.JSONField(default=dict, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gt=0),
                name='services_sales_record_line_qty_gt_0',
            ),
            models.CheckConstraint(
                condition=Q(unit_price__isnull=True) | Q(unit_price__gte=0),
                name='services_sales_record_line_price_gte_0',
            ),
            models.CheckConstraint(
                condition=Q(line_total__isnull=True) | Q(line_total__gte=0),
                name='services_sales_record_line_total_gte_0',
            ),
        ]

    def __str__(self):
        return f'{self.sales_record.record_number}: {self.name}'


class SalesPayment(models.Model):
    """A payment received outside the system, recorded against a confirmed sales record."""

    METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('bank_transfer', 'Bank transfer'),
        ('gcash', 'GCash'),
        ('maya', 'Maya'),
        ('check', 'Check'),
        ('card', 'Card'),
        ('other', 'Other'),
    ]

    KIND_CHOICES = [
        ('deposit', 'Deposit'),        # the pre-service deposit on the quotation (gates dispatch)
        ('progress', 'Progress'),      # a billing-plan payment made before the sales record exists
        ('sale', 'Sale'),              # recorded on the sales record after the work
    ]

    id = models.BigAutoField(primary_key=True, db_column='sales_payment_id')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='sale')
    sales_record = models.ForeignKey(
        SalesRecord,
        on_delete=models.PROTECT,
        related_name='payments',
        null=True,
        blank=True,
    )
    quotation = models.ForeignKey(
        'services.QuotationRecord',
        on_delete=models.PROTECT,
        related_name='deposit_payments',
        null=True,
        blank=True,
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    paid_on = models.DateField()
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    reference = models.CharField(max_length=120, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    recorded_at = models.DateTimeField(auto_now_add=True)
    # Payments are voided with a reason, never deleted, so the history stays auditable.
    is_voided = models.BooleanField(default=False)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+',
    )
    void_reason = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-paid_on', '-id']
        indexes = [
            models.Index(fields=['sales_record', 'is_voided']),
            models.Index(fields=['paid_on']),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name='services_sales_payment_amount_gt_0'),
            models.CheckConstraint(
                condition=Q(sales_record__isnull=False) | Q(quotation__isnull=False),
                name='services_sales_payment_has_owner',
            ),
        ]

    def save(self, *args, **kwargs):
        # A new payment on a quotation is the deposit unless it was explicitly recorded as progress.
        if self._state.adding and self.kind == 'sale' and self.quotation_id:
            self.kind = 'deposit'
        super().save(*args, **kwargs)

    def __str__(self):
        owner = self.sales_record.record_number if self.sales_record_id else f'Quotation #{self.quotation_id}'
        return f'{owner}: {self.amount} on {self.paid_on}'


class BillingMilestone(models.Model):
    """One stage of a quotation's payment schedule (progress billing), e.g. 30% / 60% / 10%.

    Amounts, due dates and paid status are worked out from the quotation total, the job's dates and
    the payments received (services/billing.py); only the agreed schedule is stored.
    """

    TRIGGER_CHOICES = [
        ('acceptance', 'When the quotation is accepted'),
        ('work_start', 'When work starts'),
        ('completion', 'When the work is completed'),
        ('handover', 'At handover'),
        ('date', 'On a set date'),
    ]

    id = models.BigAutoField(primary_key=True, db_column='billing_milestone_id')
    quotation = models.ForeignKey(
        'services.QuotationRecord',
        on_delete=models.CASCADE,
        related_name='billing_milestones',
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    label = models.CharField(max_length=120)
    percent = models.DecimalField(max_digits=5, decimal_places=2)
    trigger = models.CharField(max_length=20, choices=TRIGGER_CHOICES)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'id']
        constraints = [
            models.CheckConstraint(
                condition=Q(percent__gt=0) & Q(percent__lte=100),
                name='services_billing_milestone_percent_range',
            ),
            models.CheckConstraint(
                condition=~Q(trigger='date') | Q(due_date__isnull=False),
                name='services_billing_milestone_date_needs_due_date',
            ),
        ]

    def __str__(self):
        return f'{self.label} ({self.percent}%)'

