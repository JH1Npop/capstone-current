import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from afn_service_management import settings as project_settings
from afn_service_management.settings import build_postgres_config_from_url


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


class HostedDatabaseConnectionTests(SimpleTestCase):
    def test_postgres_connections_are_nonpersistent_and_health_checked_by_default(self):
        with patch.dict(os.environ, {}, clear=True):
            config = build_postgres_config_from_url(REMOTE_DATABASE_URL)

        self.assertEqual(config['CONN_MAX_AGE'], 0)
        self.assertIs(config['CONN_HEALTH_CHECKS'], True)

    def test_postgres_connection_policy_accepts_explicit_overrides(self):
        with patch.dict(
            os.environ,
            {'DB_CONN_MAX_AGE': '30', 'DB_CONN_HEALTH_CHECKS': 'False'},
            clear=True,
        ):
            config = build_postgres_config_from_url(REMOTE_DATABASE_URL)

        self.assertEqual(config['CONN_MAX_AGE'], 30)
        self.assertIs(config['CONN_HEALTH_CHECKS'], False)


class StagingRegistrationSafetyTests(SimpleTestCase):
    def test_auto_verification_is_rejected_outside_staging(self):
        with patch.multiple(
            project_settings,
            IS_PRODUCTION=True,
            IS_TEST=False,
            DEPLOYMENT_STAGE='production',
            STAGING_AUTO_VERIFY_REGISTRATIONS=True,
        ):
            with self.assertRaisesRegex(
                ImproperlyConfigured,
                'STAGING_AUTO_VERIFY_REGISTRATIONS is allowed only when DEPLOYMENT_STAGE=staging',
            ):
                project_settings.validate_production_settings()
