from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from services.models import SolarEstimate
from services.serializers import ServiceRequestSerializer, SolarEstimateSerializer
from services.views.service_requests import notify_service_request_submitted
from users.rbac import SUPERVISOR_TICKETS_VIEW, user_has_capability


class SolarEstimateViewSet(viewsets.ModelViewSet):
    serializer_class = SolarEstimateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = SolarEstimate.objects.select_related('client', 'service_request')
        user = self.request.user
        if user.role == 'client':
            return queryset.filter(client=user)
        if user_has_capability(user, SUPERVISOR_TICKETS_VIEW):
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
    def submit(self, request, pk=None):
        estimate = self.get_object()
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
                f"Solar site assessment from estimate #{estimate.id}: "
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
        if not user_has_capability(request.user, SUPERVISOR_TICKETS_VIEW) and request.user.role not in ['admin', 'superadmin', 'technician']:
            raise PermissionDenied('Only technicians and admins can promote estimate data to project profiles.')

        estimate = self.get_object()
        from services.models.documents import SolarProjectProfile
        from services.serializers import SolarProjectProfileSerializer

        location = getattr(estimate.service_request, 'location', None) if estimate.service_request else None
        if not location:
            return Response({'detail': 'The estimate must be converted and have a service location before promoting to a project profile.'}, status=status.HTTP_400_BAD_REQUEST)

        snapshot = estimate.result_snapshot or {}
        promo = estimate.selected_promotion or {}

        number_of_panels = int(snapshot.get('panelCount') or getattr(estimate, 'panelCount', 0) or 0)
        panel_brand = promo.get('panelBrand') or 'Standard High-Efficiency PV'
        inverter_brand = promo.get('inverterBrand') or 'Grid-Tie Inverter'
        number_of_inverters = int(snapshot.get('inverterCount') or 1)
        battery_brand = promo.get('batteryBrand') or ''
        mounting_structure = 'Rooftop / Standard Flush Mount'

        cap = snapshot.get('installedCapacity')
        if cap is not None:
            system_capacity = f"{float(cap):.2f} kWp"
        elif getattr(estimate, 'panel_wattage', None) and number_of_panels:
            system_capacity = f"{(number_of_panels * estimate.panel_wattage) / 1000:.2f} kWp"
        else:
            system_capacity = "3.50 kWp"

        ticket = getattr(estimate.service_request, 'ticket', None) if estimate.service_request else None

        profile, created = SolarProjectProfile.objects.update_or_create(
            location=location,
            defaults={
                'original_ticket': ticket,
                'system_capacity': system_capacity,
                'panel_brand': panel_brand,
                'number_of_panels': number_of_panels,
                'inverter_brand': inverter_brand,
                'number_of_inverters': number_of_inverters,
                'battery_brand': battery_brand,
                'mounting_structure': mounting_structure,
            }
        )
        return Response(SolarProjectProfileSerializer(profile).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
