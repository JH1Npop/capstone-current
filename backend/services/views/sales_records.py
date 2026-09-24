import re
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from inventory.models import InventoryTransaction
from notifications.models import Notification
from services.models import SalesRecord, SalesRecordLine, ServiceTicket
from services.serializers import SalesRecordSerializer
from users.permissions import CanAccessDocuments, CanManageDocuments
from users.rbac import is_admin_workspace_role


FINAL_TICKET_STATUSES = {'Completed', 'Turned Over / Accepted'}


def _decimal_or_none(value):
    if value in (None, ''):
        return None
    cleaned = re.sub(r'[^0-9.\-]', '', str(value))
    if not cleaned:
        return None
    try:
        parsed = Decimal(cleaned)
    except InvalidOperation:
        return None
    return parsed.quantize(Decimal('0.01')) if parsed >= 0 else None


def _client_name(client):
    return client.get_full_name().strip() or client.username


def _ticket_services(ticket):
    services = list(
        ticket.request.service_items.select_related('service_type').order_by('sort_order', 'id')
    )
    service_types = [item.service_type for item in services if item.service_type_id]
    if ticket.request.service_type_id and ticket.request.service_type not in service_types:
        service_types.insert(0, ticket.request.service_type)
    return service_types


def _accepted_quotation(ticket):
    try:
        quotation = ticket.quotation
    except Exception:
        return None
    return quotation if quotation.status == 'Accepted' else None


def _signed_contract(ticket):
    try:
        contract = ticket.installation_contract
    except Exception:
        return None
    return contract if contract.status == 'signed' else None


def _connected_agreed_value(quotation, contract):
    quotation_total = _decimal_or_none(quotation.total_amount) if quotation else None
    if quotation_total is not None:
        return quotation_total, 'accepted_quotation'
    if contract and contract.total_contract_amount is not None:
        return contract.total_contract_amount, 'signed_contract'
    return None, 'not_recorded'


def _build_snapshot(ticket, quotation, agreed_value, agreed_value_source):
    request = ticket.request
    client = request.client
    try:
        location = request.location
    except Exception:
        location = None
    issues = list(
        InventoryTransaction.objects.filter(
            service_ticket=ticket,
            transaction_type='issue',
        ).select_related('item').order_by('transaction_date', 'id')
    )
    equipment = list(ticket.installed_equipment.order_by('created_at', 'id'))
    return {
        'snapshot_version': 1,
        'captured_at': timezone.now().isoformat(),
        'client': {
            'id': client.id,
            'name': _client_name(client),
            'email': client.email or '',
        },
        'ticket': {
            'id': ticket.id,
            'code': f'TKT-{ticket.id:04d}',
            'status': ticket.status,
            'completed_date': ticket.completed_date.isoformat() if ticket.completed_date else None,
            'location': location.address if location else '',
            'warranty_status': ticket.warranty_status,
            'warranty_start_date': ticket.warranty_start_date.isoformat() if ticket.warranty_start_date else None,
            'warranty_end_date': ticket.warranty_end_date.isoformat() if ticket.warranty_end_date else None,
            'warranty_notes': ticket.warranty_notes or '',
        },
        'quotation': {
            'id': quotation.id,
            'number': quotation.quotation_number or '',
            'status': quotation.status,
            'total_amount': quotation.total_amount or '',
            'bill_of_materials': quotation.bill_of_materials or [],
        } if quotation else None,
        'agreed_value': {
            'source': agreed_value_source,
            'amount': str(agreed_value) if agreed_value is not None else None,
        },
        'inventory_issues': [
            {
                'transaction_id': issue.id,
                'item_id': issue.item_id,
                'name': issue.item.name,
                'sku': issue.item.sku,
                'quantity': issue.quantity,
                'unit': issue.item.unit_of_measurement,
                'transaction_date': issue.transaction_date.isoformat(),
            }
            for issue in issues
        ],
        'installed_equipment': [
            {
                'id': item.id,
                'equipment_type': item.equipment_type,
                'brand_model': item.brand_model,
                'serial_number': item.serial_number or '',
                'capacity': item.capacity or '',
                'warranty_start': item.warranty_start.isoformat() if item.warranty_start else None,
                'warranty_end': item.warranty_end.isoformat() if item.warranty_end else None,
            }
            for item in equipment
        ],
    }


def _populate_lines(record, ticket, quotation):
    record.line_items.all().delete()
    lines = []
    sort_order = 0

    for service_type in _ticket_services(ticket):
        sort_order += 1
        lines.append(SalesRecordLine(
            sales_record=record,
            line_type='service',
            service_type=service_type,
            name=service_type.name,
            quantity=Decimal('1'),
            unit='service',
            source_snapshot={
                'source': 'service_request',
                'service_type_id': service_type.id,
            },
            sort_order=sort_order,
        ))

    bom_rows = quotation.bill_of_materials if quotation else []
    valid_bom_rows = [row for row in bom_rows if isinstance(row, dict) and (row.get('description') or row.get('name'))]
    if valid_bom_rows:
        for row in valid_bom_rows:
            quantity = _decimal_or_none(row.get('qty', row.get('quantity'))) or Decimal('1')
            if quantity <= 0:
                continue
            unit_price = _decimal_or_none(row.get('unitPrice', row.get('unit_price')))
            line_total = _decimal_or_none(row.get('amount'))
            if line_total is None and unit_price is not None:
                line_total = (quantity * unit_price).quantize(Decimal('0.01'))
            sort_order += 1
            lines.append(SalesRecordLine(
                sales_record=record,
                line_type='product',
                name=str(row.get('description') or row.get('name')).strip(),
                sku=str(row.get('sku') or '').strip(),
                quantity=quantity,
                unit=str(row.get('unit') or '').strip(),
                unit_price=unit_price,
                line_total=line_total,
                source_snapshot={'source': 'accepted_quotation_bom', 'quotation_row': row},
                sort_order=sort_order,
            ))
    else:
        grouped_issues = {}
        issues = InventoryTransaction.objects.filter(
            service_ticket=ticket,
            transaction_type='issue',
        ).select_related('item').order_by('transaction_date', 'id')
        for issue in issues:
            entry = grouped_issues.setdefault(issue.item_id, {
                'item': issue.item,
                'quantity': Decimal('0'),
                'transaction_ids': [],
            })
            entry['quantity'] += Decimal(issue.quantity)
            entry['transaction_ids'].append(issue.id)
        for entry in grouped_issues.values():
            item = entry['item']
            sort_order += 1
            lines.append(SalesRecordLine(
                sales_record=record,
                line_type='product',
                inventory_item=item,
                name=item.name,
                sku=item.sku,
                quantity=entry['quantity'],
                unit=item.unit_of_measurement,
                source_snapshot={
                    'source': 'inventory_issue',
                    'transaction_ids': entry['transaction_ids'],
                    'brand': item.brand,
                    'model': item.model,
                    'capacity': item.capacity,
                },
                sort_order=sort_order,
            ))

    if not any(line.line_type == 'product' for line in lines):
        for equipment in ticket.installed_equipment.order_by('created_at', 'id'):
            sort_order += 1
            lines.append(SalesRecordLine(
                sales_record=record,
                line_type='equipment',
                installed_equipment=equipment,
                name=f'{equipment.equipment_type}: {equipment.brand_model}',
                quantity=Decimal('1'),
                unit='unit',
                source_snapshot={
                    'source': 'installed_equipment',
                    'serial_number': equipment.serial_number or '',
                    'capacity': equipment.capacity or '',
                },
                sort_order=sort_order,
            ))

    SalesRecordLine.objects.bulk_create(lines)


def _refresh_record_sources(record, ticket):
    quotation = _accepted_quotation(ticket)
    contract = _signed_contract(ticket)
    agreed_total, agreed_total_source = _connected_agreed_value(quotation, contract)
    record.client = ticket.request.client
    record.quotation = quotation
    if agreed_total is not None:
        record.agreed_total = agreed_total
    record.source_snapshot = _build_snapshot(
        ticket,
        quotation,
        agreed_total,
        agreed_total_source,
    )
    _populate_lines(record, ticket, quotation)


class SalesRecordViewSet(viewsets.ModelViewSet):
    serializer_class = SalesRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        if self.action in {'prepare', 'confirm', 'void', 'partial_update', 'create'}:
            return [CanManageDocuments()]
        return [CanAccessDocuments()]

    def get_queryset(self):
        queryset = SalesRecord.objects.select_related(
            'ticket__request__client',
            'ticket__request__service_type',
            'quotation',
            'created_by',
            'confirmed_by',
            'voided_by',
        ).prefetch_related(
            'line_items',
            'ticket__request__service_items__service_type',
        )
        user = self.request.user
        if user.role == 'client':
            queryset = queryset.filter(client=user, status='confirmed')
        elif not is_admin_workspace_role(user.role):
            queryset = queryset.none()

        status_filter = str(self.request.query_params.get('status') or '').strip().lower()
        if status_filter in {'draft', 'confirmed', 'voided'}:
            queryset = queryset.filter(status=status_filter)
        search = str(self.request.query_params.get('search') or '').strip()
        if search:
            search_query = (
                Q(record_number__icontains=search) |
                Q(client__username__icontains=search) |
                Q(client__first_name__icontains=search) |
                Q(client__last_name__icontains=search)
            )
            if search.isdigit():
                search_query |= Q(ticket_id=int(search))
            queryset = queryset.filter(search_query)
        return queryset.distinct()

    def create(self, request, *args, **kwargs):
        return Response(
            {'detail': 'Use the prepare action with a completed service ticket.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def partial_update(self, request, *args, **kwargs):
        record = self.get_object()
        if record.status != 'draft':
            return Response({'detail': 'Only draft sales records can be edited.'}, status=status.HTTP_409_CONFLICT)
        allowed = {'agreed_total', 'currency_code', 'notes'}
        blocked = set(request.data.keys()) - allowed
        if blocked:
            return Response(
                {'detail': f"Only {', '.join(sorted(allowed))} can be edited on a draft."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        quotation = _accepted_quotation(record.ticket)
        contract = _signed_contract(record.ticket)
        connected_total, _ = _connected_agreed_value(quotation, contract)
        if connected_total is not None and {'agreed_total', 'currency_code'} & set(request.data.keys()):
            return Response(
                {'agreed_total': ['The recorded contract value is controlled by the connected quotation or signed contract.']},
                status=status.HTTP_409_CONFLICT,
            )
        serializer = self.get_serializer(record, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        candidate_total = serializer.validated_data.get('agreed_total', record.agreed_total)
        candidate_notes = serializer.validated_data.get('notes', record.notes)
        if connected_total is None and candidate_total is not None and not str(candidate_notes or '').strip():
            return Response(
                {'notes': ['Explain why a manual recorded contract value is being used.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated_record = serializer.save()
        if connected_total is None:
            source_snapshot = dict(updated_record.source_snapshot or {})
            source_snapshot['agreed_value'] = {
                'source': 'manual' if updated_record.agreed_total is not None else 'not_recorded',
                'amount': str(updated_record.agreed_total) if updated_record.agreed_total is not None else None,
            }
            updated_record.source_snapshot = source_snapshot
            updated_record.save(update_fields=['source_snapshot', 'updated_at'])
            serializer = self.get_serializer(updated_record)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def prepare(self, request):
        try:
            ticket_id = int(request.data.get('ticket_id'))
        except (TypeError, ValueError):
            return Response({'ticket_id': ['A valid ticket is required.']}, status=status.HTTP_400_BAD_REQUEST)

        try:
            ticket = ServiceTicket.objects.select_for_update().select_related(
                'request__client', 'request__service_type'
            ).get(pk=ticket_id)
        except ServiceTicket.DoesNotExist:
            return Response({'ticket_id': ['Service ticket not found.']}, status=status.HTTP_404_NOT_FOUND)
        if ticket.status not in FINAL_TICKET_STATUSES:
            return Response(
                {'ticket_id': ['A sales record can only be prepared for completed or accepted work.']},
                status=status.HTTP_409_CONFLICT,
            )

        existing = SalesRecord.objects.select_for_update().filter(
            ticket=ticket, status__in=['draft', 'confirmed']
        ).first()
        if existing:
            return Response(self.get_serializer(existing).data, status=status.HTTP_200_OK)

        replaced = SalesRecord.objects.filter(ticket=ticket, status='voided').order_by('-voided_at', '-id').first()
        record = SalesRecord.objects.create(
            ticket=ticket,
            client=ticket.request.client,
            created_by=request.user,
            replaces=replaced,
        )
        _refresh_record_sources(record, ticket)
        record.save(update_fields=['client', 'quotation', 'agreed_total', 'source_snapshot', 'updated_at'])
        return Response(self.get_serializer(record).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def confirm(self, request, pk=None):
        record = get_object_or_404(SalesRecord.objects.select_for_update().select_related(
            'ticket__request__client', 'ticket__request__service_type'
        ), pk=pk)
        if record.status != 'draft':
            return Response({'detail': 'Only a draft sales record can be confirmed.'}, status=status.HTTP_409_CONFLICT)
        if record.ticket.status not in FINAL_TICKET_STATUSES:
            return Response({'detail': 'The connected ticket is no longer eligible.'}, status=status.HTTP_409_CONFLICT)

        quotation = _accepted_quotation(record.ticket)
        contract = _signed_contract(record.ticket)
        connected_total, _ = _connected_agreed_value(quotation, contract)
        if connected_total is None:
            if record.agreed_total is None:
                return Response(
                    {'agreed_total': ['Enter a recorded contract value because no accepted quotation or signed contract amount is available.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if not str(record.notes or '').strip():
                return Response(
                    {'notes': ['Explain why a manual recorded contract value is being used.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        _refresh_record_sources(record, record.ticket)
        record.status = 'confirmed'
        record.sale_date = record.ticket.completed_date.date() if record.ticket.completed_date else timezone.localdate()
        record.confirmed_by = request.user
        record.confirmed_at = timezone.now()
        record.save()
        Notification.objects.create(
            user=record.client,
            ticket=record.ticket,
            request=record.ticket.request,
            title='Purchase record available',
            message=f'{record.record_number} is now available in your purchase records.',
            type='success',
            send_email=False,
        )
        return Response(self.get_serializer(record).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def void(self, request, pk=None):
        record = get_object_or_404(SalesRecord.objects.select_for_update(), pk=pk)
        if record.status != 'confirmed':
            return Response({'detail': 'Only a confirmed sales record can be voided.'}, status=status.HTTP_409_CONFLICT)
        reason = str(request.data.get('reason') or '').strip()
        if not reason:
            return Response({'reason': ['A void reason is required.']}, status=status.HTTP_400_BAD_REQUEST)
        record.status = 'voided'
        record.void_reason = reason
        record.voided_by = request.user
        record.voided_at = timezone.now()
        record.save(update_fields=['status', 'void_reason', 'voided_by', 'voided_at', 'updated_at'])
        return Response(self.get_serializer(record).data)
