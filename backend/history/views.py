from django.db.models import Q
from rest_framework import viewsets, permissions
from .models import ServiceHistory
from .serializers import ServiceHistorySerializer
from users.rbac import is_admin_workspace_role

class ServiceHistoryViewSet(viewsets.ModelViewSet):
    queryset = ServiceHistory.objects.all()
    serializer_class = ServiceHistorySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = ServiceHistory.objects.select_related(
            'ticket',
            'ticket__request',
            'ticket__request__client',
            'ticket__technician',
            'technician',
            'service_type',
        )

        if is_admin_workspace_role(getattr(user, 'role', None)):
            return queryset.order_by('-completion_date')

        if getattr(user, 'role', None) == 'technician':
            return queryset.filter(
                Q(ticket__technician=user) |
                Q(ticket__crew_assignments__technician=user) |
                Q(technician=user)
            ).distinct().order_by('-completion_date')

        if getattr(user, 'role', None) == 'client':
            return queryset.filter(ticket__request__client=user).order_by('-completion_date')

        return queryset.none()

    def get_permissions(self):
        if self.action not in ['list', 'retrieve']:
            from users.permissions import IsAdmin
            return [IsAdmin()]
        return [permissions.IsAuthenticated()]
