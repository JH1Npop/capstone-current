from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError
from django.contrib.auth.password_validation import validate_password
from .models import ActivityLog, AdminSettings, ChangeLog, User, TechnicianProfile, ClientProfile, ManagementProfile
from .rbac import (
    get_default_admin_scope_for_role,
    get_unknown_capability_codes,
    get_user_capability_codes,
    is_admin_scoped_role,
    is_superadmin_role,
)

PH_MOBILE_PHONE_ERROR = 'Phone number must be 11 digits and start with 09.'


def validate_ph_mobile_phone(value):
    if not value:
        return value

    phone_digits = ''.join(filter(str.isdigit, str(value)))
    if phone_digits.startswith('09') and len(phone_digits) == 11:
        return value

    raise serializers.ValidationError(PH_MOBILE_PHONE_ERROR)


class UserSerializer(serializers.ModelSerializer):
    capabilities = serializers.SerializerMethodField()
    profile_image_url = serializers.SerializerMethodField()
    current_latitude = serializers.SerializerMethodField()
    current_longitude = serializers.SerializerMethodField()
    is_available = serializers.SerializerMethodField()
    skill_level = serializers.SerializerMethodField()
    max_daily_assignments = serializers.SerializerMethodField()

    # Include profile data based on role
    technician_profile = serializers.SerializerMethodField()
    client_profile = serializers.SerializerMethodField()
    management_profile = serializers.SerializerMethodField()

    def get_capabilities(self, obj):
        return sorted(get_user_capability_codes(obj))

    def get_profile_image_url(self, obj):
        if not obj.profile_image:
            return ''
        return obj.profile_image.url

    def get_technician_profile(self, obj):
        if obj.role == 'technician' and hasattr(obj, 'technician_profile'):
            return {
                'current_latitude': obj.technician_profile.current_latitude,
                'current_longitude': obj.technician_profile.current_longitude,
                'is_available': obj.technician_profile.is_available,
                'skill_level': obj.technician_profile.skill_level,
                'max_daily_assignments': obj.technician_profile.max_daily_assignments,
            }
        return None

    def get_current_latitude(self, obj):
        return obj.current_latitude if obj.role == 'technician' else None

    def get_current_longitude(self, obj):
        return obj.current_longitude if obj.role == 'technician' else None

    def get_is_available(self, obj):
        return obj.is_available if obj.role == 'technician' else None

    def get_skill_level(self, obj):
        return obj.skill_level if obj.role == 'technician' else None

    def get_max_daily_assignments(self, obj):
        return obj.max_daily_assignments if obj.role == 'technician' else None

    def get_client_profile(self, obj):
        if obj.role == 'client' and hasattr(obj, 'client_profile'):
            return {
                'client_type': obj.client_profile.client_type,
                'company_name': obj.client_profile.company_name,
                'credit_limit': str(obj.client_profile.credit_limit),
                'account_balance': str(obj.client_profile.account_balance),
            }
        return None

    def get_management_profile(self, obj):
        if obj.role in ['admin', 'superadmin'] and hasattr(obj, 'management_profile'):
            return {
                'admin_scope': obj.management_profile.admin_scope,
            }
        return None

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'middle_name', 'last_name',
                  'role', 'phone', 'landline', 'address', 'status', 'is_active',
                  'email_verified', 'pending_email', 'profile_image', 'profile_image_url',
                  'capabilities', 'created_at', 'updated_at',
                  'current_latitude', 'current_longitude', 'is_available',
                  'skill_level', 'max_daily_assignments',
                  'technician_profile', 'client_profile', 'management_profile']
        read_only_fields = ['id', 'created_at', 'updated_at', 'pending_email', 'profile_image_url']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True)
    password_confirm = serializers.CharField(write_only=True, required=True)
    current_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    current_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    is_available = serializers.BooleanField(required=False)
    skill_level = serializers.ChoiceField(
        choices=[choice[0] for choice in TechnicianProfile._meta.get_field('skill_level').choices],
        required=False,
    )
    max_daily_assignments = serializers.IntegerField(required=False, min_value=1)
    middle_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    landline = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    company_name = serializers.CharField(max_length=255, required=False, allow_blank=True, default='', write_only=True)
    VALID_ROLES = {'superadmin', 'admin', 'technician', 'client'}
    ELEVATED_ROLES = {'superadmin', 'admin', 'technician'}

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password_confirm',
                  'first_name', 'middle_name', 'last_name', 'role', 'phone', 'landline', 'address',
                  'current_latitude', 'current_longitude', 'is_available',
                  'skill_level', 'max_daily_assignments', 'company_name']

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        try:
            validate_password(attrs['password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc

        # Validate phone number
        phone = attrs.get('phone')
        if phone:
            try:
                validate_ph_mobile_phone(phone)
            except serializers.ValidationError as exc:
                raise serializers.ValidationError({'phone': exc.detail}) from exc

        requested_role = attrs.get('role') or 'client'
        if requested_role not in self.VALID_ROLES:
            raise serializers.ValidationError({
                'role': 'Unsupported role. Use one of: superadmin, admin, technician, client.'
            })

        if requested_role == 'superadmin' and User.objects.filter(role='superadmin').exists():
            raise serializers.ValidationError({'role': 'Only one superadmin account is allowed.'})

        request = self.context.get('request') if hasattr(self, 'context') else None
        is_request_superadmin = (
            request and
            getattr(request, 'user', None) and
            request.user.is_authenticated and
            is_superadmin_role(request.user.role)
        )

        if requested_role in self.ELEVATED_ROLES and not is_request_superadmin:
            raise serializers.ValidationError({
                'role': 'Only the superadmin can create admin or staff accounts.'
            })

        attrs['role'] = requested_role
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        company_name = validated_data.pop('company_name', '')
        role = validated_data.get('role') or 'client'
        validated_data['role'] = role
        profile_fields = {
            'current_latitude',
            'current_longitude',
            'is_available',
            'skill_level',
            'max_daily_assignments',
        }
        profile_data = {
            field: validated_data.pop(field)
            for field in list(validated_data.keys())
            if field in profile_fields
        }

        if validated_data.get('email'):
            validated_data['email_verified'] = False
        user = User.objects.create_user(**validated_data)

        # Create appropriate profile based on role
        if role in ['superadmin', 'admin']:
            profile, _ = ManagementProfile.objects.get_or_create(
                user=user,
                defaults={'admin_scope': get_default_admin_scope_for_role(role) or 'general'},
            )
            default_scope = get_default_admin_scope_for_role(role)
            if default_scope and profile.admin_scope != default_scope:
                profile.admin_scope = default_scope
                profile.save(update_fields=['admin_scope'])
        elif role == 'technician':
            profile, _ = TechnicianProfile.objects.get_or_create(user=user)
            updated_fields = []
            for field, value in profile_data.items():
                setattr(profile, field, value)
                updated_fields.append(field)
            if updated_fields:
                profile.save(update_fields=updated_fields)
        elif role == 'client':
            profile, _ = ClientProfile.objects.get_or_create(user=user)
            if company_name:
                profile.company_name = company_name
                profile.save(update_fields=['company_name'])
        return user


class UserLoginSerializer(serializers.Serializer):
    username = serializers.CharField(required=True)
    password = serializers.CharField(required=True)


class ChangeLogSerializer(serializers.ModelSerializer):
    model = serializers.CharField(source='content_type.model', read_only=True)
    app_label = serializers.CharField(source='content_type.app_label', read_only=True)
    object_label = serializers.SerializerMethodField()
    changed_by_name = serializers.SerializerMethodField()
    changed_by_role = serializers.CharField(source='changed_by.role', read_only=True)

    class Meta:
        model = ChangeLog
        fields = [
            'id',
            'app_label',
            'model',
            'object_id',
            'object_label',
            'action',
            'field_name',
            'old_value',
            'new_value',
            'changed_by',
            'changed_by_name',
            'changed_by_role',
            'changed_at',
            'summary',
        ]
        read_only_fields = fields

    def get_object_label(self, obj):
        content_object = obj.content_object
        if content_object is None:
            return f'{obj.content_type.model} #{obj.object_id}'
        return str(content_object)

    def get_changed_by_name(self, obj):
        user = obj.changed_by
        if not user:
            return 'System'
        full_name = f'{user.first_name} {user.last_name}'.strip()
        return full_name or user.username


class ActivityLogSerializer(serializers.ModelSerializer):
    action = serializers.SerializerMethodField()
    actor_name = serializers.SerializerMethodField()
    model = serializers.CharField(source='target_model', read_only=True)
    app_label = serializers.CharField(source='target_app_label', read_only=True)
    object_id = serializers.IntegerField(source='target_id', read_only=True)
    object_label = serializers.CharField(source='target_label', read_only=True)
    changed_by = serializers.IntegerField(source='actor_id', read_only=True)
    changed_by_name = serializers.SerializerMethodField()
    changed_by_role = serializers.CharField(source='actor_role', read_only=True)
    changed_at = serializers.DateTimeField(source='created_at', read_only=True)
    field_name = serializers.SerializerMethodField()
    old_value = serializers.SerializerMethodField()
    new_value = serializers.SerializerMethodField()
    summary = serializers.CharField(source='message', read_only=True)
    service_context = serializers.SerializerMethodField()

    class Meta:
        model = ActivityLog
        fields = [
            'id',
            'category',
            'action',
            'actor',
            'actor_name',
            'actor_role',
            'actor_display_name',
            'message',
            'target_app_label',
            'target_model',
            'target_id',
            'target_label',
            'metadata',
            'ip_address',
            'user_agent',
            'created_at',
            # Backward-compatible keys for existing frontend/tests.
            'app_label',
            'model',
            'object_id',
            'object_label',
            'changed_by',
            'changed_by_name',
            'changed_by_role',
            'changed_at',
            'field_name',
            'old_value',
            'new_value',
            'summary',
            'service_context',
        ]
        read_only_fields = fields

    def get_actor_name(self, obj):
        if obj.actor_display_name:
            return obj.actor_display_name
        return self._actor_name_from_message(obj.message) or 'System'

    def get_changed_by_name(self, obj):
        return self.get_actor_name(obj)

    def get_action(self, obj):
        metadata = obj.metadata or {}
        field_name = str(metadata.get('field_name') or '').lower()
        new_value = str(metadata.get('new_value') or metadata.get('new_display_value') or '').lower()
        if obj.action == 'update':
            if field_name == 'status':
                if new_value == 'cancelled':
                    return 'cancel'
                if new_value == 'completed':
                    return 'complete'
            if field_name in {'assigned_admin_id', 'technician_id'}:
                return 'assign'
            if field_name in {
                'scheduled_date',
                'scheduled_time',
                'scheduled_time_slot',
                'reschedule_requested',
                'reschedule_reason',
            }:
                return 'reschedule'
        return obj.action

    def get_field_name(self, obj):
        return (obj.metadata or {}).get('field_name', '')

    def get_old_value(self, obj):
        metadata = obj.metadata or {}
        return metadata.get('old_display_value', metadata.get('old_value'))

    def get_new_value(self, obj):
        metadata = obj.metadata or {}
        return metadata.get('new_display_value', metadata.get('new_value'))

    def get_service_context(self, obj):
        target_model = str(obj.target_model or '').lower()
        if target_model == 'serviceticket':
            return self._ticket_service_context(obj)
        if target_model == 'servicerequest':
            return self._request_service_context(obj)
        if target_model == 'aftersalescase':
            return self._after_sales_service_context(obj)
        if target_model == 'maintenanceschedule':
            return self._maintenance_service_context(obj)
        return {}

    def _base_service_context(
        self,
        obj,
        *,
        service_provider='',
        service_type='',
        outcome='',
        action_taken='',
        resolution='',
        feedback='',
    ):
        return {
            'date_time': obj.created_at.isoformat() if obj.created_at else '',
            'event_description': obj.message or obj.get_action_display(),
            'service_provider': service_provider or self.get_actor_name(obj),
            'service_type': service_type or '',
            'outcome': outcome or obj.get_action_display(),
            'action_taken': action_taken or self._default_action_taken(obj),
            'resolution': resolution or '',
            'feedback': feedback or '',
        }

    def _default_action_taken(self, obj):
        field_name = self.get_field_name(obj)
        if field_name:
            return f'{self._friendly_label(field_name)} changed'
        return obj.message or obj.get_action_display()

    def _friendly_label(self, value):
        return str(value or '').replace('_', ' ').title()

    def _actor_name_from_message(self, message):
        text = str(message or '').strip()
        if not text:
            return ''
        markers = [
            ' updated ',
            ' created ',
            ' deleted ',
            ' assigned ',
            ' changed ',
            ' logged in',
            ' logged out',
        ]
        lowered = text.lower()
        for marker in markers:
            index = lowered.find(marker)
            if index > 0:
                return text[:index].strip()
        return ''

    def _user_label(self, user):
        if not user:
            return ''
        return user.get_full_name().strip() or user.username

    def _ticket_service_context(self, obj):
        from services.models import ServiceTicket

        ticket = (
            ServiceTicket.objects
            .select_related('request__service_type', 'technician', 'assigned_admin')
            .filter(pk=obj.target_id)
            .first()
        )
        if not ticket:
            return self._base_service_context(obj)

        feedback_parts = []
        if ticket.client_rating:
            feedback_parts.append(f'Rating: {ticket.client_rating}/5')
        if ticket.client_feedback:
            feedback_parts.append(ticket.client_feedback)

        service_type = getattr(getattr(ticket, 'request', None), 'service_type', None)
        return self._base_service_context(
            obj,
            service_provider=(
                self._user_label(ticket.technician)
                or self._user_label(ticket.assigned_admin)
                or 'Admin team'
            ),
            service_type=getattr(service_type, 'name', ''),
            outcome=ticket.status,
            resolution=ticket.completion_notes or ticket.notes or '',
            feedback=' | '.join(feedback_parts),
        )

    def _request_service_context(self, obj):
        from services.models import ServiceRequest

        service_request = (
            ServiceRequest.objects
            .select_related('service_type')
            .filter(pk=obj.target_id)
            .first()
        )
        if not service_request:
            return self._base_service_context(obj)

        return self._base_service_context(
            obj,
            service_provider=self.get_actor_name(obj) or 'Admin team',
            service_type=getattr(service_request.service_type, 'name', ''),
            outcome=service_request.status,
            resolution=service_request.scheduling_notes or '',
        )

    def _after_sales_service_context(self, obj):
        from services.models import AfterSalesCase

        case = (
            AfterSalesCase.objects
            .select_related('assigned_to', 'service_ticket__request__service_type')
            .filter(pk=obj.target_id)
            .first()
        )
        if not case:
            return self._base_service_context(obj)

        service_type = getattr(getattr(case.service_ticket, 'request', None), 'service_type', None)
        feedback = (
            f'Satisfaction: {case.customer_satisfaction}/5'
            if case.customer_satisfaction
            else ''
        )
        return self._base_service_context(
            obj,
            service_provider=self._user_label(case.assigned_to) or self.get_actor_name(obj),
            service_type=getattr(service_type, 'name', ''),
            outcome=case.get_status_display(),
            action_taken=case.summary or self._default_action_taken(obj),
            resolution=case.resolution_notes or '',
            feedback=feedback,
        )

    def _maintenance_service_context(self, obj):
        from services.models import MaintenanceSchedule

        schedule = (
            MaintenanceSchedule.objects
            .select_related('service_type')
            .filter(pk=obj.target_id)
            .first()
        )
        if not schedule:
            return self._base_service_context(obj)

        return self._base_service_context(
            obj,
            service_provider=self.get_actor_name(obj) or 'Admin team',
            service_type=getattr(schedule.service_type, 'name', ''),
            outcome=schedule.get_status_display(),
            action_taken=schedule.prediction_notes or self._default_action_taken(obj),
            resolution=schedule.maintenance_notes or '',
        )


class UserUpdateSerializer(serializers.ModelSerializer):
    current_latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    current_longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    is_available = serializers.BooleanField(required=False)
    skill_level = serializers.ChoiceField(
        choices=[choice[0] for choice in TechnicianProfile._meta.get_field('skill_level').choices],
        required=False,
    )
    max_daily_assignments = serializers.IntegerField(required=False, min_value=1)

    def validate_phone(self, value):
        """Validate phone number format"""
        return validate_ph_mobile_phone(value)

    def validate_role(self, value):
        current_role = getattr(self.instance, 'role', None)
        if value == current_role:
            return value

        request = self.context.get('request') if hasattr(self, 'context') else None
        actor = getattr(request, 'user', None)

        if not actor or not actor.is_authenticated or not is_superadmin_role(getattr(actor, 'role', None)):
            raise serializers.ValidationError('Only the superadmin can change account roles.')

        if current_role == 'superadmin' and value != 'superadmin':
            raise serializers.ValidationError('The superadmin account cannot be demoted here.')

        if value == 'superadmin':
            existing_superadmin = User.objects.filter(role='superadmin')
            if getattr(self.instance, 'pk', None):
                existing_superadmin = existing_superadmin.exclude(pk=self.instance.pk)
            if existing_superadmin.exists():
                raise serializers.ValidationError('Only one superadmin account is allowed.')

        return value

    class Meta:
        model = User
        fields = [
            'username', 'email', 'first_name', 'last_name', 'phone', 'address',
            'role', 'status', 'current_latitude', 'current_longitude',
            'is_available', 'skill_level', 'max_daily_assignments'
        ]

    def update(self, instance, validated_data):
        profile_fields = {
            'current_latitude',
            'current_longitude',
            'is_available',
            'skill_level',
            'max_daily_assignments',
        }
        profile_data = {
            field: validated_data.pop(field)
            for field in list(validated_data.keys())
            if field in profile_fields
        }

        instance = super().update(instance, validated_data)

        if profile_data and instance.role == 'technician':
            profile, _ = TechnicianProfile.objects.get_or_create(user=instance)
            updated_fields = []
            for field, value in profile_data.items():
                setattr(profile, field, value)
                updated_fields.append(field)
            if updated_fields:
                profile.save(update_fields=updated_fields)

        return instance


class SelfUserUpdateSerializer(serializers.ModelSerializer):
    """Restricted serializer for self-service profile edits."""
    profile_image = serializers.FileField(required=False, allow_null=True)

    def validate_profile_image(self, value):
        if not value:
            return value

        content_type = getattr(value, 'content_type', '')
        if content_type not in {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}:
            raise serializers.ValidationError('Upload a JPG, PNG, WebP, or GIF image.')

        max_size = 2 * 1024 * 1024
        if getattr(value, 'size', 0) > max_size:
            raise serializers.ValidationError('Profile image must be 2 MB or smaller.')

        return value

    def validate_phone(self, value):
        """Validate phone number format"""
        return validate_ph_mobile_phone(value)

    def validate_email(self, value):
        if not value:
            return value

        normalized_email = str(value).strip()
        user_id = getattr(self.instance, 'pk', None)
        if User.objects.exclude(pk=user_id).filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError('This email address is already in use.')
        if User.objects.exclude(pk=user_id).filter(pending_email__iexact=normalized_email).exists():
            raise serializers.ValidationError('This email address is already waiting for verification.')
        return normalized_email
    company_name = serializers.CharField(required=False, allow_blank=True, write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'first_name', 'middle_name', 'last_name', 'phone', 'landline', 'address', 'profile_image', 'company_name']

    def to_internal_value(self, data):
        allowed_fields = set(self.fields.keys())
        unexpected_fields = sorted(set(data.keys()) - allowed_fields)
        if unexpected_fields:
            raise serializers.ValidationError({
                field: 'This field cannot be updated on this endpoint.'
                for field in unexpected_fields
            })
        return super().to_internal_value(data)

    def update(self, instance, validated_data):
        requested_email = validated_data.pop('email', None)
        company_name = validated_data.pop('company_name', None)
        
        if requested_email is not None:
            requested_email = str(requested_email).strip()
            current_email = str(instance.email or '').strip()
            if requested_email and requested_email.lower() != current_email.lower():
                instance.pending_email = requested_email
                instance.pending_email_verification_sent_at = None
            elif requested_email.lower() == current_email.lower():
                instance.pending_email = None
                instance.pending_email_verification_sent_at = None

        instance = super().update(instance, validated_data)
        
        if company_name is not None and instance.role == 'client':
            profile, _ = ClientProfile.objects.get_or_create(user=instance)
            profile.company_name = company_name
            profile.save(update_fields=['company_name'])

        return instance


class TechnicianLocationUpdateSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    accuracy = serializers.FloatField(required=False, default=0)


class PasswordChangeSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=False, write_only=True)
    current_password = serializers.CharField(required=False, write_only=True)
    new_password = serializers.CharField(required=True)

    def validate(self, attrs):
        old_password = attrs.get('old_password') or attrs.get('current_password')
        if not old_password:
            raise serializers.ValidationError({'current_password': 'Current password is required'})

        user = self.context['request'].user
        if not user.check_password(old_password):
            raise serializers.ValidationError({'current_password': 'Current password is incorrect'})

        try:
            validate_password(attrs['new_password'], user=user)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc

        attrs['old_password'] = old_password
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=True, trim_whitespace=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(required=True)
    token = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, write_only=True)
    password_confirm = serializers.CharField(required=True, write_only=True)

    def validate(self, attrs):
        if attrs['new_password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': "Password fields didn't match."})

        try:
            validate_password(attrs['new_password'])
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'new_password': list(exc.messages)}) from exc

        return attrs


class AdminSettingsSerializer(serializers.ModelSerializer):
    systemName = serializers.CharField(source='system_name')
    supportEmail = serializers.EmailField(source='support_email')
    enableNotifications = serializers.BooleanField(source='enable_notifications')
    enableInAppNotifications = serializers.BooleanField(source='enable_in_app_notifications')
    enableEmailNotifications = serializers.BooleanField(source='enable_email_notifications')
    autoDispatchEnabled = serializers.BooleanField(source='auto_dispatch_enabled')
    allowOvertimeDispatch = serializers.BooleanField(source='allow_overtime_dispatch')
    overtimeDailyCapacityHours = serializers.SerializerMethodField()
    overtimeDailyCapacityMinutes = serializers.IntegerField(
        source='overtime_daily_capacity_minutes',
        min_value=480,
        max_value=960,
    )
    defaultTimeZone = serializers.CharField(source='default_time_zone')
    maxTechnicianAssignments = serializers.IntegerField(source='max_technician_assignments', min_value=1, max_value=50)
    businessDays = serializers.ListField(source='business_days', child=serializers.IntegerField(min_value=1, max_value=7), allow_empty=False)
    businessOpenTime = serializers.TimeField(source='business_open_time', format='%H:%M')
    businessCloseTime = serializers.TimeField(source='business_close_time', format='%H:%M')
    holidayDates = serializers.ListField(source='holiday_dates', child=serializers.DateField(), required=False)
    maintenanceReminderDays = serializers.IntegerField(source='maintenance_reminder_days', min_value=3, max_value=30)
    companyName = serializers.CharField(source='company_name', max_length=255)
    companyAddress = serializers.CharField(source='company_address', allow_blank=True, required=False)
    documentFooter = serializers.CharField(source='document_footer', allow_blank=True, required=False)
    currencyCode = serializers.CharField(source='currency_code', min_length=3, max_length=3)
    quotationValidityDays = serializers.IntegerField(source='quotation_validity_days', min_value=1, max_value=365)
    defaultWarrantyDays = serializers.IntegerField(source='default_warranty_days', min_value=1, max_value=3650)
    externalPaymentNotice = serializers.CharField(source='external_payment_notice', max_length=255)
    landingPageContent = serializers.JSONField(source='landing_page_content', required=False)
    solarCalculatorSettings = serializers.JSONField(source='solar_calculator_settings', required=False)
    landingPagePromotions = serializers.JSONField(source='landing_page_promotions', required=False)
    locationValidationEnabled = serializers.BooleanField(source='location_validation_enabled')
    arrivalRadiusMeters = serializers.IntegerField(source='arrival_radius_meters', min_value=1, max_value=1000)
    locationValidationDisabledReason = serializers.CharField(
        source='location_validation_disabled_reason',
        allow_blank=True,
        required=False,
    )
    locationValidationUpdatedAt = serializers.DateTimeField(source='location_validation_updated_at', read_only=True)
    locationValidationUpdatedByName = serializers.SerializerMethodField()
    locationValidationUpdatedById = serializers.IntegerField(source='location_validation_updated_by.id', read_only=True, allow_null=True)

    def get_overtimeDailyCapacityHours(self, obj):
        return round((obj.overtime_daily_capacity_minutes or 600) / 60, 2)

    def get_locationValidationUpdatedByName(self, obj):
        user = getattr(obj, 'location_validation_updated_by', None)
        if not user:
            return ''
        full_name = (user.get_full_name() or '').strip()
        return full_name or user.username

    def validate(self, attrs):
        open_time = attrs.get('business_open_time', getattr(self.instance, 'business_open_time', None))
        close_time = attrs.get('business_close_time', getattr(self.instance, 'business_close_time', None))
        if open_time and close_time and open_time >= close_time:
            raise serializers.ValidationError({'businessCloseTime': 'Closing time must be later than opening time.'})
        if 'business_days' in attrs:
            attrs['business_days'] = sorted(set(attrs['business_days']))
        if 'holiday_dates' in attrs:
            attrs['holiday_dates'] = sorted({value.isoformat() for value in attrs['holiday_dates']})
        if 'currency_code' in attrs:
            attrs['currency_code'] = attrs['currency_code'].upper()
        if not attrs.get('location_validation_enabled', True):
            reason = str(
                attrs.get('location_validation_disabled_reason')
                or getattr(self.instance, 'location_validation_disabled_reason', '')
                or ''
            ).strip()
            if not reason:
                raise serializers.ValidationError({
                    'locationValidationDisabledReason': 'A reason is required when location validation is turned off.'
                })
        return attrs

    def validate_landingPageContent(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Landing page content must be an object.')
        for key, field_value in value.items():
            if not isinstance(field_value, str):
                raise serializers.ValidationError(f'{key} must be text.')
            if len(field_value) > 500:
                raise serializers.ValidationError(f'{key} must be 500 characters or fewer.')
        return value

    def validate_solarCalculatorSettings(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Solar calculator settings must be an object.')
        numeric_ranges = {
            'defaultPeakSunHours': (1, 10),
            'defaultPerformanceRatio': (0.5, 1),
            'defaultPanelWattage': (100, 1000),
            'defaultElectricityRate': (0.01, 100),
            'defaultDesiredOffset': (10, 100),
        }
        for key, (minimum, maximum) in numeric_ranges.items():
            if key not in value:
                continue
            try:
                number = float(value[key])
            except (TypeError, ValueError):
                raise serializers.ValidationError({key: 'Enter a valid number.'})
            if number < minimum or number > maximum:
                raise serializers.ValidationError({key: f'Enter a value from {minimum} to {maximum}.'})
        return value

    def validate_landingPagePromotions(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Promotions must be a list.')
        if len(value) > 24:
            raise serializers.ValidationError('A maximum of 24 promotions is allowed.')

        allowed_link_prefixes = ('/', '#', 'https://', 'http://')
        normalized = []
        for index, promotion in enumerate(value):
            if not isinstance(promotion, dict):
                raise serializers.ValidationError(f'Promotion {index + 1} must be an object.')
            name = str(promotion.get('name') or '').strip()
            if not name:
                raise serializers.ValidationError(f'Promotion {index + 1} requires a name.')
            if len(name) > 120:
                raise serializers.ValidationError(f'Promotion {index + 1} name is too long.')

            cta_url = str(promotion.get('ctaUrl') or '').strip()
            image_url = str(promotion.get('imageUrl') or '').strip()
            if cta_url and not cta_url.startswith(allowed_link_prefixes):
                raise serializers.ValidationError(f'Promotion {index + 1} has an invalid call-to-action URL.')
            if image_url and not image_url.startswith(('/', 'https://', 'http://')):
                raise serializers.ValidationError(f'Promotion {index + 1} has an invalid image URL.')

            normalized.append({
                'id': str(promotion.get('id') or f'promotion-{index + 1}')[:80],
                'name': name,
                'description': str(promotion.get('description') or '').strip()[:500],
                'regularPrice': promotion.get('regularPrice') or '',
                'promoPrice': promotion.get('promoPrice') or '',
                'imageUrl': image_url[:500],
                'imageAssetId': promotion.get('imageAssetId') or None,
                'startDate': str(promotion.get('startDate') or '')[:10],
                'endDate': str(promotion.get('endDate') or '')[:10],
                'featured': bool(promotion.get('featured', False)),
                'active': bool(promotion.get('active', True)),
                'ctaLabel': str(promotion.get('ctaLabel') or 'Learn more').strip()[:80],
                'ctaUrl': cta_url[:500],
                'panelWattage': promotion.get('panelWattage') or '',
            })
        return normalized

    class Meta:
        model = AdminSettings
        fields = [
            'systemName',
            'supportEmail',
            'enableNotifications',
            'enableInAppNotifications',
            'enableEmailNotifications',
            'autoDispatchEnabled',
            'allowOvertimeDispatch',
            'overtimeDailyCapacityHours',
            'overtimeDailyCapacityMinutes',
            'defaultTimeZone',
            'maxTechnicianAssignments',
            'businessDays',
            'businessOpenTime',
            'businessCloseTime',
            'holidayDates',
            'maintenanceReminderDays',
            'companyName',
            'companyAddress',
            'documentFooter',
            'currencyCode',
            'quotationValidityDays',
            'defaultWarrantyDays',
            'externalPaymentNotice',
            'landingPageContent',
            'solarCalculatorSettings',
            'landingPagePromotions',
            'locationValidationEnabled',
            'arrivalRadiusMeters',
            'locationValidationDisabledReason',
            'locationValidationUpdatedAt',
            'locationValidationUpdatedByName',
            'locationValidationUpdatedById',
        ]


class CapabilityGrantUpdateSerializer(serializers.Serializer):
    capabilities = serializers.ListField(
        child=serializers.CharField(),
        allow_empty=True,
    )

    def validate_capabilities(self, value):
        normalized_capabilities = []
        for capability_code in value:
            normalized_code = str(capability_code or '').strip()
            if normalized_code and normalized_code not in normalized_capabilities:
                normalized_capabilities.append(normalized_code)

        unknown_capabilities = get_unknown_capability_codes(normalized_capabilities)
        if unknown_capabilities:
            raise serializers.ValidationError(
                f"Unknown capability code(s): {', '.join(unknown_capabilities)}"
            )

        allowed_capabilities = set(self.context.get('allowed_capabilities') or [])
        disallowed_capabilities = sorted(set(normalized_capabilities) - allowed_capabilities)
        if disallowed_capabilities:
            raise serializers.ValidationError(
                f"You cannot assign capability code(s): {', '.join(disallowed_capabilities)}"
            )

        return normalized_capabilities


class CapabilityDefinitionSerializer(serializers.Serializer):
    code = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    category = serializers.CharField()
    assignable = serializers.BooleanField()
