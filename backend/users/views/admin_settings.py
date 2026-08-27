# Auto-split from users/views.py
from users.views.helpers import *  # noqa: F401,F403
from django.utils import timezone
from pathlib import Path
from uuid import uuid4
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from users.models import LandingPageAsset
from users.rbac import PUBLIC_SITE_MANAGE_CAPABILITIES, PUBLIC_SITE_VIEW_CAPABILITIES, user_has_any_capability

class AdminSettingsViewSet(viewsets.ViewSet):
    """ViewSet for admin settings"""
    permission_classes = [permissions.IsAuthenticated, IsAdmin]
    SUPERADMIN_ONLY_FIELDS = {
        'companyName', 'companyAddress', 'documentFooter', 'currencyCode',
        'quotationValidityDays', 'defaultWarrantyDays', 'externalPaymentNotice',
    }
    LANDING_PAGE_FIELDS = {
        'landingPageContent', 'solarCalculatorSettings', 'landingPagePromotions',
    }
    LANDING_IMAGE_TYPES = {
        'image/jpeg': ('jpg', b'\xff\xd8\xff'),
        'image/png': ('png', b'\x89PNG\r\n\x1a\n'),
        'image/webp': ('webp', None),
    }
    MAX_LANDING_IMAGE_SIZE = 5 * 1024 * 1024

    def _response_data(self, request, settings_obj):
        data = dict(AdminSettingsSerializer(settings_obj).data)
        data['canManageOrganizationSettings'] = request.user.role == 'superadmin'
        can_view_landing_page = user_has_any_capability(request.user, PUBLIC_SITE_VIEW_CAPABILITIES)
        can_manage_landing_page = user_has_any_capability(request.user, PUBLIC_SITE_MANAGE_CAPABILITIES)
        data['canViewLandingPage'] = can_view_landing_page
        data['canManageLandingPage'] = can_manage_landing_page
        if not can_view_landing_page:
            for field in self.LANDING_PAGE_FIELDS:
                data.pop(field, None)
        return data

    def _get_settings(self):
        settings_obj = AdminSettings.objects.order_by('id').first()
        if settings_obj:
            return settings_obj

        return AdminSettings.objects.create(
            system_name='AFN Service Management',
            support_email='support@afnservice.com',
            enable_notifications=True,
            auto_dispatch_enabled=False,
            allow_overtime_dispatch=False,
            overtime_daily_capacity_minutes=600,
            location_validation_enabled=True,
            arrival_radius_meters=30,
            location_validation_disabled_reason='',
            default_time_zone=django_settings.TIME_ZONE,
            max_technician_assignments=5,
        )

    def list(self, request):
        """Get admin settings"""
        return Response(self._response_data(request, self._get_settings()))

    def update(self, request, pk=None):
        """Update admin settings via the router's standard PUT endpoint"""
        settings_obj = self._get_settings()
        protected_updates = self.SUPERADMIN_ONLY_FIELDS.intersection(request.data.keys())
        if protected_updates and request.user.role != 'superadmin':
            return Response(
                {'detail': 'Only a superadmin can update organization and document defaults.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        landing_page_updates = self.LANDING_PAGE_FIELDS.intersection(request.data.keys())
        if landing_page_updates and not user_has_any_capability(request.user, PUBLIC_SITE_MANAGE_CAPABILITIES):
            return Response(
                {'detail': 'You need the Manage public site capability to publish landing-page changes.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AdminSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated_settings = serializer.save(updated_by=request.user)

        workflow_fields = {
            'location_validation_enabled',
            'arrival_radius_meters',
            'location_validation_disabled_reason',
        }
        if workflow_fields.intersection(serializer.validated_data.keys()):
            updated_settings.location_validation_updated_by = request.user
            updated_settings.location_validation_updated_at = timezone.now()
            updated_settings.save(update_fields=['location_validation_updated_by', 'location_validation_updated_at'])
        response_data = self._response_data(request, updated_settings)
        return Response({**response_data, 'settings': response_data})

    @action(detail=False, methods=['put'])
    def update_settings(self, request):
        """Update admin settings"""
        return self.update(request)

    @action(detail=False, methods=['post'], url_path='landing-images', parser_classes=[MultiPartParser, FormParser])
    def upload_landing_image(self, request):
        if not user_has_any_capability(request.user, PUBLIC_SITE_MANAGE_CAPABILITIES):
            return Response(
                {'detail': 'You need the Manage public site capability to upload landing-page images.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get('image')
        if not uploaded_file:
            return Response({'image': 'Choose an image to upload.'}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded_file.size > self.MAX_LANDING_IMAGE_SIZE:
            return Response({'image': 'Image must be 5 MB or smaller.'}, status=status.HTTP_400_BAD_REQUEST)

        content_type = str(getattr(uploaded_file, 'content_type', '') or '').lower()
        type_config = self.LANDING_IMAGE_TYPES.get(content_type)
        if not type_config:
            return Response({'image': 'Upload a JPG, PNG, or WebP image.'}, status=status.HTTP_400_BAD_REQUEST)

        header = uploaded_file.read(16)
        uploaded_file.seek(0)
        extension, signature = type_config
        is_valid_signature = (
            header.startswith(signature)
            if signature
            else header.startswith(b'RIFF') and header[8:12] == b'WEBP'
        )
        if not is_valid_signature:
            return Response({'image': 'The uploaded file does not contain a valid image.'}, status=status.HTTP_400_BAD_REQUEST)

        asset = LandingPageAsset(
            original_name=Path(uploaded_file.name).name[:255],
            content_type=content_type,
            uploaded_by=request.user,
        )
        asset.file.save(f'{uuid4().hex}.{extension}', uploaded_file, save=False)
        asset.save()
        return Response({
            'id': asset.id,
            'url': asset.file.url,
            'name': asset.original_name,
            'contentType': asset.content_type,
            'size': uploaded_file.size,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['delete'], url_path=r'landing-images/(?P<asset_id>[^/.]+)')
    def delete_landing_image(self, request, asset_id=None):
        if not user_has_any_capability(request.user, PUBLIC_SITE_MANAGE_CAPABILITIES):
            return Response(
                {'detail': 'You need the Manage public site capability to delete landing-page images.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            asset = LandingPageAsset.objects.get(pk=asset_id)
        except (LandingPageAsset.DoesNotExist, ValueError):
            return Response({'detail': 'Landing-page image not found.'}, status=status.HTTP_404_NOT_FOUND)

        settings_obj = self._get_settings()
        is_referenced = any(
            str(promotion.get('imageAssetId') or '') == str(asset.id)
            for promotion in settings_obj.landing_page_promotions or []
            if isinstance(promotion, dict)
        )
        if is_referenced:
            return Response(
                {'detail': 'Remove this image from the promotion and publish before deleting the file.'},
                status=status.HTTP_409_CONFLICT,
            )

        asset.file.delete(save=False)
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
