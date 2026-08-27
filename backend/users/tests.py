import re
from datetime import datetime
from unittest.mock import patch

from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from django.core.cache import cache
from django.core import mail
from django.test import override_settings
from django.utils import timezone

from inventory.models import InventoryCategory, InventoryItem, InventoryTransaction
from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType, TechnicianSkill
from .models import ActivityLog, AdminSettings, ChangeLog, User, UserCapabilityGrant
from .rbac import (
    AFTER_SALES_CASES_MANAGE,
    AFTER_SALES_CASES_VIEW,
    AFTER_SALES_DASHBOARD_VIEW,
    ADMIN_CONFIGURED_MARKER,
    MANAGE_STAFF_CAPABILITIES,
    TECHNICIAN_DASHBOARD_VIEW,
    TECHNICIAN_JOBS_VIEW,
    TECHNICIAN_PROFILE_VIEW,
    USER_DIRECTORY_VIEW,
    USER_MANAGEMENT_MANAGE,
    SUPERVISOR_TRACKING_VIEW,
    get_default_admin_scope_for_role,
    is_admin_scoped_role,
    is_admin_workspace_role,
)


class UserRegistrationTests(APITestCase):
    def setUp(self):
        self.register_url = '/api/users/register/'
        self.user_create_url = '/api/admin/users/'

    def test_public_registration_rejects_admin_when_no_admin_exists(self):
        payload = {
            'username': 'admin1',
            'email': 'admin1@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'first_name': 'Admin',
            'last_name': 'One',
            'phone': '1234567890',
            'role': 'admin'
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='admin1').exists())

    def test_public_registration_rejects_admin_when_admin_exists(self):
        User.objects.create_user(
            username='existing_admin',
            email='existing_admin@example.com',
            password='Password123!',
            role='admin',
            admin_scope='service_follow_up'
        )

        payload = {
            'username': 'admin2',
            'email': 'admin2@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'first_name': 'Admin',
            'last_name': 'Two',
            'phone': '1234567899',
            'role': 'admin',
            'admin_scope': 'task_management'
        }
        response = self.client.post(self.register_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='admin2').exists())

    def test_superadmin_user_can_create_additional_admin(self):
        superadmin_user = User.objects.create_user(
            username='existing_owner',
            email='existing_owner@example.com',
            password='Password123!',
            role='superadmin'
        )
        token = Token.objects.create(user=superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        payload = {
            'username': 'admin3',
            'email': 'admin3@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'first_name': 'Admin',
            'last_name': 'Three',
            'role': 'admin'
        }

        response = self.client.post(self.user_create_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(User.objects.get(username='admin3').role, 'admin')

    def test_superadmin_user_cannot_create_removed_follow_up_role(self):
        superadmin_user = User.objects.create_user(
            username='existing_owner_two',
            email='existing_owner_two@example.com',
            password='Password123!',
            role='superadmin'
        )
        token = Token.objects.create(user=superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        payload = {
            'username': 'followup1',
            'email': 'followup1@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'first_name': 'Follow',
            'last_name': 'Up',
            'role': 'follow_up'
        }

        response = self.client.post(self.user_create_url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='followup1').exists())

    def test_superadmin_user_can_deactivate_user(self):
        superadmin_user = User.objects.create_user(
            username='existing_owner_three',
            email='existing_owner_three@example.com',
            password='Password123!',
            role='superadmin'
        )
        managed_user = User.objects.create_user(
            username='tech_user',
            email='tech@example.com',
            password='Password123!',
            role='technician'
        )
        token = Token.objects.create(user=superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.delete(f'/api/admin/users/{managed_user.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        managed_user.refresh_from_db()
        self.assertEqual(managed_user.status, 'inactive')
        self.assertFalse(managed_user.is_active)

    def test_admin_user_cannot_create_internal_user(self):
        admin_user = User.objects.create_user(
            username='operations_admin',
            email='operations_admin@example.com',
            password='Password123!',
            role='admin'
        )
        token = Token.objects.create(user=admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.post(self.user_create_url, {
            'username': 'blocked_supervisor',
            'email': 'blocked_supervisor@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'role': 'supervisor'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username='blocked_supervisor').exists())

    def test_public_registration_rejects_weak_password(self):
        payload = {
            'username': 'weak_password_user',
            'email': 'weak@example.com',
            'password': '123',
            'password_confirm': '123',
            'role': 'client',
        }

        response = self.client.post(self.register_url, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)
        self.assertFalse(User.objects.filter(username='weak_password_user').exists())


class RoleClassificationTests(APITestCase):
    def test_admin_roles_own_internal_workspaces(self):
        self.assertTrue(is_admin_scoped_role('admin'))
        self.assertTrue(is_admin_workspace_role('admin'))
        self.assertEqual(get_default_admin_scope_for_role('admin'), 'general')
        self.assertFalse(is_admin_scoped_role('follow_up'))
        self.assertFalse(is_admin_workspace_role('follow_up'))
        self.assertIsNone(get_default_admin_scope_for_role('follow_up'))


class UserLoginTests(APITestCase):
    def setUp(self):
        self.login_url = '/api/users/login/'
        cache.clear()

    def test_user_can_login_with_email(self):
        user = User.objects.create_user(
            username='email_login_user',
            email='email-login@example.com',
            password='Password123!',
            role='client'
        )

        response = self.client.post(self.login_url, {
            'username': user.email,
            'password': 'Password123!'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], user.username)
        self.assertIn('token', response.data)

    def test_login_rejects_legacy_plain_text_password(self):
        user = User.objects.create(
            username='legacy_user',
            email='legacy@example.com',
            password='legacy-pass',
            role='client',
            is_active=True
        )

        response = self.client.post(self.login_url, {
            'username': user.username,
            'password': 'legacy-pass'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        user.refresh_from_db()
        self.assertEqual(user.password, 'legacy-pass')

    def test_user_can_login_with_duplicate_email_when_password_matches_later_account(self):
        shared_email = 'shared-login@example.com'
        User.objects.create_user(
            username='shared_email_first',
            email=shared_email,
            password='Password123!',
            role='client'
        )
        matching_user = User.objects.create_user(
            username='shared_email_second',
            email=shared_email,
            password='DifferentPass456!',
            role='admin'
        )

        response = self.client.post(self.login_url, {
            'username': shared_email,
            'password': 'DifferentPass456!'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], matching_user.username)
        self.assertEqual(response.data['user']['role'], matching_user.role)
        self.assertIn('token', response.data)

    def test_user_can_login_with_case_insensitive_username(self):
        user = User.objects.create_user(
            username='MixedCaseUser',
            email='mixedcase@example.com',
            password='Password123!',
            role='client'
        )

        response = self.client.post(self.login_url, {
            'username': 'mixedcaseuser',
            'password': 'Password123!'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['username'], user.username)

    @override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
    def test_login_is_rate_limited_after_too_many_attempts(self):
        from notifications.models import Notification
        User.objects.create_user(
            username='admin_alert_recipient',
            email='admin@example.com',
            password='Password123!',
            role='admin'
        )
        User.objects.create_user(
            username='throttle_user',
            email='throttle@example.com',
            password='Password123!',
            role='client'
        )

        for _ in range(10):
            response = self.client.post(self.login_url, {
                'username': 'throttle_user',
                'password': 'wrong-password'
            }, format='json')

        # After 5+ failed attempts, admin should have received an urgent alert
        self.assertTrue(Notification.objects.filter(type='urgent', title__icontains='Repeated Failed Logins').exists())

        response = self.client.post(self.login_url, {
            'username': 'throttle_user',
            'password': 'wrong-password'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertTrue(ActivityLog.objects.filter(category='security', action='throttled').exists())
        self.assertTrue(Notification.objects.filter(type='urgent', title__icontains='Rate Limit Exceeded').exists())


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    FRONTEND_BASE_URL='http://localhost:5173',
)
class EmailVerificationTests(APITestCase):
    def setUp(self):
        self.register_url = '/api/users/register/'
        self.verify_url = '/api/users/verify_email/'
        self.login_url = '/api/users/login/'
        cache.clear()

    def _extract_verification_credentials(self, body):
        match = re.search(r'uid=([^&\s]+)&token=([^\s]+)', body)
        self.assertIsNotNone(match)
        return match.group(1), match.group(2)

    def test_registration_sends_verification_email_and_does_not_return_token(self):
        response = self.client.post(self.register_url, {
            'username': 'verify_client',
            'email': 'verify-client@gmail.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'role': 'client',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('token', response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('/verify-email?uid=', mail.outbox[0].body)
        user = User.objects.get(username='verify_client')
        self.assertFalse(user.email_verified)
        self.assertIsNotNone(user.email_verification_sent_at)

    def test_unverified_user_cannot_login_until_email_is_verified(self):
        user = User.objects.create_user(
            username='unverified_client',
            email='unverified-client@gmail.com',
            password='Password123!',
            role='client',
            email_verified=False,
        )

        blocked_response = self.client.post(self.login_url, {
            'username': user.email,
            'password': 'Password123!',
        }, format='json')

        self.assertEqual(blocked_response.status_code, status.HTTP_403_FORBIDDEN)

        from users.views.helpers import send_email_verification_email

        send_email_verification_email(user)
        uid, token = self._extract_verification_credentials(mail.outbox[0].body)

        verify_response = self.client.post(self.verify_url, {
            'uid': uid,
            'token': token,
        }, format='json')

        self.assertEqual(verify_response.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.email_verified)

        login_response = self.client.post(self.login_url, {
            'username': user.email,
            'password': 'Password123!',
        }, format='json')

        self.assertEqual(login_response.status_code, status.HTTP_200_OK)
        self.assertIn('token', login_response.data)

    def test_unverified_client_is_removed_after_five_minutes(self):
        user = User.objects.create_user(
            username='expired_unverified_client',
            email='expired-unverified-client@gmail.com',
            password='Password123!',
            role='client',
            email_verified=False,
            email_verification_sent_at=timezone.now() - timezone.timedelta(minutes=6),
        )

        response = self.client.post(self.login_url, {
            'username': user.email,
            'password': 'Password123!',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(User.objects.filter(pk=user.pk).exists())

    def test_recent_unverified_client_is_kept_before_five_minutes(self):
        user = User.objects.create_user(
            username='recent_unverified_client',
            email='recent-unverified-client@gmail.com',
            password='Password123!',
            role='client',
            email_verified=False,
            email_verification_sent_at=timezone.now() - timezone.timedelta(minutes=4),
        )

        response = self.client.post(self.login_url, {
            'username': user.email,
            'password': 'Password123!',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=user.pk).exists())


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    FRONTEND_BASE_URL='http://localhost:5173',
)
class PasswordResetTests(APITestCase):
    def setUp(self):
        self.request_url = '/api/users/password_reset_request/'
        self.confirm_url = '/api/users/password_reset_confirm/'
        self.user = User.objects.create_user(
            username='reset_user',
            email='reset-user@example.com',
            password='Password123!',
            role='client'
        )
        cache.clear()

    def _extract_reset_credentials(self, body):
        match = re.search(r'uid=([^&\s]+)&token=([^\s]+)', body)
        self.assertIsNotNone(match)
        return match.group(1), match.group(2)

    def test_password_reset_request_sends_email_with_reset_link(self):
        response = self.client.post(self.request_url, {
            'identifier': self.user.email
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.username, mail.outbox[0].body)
        self.assertIn('/reset-password?uid=', mail.outbox[0].body)
        self.assertIn('token=', mail.outbox[0].body)

    @override_settings(FRONTEND_BASE_URL='https://trusted.example')
    def test_password_reset_link_ignores_untrusted_origin(self):
        response = self.client.post(
            self.request_url,
            {'identifier': self.user.email},
            format='json',
            HTTP_ORIGIN='https://attacker.ngrok-free.app',
            HTTP_REFERER='https://attacker.ngrok-free.app/reset',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn('https://trusted.example/reset-password', mail.outbox[0].body)
        self.assertNotIn('attacker.ngrok-free.app', mail.outbox[0].body)

    def test_password_reset_confirm_updates_password_and_revokes_existing_tokens(self):
        existing_token = Token.objects.create(user=self.user)

        self.client.post(self.request_url, {
            'identifier': self.user.email
        }, format='json')
        uid, token = self._extract_reset_credentials(mail.outbox[0].body)

        response = self.client.post(self.confirm_url, {
            'uid': uid,
            'token': token,
            'new_password': 'EvenStrongerPassword456!',
            'password_confirm': 'EvenStrongerPassword456!',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('EvenStrongerPassword456!'))
        self.assertFalse(Token.objects.filter(key=existing_token.key).exists())

    def test_password_reset_confirm_rejects_invalid_token(self):
        response = self.client.post(self.confirm_url, {
            'uid': 'invalid',
            'token': 'invalid-token',
            'new_password': 'EvenStrongerPassword456!',
            'password_confirm': 'EvenStrongerPassword456!',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)


class SelfServiceProfileTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='self_service_client',
            email='self-service-client@example.com',
            password='Password123!',
            role='client',
            phone='09111111111',
            address='Old Address'
        )
        self.client_token = Token.objects.create(user=self.client_user)

        self.technician_user = User.objects.create_user(
            username='self_service_tech',
            email='self-service-tech@example.com',
            password='Password123!',
            role='technician',
            phone='09222222222',
            status='active',
            is_available=True
        )
        self.technician_token = Token.objects.create(user=self.technician_user)

    def test_me_endpoint_allows_safe_profile_fields(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.client_token.key}')

        response = self.client.patch('/api/users/me/', {
            'first_name': 'Updated',
            'phone': '09999999999',
            'address': 'New Address'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.first_name, 'Updated')
        self.assertEqual(self.client_user.phone, '09999999999')
        self.assertEqual(self.client_user.address, 'New Address')

    def test_me_endpoint_blocks_privileged_fields(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.client_token.key}')

        response = self.client.patch('/api/users/me/', {
            'role': 'admin',
            'admin_scope': 'service_follow_up',
            'status': 'inactive',
            'is_available': False
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.role, 'client')
        self.assertEqual(self.client_user.admin_scope, 'general')
        self.assertEqual(self.client_user.status, 'active')
        self.assertTrue(self.client_user.is_available)

    def test_technician_profile_update_allows_safe_fields(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.technician_token.key}')

        response = self.client.put('/api/technician/profile/', {
            'phone': '09333333333'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.technician_user.refresh_from_db()
        self.assertEqual(self.technician_user.phone, '09333333333')

    def test_technician_profile_update_blocks_privileged_fields(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.technician_token.key}')

        response = self.client.put('/api/technician/profile/', {
            'role': 'admin',
            'status': 'inactive',
            'is_available': False
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', response.data)
        self.technician_user.refresh_from_db()
        self.assertEqual(self.technician_user.role, 'technician')
        self.assertEqual(self.technician_user.status, 'active')
        self.assertTrue(self.technician_user.is_available)

    def test_change_password_rejects_weak_password(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.client_token.key}')

        response = self.client.post('/api/users/change_password/', {
            'current_password': 'Password123!',
            'new_password': '123',
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('new_password', response.data)


class LegacyUserActionAuthorizationTests(APITestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='legacy-action-client',
            password='Password123!',
            role='client',
            email_verified=True,
        )
        self.technician = User.objects.create_user(
            username='legacy-action-technician',
            password='Password123!',
            role='technician',
            status='active',
        )

    def _configured_admin(self, username, capability):
        user = User.objects.create_user(
            username=username,
            password='Password123!',
            role='admin',
        )
        UserCapabilityGrant.objects.bulk_create([
            UserCapabilityGrant(user=user, capability_code=ADMIN_CONFIGURED_MARKER),
            UserCapabilityGrant(user=user, capability_code=capability),
        ])
        return user

    def test_client_cannot_mutate_other_users_or_list_directories(self):
        self.client.force_authenticate(user=self.client_user)

        status_response = self.client.post(
            f'/api/users/{self.technician.id}/update_status/',
            {'status': 'inactive'},
            format='json',
        )
        availability_response = self.client.post(
            f'/api/users/{self.technician.id}/set_available/',
            {'is_available': False},
            format='json',
        )

        self.assertEqual(status_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(availability_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/users/technicians/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.client.get('/api/users/clients/').status_code, status.HTTP_403_FORBIDDEN)

        self.technician.refresh_from_db()
        self.assertEqual(self.technician.status, 'active')
        self.assertTrue(self.technician.is_available)

    def test_technician_can_update_only_own_availability(self):
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            f'/api/users/{self.technician.id}/set_available/',
            {'is_available': False},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.technician.refresh_from_db()
        self.assertFalse(self.technician.is_available)

    def test_technician_availability_rejects_invalid_boolean(self):
        self.client.force_authenticate(user=self.technician)

        response = self.client.post(
            f'/api/users/{self.technician.id}/set_available/',
            {'is_available': 'not-a-boolean'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.technician.refresh_from_db()
        self.assertTrue(self.technician.is_available)

    def test_directory_actions_require_the_matching_capability(self):
        tracking_admin = self._configured_admin('tracking-directory-admin', SUPERVISOR_TRACKING_VIEW)
        self.client.force_authenticate(user=tracking_admin)
        self.assertEqual(self.client.get('/api/users/technicians/').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get('/api/users/clients/').status_code, status.HTTP_403_FORBIDDEN)

        directory_admin = self._configured_admin('client-directory-admin', USER_DIRECTORY_VIEW)
        self.client.force_authenticate(user=directory_admin)
        self.assertEqual(self.client.get('/api/users/clients/').status_code, status.HTTP_200_OK)

    def test_user_manager_can_update_account_status(self):
        manager = self._configured_admin('legacy-action-manager', USER_MANAGEMENT_MANAGE)
        self.client.force_authenticate(user=manager)

        response = self.client.post(
            f'/api/users/{self.client_user.id}/update_status/',
            {'status': 'inactive'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.client_user.refresh_from_db()
        self.assertEqual(self.client_user.status, 'inactive')


class AdminSettingsTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='settings_admin',
            email='settings_admin@example.com',
            password='Password123!',
            role='admin'
        )
        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_admin_settings_can_be_updated(self):
        response = self.client.put('/api/users/admin_settings/', {
            'defaultTimeZone': 'Asia/Manila',
            'maxTechnicianAssignments': 7,
            'autoDispatchEnabled': True
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['defaultTimeZone'], 'Asia/Manila')
        self.assertEqual(response.data['maxTechnicianAssignments'], 7)

        settings_record = AdminSettings.objects.get()
        self.assertEqual(settings_record.updated_by, self.admin_user)

    def test_admin_can_update_operating_calendar_but_not_document_defaults(self):
        response = self.client.put('/api/users/admin_settings/', {
            'businessDays': [1, 2, 3, 4, 5, 6],
            'businessOpenTime': '07:30',
            'businessCloseTime': '18:00',
            'maintenanceReminderDays': 10,
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['maintenanceReminderDays'], 10)

        forbidden = self.client.put('/api/users/admin_settings/', {
            'companyName': 'Unauthorized Change',
        }, format='json')
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_can_update_document_and_payment_defaults(self):
        superadmin = User.objects.create_user(
            username='settings_owner', password='Password123!', role='superadmin'
        )
        token = Token.objects.create(user=superadmin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        response = self.client.put('/api/users/admin_settings/', {
            'companyName': 'AFN Solar Power Engineering Services',
            'currencyCode': 'php',
            'quotationValidityDays': 45,
            'defaultWarrantyDays': 730,
            'externalPaymentNotice': 'Paid outside the system; confirm the amount before printing.',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['currencyCode'], 'PHP')
        self.assertEqual(response.data['quotationValidityDays'], 45)


class AdminTechnicianAccessTests(APITestCase):
    def setUp(self):
        self.operations_admin = User.objects.create_user(
            username='dispatch_operations_admin',
            email='dispatch_operations_admin@example.com',
            password='Password123!',
            role='admin'
        )
        self.superadmin = User.objects.create_user(
            username='dispatch_superadmin',
            email='dispatch_superadmin@example.com',
            password='Password123!',
            role='superadmin'
        )
        self.technician = User.objects.create_user(
            username='dispatch_tech',
            email='dispatch_tech@example.com',
            password='Password123!',
            role='technician',
            status='active',
            is_available=True
        )
        self.operations_admin_token = Token.objects.create(user=self.operations_admin)
        self.superadmin_token = Token.objects.create(user=self.superadmin)

    def test_admin_can_list_technicians_for_dispatch(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.operations_admin_token.key}')

        response = self.client.get('/api/admin/technicians/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(any(item['id'] == self.technician.id for item in response.data))

    def test_admin_cannot_create_technician(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.operations_admin_token.key}')

        response = self.client.post('/api/admin/technicians/', {
            'username': 'should_fail',
            'email': 'should_fail@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'role': 'technician'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class AdminUserManagementTests(APITestCase):
    def setUp(self):
        self.superadmin_user = User.objects.create_user(
            username='user_mgmt_owner',
            email='user_mgmt_owner@example.com',
            password='Password123!',
            role='superadmin'
        )
        token = Token.objects.create(user=self.superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def test_superadmin_can_create_internal_user_with_selected_role(self):
        response = self.client.post('/api/admin/users/', {
            'username': 'created_operations_admin',
            'email': 'created_operations_admin@example.com',
            'password': 'Password123!',
            'password_confirm': 'Password123!',
            'role': 'admin'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created_user = User.objects.get(username='created_operations_admin')
        self.assertEqual(created_user.role, 'admin')
        self.assertEqual(response.data['role'], 'admin')
        self.assertTrue(created_user.is_active)
        self.assertEqual(created_user.status, 'active')


class AdminAnalyticsTests(APITestCase):
    def setUp(self):
        self.admin_user = User.objects.create_user(
            username='analytics_admin',
            email='analytics_admin@example.com',
            password='Password123!',
            role='admin'
        )
        self.client_user = User.objects.create_user(
            username='analytics_client',
            email='analytics_client@example.com',
            password='Password123!',
            role='client'
        )
        self.technician_user = User.objects.create_user(
            username='analytics_tech',
            email='analytics_tech@example.com',
            password='Password123!',
            role='technician',
            status='active',
            is_available=True
        )

        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        self.solar = ServiceType.objects.create(
            name='Solar Installation',
            description='Solar setup',
            estimated_duration=120
        )
        self.cctv = ServiceType.objects.create(
            name='CCTV Service',
            description='Security setup',
            estimated_duration=90
        )
        TechnicianSkill.objects.create(
            technician=self.technician_user,
            service_type=self.solar,
            skill_level='expert'
        )

        self._create_request_with_ticket(
            service_type=self.solar,
            request_days_ago=2,
            completed_days_ago=1,
            status='Completed'
        )
        self._create_request_with_ticket(
            service_type=self.solar,
            request_days_ago=5,
            completed_days_ago=3,
            status='Completed'
        )
        self._create_request_with_ticket(
            service_type=self.solar,
            request_days_ago=9,
            status='Approved'
        )
        self._create_request_with_ticket(
            service_type=self.cctv,
            request_days_ago=4,
            status='Approved'
        )
        self._create_request_with_ticket(
            service_type=self.cctv,
            request_days_ago=45,
            completed_days_ago=44,
            status='Completed',
            city='Abuja',
            province='FCT'
        )

    def _create_request_with_ticket(
        self,
        service_type,
        request_days_ago,
        status='Approved',
        completed_days_ago=None,
        city='Lagos',
        province='Lagos',
        request_source='client_portal',
        request_priority='Normal',
        preferred_time_slot=None,
        ticket_priority='Normal',
        ticket_type='installation',
        scheduled_time_slot=None,
        reschedule_requested=False,
        warranty_status='not_applicable',
    ):
        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=service_type,
            description=f'{service_type.name} request',
            priority=request_priority,
            status=status
        )

        request_time = timezone.now() - timezone.timedelta(days=request_days_ago)
        ServiceRequest.objects.filter(pk=request_obj.pk).update(
            request_source=request_source,
            preferred_time_slot=preferred_time_slot,
            request_date=request_time,
            updated_at=request_time
        )
        request_obj.refresh_from_db()

        ServiceLocation.objects.create(
            request=request_obj,
            address=f'{service_type.name} Address',
            city=city,
            province=province,
            latitude=6.5 + (request_days_ago * 0.01),
            longitude=3.3 + (request_days_ago * 0.01)
        )

        ticket = ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            ticket_type=ticket_type,
            scheduled_date=request_time.date(),
            scheduled_time_slot=scheduled_time_slot,
            assigned_at=request_time + timezone.timedelta(hours=2),
            start_time=request_time + timezone.timedelta(hours=4),
            priority=ticket_priority,
            status='Completed' if completed_days_ago is not None else 'Not Started',
            reschedule_requested=reschedule_requested,
            warranty_status=warranty_status,
            completed_date=(
                timezone.now() - timezone.timedelta(days=completed_days_ago)
                if completed_days_ago is not None else None
            )
        )
        return ticket

    def test_admin_analytics_returns_predictive_metrics_from_live_data(self):
        self._create_request_with_ticket(
            service_type=self.solar,
            request_days_ago=1,
            status='Approved',
            request_source='phone',
            request_priority='Urgent',
            preferred_time_slot='morning',
            ticket_priority='High',
            ticket_type='inspection',
            scheduled_time_slot='afternoon',
            reschedule_requested=True,
            warranty_status='active',
        )

        response = self.client.get('/api/admin/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('overview', response.data)
        self.assertIn('predictiveSummary', response.data)
        self.assertIn('serviceForecasts', response.data)
        self.assertIn('busiestMonths', response.data)
        self.assertIn('busiestWeeks', response.data)
        self.assertIn('topRequestedServiceTypes', response.data)
        self.assertIn('cityCompletionTrends', response.data)
        self.assertIn('provinceCompletionTrends', response.data)
        self.assertIn('locationDemandForecast', response.data)
        self.assertIn('requestSourceBreakdown', response.data)
        self.assertIn('priorityDistribution', response.data)
        self.assertIn('ticketStatusBreakdown', response.data)
        self.assertIn('schedulingInsights', response.data)
        self.assertGreaterEqual(response.data['overview']['totalRequests'], 4)
        self.assertGreaterEqual(response.data['overview']['completedRequests'], 2)
        self.assertEqual(response.data['topTech']['techName'], self.technician_user.username)
        self.assertTrue(any(item['name'] == self.solar.name for item in response.data['jobCountByService']))
        self.assertGreaterEqual(response.data['predictiveSummary']['totalPredictedRequests'], 1)
        self.assertTrue(any(item['serviceType'] == self.solar.name for item in response.data['serviceForecasts']))
        self.assertGreaterEqual(len(response.data['busiestMonths']), 1)
        self.assertGreaterEqual(len(response.data['busiestWeeks']), 1)
        self.assertEqual(response.data['topRequestedServiceTypes'][0]['serviceType'], self.solar.name)
        self.assertTrue(any(item['city'] == 'Lagos' for item in response.data['cityCompletionTrends']))
        self.assertTrue(any(item['province'] == 'Lagos' for item in response.data['provinceCompletionTrends']))
        self.assertGreaterEqual(len(response.data['locationDemandForecast']['hotspots']), 1)
        self.assertEqual(response.data['locationDemandForecast']['hotspots'][0]['city'], 'Lagos')
        self.assertIn('projectedNext7Days', response.data['locationDemandForecast']['hotspots'][0])
        self.assertTrue(any(item['source'] == 'phone' for item in response.data['requestSourceBreakdown']))
        self.assertTrue(any(item['priority'] == 'Urgent' for item in response.data['priorityDistribution']['requests']))
        self.assertTrue(any(item['priority'] == 'High' for item in response.data['priorityDistribution']['tickets']))
        self.assertTrue(any(item['status'] == 'Not Started' for item in response.data['ticketStatusBreakdown']))
        self.assertTrue(any(item['value'] == 'morning' for item in response.data['schedulingInsights']['preferredRequestSlots']))
        self.assertTrue(any(item['value'] == 'afternoon' for item in response.data['schedulingInsights']['scheduledTicketSlots']))
        self.assertTrue(any(item['value'] == 'inspection' for item in response.data['schedulingInsights']['ticketTypes']))
        self.assertTrue(any(item['value'] == 'active' for item in response.data['schedulingInsights']['warrantyStatuses']))
        self.assertGreaterEqual(response.data['schedulingInsights']['rescheduleRequests']['count'], 1)

    @override_settings(GEMINI_API_KEY='')
    def test_admin_analytics_ai_summary_returns_local_fallback_without_api_key(self):
        response = self.client.get('/api/admin/analytics/ai-summary/?days=30')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['source'], 'local')
        self.assertFalse(response.data['configured'])
        self.assertIn('summary', response.data)
        self.assertIn('analytics', response.data)
        self.assertIn('overview', response.data['analytics'])
        self.assertIn('forecast', response.data['analytics'])

    @override_settings(GEMINI_API_KEY='')
    def test_admin_analytics_ai_summary_includes_issued_inventory_demand(self):
        category = InventoryCategory.objects.create(name='Solar Parts')
        item = InventoryItem.objects.create(
            name='Solar Cable',
            sku='SOL-CABLE-001',
            category=category,
            item_type='part',
            quantity=20,
            minimum_stock=5,
        )
        ticket = ServiceTicket.objects.filter(request__service_type=self.solar).first()
        InventoryTransaction.objects.create(
            item=item,
            transaction_type='issue',
            quantity=3,
            technician=self.technician_user,
            service_ticket=ticket,
            performed_by=self.admin_user,
        )

        response = self.client.get('/api/admin/analytics/ai-summary/?days=30')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        inventory_demand = response.data['analytics']['inventoryDemand']
        self.assertEqual(inventory_demand['totalTransactions'], 1, inventory_demand)
        self.assertEqual(inventory_demand['totalQuantityConsumed'], 3)
        self.assertEqual(inventory_demand['topItems'][0]['item'], 'Solar Cable')
        self.assertEqual(inventory_demand['topCategories'][0]['category'], 'Solar Parts')

    def test_admin_analytics_period_changes_overview_and_service_counts(self):
        weekly_response = self.client.get('/api/admin/analytics/?days=7')
        yearly_response = self.client.get('/api/admin/analytics/?days=365')

        self.assertEqual(weekly_response.status_code, status.HTTP_200_OK)
        self.assertEqual(yearly_response.status_code, status.HTTP_200_OK)
        self.assertEqual(weekly_response.data['analyticsPeriodDays'], 7)
        self.assertEqual(yearly_response.data['analyticsPeriodDays'], 365)
        self.assertEqual(weekly_response.data['overview']['totalRequests'], 3)
        self.assertEqual(weekly_response.data['overview']['completedRequests'], 2)
        self.assertEqual(yearly_response.data['overview']['totalRequests'], 5)
        self.assertEqual(yearly_response.data['overview']['completedRequests'], 3)

        weekly_services = {
            item['serviceType']: item['requestCount']
            for item in weekly_response.data['topRequestedServiceTypes']
        }
        yearly_services = {
            item['serviceType']: item['requestCount']
            for item in yearly_response.data['topRequestedServiceTypes']
        }

        self.assertEqual(weekly_services[self.solar.name], 2)
        self.assertEqual(weekly_services[self.cctv.name], 1)
        self.assertEqual(yearly_services[self.solar.name], 3)
        self.assertEqual(yearly_services[self.cctv.name], 2)

    def test_admin_analytics_avg_completion_time_respects_selected_period(self):
        weekly_response = self.client.get('/api/admin/analytics/?days=7')
        yearly_response = self.client.get('/api/admin/analytics/?days=365')

        self.assertEqual(weekly_response.status_code, status.HTTP_200_OK)
        self.assertEqual(yearly_response.status_code, status.HTTP_200_OK)
        self.assertEqual(weekly_response.data['overview']['avgCompletionTimeHours'], 32.0)
        self.assertEqual(yearly_response.data['overview']['avgCompletionTimeHours'], 28.0)

    def test_admin_analytics_counts_only_available_technicians_in_overview(self):
        User.objects.create_user(
            username='offline_analytics_tech',
            email='offline_analytics_tech@example.com',
            password='Password123!',
            role='technician',
            status='active',
            is_available=False,
        )

        response = self.client.get('/api/admin/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['overview']['activeTechnicians'], 1)
        self.assertEqual(response.data['overview']['availableTechnicians'], 1)
        self.assertEqual(response.data['overview']['activeTechnicianAccounts'], 2)

    def test_admin_analytics_monthly_trend_buckets_completions_by_completion_month(self):
        fixed_now = timezone.make_aware(datetime(2026, 4, 25, 12, 0, 0))

        with patch('users.views.timezone.now', return_value=fixed_now):
            base_response = self.client.get('/api/admin/analytics/')

        base_trend = {
            item['monthStart']: item
            for item in base_response.data['monthlyServiceTrend']
        }

        request_time = timezone.make_aware(datetime(2026, 3, 28, 9, 0, 0))
        completion_time = timezone.make_aware(datetime(2026, 4, 4, 15, 0, 0))

        request_obj = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.cctv,
            description='Cross-month completion request',
            priority='Normal',
            status='Completed',
        )
        ServiceRequest.objects.filter(pk=request_obj.pk).update(
            request_date=request_time,
            updated_at=completion_time,
        )

        ServiceLocation.objects.create(
            request=request_obj,
            address='Cross Month Address',
            city='Lagos',
            province='Lagos',
            latitude=6.75,
            longitude=3.45,
        )

        ServiceTicket.objects.create(
            request=request_obj,
            technician=self.technician_user,
            scheduled_date=request_time.date(),
            assigned_at=request_time + timezone.timedelta(hours=2),
            start_time=completion_time - timezone.timedelta(hours=2),
            status='Completed',
            completed_date=completion_time,
        )

        with patch('users.views.timezone.now', return_value=fixed_now):
            response = self.client.get('/api/admin/analytics/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        request_month = request_time.date().replace(day=1).isoformat()
        completion_month = completion_time.date().replace(day=1).isoformat()
        updated_trend = {
            item['monthStart']: item
            for item in response.data['monthlyServiceTrend']
        }

        self.assertEqual(
            updated_trend[request_month]['requestCount'],
            base_trend[request_month]['requestCount'] + 1,
        )
        self.assertEqual(
            updated_trend[completion_month]['completedCount'],
            base_trend[completion_month]['completedCount'] + 1,
        )
        self.assertEqual(
            updated_trend[request_month]['completedCount'],
            base_trend[request_month]['completedCount'],
        )


class CapabilityGrantApiTests(APITestCase):
    def setUp(self):
        self.superadmin_user = User.objects.create_user(
            username='cap_superadmin',
            email='cap_superadmin@example.com',
            password='Password123!',
            role='superadmin'
        )
        self.admin_user = User.objects.create_user(
            username='cap_admin',
            email='cap_admin@example.com',
            password='Password123!',
            role='admin'
        )
        self.technician_user = User.objects.create_user(
            username='cap_technician',
            email='cap_technician@example.com',
            password='Password123!',
            role='technician'
        )
        self.other_admin = User.objects.create_user(
            username='cap_admin_peer',
            email='cap_admin_peer@example.com',
            password='Password123!',
            role='admin'
        )
        self.client_user = User.objects.create_user(
            username='cap_client',
            email='cap_client@example.com',
            password='Password123!',
            role='client'
        )

    def test_superadmin_can_grant_direct_capabilities_to_staff(self):
        token = Token.objects.create(user=self.superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.put(
            f'/api/users/{self.technician_user.id}/capabilities/',
            {
                'capabilities': [
                    TECHNICIAN_DASHBOARD_VIEW,
                    TECHNICIAN_JOBS_VIEW,
                ]
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(UserCapabilityGrant.objects.filter(user=self.technician_user).values_list('capability_code', flat=True)),
            {TECHNICIAN_DASHBOARD_VIEW, TECHNICIAN_JOBS_VIEW}
        )
        self.assertIn(TECHNICIAN_DASHBOARD_VIEW, response.data['effective_capabilities'])

    def test_admin_cannot_grant_staff_capabilities(self):
        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.put(
            f'/api/users/{self.technician_user.id}/capabilities/',
            {
                'capabilities': [
                    TECHNICIAN_PROFILE_VIEW,
                ]
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(UserCapabilityGrant.objects.filter(user=self.technician_user).exists())

    def test_admin_cannot_manage_admin_capabilities(self):
        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get(f'/api/users/{self.other_admin.id}/capabilities/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_me_endpoint_includes_effective_capabilities(self):
        UserCapabilityGrant.objects.create(
            user=self.technician_user,
            capability_code=AFTER_SALES_CASES_VIEW,
            granted_by=self.admin_user,
        )
        token = Token.objects.create(user=self.technician_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get('/api/users/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(AFTER_SALES_CASES_VIEW, response.data['capabilities'])

    def test_available_capabilities_are_scoped_to_the_target_staff_role(self):
        token = Token.objects.create(user=self.superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get(f'/api/users/{self.technician_user.id}/capabilities/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        available_codes = {item['code'] for item in response.data['available_capabilities']}
        self.assertIn(TECHNICIAN_DASHBOARD_VIEW, available_codes)
        self.assertIn(TECHNICIAN_JOBS_VIEW, available_codes)
        self.assertIn(TECHNICIAN_PROFILE_VIEW, available_codes)
        self.assertNotIn(AFTER_SALES_DASHBOARD_VIEW, available_codes)
        self.assertNotIn(MANAGE_STAFF_CAPABILITIES, available_codes)

    def test_direct_staff_capabilities_replace_default_staff_navigation(self):
        UserCapabilityGrant.objects.create(
            user=self.technician_user,
            capability_code=TECHNICIAN_PROFILE_VIEW,
            granted_by=self.admin_user,
        )
        token = Token.objects.create(user=self.technician_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get('/api/users/me/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(TECHNICIAN_DASHBOARD_VIEW, response.data['capabilities'])
        self.assertNotIn(TECHNICIAN_JOBS_VIEW, response.data['capabilities'])
        self.assertIn(TECHNICIAN_PROFILE_VIEW, response.data['capabilities'])

    def test_admin_cannot_manage_client_capabilities(self):
        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get(f'/api/users/{self.client_user.id}/capabilities/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_without_directory_capability_cannot_list_users(self):
        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get('/api/users/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_superadmin_can_grant_directory_capability_to_admin(self):
        token = Token.objects.create(user=self.superadmin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.put(
            f'/api/users/{self.admin_user.id}/capabilities/',
            {
                'capabilities': [
                    USER_DIRECTORY_VIEW,
                ]
            },
            format='json'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            UserCapabilityGrant.objects.filter(
                user=self.admin_user,
                capability_code=USER_DIRECTORY_VIEW,
                granted_by=self.superadmin_user,
            ).exists()
        )
        self.assertIn(USER_DIRECTORY_VIEW, response.data['effective_capabilities'])

    def test_admin_with_directory_capability_can_list_all_users(self):
        UserCapabilityGrant.objects.create(
            user=self.admin_user,
            capability_code=USER_DIRECTORY_VIEW,
            granted_by=self.superadmin_user,
        )
        token = Token.objects.create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get('/api/users/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        usernames = {item['username'] for item in response.data}
        self.assertIn(self.admin_user.username, usernames)
        self.assertIn(self.technician_user.username, usernames)
        self.assertIn(self.client_user.username, usernames)


class AdminActivityLogTests(APITestCase):
    def setUp(self):
        self.superadmin_user = User.objects.create_user(
            username='activity_owner',
            password='Password123!',
            role='superadmin',
        )
        self.client_user = User.objects.create_user(
            username='activity_client',
            password='Password123!',
            role='client',
        )
        self.technician_user = User.objects.create_user(
            username='activity_tech',
            password='Password123!',
            role='technician',
        )
        self.service_type = ServiceType.objects.create(
            name='Activity Service',
            description='Initial description',
            estimated_duration=60,
        )

    def authenticate(self, user):
        token = Token.objects.create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

    def results(self, response):
        return response.data.get('results', response.data)

    def test_token_actor_is_recorded_for_service_changes(self):
        self.authenticate(self.superadmin_user)

        response = self.client.put(
            f'/api/admin/services/{self.service_type.id}/',
            {
                'name': 'Activity Service Updated',
                'description': 'Updated description',
                'estimated_duration': 90,
                'estimated_cost': 250,
                'max_daily_assignments': 3,
                'procedures': [],
                'required_equipment': [],
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log = ChangeLog.objects.filter(
            content_type__model='servicetype',
            object_id=self.service_type.id,
            field_name='estimated_duration',
        ).latest('changed_at')
        self.assertEqual(log.changed_by, self.superadmin_user)
        self.assertEqual(log.old_value, '60')
        self.assertEqual(log.new_value, '90')

    def test_admin_can_filter_activity_logs_by_model_and_action(self):
        self.authenticate(self.superadmin_user)
        self.service_type.estimated_duration = 75
        self.service_type.save(update_fields=['estimated_duration'])

        response = self.client.get('/api/admin/activity-logs/', {
            'model': 'servicetype',
            'action': 'update',
            'search': 'estimated_duration',
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.results(response)
        self.assertTrue(rows)
        self.assertTrue(all(row['model'] == 'servicetype' for row in rows))
        self.assertTrue(all(row['action'] == 'update' for row in rows))

    def test_cancelled_service_request_is_recorded_as_cancel_activity(self):
        self.authenticate(self.superadmin_user)
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Cancel this request',
            status='Pending',
        )
        ActivityLog.objects.all().delete()

        response = self.client.post(f'/api/services/service-requests/{service_request.id}/cancel/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        log = ActivityLog.objects.filter(
            target_model='servicerequest',
            target_id=service_request.id,
        ).latest('created_at')
        self.assertEqual(log.action, 'cancel')
        self.assertIn('cancelled', log.message.lower())
        self.assertEqual(log.metadata['field_name'], 'status')
        self.assertEqual(log.metadata['new_value'], 'Cancelled')

    def test_technician_location_updates_do_not_create_general_activity_logs(self):
        ActivityLog.objects.all().delete()
        self.authenticate(self.technician_user)

        response = self.client.post('/api/services/technician/location/', {
            'latitude': '13.928306',
            'longitude': '121.617500',
            'accuracy': 15,
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(
            ActivityLog.objects.filter(
                target_model='technicianprofile',
                metadata__field_name__in=['current_latitude', 'current_longitude', 'last_location_update'],
            ).exists()
        )

    def test_service_ticket_activity_log_includes_service_context(self):
        self.authenticate(self.superadmin_user)
        service_request = ServiceRequest.objects.create(
            client=self.client_user,
            service_type=self.service_type,
            description='Panel needs maintenance',
            status='Approved',
        )
        ticket = ServiceTicket.objects.create(
            request=service_request,
            technician=self.technician_user,
            assigned_admin=self.superadmin_user,
            scheduled_date=timezone.localdate(),
            status='Completed',
            completion_notes='Panel cleaned and tested.',
            client_rating=5,
            client_feedback='Fast and clear service.',
        )
        log = ActivityLog.objects.create(
            actor=self.superadmin_user,
            actor_role='superadmin',
            category='tickets',
            action='complete',
            target_app_label='services',
            target_model='serviceticket',
            target_id=ticket.id,
            target_label=str(ticket),
            message='Ticket was completed',
        )

        response = self.client.get('/api/admin/activity-logs/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.results(response)
        row = next(item for item in rows if item['id'] == log.id)
        context = row['service_context']
        self.assertEqual(context['service_type'], self.service_type.name)
        self.assertEqual(context['service_provider'], self.technician_user.username)
        self.assertEqual(context['outcome'], 'Completed')
        self.assertEqual(context['resolution'], 'Panel cleaned and tested.')
        self.assertIn('Rating: 5/5', context['feedback'])
        self.assertIn('Fast and clear service.', context['feedback'])

    def test_client_cannot_view_activity_logs(self):
        self.authenticate(self.client_user)

        response = self.client.get('/api/admin/activity-logs/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_audit_taxonomy_covers_sla_admin_settings_and_documents(self):
        from users.signals import set_current_user
        from services.models import SLARule, ServiceTicket, QuotationRecord, InstallationContract

        set_current_user(self.superadmin_user)
        try:
            # 1. AdminSettings check
            settings_obj = AdminSettings.objects.create(system_name="Initial Name", enable_notifications=True)
            settings_obj.enable_notifications = False
            settings_obj.save(update_fields=['enable_notifications'])

            settings_changelog = ChangeLog.objects.filter(
                content_type__model='adminsettings',
                object_id=settings_obj.pk,
                field_name='enable_notifications',
            ).latest('changed_at')
            self.assertEqual(settings_changelog.old_value, 'True')
            self.assertEqual(settings_changelog.new_value, 'False')

            settings_activity = ActivityLog.objects.filter(
                target_model='adminsettings',
                target_id=settings_obj.pk,
            ).latest('created_at')
            self.assertEqual(settings_activity.category, 'settings')
            self.assertEqual((settings_activity.metadata or {}).get('field_name'), 'enable_notifications')
            self.assertIn('enable notifications', settings_activity.message.lower())

            # 2. SLARule check
            sla_rule, _ = SLARule.objects.get_or_create(key='approval_delay', defaults={'warning_minutes': 30, 'overdue_minutes': 60})
            old_warning = sla_rule.warning_minutes
            new_warning = 99 if old_warning != 99 else 88
            sla_rule.warning_minutes = new_warning
            sla_rule.save(update_fields=['warning_minutes'])

            sla_changelog = ChangeLog.objects.filter(
                content_type__model='slarule',
                object_id=sla_rule.pk,
                field_name='warning_minutes',
            ).latest('changed_at')
            self.assertEqual(sla_changelog.old_value, str(old_warning))
            self.assertEqual(sla_changelog.new_value, str(new_warning))

            sla_activity = ActivityLog.objects.filter(
                target_model='slarule',
                target_id=sla_rule.pk,
            ).latest('created_at')
            self.assertEqual(sla_activity.category, 'sla')
            self.assertEqual((sla_activity.metadata or {}).get('field_name'), 'warning_minutes')

            # 3. QuotationRecord check
            request = ServiceRequest.objects.create(client=self.client_user, service_type=self.service_type, description='Test audit request')
            ticket = ServiceTicket.objects.create(request=request, scheduled_date=timezone.localdate())
            quotation = QuotationRecord.objects.create(ticket=ticket, client=self.client_user, status='Draft')
            quotation.status = 'Sent'
            quotation.save(update_fields=['status'])

            quotation_changelog = ChangeLog.objects.filter(
                content_type__model='quotationrecord',
                object_id=quotation.pk,
                field_name='status',
            ).latest('changed_at')
            self.assertEqual(quotation_changelog.new_value, 'Sent')

            # 4. InstallationContract check
            contract = InstallationContract.objects.create(ticket=ticket, status='draft')
            contract.status = 'finalized'
            contract.save(update_fields=['status'])

            contract_changelog = ChangeLog.objects.filter(
                content_type__model='installationcontract',
                object_id=contract.pk,
                field_name='status',
            ).latest('changed_at')
            self.assertEqual(contract_changelog.new_value, 'finalized')
        finally:
            set_current_user(None)
