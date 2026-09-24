"""Isolated settings for local and CI browser automation only."""

import tempfile
from pathlib import Path

from .settings import *  # noqa: F401,F403


# Browser tests must never read or mutate the developer's SQLite database.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.e2e.sqlite3',
        'OPTIONS': {'timeout': 20},
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
