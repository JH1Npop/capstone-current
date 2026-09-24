# Auto-split from users/views.py
from django.db import transaction
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from users.views.helpers import *  # noqa: F401,F403


VALID_SKILL_LEVELS = {choice[0] for choice in TechnicianSkill.SKILL_LEVELS}


def _extract_skills_payload(request_data):
    if hasattr(request_data, 'copy'):
        data = request_data.copy()
    else:
        data = dict(request_data)
    skills_payload = data.pop('skills', None)
    return data, skills_payload


def _normalize_skill_payload(skills_payload):
    if skills_payload is None:
        return None

    if not isinstance(skills_payload, list):
        raise serializers.ValidationError({
            'skills': 'Skills must be provided as a list of service type and skill level entries.',
        })

    normalized = []
    service_type_ids = []
    seen_service_types = set()

    for index, raw_skill in enumerate(skills_payload):
        if not isinstance(raw_skill, dict):
            raise serializers.ValidationError({
                'skills': f'Skill entry #{index + 1} must be an object.',
            })

        service_type_value = raw_skill.get('service_type')
        skill_level = str(raw_skill.get('skill_level') or '').strip().lower()

        try:
            service_type_id = int(service_type_value)
        except (TypeError, ValueError):
            raise serializers.ValidationError({
                'skills': f'Skill entry #{index + 1} must include a valid service_type id.',
            })

        if service_type_id in seen_service_types:
            raise serializers.ValidationError({
                'skills': 'Each service type can only appear once in the technician skill list.',
            })

        if skill_level not in VALID_SKILL_LEVELS:
            raise serializers.ValidationError({
                'skills': (
                    f'Skill entry #{index + 1} must use one of: '
                    f'{", ".join(sorted(VALID_SKILL_LEVELS))}.'
                ),
            })

        seen_service_types.add(service_type_id)
        service_type_ids.append(service_type_id)
        normalized.append({
            'service_type_id': service_type_id,
            'skill_level': skill_level,
        })

    service_types_by_id = ServiceType.objects.in_bulk(service_type_ids)
    missing_ids = [skill_id for skill_id in service_type_ids if skill_id not in service_types_by_id]
    if missing_ids:
        raise serializers.ValidationError({
            'skills': f'Unknown service type id(s): {", ".join(str(skill_id) for skill_id in missing_ids)}.',
        })

    for skill in normalized:
        skill['service_type'] = service_types_by_id[skill['service_type_id']]

    return normalized


def _sync_technician_skills(technician, normalized_skills):
    if normalized_skills is None:
        return

    existing_skills = {
        skill.service_type_id: skill
        for skill in TechnicianSkill.objects.filter(technician=technician)
    }
    incoming_service_type_ids = set()

    for skill_data in normalized_skills:
        service_type = skill_data['service_type']
        skill_level = skill_data['skill_level']
        incoming_service_type_ids.add(service_type.id)

        existing_skill = existing_skills.get(service_type.id)
        if existing_skill:
            if existing_skill.skill_level != skill_level:
                existing_skill.skill_level = skill_level
                existing_skill.save(update_fields=['skill_level'])
            continue

        TechnicianSkill.objects.create(
            technician=technician,
            service_type=service_type,
            skill_level=skill_level,
        )

    TechnicianSkill.objects.filter(technician=technician).exclude(
        service_type_id__in=incoming_service_type_ids
    ).delete()


def _serialize_technician_payload(technician):
    serializer = UserSerializer(technician)
    skill_details = [
        {
            'id': skill.id,
            'service_type': skill.service_type_id,
            'service_type_name': skill.service_type.name,
            'skill_level': skill.skill_level,
        }
        for skill in TechnicianSkill.objects.filter(technician=technician).select_related('service_type').order_by('service_type__name', 'id')
    ]
    skill_names = [skill['service_type_name'] for skill in skill_details]
    return {
        **serializer.data,
        'skills': skill_names,
        'skill': skill_names[0] if skill_names else '',
        'skill_details': skill_details,
    }


def _send_admin_created_verification(user, request):
    if not user.email:
        return
    send_email_verification_email(user, request=request)
    user.email_verification_sent_at = timezone.now()
    user.save(update_fields=['email_verification_sent_at'])

class AdminTechniciansViewSet(viewsets.ViewSet):
    """ViewSet for admin technician management"""
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated(), CanViewSupervisorTechnicianDirectory()]
        return [permissions.IsAuthenticated(), IsSuperadmin()]

    def list(self, request):
        """Get all technicians"""
        technicians = User.objects.filter(role='technician').prefetch_related('capability_grants')
        return Response([
            _serialize_technician_payload(technician)
            for technician in technicians
        ])

    def create(self, request):
        """Create a new technician"""
        payload, skills_payload = _extract_skills_payload(request.data)
        serializer = UserRegistrationSerializer(data=payload, context={'request': request})
        if serializer.is_valid():
            try:
                with transaction.atomic():
                    normalized_skills = _normalize_skill_payload(skills_payload)
                    user = serializer.save()
                    user.role = 'technician'
                    user.save(update_fields=['role'])
                    _sync_technician_skills(user, normalized_skills)
                    _send_admin_created_verification(user, request)
            except serializers.ValidationError as exc:
                return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
            except Exception as exc:
                logger.error('Admin-created technician verification email failed: %s', exc, exc_info=True)
                return Response(
                    {'error': 'The verification email could not be sent. Please check the email address or try again.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(_serialize_technician_payload(user), status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        """Get a specific technician"""
        try:
            technician = User.objects.prefetch_related('capability_grants').get(id=pk, role='technician')
            return Response(_serialize_technician_payload(technician))
        except User.DoesNotExist:
            return Response({'error': 'Technician not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        """Update a technician"""
        try:
            technician = User.objects.get(id=pk, role='technician')
            payload, skills_payload = _extract_skills_payload(request.data)
            serializer = UserUpdateSerializer(technician, data=payload, partial=True, context={'request': request})
            if serializer.is_valid():
                with transaction.atomic():
                    normalized_skills = _normalize_skill_payload(skills_payload)
                    user = serializer.save()
                    _sync_technician_skills(user, normalized_skills)
                return Response(_serialize_technician_payload(user))
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({'error': 'Technician not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        """Delete a technician"""
        try:
            technician = User.objects.get(id=pk, role='technician')
            technician.status = 'inactive'
            technician.is_active = False
            technician.save(update_fields=['status', 'is_active'])
            return Response({'message': 'Technician deactivated'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Technician not found'}, status=status.HTTP_404_NOT_FOUND)


class AdminClientsViewSet(viewsets.ViewSet):
    """ViewSet for admin client management"""
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated(), CanViewUserDirectory()]
        return [permissions.IsAuthenticated(), IsSuperadmin()]

    def list(self, request):
        """Get all clients"""
        from users.views.helpers import delete_expired_unverified_clients
        delete_expired_unverified_clients()
        clients = User.objects.filter(role='client').prefetch_related('capability_grants')
        serializer = UserSerializer(clients, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new client"""
        serializer = UserRegistrationSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            try:
                with transaction.atomic():
                    user = serializer.save()
                    user.role = 'client'
                    user.save(update_fields=['role'])
                    _send_admin_created_verification(user, request)
            except Exception as exc:
                import logging
                logger = logging.getLogger(__name__)
                logger.error('Admin-created client verification email failed: %s', exc, exc_info=True)
                return Response(
                    {'error': 'The verification email could not be sent. Please check the email address or try again.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        """Get a specific client"""
        try:
            client = User.objects.prefetch_related('capability_grants').get(id=pk, role='client')
            serializer = UserSerializer(client)
            return Response(serializer.data)
        except User.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        """Update a client"""
        try:
            client = User.objects.get(id=pk, role='client')
            serializer = UserUpdateSerializer(client, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                serializer.save()
                return Response(UserSerializer(client).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        """Delete a client"""
        try:
            client = User.objects.get(id=pk, role='client')
            client.status = 'inactive'
            client.is_active = False
            client.save(update_fields=['status', 'is_active'])
            return Response({'message': 'Client deactivated'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

class AdminUsersViewSet(viewsets.ViewSet):
    """ViewSet for superadmin account management."""
    def get_permissions(self):
        if self.action == 'create':
            return [permissions.IsAuthenticated(), IsSuperadmin()]
        if self.action in ['update', 'destroy']:
            return [permissions.IsAuthenticated(), CanManageUsers()]
        return [permissions.IsAuthenticated(), CanViewUserDirectory()]

    def list(self, request):
        """Get all users"""
        delete_expired_unverified_clients()
        users = User.objects.exclude(role='client', email_verified=False).prefetch_related('capability_grants')
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data)

    def create(self, request):
        """Create a new user"""
        serializer = UserRegistrationSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            try:
                with transaction.atomic():
                    user = serializer.save()
                    _send_admin_created_verification(user, request)
            except Exception as exc:
                logger.error('Admin-created user verification email failed: %s', exc, exc_info=True)
                return Response(
                    {'error': 'The verification email could not be sent. Please check the email address or try again.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def retrieve(self, request, pk=None):
        """Get a specific user"""
        try:
            user = User.objects.prefetch_related('capability_grants').get(id=pk)
            serializer = UserSerializer(user)
            return Response(serializer.data)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    def update(self, request, pk=None):
        """Update a user"""
        try:
            user = User.objects.get(id=pk)
            try:
                ensure_actor_can_manage_account(request.user, user)
            except PermissionError as exc:
                raise PermissionDenied(str(exc))
            serializer = UserUpdateSerializer(user, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                serializer.save()
                return Response(UserSerializer(user).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    def destroy(self, request, pk=None):
        """Delete a user"""
        try:
            user = User.objects.get(id=pk)
            try:
                ensure_actor_can_manage_account(request.user, user)
            except PermissionError as exc:
                raise PermissionDenied(str(exc))
            user.status = 'inactive'
            user.is_active = False
            user.save(update_fields=['status', 'is_active'])
            return Response({'message': 'User deactivated'}, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
