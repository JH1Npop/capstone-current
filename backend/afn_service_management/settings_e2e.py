"""Isolated settings for local and CI browser automation only."""

from .settings import *  # noqa: F401,F403


PASSWORD_HASHERS = [
    'afn_service_management.hashers.FastTestPBKDF2PasswordHasher',
]

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

