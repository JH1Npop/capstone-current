# Auto-split from services/views.py
from services.views.helpers import *  # noqa: F401,F403
from users.permissions import CanManageServiceCatalog, CanViewServiceCatalog
from users.rbac import SERVICE_CATALOG_VIEW_CAPABILITIES, user_has_any_capability
from django.db.models import Count, IntegerField, OuterRef, Prefetch, Subquery
from django.db.models.functions import Coalesce

def _count_subquery(queryset):
    return Coalesce(Subquery(queryset.order_by().values('c')[:1], output_field=IntegerField()), 0)


def with_catalog_counts(queryset):
    """Annotate usage counts and prefetch requirements so serializing a catalog takes a fixed number of queries."""
    from inventory.models import ServiceTypeInventoryRequirement

    requests = ServiceRequest.objects.filter(service_type=OuterRef('pk')).order_by().values('service_type').annotate(c=Count('id'))
    tickets = ServiceTicket.objects.filter(request__service_type=OuterRef('pk')).order_by().values('request__service_type').annotate(c=Count('id'))
    requirements = ServiceTypeInventoryRequirement.objects.filter(service_type=OuterRef('pk')).order_by().values('service_type').annotate(c=Count('id'))
    return queryset.annotate(
        annotated_request_count=_count_subquery(requests),
        annotated_ticket_count=_count_subquery(tickets),
        annotated_requirement_count=_count_subquery(requirements),
    ).prefetch_related(Prefetch(
        'inventory_requirements',
        queryset=ServiceTypeInventoryRequirement.objects.select_related('item').order_by('item__name', 'id'),
    ))


class ServiceTypeViewSet(viewsets.ModelViewSet):
    queryset = ServiceType.objects.all()
    serializer_class = ServiceTypeSerializer

    def get_queryset(self):
        queryset = ServiceType.objects.all()
        include_inactive = self.request.query_params.get('include_inactive') == 'true'
        user = getattr(self.request, 'user', None)
        can_view_full_catalog = bool(
            user and user.is_authenticated and
            user_has_any_capability(user, SERVICE_CATALOG_VIEW_CAPABILITIES)
        )
        if not include_inactive or not can_view_full_catalog:
            queryset = queryset.filter(is_active=True)
        return with_catalog_counts(queryset)

    def destroy(self, request, *args, **kwargs):
        service = self.get_object()
        usage = {
            'request_count': ServiceRequest.objects.filter(service_type=service).count(),
            'service_item_count': service.request_items.count(),
            'maintenance_count': service.maintenance_schedules.count(),
        }
        if any(usage.values()):
            return Response({
                'error': 'This service is already used by requests, tickets, or maintenance schedules. Deactivate it instead of deleting it.',
                **usage,
            }, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    def get_permissions(self):
        """Allow anyone to read service types, but only admins can create/update/delete."""
        if self.action in ['list', 'retrieve']:
            return []  # No permission required to view service types
        return [CanManageServiceCatalog()]


class SLARuleViewSet(viewsets.ModelViewSet):
    queryset = SLARule.objects.all()
    serializer_class = SLARuleSerializer
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [CanViewServiceCatalog()]
        return [CanManageServiceCatalog()]
    http_method_names = ['get', 'patch', 'head', 'options']
