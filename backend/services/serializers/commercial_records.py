import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.utils import timezone
from rest_framework import serializers
from ..models import (
    ServiceType, SLARule, ServiceRequest, ServiceRequestService, ServiceLocation, SolarEstimate, ServiceTicket,
    AfterSalesCase as FollowUpCase, AfterSalesCaseEvent,
    TechnicianSkill, ServiceStatusHistory, InspectionChecklist, SolarCommissioningChecklist,
    TechnicianLocationHistory, ServiceAnalytics, TechnicianPerformance,
    GeneratedDocument,
    DemandForecast, ServiceTrend, MaintenanceSchedule,
    InstalledEquipment, QuotationRecord, TurnoverAcceptance, TechnicalDataSheet,
    InstallationContract, SolarProjectProfile, FieldServiceReport,
    SalesRecord, SalesRecordLine, SalesPayment
)
from ..solar_calculator import CALCULATION_VERSION, SolarCalculationError, calculate_solar_estimate
from ..sla import (
    evaluate_service_request_sla,
    evaluate_service_ticket_sla,
    get_ticket_dispatch_state,
    serialize_sla_evaluation,
)
from ..business_time import business_today
from ..user_display import client_technician_label
from ..deposits import (
    calculate_required_deposit,
    decimal_from_money,
    effective_request_deposit_rule,
    quotation_deposit_summary,
)

class TechnicalDataSheetSerializer(serializers.ModelSerializer):
    purpose_of_going_solar = serializers.JSONField(required=False)
    load_schedule_json = serializers.JSONField(required=False)
    generator_details_json = serializers.JSONField(required=False)
    attachments_json = serializers.JSONField(required=False)
    prepared_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    def get_prepared_by_name(self, obj):
        return client_technician_label(obj.prepared_by) or ''

    def get_reviewed_by_name(self, obj):
        return client_technician_label(obj.reviewed_by) or ''

    def validate(self, attrs):
        if self.instance and self.instance.status == 'reviewed':
            raise serializers.ValidationError("Cannot update a Technical Data Sheet that has already been reviewed.")
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'role', None) == 'technician':
            # Status moves only through the submit and review actions.
            attrs.pop('status', None)
        expected_types = {
            'purpose_of_going_solar': list,
            'load_schedule_json': list,
            'generator_details_json': dict,
            'attachments_json': dict,
        }
        for field, expected_type in expected_types.items():
            value = attrs.get(field, getattr(self.instance, field, expected_type()))
            if not isinstance(value, expected_type):
                raise serializers.ValidationError({
                    field: f'{field.replace("_", " ").capitalize()} must be a {expected_type.__name__}.',
                })
        return super().validate(attrs)

    class Meta:
        model = TechnicalDataSheet
        fields = '__all__'
        read_only_fields = ['prepared_by', 'reviewed_by', 'created_at', 'updated_at', 'submitted_at', 'reviewed_at']


class QuotationRecordSerializer(serializers.ModelSerializer):
    bill_of_materials = serializers.JSONField(required=False)
    deposit_paid_amount = serializers.SerializerMethodField()
    deposit_remaining_amount = serializers.SerializerMethodField()
    deposit_status = serializers.SerializerMethodField()
    deposit_payments = serializers.SerializerMethodField()

    def _deposit_summary(self, obj):
        return quotation_deposit_summary(obj)

    def get_deposit_paid_amount(self, obj):
        return str(self._deposit_summary(obj)['deposit_paid_amount'])

    def get_deposit_remaining_amount(self, obj):
        return str(self._deposit_summary(obj)['deposit_remaining_amount'])

    def get_deposit_status(self, obj):
        return self._deposit_summary(obj)['deposit_status']

    def get_deposit_payments(self, obj):
        payments = obj.deposit_payments.select_related('recorded_by').all()
        return SalesPaymentSerializer(payments, many=True).data

    @staticmethod
    def _apply_deposit_snapshot(validated_data, instance=None):
        ticket = validated_data.get('ticket') or instance.ticket
        if instance is None:
            policy = None
            value = None
        else:
            policy = instance.deposit_policy
            value = instance.deposit_value
        total_text = validated_data.get('total_amount', getattr(instance, 'total_amount', None))
        total = decimal_from_money(total_text)
        try:
            if instance is None:
                policy, value, required = effective_request_deposit_rule(ticket.request, total)
            else:
                required = calculate_required_deposit(policy, value, total)
        except ValueError as exc:
            raise serializers.ValidationError({'total_amount': str(exc)}) from exc
        validated_data['deposit_policy'] = policy
        validated_data['deposit_value'] = value
        validated_data['required_deposit_amount'] = required
        if required > 0:
            validated_data['downpayment_amount'] = f'PHP {required:,.2f}'
            validated_data['balance_amount'] = f'PHP {(total - required):,.2f}'
        else:
            validated_data['downpayment_amount'] = None
            validated_data['balance_amount'] = f'PHP {total:,.2f}' if total is not None else None
        return validated_data

    def create(self, validated_data):
        return super().create(self._apply_deposit_snapshot(validated_data))

    @staticmethod
    def _next_revision_number(number):
        # QUO-0005 -> QUO-0005-R2 -> QUO-0005-R3: each revision after a decline is traceable.
        match = re.match(r'^(.*?)-R(\d+)$', number or '')
        base, revision = (match.group(1), int(match.group(2))) if match else (number, 1)
        return f'{base}-R{revision + 1}'

    def update(self, instance, validated_data):
        revising = instance.status == 'Rejected'
        previous_number = instance.quotation_number
        previous_note = instance.client_response_note
        quotation = super().update(instance, self._apply_deposit_snapshot(validated_data, instance))
        if revising:
            # The revised offer awaits a fresh client decision; the decline stays in the audit log.
            quotation.client_responded_at = None
            quotation.client_response_note = ''
            quotation.save(update_fields=['client_responded_at', 'client_response_note', 'updated_at'])
            from users.signals import log_activity
            log_activity(
                category='tickets',
                action='update',
                target=quotation,
                message=f'Quotation {previous_number} was revised as {quotation.quotation_number} after the client declined it.',
                metadata={
                    'previous_quotation_number': previous_number,
                    'client_decline_note': previous_note,
                    'revised_total_amount': quotation.total_amount,
                },
            )
        return quotation

    def validate(self, attrs):
        if self.instance and self.instance.status == 'Accepted':
            raise serializers.ValidationError("Cannot update a Quotation Record that has already been accepted.")
        if self.instance and self.instance.status == 'Rejected':
            # A declined quotation can only be revised into a new offer for the client.
            if attrs.get('status') not in ('Draft', 'Sent'):
                raise serializers.ValidationError(
                    "This quotation was declined. Revise it and send it again, or keep it as declined."
                )
            attrs['quotation_number'] = self._next_revision_number(self.instance.quotation_number)
        ticket = attrs.get('ticket', getattr(self.instance, 'ticket', None))
        client = attrs.get('client', getattr(self.instance, 'client', None))
        if ticket and client and ticket.request.client_id != client.id:
            raise serializers.ValidationError({
                'client': 'Quotation client must match the service ticket client.',
            })
        quotation_number = str(
            attrs.get('quotation_number', getattr(self.instance, 'quotation_number', '')) or ''
        ).strip().upper()
        if not quotation_number and ticket:
            quotation_number = f'QUO-{ticket.id:04d}'
        if not quotation_number:
            raise serializers.ValidationError({'quotation_number': 'Quotation number is required.'})
        duplicate = QuotationRecord.objects.filter(quotation_number__iexact=quotation_number)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError({'quotation_number': 'This quotation number is already in use.'})
        attrs['quotation_number'] = quotation_number
        validity_days = attrs.get('validity_days', getattr(self.instance, 'validity_days', 30))
        if validity_days is not None and not 1 <= validity_days <= 365:
            raise serializers.ValidationError({'validity_days': 'Validity must be between 1 and 365 days.'})
        bill_of_materials = attrs.get('bill_of_materials', getattr(self.instance, 'bill_of_materials', []))
        if not isinstance(bill_of_materials, list):
            raise serializers.ValidationError({'bill_of_materials': 'Bill of materials must be a list.'})
        if len(bill_of_materials) > 500:
            raise serializers.ValidationError({'bill_of_materials': 'Bill of materials cannot exceed 500 rows.'})
        if any(not isinstance(row, dict) for row in bill_of_materials):
            raise serializers.ValidationError({'bill_of_materials': 'Every bill-of-materials row must be an object.'})
        return super().validate(attrs)

    class Meta:
        model = QuotationRecord
        fields = '__all__'
        # Client responses are recorded only through the respond action.
        read_only_fields = [
            'created_at', 'updated_at', 'client_responded_at', 'client_response_note',
            'deposit_policy', 'deposit_value', 'required_deposit_amount',
            'deposit_paid_amount', 'deposit_remaining_amount', 'deposit_status', 'deposit_payments',
        ]


class SalesRecordLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesRecordLine
        fields = [
            'id', 'line_type', 'service_type', 'inventory_item', 'installed_equipment',
            'name', 'sku', 'quantity', 'unit', 'unit_price', 'line_total',
            'source_snapshot', 'sort_order',
        ]
        read_only_fields = fields


class SalesPaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()
    method_label = serializers.CharField(source='get_method_display', read_only=True)

    def get_recorded_by_name(self, obj):
        user = obj.recorded_by
        return (user.get_full_name().strip() or user.username) if user else ''

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Enter an amount greater than zero.')
        return value

    def validate_paid_on(self, value):
        # Compare with the business (UTC+8) day: before 08:00 local the UTC date is still yesterday.
        if value and value > business_today():
            raise serializers.ValidationError('The payment date cannot be in the future.')
        return value

    class Meta:
        model = SalesPayment
        fields = [
            'id', 'sales_record', 'quotation', 'amount', 'paid_on', 'method', 'method_label', 'reference', 'notes',
            'recorded_by', 'recorded_by_name', 'recorded_at', 'is_voided', 'voided_at', 'void_reason',
        ]
        read_only_fields = [
            'id', 'sales_record', 'quotation', 'recorded_by', 'recorded_at', 'is_voided', 'voided_at', 'void_reason',
        ]


def sales_payment_summary(record):
    """Amount paid, balance due and payment status from non-voided payments."""
    payments = getattr(record, '_prefetched_objects_cache', {}).get('payments')
    if payments is None:
        payments = record.payments.all()
    paid = sum((payment.amount for payment in payments if not payment.is_voided), Decimal('0'))
    total = record.agreed_total
    balance = (total - paid) if total is not None else None
    if record.status != 'confirmed' or total is None:
        payment_status = 'not_applicable'
    elif paid <= 0:
        payment_status = 'unpaid'
    elif balance > 0:
        payment_status = 'partial'
    else:
        payment_status = 'paid'
    return {'amount_paid': paid, 'balance_due': balance, 'payment_status': payment_status}


class SalesRecordSerializer(serializers.ModelSerializer):
    line_items = SalesRecordLineSerializer(many=True, read_only=True)
    payments = SalesPaymentSerializer(many=True, read_only=True)
    amount_paid = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()

    def _payment_summary(self, obj):
        cache = getattr(self, '_payment_summary_cache', {})
        if obj.pk not in cache:
            cache[obj.pk] = sales_payment_summary(obj)
            self._payment_summary_cache = cache
        return cache[obj.pk]

    def get_amount_paid(self, obj):
        return str(self._payment_summary(obj)['amount_paid'])

    def get_balance_due(self, obj):
        balance = self._payment_summary(obj)['balance_due']
        return str(balance) if balance is not None else None

    def get_payment_status(self, obj):
        return self._payment_summary(obj)['payment_status']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        if request is not None and getattr(request.user, 'role', None) == 'client':
            # Payments are settled outside the system; clients see purchase records, not collection status.
            for field in ('payments', 'amount_paid', 'balance_due', 'payment_status'):
                data.pop(field, None)
        return data
    client_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()
    service_summary = serializers.SerializerMethodField()
    quotation_number = serializers.CharField(source='quotation.quotation_number', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    confirmed_by_name = serializers.SerializerMethodField()
    voided_by_name = serializers.SerializerMethodField()
    agreed_total_source = serializers.SerializerMethodField()

    def get_client_name(self, obj):
        return client_technician_label(obj.client) or obj.client.username

    def get_ticket_code(self, obj):
        return f'TKT-{obj.ticket_id:04d}'

    def get_service_summary(self, obj):
        names = [
            item.service_type.name
            for item in obj.ticket.request.service_items.select_related('service_type').order_by('sort_order', 'id')
            if item.service_type_id
        ]
        if names:
            return ', '.join(names)
        return obj.ticket.request.service_type.name if obj.ticket.request.service_type_id else 'Service'

    def get_created_by_name(self, obj):
        return client_technician_label(obj.created_by) or ''

    def get_confirmed_by_name(self, obj):
        return client_technician_label(obj.confirmed_by) or ''

    def get_voided_by_name(self, obj):
        return client_technician_label(obj.voided_by) or ''

    def get_agreed_total_source(self, obj):
        snapshot = obj.source_snapshot if isinstance(obj.source_snapshot, dict) else {}
        agreed_value = snapshot.get('agreed_value')
        if isinstance(agreed_value, dict):
            source = agreed_value.get('source')
            if source in {'accepted_quotation', 'signed_contract'}:
                return source
        if obj.agreed_total is not None:
            return 'manual'
        return 'not_recorded'

    def validate_agreed_total(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError('Recorded contract value cannot be negative.')
        return value

    def validate_currency_code(self, value):
        code = str(value or '').strip().upper()
        if len(code) != 3 or not code.isalpha():
            raise serializers.ValidationError('Use a three-letter currency code such as PHP.')
        return code

    class Meta:
        model = SalesRecord
        fields = [
            'id', 'record_number', 'ticket', 'ticket_code', 'client', 'client_name',
            'quotation', 'quotation_number', 'service_summary', 'status', 'sale_date',
            'currency_code', 'agreed_total', 'agreed_total_source', 'notes', 'source_snapshot', 'line_items',
            'created_by', 'created_by_name', 'confirmed_by', 'confirmed_by_name',
            'confirmed_at', 'voided_by', 'voided_by_name', 'voided_at', 'void_reason',
            'replaces', 'created_at', 'updated_at',
            'payments', 'amount_paid', 'balance_due', 'payment_status',
        ]
        read_only_fields = [
            'id', 'record_number', 'ticket', 'client', 'quotation', 'status', 'sale_date',
            'source_snapshot', 'created_by', 'confirmed_by', 'confirmed_at', 'voided_by',
            'voided_at', 'void_reason', 'replaces', 'created_at', 'updated_at',
        ]



class GeneratedDocumentSerializer(serializers.ModelSerializer):
    document_code = serializers.SerializerMethodField()
    data_json = serializers.JSONField(required=False)
    source_snapshot_json = serializers.JSONField(required=False)
    generated_by_name = serializers.SerializerMethodField()
    ticket_code = serializers.SerializerMethodField()

    def get_generated_by_name(self, obj):
        return client_technician_label(obj.generated_by) or ''

    def get_ticket_code(self, obj):
        return f"TKT-{obj.ticket_id:04d}" if obj.ticket_id else ''

    def get_document_code(self, obj):
        return f'DOC-{obj.id:04d}'

    def validate(self, attrs):
        if self.instance and self.instance.status == 'finalized':
            raise serializers.ValidationError("Cannot update a Generated Document that has already been finalized.")
        for field in ('data_json', 'source_snapshot_json'):
            value = attrs.get(field, getattr(self.instance, field, {}))
            if not isinstance(value, dict):
                raise serializers.ValidationError({field: 'Value must be an object.'})
        return super().validate(attrs)

    class Meta:
        model = GeneratedDocument
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'generated_by']
