import time

from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from users.mfa import TOTP_PERIOD_SECONDS, _totp_at
from users.models import User


class AdministratorMfaTests(APITestCase):
    password = 'Correct-Horse-77!'

    def setUp(self):
        self.admin = User.objects.create_user(
            username='mfa-admin',
            email='mfa-admin@example.com',
            password=self.password,
            role='admin',
            email_verified=True,
        )
        self.client.force_authenticate(self.admin)

    @staticmethod
    def current_code(secret):
        return _totp_at(secret, int(time.time()) // TOTP_PERIOD_SECONDS)

    def enroll(self):
        setup = self.client.post(
            '/api/users/mfa_setup/',
            {'current_password': self.password},
            format='json',
        )
        self.assertEqual(setup.status_code, status.HTTP_200_OK, setup.data)
        confirm = self.client.post(
            '/api/users/mfa_confirm/',
            {
                'current_password': self.password,
                'setup_token': setup.data['setup_token'],
                'code': self.current_code(setup.data['secret']),
            },
            format='json',
        )
        self.assertEqual(confirm.status_code, status.HTTP_200_OK, confirm.data)
        self.admin.refresh_from_db()
        return setup.data, confirm.data

    def test_enrollment_encrypts_secret_and_returns_recovery_codes_once(self):
        setup, confirm = self.enroll()

        self.assertTrue(self.admin.mfa_enabled)
        self.assertNotEqual(self.admin.mfa_secret_encrypted, setup['secret'])
        self.assertNotIn(setup['secret'], self.admin.mfa_secret_encrypted)
        self.assertEqual(len(confirm['recovery_codes']), 10)
        self.assertEqual(len(self.admin.mfa_recovery_code_hashes), 10)
        self.assertNotEqual(self.admin.mfa_recovery_code_hashes[0], confirm['recovery_codes'][0])

        status_response = self.client.get('/api/users/mfa_status/')
        self.assertNotIn('secret', status_response.data)
        self.assertNotIn('recovery_codes', status_response.data)

    def test_login_does_not_issue_token_before_valid_second_factor(self):
        setup, _ = self.enroll()
        self.client.force_authenticate(user=None)
        Token.objects.filter(user=self.admin).delete()

        password_only = self.client.post(
            '/api/users/login/',
            {'username': self.admin.username, 'password': self.password},
            format='json',
        )
        self.assertEqual(password_only.status_code, status.HTTP_202_ACCEPTED)
        self.assertTrue(password_only.data['mfa_required'])
        self.assertFalse(Token.objects.filter(user=self.admin).exists())

        invalid = self.client.post(
            '/api/users/login/',
            {'username': self.admin.username, 'password': self.password, 'mfa_code': '000000'},
            format='json',
        )
        self.assertEqual(invalid.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertFalse(Token.objects.filter(user=self.admin).exists())

        valid = self.client.post(
            '/api/users/login/',
            {
                'username': self.admin.username,
                'password': self.password,
                'mfa_code': self.current_code(setup['secret']),
            },
            format='json',
        )
        self.assertEqual(valid.status_code, status.HTTP_200_OK, valid.data)
        self.assertTrue(valid.data['token'])

    def test_recovery_code_is_single_use(self):
        _, confirm = self.enroll()
        recovery_code = confirm['recovery_codes'][0]
        self.client.force_authenticate(user=None)

        first = self.client.post(
            '/api/users/login/',
            {'username': self.admin.username, 'password': self.password, 'mfa_code': recovery_code},
            format='json',
        )
        self.assertEqual(first.status_code, status.HTTP_200_OK, first.data)
        Token.objects.filter(user=self.admin).delete()

        second = self.client.post(
            '/api/users/login/',
            {'username': self.admin.username, 'password': self.password, 'mfa_code': recovery_code},
            format='json',
        )
        self.assertEqual(second.status_code, status.HTTP_401_UNAUTHORIZED)
        self.admin.refresh_from_db()
        self.assertEqual(len(self.admin.mfa_recovery_code_hashes), 9)

    def test_disable_requires_password_and_second_factor_and_revokes_tokens(self):
        setup, _ = self.enroll()
        Token.objects.create(user=self.admin)

        response = self.client.post(
            '/api/users/mfa_disable/',
            {'current_password': self.password, 'code': self.current_code(setup['secret'])},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.mfa_enabled)
        self.assertEqual(self.admin.mfa_secret_encrypted, '')
        self.assertEqual(self.admin.mfa_recovery_code_hashes, [])
        self.assertFalse(Token.objects.filter(user=self.admin).exists())

    def test_non_admin_cannot_enroll(self):
        client_user = User.objects.create_user(
            username='mfa-client',
            password=self.password,
            role='client',
            email_verified=True,
        )
        self.client.force_authenticate(client_user)

        response = self.client.post(
            '/api/users/mfa_setup/',
            {'current_password': self.password},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
