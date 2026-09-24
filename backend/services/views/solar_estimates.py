from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from services.models import SolarEstimate
from services.serializers import ServiceRequestSerializer, SolarEstimateSerializer
from services.views.service_requests import notify_service_request_submitted
from services.views.helpers import CanManageDocuments
from users.rbac import DOCUMENTS_MANAGE, SUPERVISOR_TICKETS_VIEW, user_has_capability


class SolarEstimateViewSet(viewsets.ModelViewSet):
    serializer_class = SolarEstimateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action == 'promote_to_profile':
            return [CanManageDocuments()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = SolarEstimate.objects.select_related('client', 'service_request')
        user = self.request.user
        if user.role == 'client':
            return queryset.filter(client=user)
        if user_has_capability(user, SUPERVISOR_TICKETS_VIEW) or user_has_capability(user, DOCUMENTS_MANAGE):
            return queryset
        return queryset.none()

    def perform_create(self, serializer):
        if self.request.user.role != 'client':
            raise PermissionDenied('Only clients can create solar estimates.')
        serializer.save(client=self.request.user)

    def perform_update(self, serializer):
        estimate = self.get_object()
        if estimate.client_id != self.request.user.id or estimate.status != 'draft':
            raise PermissionDenied('Only the owning client can update a draft estimate.')
        serializer.save()

    def perform_destroy(self, instance):
        if instance.client_id != self.request.user.id or instance.status != 'draft':
            raise PermissionDenied('Only the owning client can delete a draft estimate.')
        instance.delete()

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def submit(self, request, pk=None):
        visible_estimate = self.get_object()
        estimate = SolarEstimate.objects.select_for_update().get(pk=visible_estimate.pk)
        if estimate.client_id != request.user.id:
            raise PermissionDenied('You can only submit your own estimate.')
        if estimate.status == 'draft':
            estimate.status = 'submitted'
            estimate.submitted_at = timezone.now()
            estimate.save(update_fields=['status', 'submitted_at', 'updated_at'])
        return Response(self.get_serializer(estimate).data)

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        if request.user.role != 'client':
            raise PermissionDenied('Only clients can convert estimates to service requests.')

        visible_estimate = self.get_object()
        if visible_estimate.client_id != request.user.id:
            raise PermissionDenied('You can only convert your own estimate.')

        with transaction.atomic():
            estimate = SolarEstimate.objects.select_for_update().select_related('service_request').get(
                pk=pk,
                client=request.user,
            )
            if estimate.service_request_id:
                return Response({
                    'estimate': self.get_serializer(estimate).data,
                    'service_request': ServiceRequestSerializer(estimate.service_request).data,
                    'created': False,
                })

            allowed_fields = {
                'service_type', 'service_types', 'preferred_date', 'preferred_time_slot',
                'priority', 'scheduling_notes', 'location_address', 'location_city', 'location_province',
                'latitude', 'longitude', 'lat', 'lng', 'locationDesc',
            }
            payload = {key: value for key, value in request.data.items() if key in allowed_fields}
            result = estimate.result_snapshot or {}
            payload['description'] = request.data.get('description') or (
                f"Solar site assessment from EST-{estimate.id:04d}: "
                f"{result.get('monthlyConsumption', 0)} kWh/month, "
                f"{result.get('panelCount', 0)} panels, "
                f"{result.get('installedCapacity', 0)} kWp preliminary capacity."
            )

            request_serializer = ServiceRequestSerializer(data=payload, context={'request': request})
            request_serializer.is_valid(raise_exception=True)
            service_request = request_serializer.save(status='Pending', auto_ticket_created=False)

            estimate.service_request = service_request
            estimate.status = 'converted'
            estimate.submitted_at = estimate.submitted_at or timezone.now()
            estimate.converted_at = timezone.now()
            estimate.save(update_fields=[
                'service_request', 'status', 'submitted_at', 'converted_at', 'updated_at'
            ])

        notify_service_request_submitted(service_request)
        return Response({
            'estimate': self.get_serializer(estimate).data,
            'service_request': ServiceRequestSerializer(service_request).data,
            'created': True,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='promote-to-profile')
    def promote_to_profile(self, request, pk=None):
        estimate = self.get_object()
        from services.models.documents import SolarProjectProfile
        from services.serializers import SolarProjectProfileSerializer

        location = getattr(estimate.service_request, 'location', None) if estimate.service_request else None
        if not location:
            return Response({'detail': 'The estimate must be converted and have a service location before promoting to a project profile.'}, status=status.HTTP_400_BAD_REQUEST)

        ticket = (
            estimate.service_request.serviceticket_set.order_by('-created_at', '-id').first()
            if estimate.service_request else None
        )

        profile, created = SolarProjectProfile.objects.update_or_create(
            location=location,
            defaults=build_solar_profile_defaults(estimate=estimate, ticket=ticket),
        )
        return Response(SolarProjectProfileSerializer(profile).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


def _safe_nonnegative_int(value):
    if value in (None, ''):
        return None
    try:
        result = int(value)
    except (TypeError, ValueError):
        return None
    return result if result >= 0 else None


def build_solar_profile_defaults(*, estimate=None, ticket=None):
    """Map verified estimate/project inputs without inventing operational specifications."""
    snapshot = (estimate.result_snapshot or {}) if estimate else {}
    promotion = (estimate.selected_promotion or {}) if estimate else {}
    number_of_panels = _safe_nonnegative_int(snapshot.get('panelCount'))
    number_of_inverters = _safe_nonnegative_int(snapshot.get('inverterCount'))

    system_capacity = None
    capacity = snapshot.get('installedCapacity')
    try:
        if capacity not in (None, '') and float(capacity) >= 0:
            system_capacity = f'{float(capacity):.2f} kWp'
        elif estimate and estimate.panel_wattage and number_of_panels:
            system_capacity = f'{(number_of_panels * estimate.panel_wattage) / 1000:.2f} kWp'
    except (TypeError, ValueError):
        system_capacity = None

    mounting_structure = None
    if ticket:
        technical_data_sheet = getattr(ticket, 'technical_data_sheet', None)
        if technical_data_sheet and technical_data_sheet.rooftop_type:
            mounting_structure = technical_data_sheet.rooftop_type

    return {
        'original_ticket': ticket,
        'system_capacity': system_capacity,
        'panel_brand': str(promotion.get('panelBrand') or '').strip() or None,
        'number_of_panels': number_of_panels,
        'inverter_brand': str(promotion.get('inverterBrand') or '').strip() or None,
        'number_of_inverters': number_of_inverters,
        'battery_brand': str(promotion.get('batteryBrand') or '').strip() or None,
        'mounting_structure': mounting_structure,
    }
