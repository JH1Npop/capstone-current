"""
Middleware to inject the current request user into thread-local storage.
This allows the ChangeLog signals to know WHO made each change.
"""

from users.signals import set_current_request_meta, set_current_user


class ChangeLogUserMiddleware:
    """
    Sets the current request user in thread-local storage so that
    ChangeLog signals can automatically record who made each change.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        current_user = getattr(request, 'user', None)
        if current_user and current_user.is_authenticated:
            set_current_user(current_user)
        else:
            set_current_user(self._get_token_user(request))
        set_current_request_meta(request)

        try:
            return self.get_response(request)
        finally:
            # Clear after response to avoid leaking between requests, even on errors.
            set_current_user(None)
            set_current_request_meta(None)

    def _get_token_user(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Token '):
            return None

        token_key = auth_header.split(' ', 1)[1].strip()
        if not token_key:
            return None

        try:
            from rest_framework.authtoken.models import Token

            user = Token.objects.select_related('user').get(key=token_key).user
            if not user.is_active or getattr(user, 'status', None) != 'active':
                return None
            return user
        except Exception:
            return None
