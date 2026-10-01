from django.http import HttpResponse
from django.test import RequestFactory, TestCase

from users.admin import RoleScopedAdminAuthenticationForm
from users.middleware import RoleScopedDjangoAdminMiddleware
from users.models import User


class DjangoAdminRoleBoundaryTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.middleware = RoleScopedDjangoAdminMiddleware(lambda request: HttpResponse('allowed'))

    def admin_response_for(self, user=None):
        request = self.factory.get('/django-admin/')
        if user is not None:
            request.user = user
        return self.middleware(request)

    def test_client_role_is_blocked_even_with_superuser_flags(self):
        user = User.objects.create_user(
            username='flagged-client',
            password='pass',
            role='client',
            is_staff=True,
            is_superuser=True,
        )
        response = self.admin_response_for(user)

        self.assertEqual(response.status_code, 403)

    def test_technician_role_is_blocked_even_with_staff_flag(self):
        user = User.objects.create_user(
            username='flagged-technician',
            password='pass',
            role='technician',
            is_staff=True,
        )
        response = self.admin_response_for(user)

        self.assertEqual(response.status_code, 403)

    def test_admin_and_superadmin_roles_can_reach_django_admin_when_staff(self):
        for role in ('admin', 'superadmin'):
            with self.subTest(role=role):
                user = User.objects.create_user(
                    username=f'{role}-admin-site',
                    password='pass',
                    role=role,
                    is_staff=True,
                    is_superuser=role == 'superadmin',
                )
                response = self.admin_response_for(user)
                self.assertEqual(response.status_code, 200)

    def test_request_without_an_authenticated_user_is_not_blocked(self):
        response = self.admin_response_for()

        self.assertEqual(response.status_code, 200)

    def test_admin_login_form_rejects_flagged_non_admin_role(self):
        User.objects.create_user(
            username='flagged-login-client',
            password='pass',
            role='client',
            is_staff=True,
            is_superuser=True,
        )

        form = RoleScopedAdminAuthenticationForm(
            request=None,
            data={'username': 'flagged-login-client', 'password': 'pass'},
        )

        self.assertFalse(form.is_valid())
        self.assertIn('username and password', form.non_field_errors()[0])

    def test_admin_login_form_accepts_admin_role_with_staff_flag(self):
        User.objects.create_user(
            username='allowed-admin-login',
            password='pass',
            role='admin',
            is_staff=True,
        )

        form = RoleScopedAdminAuthenticationForm(
            request=None,
            data={'username': 'allowed-admin-login', 'password': 'pass'},
        )

        self.assertTrue(form.is_valid(), form.errors)
