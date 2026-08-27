from django.db.models import Q
from django.utils.dateparse import parse_date
from rest_framework import permissions, viewsets
from rest_framework.pagination import PageNumberPagination

from users.models import ActivityLog
from users.permissions import CanViewAuditLogs
from users.serializers import ActivityLogSerializer


class AdminActivityLogPagination(PageNumberPagination):
    page_size = 15
    page_size_query_param = 'page_size'
    max_page_size = 100


class AdminActivityLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ActivityLogSerializer
    permission_classes = [permissions.IsAuthenticated, CanViewAuditLogs]
    pagination_class = AdminActivityLogPagination

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
