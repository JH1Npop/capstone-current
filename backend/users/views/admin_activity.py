import csv
import json
from itertools import chain

from django.db.models import Q
from django.db.models import Count
from django.http import StreamingHttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from users.models import ActivityLog
from users.permissions import CanViewAuditLogs
from users.serializers import ActivityLogSerializer


class AdminActivityLogPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated, CanViewAuditLogs]
    pagination_class = AdminActivityLogPagination

    class _CsvBuffer:
        def write(self, value):
            return value

    @staticmethod
    def _safe_csv_value(value):
        if value is None:
            return ''
        if isinstance(value, (dict, list)):
            text = json.dumps(value, ensure_ascii=False, sort_keys=True)
        else:
            text = str(value)
        if text.startswith(('=', '+', '-', '@', '\t', '\r')):
            return f"'{text}"
        return text

    @action(detail=False, methods=['get'])
    def summary(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        today = timezone.localdate()
        totals = queryset.aggregate(
            total=Count('id'),
            today=Count('id', filter=Q(created_at__date=today)),
            attention=Count('id', filter=Q(action='error')),
            user_actions=Count('id', filter=Q(actor__isnull=False)),
        )
        return Response(totals)

    @action(detail=False, methods=['get'], url_path='export')
    def export_csv(self, request):
        queryset = self.filter_queryset(self.get_queryset())
        writer = csv.writer(self._CsvBuffer())
        header = [
            'Event ID', 'Recorded at', 'Category', 'Action', 'Actor ID',
            'Actor name', 'Actor role', 'Target model', 'Target ID',
            'Target label', 'Message', 'IP address', 'User agent', 'Metadata',
        ]

        def rows():
            for log in queryset.iterator(chunk_size=500):
                values = [
                    log.pk,
                    log.created_at.isoformat() if log.created_at else '',
                    log.category,
                    log.action,
                    log.actor_id,
                    log.actor_display_name or (log.actor.get_full_name().strip() if log.actor else '') or (log.actor.username if log.actor else 'System'),
                    log.actor_role,
                    log.target_model,
                    log.target_id,
                    log.target_label,
                    log.message,
                    log.ip_address,
                    log.user_agent,
                    log.metadata,
                ]
                yield writer.writerow([self._safe_csv_value(value) for value in values])

        response = StreamingHttpResponse(
            chain([writer.writerow(header)], rows()),
            content_type='text/csv; charset=utf-8',
        )
        response['Content-Disposition'] = f'attachment; filename="activity-logs-{timezone.localdate().isoformat()}.csv"'
        response['X-Content-Type-Options'] = 'nosniff'
        return response

    def get_queryset(self):
        queryset = ActivityLog.objects.select_related('actor').order_by('-created_at', '-id')
        queryset = queryset.exclude(
            Q(target_model__in=['technicianprofile', 'technician_profile']) &
            Q(metadata__field_name__in=['current_latitude', 'current_longitude', 'last_location_update'])
        )
        query_params = self.request.query_params

        category = query_params.get('category')
        if category:
            queryset = queryset.filter(category=category)

        action = query_params.get('action') or query_params.get('activity_type')
        if action:
            queryset = queryset.filter(action=action)

        model = query_params.get('model')
        if model:
            queryset = queryset.filter(target_model=model.lower())

        app_label = query_params.get('app_label')
        if app_label:
            queryset = queryset.filter(target_app_label=app_label.lower())

        changed_by = query_params.get('changed_by') or query_params.get('actor')
        if changed_by:
            queryset = queryset.filter(actor_id=changed_by)

        object_id = query_params.get('object_id')
        if object_id:
            queryset = queryset.filter(target_id=object_id)

        date_from = parse_date(query_params.get('date_from') or query_params.get('from') or '')
        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        date_to = parse_date(query_params.get('date_to') or query_params.get('to') or '')
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        search = query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(message__icontains=search) |
                Q(category__icontains=search) |
                Q(action__icontains=search) |
                Q(target_model__icontains=search) |
                Q(target_app_label__icontains=search) |
                Q(target_label__icontains=search) |
                Q(metadata__icontains=search) |
                Q(actor__username__icontains=search) |
                Q(actor__email__icontains=search) |
                Q(actor__first_name__icontains=search) |
                Q(actor__last_name__icontains=search) |
                Q(actor_role__icontains=search)
            )

        return queryset
