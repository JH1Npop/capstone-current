from django.db.models import Q
from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import TicketProgress
from .serializers import TicketProgressSerializer, TicketProgressReportSerializer
from users.rbac import is_admin_workspace_role

class TicketProgressViewSet(viewsets.ModelViewSet):
    queryset = TicketProgress.objects.all()
    serializer_class = TicketProgressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        queryset = TicketProgress.objects.select_related(
            'ticket',
            'ticket__request',
            'ticket__request__client',
            'ticket__technician',
            'updated_by',
        )

        if is_admin_workspace_role(getattr(user, 'role', None)):
            return queryset.order_by('-updated_at')

        if getattr(user, 'role', None) == 'technician':
            return queryset.filter(
                Q(ticket__technician=user) |
                Q(ticket__crew_assignments__technician=user)
            ).distinct().order_by('-updated_at')

        if getattr(user, 'role', None) == 'client':
            return queryset.filter(ticket__request__client=user).order_by('-updated_at')

        return queryset.none()

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action == 'report':
            from users.permissions import IsAdmin
            return [IsAdmin()]  # Only superadmin and admin can access reports
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        user = self.request.user
        ticket = serializer.validated_data.get('ticket')

        if getattr(user, 'role', None) == 'client':
            raise PermissionDenied('Clients cannot create ticket progress updates.')

        if not self.get_queryset().filter(ticket=ticket).exists():
            raise PermissionDenied('You cannot update progress for this ticket.')

        serializer.save(updated_by=user)

    @action(detail=False, methods=['get'])
    def report(self, request):
        """Operations Ticket Report endpoint with proper field formatting"""
        # Use the report serializer for proper field names
        queryset = self.get_queryset().select_related(
            'ticket',
            'ticket__request__client',
            'ticket__request__service_type',
            'ticket__technician',
            'updated_by'
        ).order_by('-updated_at')

        serializer = TicketProgressReportSerializer(queryset, many=True)
        return Response(serializer.data)
