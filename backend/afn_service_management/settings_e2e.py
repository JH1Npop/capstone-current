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

# Pages fire many API calls at once (React development mode runs each load twice), and Django's
# development server keeps only 10 waiting connections. On Windows the 11th is refused outright,
# so a busy page showed "The server encountered an error" at random. Production runs Daphne and is
# not affected; this raises the queue for the browser-test server only.
from django.core.servers import basehttp as _basehttp  # noqa: E402

_basehttp.WSGIServer.request_queue_size = 128

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

# Browser journeys create many requests for the one seeded client account; the real limit
# (5 per client per hour) stays in force in development, staging, and production.
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    **REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
    'service_request_create': '1000/hour',
}
