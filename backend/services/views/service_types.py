# Auto-split from services/views.py
from services.views.helpers import *  # noqa: F401,F403
from users.permissions import CanManageServiceCatalog, CanViewServiceCatalog
from users.rbac import SERVICE_CATALOG_VIEW_CAPABILITIES, user_has_any_capability

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
        return queryset

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
