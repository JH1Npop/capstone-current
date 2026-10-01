import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase


BACKEND_DIR = Path(__file__).resolve().parents[1]
REMOTE_DATABASE_URL = 'postgresql://example:example@remote.example.invalid:5432/example'


class DevelopmentDatabaseSafetyTests(SimpleTestCase):
    def import_settings(self, *, allow_remote=None):
        environment = os.environ.copy()
        environment.update(
            {
                'DJANGO_ENV': 'development',
                'DEPLOYMENT_STAGE': 'development',
                'DEBUG': 'True',
                'DATABASE_URL': REMOTE_DATABASE_URL,
            }
        )
        if allow_remote is None:
            environment.pop('ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT', None)
        else:
            environment['ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT'] = allow_remote

        return subprocess.run(
            [sys.executable, '-c', 'import afn_service_management.settings'],
            cwd=BACKEND_DIR,
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_remote_database_url_is_blocked_by_default_in_development(self):
        result = self.import_settings()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn('DATABASE_URL is blocked outside production', result.stderr)

    def test_remote_database_url_requires_explicit_development_override(self):
        result = self.import_settings(allow_remote='True')

        self.assertEqual(result.returncode, 0, result.stderr)
