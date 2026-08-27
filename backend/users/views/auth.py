# Auto-split from users/views.py
from users.views.helpers import *  # noqa: F401,F403
from django.db.models import F
from rest_framework import serializers as drf_serializers
from rest_framework.exceptions import PermissionDenied
from users.rbac import CAPABILITY_DEFINITIONS
from users.signals import log_activity

class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user and is_admin_workspace_role(request.user.role)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().prefetch_related('capability_grants')
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_permissions(self):
        """Return appropriate permissions based on action"""
        if self.action in ['login', 'register', 'verify_email', 'password_reset_request', 'password_reset_confirm']:
            return [permissions.AllowAny()]
        elif self.action in ['available_capabilities', 'capabilities']:
            return [CanManageStaffCapabilities()]
        elif self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [CanManageUsers()]
        elif self.action == 'list':
            return [CanViewUserDirectory()]
        return [permissions.IsAuthenticated()]

    def get_throttles(self):
        if self.action == 'login':
            self.throttle_scope = 'login'
            return [ScopedRateThrottle()]
        if self.action == 'register':
            self.throttle_scope = 'register'
            return [ScopedRateThrottle()]
        if self.action in ['password_reset_request', 'password_reset_confirm']:
            self.throttle_scope = 'password_reset'
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        """Filter queryset based on user role"""
        delete_expired_unverified_clients()
        user = self.request.user
        queryset = User.objects.none()

        # Support filtered users by query param from admin dashboard
        role_filter = self.request.query_params.get('role')

        if is_superadmin_role(user.role):
            queryset = User.objects.all().prefetch_related('capability_grants')
        elif user.role == 'admin' and user_has_any_capability(user, USER_DIRECTORY_VIEW_CAPABILITIES):
            queryset = User.objects.all().prefetch_related('capability_grants')
        elif user.role in ['admin', 'technician', 'client']:
            queryset = User.objects.filter(id=user.id).prefetch_related('capability_grants')

        if role_filter:
            queryset = queryset.filter(role=role_filter)

        return queryset

    def get_serializer_class(self):
        """Return appropriate serializer based on action"""
        if self.action == 'register':
            return UserRegistrationSerializer
        elif self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        return UserSerializer

    @action(detail=False, methods=['get', 'patch'])
    def me(self, request):
        """Get current user info"""
        if request.method.lower() == 'patch':
            old_email = str(request.user.email or '').strip()
            serializer = SelfUserUpdateSerializer(request.user, data=request.data, partial=True)
            if serializer.is_valid():
                user = serializer.save()
                pending_email = str(getattr(user, 'pending_email', '') or '').strip()
                if pending_email and pending_email.lower() != old_email.lower() and request.data.get('email'):
                    try:
                        send_pending_email_verification_email(user, request=request)
                        user.pending_email_verification_sent_at = timezone.now()
                        user.save(update_fields=['pending_email_verification_sent_at'])
                    except Exception as exc:
                        logger.error('Pending email verification send failed: %s', exc, exc_info=True)
                        user.pending_email = None
                        user.pending_email_verification_sent_at = None
                        user.save(update_fields=['pending_email', 'pending_email_verification_sent_at'])
                        return Response(
                            {'error': 'Profile changes were saved, but the new email could not be verified right now. Please check the new email address or try again later.'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        )
                return Response(UserSerializer(request.user, context={'request': request}).data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        """Register a new user"""
        delete_expired_unverified_clients()
        requested_role = str(request.data.get('role') or 'client').strip().lower()
        if (
            request.user.is_authenticated
            and requested_role in UserRegistrationSerializer.ELEVATED_ROLES
            and not is_superadmin_role(request.user.role)
        ):
            return Response(
                {'role': 'Only the superadmin can create admin or staff accounts.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = UserRegistrationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                with transaction.atomic():
                    user = serializer.save()
                    send_email_verification_email(user, request=request)
                    user.email_verification_sent_at = timezone.now()
                    user.save(update_fields=['email_verification_sent_at'])
            except Exception as exc:
                logger.error('Email verification send failed during registration: %s', exc, exc_info=True)
                return Response(
                    {'error': 'The verification email could not be sent. Please check the email address or try again later.'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )
            return Response({
                'user': UserSerializer(user, context={'request': request}).data,
                'message': 'Account created. Please check your email to verify your account before signing in.'
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def verify_email(self, request):
        uid = request.data.get('uid')
        token = request.data.get('token')
        requested_email = str(request.data.get('email') or '').strip()

        if not uid or not token:
            return Response(
                {'error': 'Verification link is missing required information.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {'error': 'This verification link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'This verification link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        update_fields = []
        pending_email = str(getattr(user, 'pending_email', '') or '').strip()
        if requested_email:
            if not pending_email or requested_email.lower() != pending_email.lower():
                return Response(
                    {'error': 'This email verification link is no longer valid.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.email = pending_email
            user.pending_email = None
            user.pending_email_verification_sent_at = None
            user.email_verified = True
            update_fields.extend([
                'email',
                'pending_email',
                'pending_email_verification_sent_at',
                'email_verified',
            ])
        elif not user.email_verified:
            user.email_verified = True
            update_fields.append('email_verified')
        if not user.is_active:
            user.is_active = True
            update_fields.append('is_active')
        if user.status != 'active':
            user.status = 'active'
            update_fields.append('status')
        if update_fields:
            user.save(update_fields=update_fields)

        return Response({'message': 'Email verified successfully. You can now sign in.'})

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def login(self, request):
        """User login"""
        delete_expired_unverified_clients()
        serializer = UserLoginSerializer(data=request.data)
        if serializer.is_valid():
            user = authenticate_user_credentials(
                serializer.validated_data['username'],
                serializer.validated_data['password']
            )
            if user:
                if not user.email_verified:
                    return Response(
                        {'error': 'Please verify your email address before signing in.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                existing_token = Token.objects.filter(user=user).first()
                if existing_token:
                    log_activity(
                        actor=user,
                        category='security',
                        action='logout',
                        target=user,
                        message=f'{user.get_full_name().strip() or user.username} session ended before a new login',
                        metadata={'reason': 'session_replaced'},
                    )
                    existing_token.delete()
                token = Token.objects.create(user=user)
                ip = request.META.get('REMOTE_ADDR') if hasattr(request, 'META') else ''
                log_activity(
                    actor=user,
                    category='security',
                    action='login',
                    target=user,
                    message=f'{user.get_full_name().strip() or user.username} logged in',
                    metadata={'ip_address': ip},
                )
                return Response({
                    'user': UserSerializer(user, context={'request': request}).data,
                    'token': token.key
                })
            ip = request.META.get('REMOTE_ADDR') if hasattr(request, 'META') else ''
            identifier = serializer.validated_data['username']
            log_activity(
                category='security',
                action='error',
                message=f"Failed login attempt for '{identifier}' from IP {ip or 'unknown'}",
                metadata={'identifier': identifier, 'ip_address': ip},
            )
            try:
                from users.signals import notify_admin_security_alert
                from users.models import ActivityLog
                from django.db import models
                from django.utils import timezone
                from datetime import timedelta
                recent_logs = ActivityLog.objects.filter(
                    category='security',
                    action__in=['error', 'login_failed'],
                    created_at__gte=timezone.now() - timedelta(minutes=15),
                )
                recent_failures = 0
                for log in recent_logs:
                    if identifier in log.message or (ip and (log.ip_address == ip or ip in log.message)):
                        recent_failures += 1
                if recent_failures >= 5:
                    notify_admin_security_alert(
                        title="Security Alert: Repeated Failed Logins",
                        message=f"Detected {recent_failures} failed login attempts for '{identifier}' / IP {ip or 'unknown'} within 15 minutes.",
                        metadata={'identifier': identifier, 'ip_address': ip, 'failures': recent_failures},
                    )
            except Exception as e:
                logger.warning("Failed to check repeated failed logins or notify admin: %s", e)
            return Response(
                {'error': 'Invalid credentials'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'])
    def logout(self, request):
        """User logout"""
        try:
            log_activity(
                actor=request.user,
                category='security',
                action='logout',
                target=request.user,
                message=f'{request.user.get_full_name().strip() or request.user.username} logged out',
            )
            request.user.auth_token.delete()
            return Response({'message': 'Logged out successfully'})
        except Exception as e:
            from rest_framework.authtoken.models import Token
            try:
                # Token already deleted or never created — still a clean logout
                pass
            except:
                pass
            return Response({'message': 'Logged out successfully'})

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        """Change password for the authenticated user"""
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({'message': 'Password changed successfully'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def password_reset_request(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        identifier = serializer.validated_data['identifier']

        try:
            for user in get_password_reset_users(identifier):
                send_password_reset_email(user, request=request)
        except Exception as exc:
            return Response(
                {'error': 'Unable to send password reset email right now. Please try again later.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response({
            'message': 'If an account exists for that email or username, a password reset link has been sent.'
        })

    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def password_reset_confirm(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            user_id = force_str(urlsafe_base64_decode(serializer.validated_data['uid']))
            user = User.objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {'error': 'This password reset link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token = serializer.validated_data['token']
        if not default_token_generator.check_token(user, token):
            return Response(
                {'error': 'This password reset link is invalid or has expired.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        from rest_framework.authtoken.models import Token
        Token.objects.filter(user=user).delete()

        return Response({
            'message': 'Password has been reset successfully. Please sign in with your new password.'
        })

    @action(detail=False, methods=['get'])
    def available_capabilities(self, request):
        capability_catalog = get_capability_catalog(include_non_assignable=False)
        assignable_codes = get_assignable_capability_codes(request.user)
        allowed_capabilities = [
            capability
            for capability in capability_catalog
            if capability['code'] in assignable_codes
        ]
        serializer = CapabilityDefinitionSerializer(allowed_capabilities, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'put'])
    def capabilities(self, request, pk=None):
        try:
            target_user = User.objects.prefetch_related('capability_grants').get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if not can_manage_user_capabilities(request.user, target_user):
            return Response(
                {'error': 'You do not have permission to manage this user.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        allowed_capabilities = get_assignable_capability_codes(request.user, target_user=target_user)

        if request.method.lower() == 'put':
            serializer = CapabilityGrantUpdateSerializer(
                data=request.data,
                context={'allowed_capabilities': allowed_capabilities},
            )
            serializer.is_valid(raise_exception=True)
            requested_capabilities = set(serializer.validated_data['capabilities'])
            
            if target_user.role == 'admin':
                requested_capabilities.add(ADMIN_CONFIGURED_MARKER)

            current_capabilities = get_user_direct_capability_codes(target_user)

            capabilities_to_add = sorted(requested_capabilities - current_capabilities)
            capabilities_to_remove = sorted(current_capabilities - requested_capabilities)

            for capability_code in capabilities_to_add:
                UserCapabilityGrant.objects.create(
                    user=target_user,
                    capability_code=capability_code,
                    granted_by=request.user,
                )

            if capabilities_to_remove:
                UserCapabilityGrant.objects.filter(
                    user=target_user,
                    capability_code__in=capabilities_to_remove,
                ).delete()

        visible_catalog = [
            capability for capability in get_capability_catalog()
            if capability['code'] in allowed_capabilities
        ]

        return Response({
            'role_capabilities': sorted(get_role_capabilities(target_user.role)),
            'direct_capabilities': sorted(
                get_user_direct_capability_codes(target_user) - {ADMIN_CONFIGURED_MARKER}
            ),
            'effective_capabilities': sorted(get_user_capability_codes(target_user)),
            'available_capabilities': CapabilityDefinitionSerializer(visible_catalog, many=True).data,
        })

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny])
    def test_connection(self, request):
        """Test endpoint to verify frontend-backend connection"""
        return Response({'message': 'Backend is connected!', 'status': 'success'})

    @action(detail=False, methods=['post'])
    def verify_token(self, request):
        """Verify if token is valid"""
        return Response({'valid': True})

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Update user status (admin only)"""
        if not CanManageUsers().has_permission(request, self):
            raise PermissionDenied('You do not have permission to update user status.')
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status in ['active', 'inactive']:
            user.status = new_status
            user.save()
            return Response({'status': 'Status updated'})
        return Response({'error': 'Invalid status'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def set_available(self, request, pk=None):
        """Set technician availability"""
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if user.role != 'technician':
            return Response({'error': 'Only technicians can set availability'}, status=status.HTTP_400_BAD_REQUEST)

        can_manage_users = CanManageUsers().has_permission(request, self)
        if request.user.id != user.id and not can_manage_users:
            raise PermissionDenied('You can only update your own availability.')

        try:
            is_available = drf_serializers.BooleanField().run_validation(
                request.data.get('is_available', True)
            )
        except drf_serializers.ValidationError as exc:
            return Response({'is_available': exc.detail}, status=status.HTTP_400_BAD_REQUEST)

        user.is_available = is_available

        return Response({'is_available': user.is_available})

    @action(detail=False, methods=['get'])
    def technicians(self, request):
        """Get all technicians"""
        if not CanViewSupervisorTechnicianDirectory().has_permission(request, self):
            raise PermissionDenied('You do not have permission to view the technician directory.')
        technicians = User.objects.filter(role='technician').annotate(
            current_latitude=F('technician_profile__current_latitude'),
            current_longitude=F('technician_profile__current_longitude'),
            is_available=F('technician_profile__is_available'),
        ).values(
            'id', 'username', 'email', 'phone', 'current_latitude',
            'current_longitude', 'is_available', 'status'
        )
        return Response(technicians)

    @action(detail=False, methods=['get'])
    def clients(self, request):
        """Get all clients"""
        if not CanViewUserDirectory().has_permission(request, self):
            raise PermissionDenied('You do not have permission to view the client directory.')
        delete_expired_unverified_clients()
        clients = User.objects.filter(role='client', email_verified=True).values(
            'id', 'username', 'email', 'phone', 'address', 'status'
        )
        return Response(clients)
