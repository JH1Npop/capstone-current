from channels.db import database_sync_to_async


@database_sync_to_async
def _get_user_for_token(token_key):
    from django.contrib.auth.models import AnonymousUser
    from rest_framework.authtoken.models import Token

    if not token_key:
        return AnonymousUser()

    try:
        user = Token.objects.select_related('user').get(key=token_key).user
        if not user.is_active or getattr(user, 'status', None) != 'active':
            return AnonymousUser()
        return user
    except Token.DoesNotExist:
        return AnonymousUser()


class TokenAuthMiddleware:
    """Authenticate Channels websocket connections with DRF token auth."""

    def __init__(self, inner):
        self.inner = inner

    async def __call__(self, scope, receive, send):
        if not scope.get('user') or scope['user'].is_anonymous:
            token_key = None
            for header_name, header_value in scope.get('headers', []):
                if header_name == b'authorization':
                    auth_header = header_value.decode()
                    auth_type, _, auth_token = auth_header.partition(' ')
                    if auth_type.lower() == 'token':
                        token_key = auth_token.strip()
                    break

            scope['user'] = await _get_user_for_token(token_key)

        return await self.inner(scope, receive, send)


def TokenAuthMiddlewareStack(inner):
    return TokenAuthMiddleware(inner)
