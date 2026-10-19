"""Isolated settings for local and CI browser automation only."""

import tempfile
from pathlib import Path

from .settings import *  # noqa: F401,F403


# Browser tests must never read or mutate the developer's SQLite database.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.e2e.sqlite3',
        # IMMEDIATE takes the write lock when a transaction begins, so concurrent writers wait for the
        # timeout instead of failing at once with "database is locked" on a read-to-write upgrade.
        'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE'},
    },
}

PASSWORD_HASHERS = [
    'afn_service_management.hashers.FastTestPBKDF2PasswordHasher',
]

EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'

# Browser automation must remain self-contained even when the developer has
# valid Cloudinary credentials in their local environment.
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}
MEDIA_ROOT = Path(tempfile.gettempdir()) / 'afn-service-management-e2e-media'

# Likewise, never call the live routing providers from browser tests: a slow or rate-limited
# provider would stall navigation, and real API keys must not be spent by automation.
DISABLE_EXTERNAL_ROUTING = True
