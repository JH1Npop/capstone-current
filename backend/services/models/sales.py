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
