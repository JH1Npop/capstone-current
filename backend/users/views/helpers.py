from django.conf import settings as django_settings
from django.contrib.auth import authenticate
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Avg, Count, Q, F
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from collections import defaultdict
from urllib.parse import quote
import logging

logger = logging.getLogger(__name__)

UNVERIFIED_CLIENT_EXPIRY_HOURS = int(
    getattr(django_settings, 'EMAIL_VERIFICATION_EXPIRY_HOURS', 24)
)

from users.models import AdminSettings, User, UserCapabilityGrant
from users.serializers import (
    UserSerializer, UserRegistrationSerializer, UserLoginSerializer,
    UserUpdateSerializer, SelfUserUpdateSerializer,
    TechnicianLocationUpdateSerializer, PasswordChangeSerializer,
    PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    AdminSettingsSerializer, CapabilityGrantUpdateSerializer,
    CapabilityDefinitionSerializer,
)
from users.permissions import (
    IsAdmin, IsSuperadmin, IsSupervisor, IsTechnician, IsClient,
    IsAdminOrSupervisor, IsAdminOrSupervisorOrTechnician, IsSuperadminOrSupervisor,
    IsOwnerOrAdmin, CanManageUsers, CanManageStaffCapabilities, CanViewUserDirectory,
    CanViewSupervisorTechnicianDirectory,
)
from users.rbac import (
    ADMIN_CONFIGURED_MARKER,
    MANAGE_STAFF_CAPABILITIES,
    USER_DIRECTORY_VIEW_CAPABILITIES,
    can_manage_user_capabilities,
    get_assignable_capability_codes,
    get_capability_catalog,
    get_role_capabilities,
    get_user_capability_codes,
    get_user_direct_capability_codes,
    is_admin_workspace_role,
    is_superadmin_role,
    user_has_any_capability,
    user_has_capability,
)
from services.models import ServiceRequest, ServiceTicket, ServiceType, TechnicianSkill
from services.serializers import ServiceTypeSerializer


def delete_expired_unverified_clients():
    """
    Remove client self-registrations that were not verified within the
    verification window. This runs opportunistically from auth/admin endpoints
    so local/dev installs do not need a background scheduler.
    """
    cutoff = timezone.now() - timezone.timedelta(hours=UNVERIFIED_CLIENT_EXPIRY_HOURS)
    expired_clients = User.objects.filter(
        role='client',
        email_verified=False,
    ).filter(
        Q(email_verification_sent_at__lt=cutoff) |
        Q(email_verification_sent_at__isnull=True, date_joined__lt=cutoff)
    )

    deleted_count = 0
    for client in expired_clients:
        client._activity_reason = 'Email verification was not completed before the expiry window.'
        client.delete()
        deleted_count += 1
    return deleted_count


def authenticate_user_credentials(identifier, password):
    """
    Accept username or email and authenticate against Django's auth backend.
    """
    lookup_value = (identifier or '').strip()
    user = authenticate(username=lookup_value, password=password)
    if user and user.status == 'active':
        return user

    if not lookup_value:
        return None

    def authenticate_candidate(candidate):
        if (
            not candidate
            or not candidate.is_active
            or candidate.status != 'active'
        ):
            return None

        return authenticate(username=candidate.username, password=password)

    for candidate in User.objects.filter(email__iexact=lookup_value).order_by('id'):
        authenticated_user = authenticate_candidate(candidate)
        if authenticated_user:
            return authenticated_user

    username_candidate = User.objects.filter(username__iexact=lookup_value).first()
    return authenticate_candidate(username_candidate)


def get_password_reset_users(identifier):
    """
    Resolve password-reset targets by username or email without exposing whether
    the identifier exists. Duplicate emails are supported by sending a reset
    email for each matching active account.
    """
    lookup_value = (identifier or '').strip()
    if not lookup_value:
        return []

    if '@' in lookup_value:
        return list(User.objects.filter(
            email__iexact=lookup_value,
            is_active=True,
            status='active',
            email_verified=True,
        ).order_by('id'))

    user = User.objects.filter(
        username__iexact=lookup_value,
        is_active=True,
        status='active',
        email_verified=True,
    ).first()
    return [user] if user else []


def ensure_actor_can_manage_account(actor, target_user):
    """Enforce account hierarchy and prevent self-lockout on management APIs."""
    if not actor or not getattr(actor, 'is_authenticated', False):
        raise PermissionError('Authentication is required to manage accounts.')
    if target_user.pk == actor.pk:
        raise PermissionError('Use the profile and password endpoints for your own account.')
    if target_user.role == 'superadmin':
        raise PermissionError('The superadmin account cannot be modified or deactivated.')
    if target_user.role == 'admin' and not is_superadmin_role(actor.role):
        raise PermissionError('Only the superadmin can manage administrator accounts.')


def _frontend_base_url_from_request(request=None):
    # Security links must never inherit a caller-controlled Origin or Referer.
    # A forged password-reset request could otherwise direct the emailed token
    # to an attacker-controlled host.
    return django_settings.FRONTEND_BASE_URL.rstrip('/')


def send_password_reset_email(user, request=None):
    if not user.email:
        logger.warning('Skipping password reset email for user %s because no email address is set.', user.pk)
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_base_url = _frontend_base_url_from_request(request)
    reset_link = (
        f"{frontend_base_url}/reset-password"
        f"?uid={uid}&token={token}"
    )
    display_name = user.get_full_name().strip() or user.username
    message = (
        f"Hello {display_name},\n\n"
        "We received a request to reset the password for your AFN Service Management account.\n"
        f"Username: {user.username}\n"
        f"Reset your password here: {reset_link}\n\n"
        "If you did not request this, you can safely ignore this email."
    )

    send_mail(
        subject='Reset your AFN Service Management password',
        message=message,
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_email_verification_email(user, request=None):
    if not user.email:
        logger.warning('Skipping email verification for user %s because no email address is set.', user.pk)
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_base_url = _frontend_base_url_from_request(request)
    verify_link = (
        f"{frontend_base_url}/verify-email"
        f"?uid={uid}&token={token}"
    )
    display_name = user.get_full_name().strip() or user.username
    message = (
        f"Hello {display_name},\n\n"
        "Please verify your email address for your AFN-SERVE account.\n"
        f"Username: {user.username}\n"
        f"Verify your email here: {verify_link}\n\n"
        "If you did not create this account, you can safely ignore this email."
    )

    send_mail(
        subject='Verify your AFN-SERVE email address',
        message=message,
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_pending_email_verification_email(user, request=None):
    pending_email = str(getattr(user, 'pending_email', '') or '').strip()
    if not pending_email:
        logger.warning('Skipping pending email verification for user %s because no pending email is set.', user.pk)
        return

    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_base_url = _frontend_base_url_from_request(request)
    verify_link = (
        f"{frontend_base_url}/verify-email"
        f"?uid={uid}&token={token}&email={quote(pending_email)}"
    )
    display_name = user.get_full_name().strip() or user.username
    message = (
        f"Hello {display_name},\n\n"
        "Please verify this new email address for your AFN-SERVE account.\n"
        f"Username: {user.username}\n"
        f"Verify your new email here: {verify_link}\n\n"
        "Your current email will stay active until this link is verified. "
        "If you did not request this change, you can safely ignore this email."
    )

    send_mail(
        subject='Verify your new AFN-SERVE email address',
        message=message,
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[pending_email],
        fail_silently=False,
    )
