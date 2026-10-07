from io import StringIO
from unittest.mock import patch

from django.conf import settings
from django.core.management import call_command
from django.test import SimpleTestCase


class ShowEnvironmentCommandTests(SimpleTestCase):
    def run_command(self):
        output = StringIO()
        call_command('show_environment', stdout=output)
        return output.getvalue()

    def test_reports_safe_local_sqlite_target(self):
        with patch.multiple(settings, DEPLOYMENT_STAGE='development', ENVIRONMENT='development'):
            with patch.dict(settings.DATABASES['default'], {
                'ENGINE': 'django.db.backends.sqlite3',
                'NAME': settings.BASE_DIR / 'db.sqlite3',
            }, clear=True):
                output = self.run_command()

        self.assertIn('Database engine: SQLite', output)
        self.assertIn('Database target: local', output)
        self.assertIn('Safe local-development target confirmed.', output)
        self.assertNotIn('PASSWORD', output)

    def test_reports_staging_postgres_without_password(self):
        with patch.multiple(settings, DEPLOYMENT_STAGE='staging', ENVIRONMENT='production'):
            with patch.dict(settings.DATABASES['default'], {
                'ENGINE': 'django.db.backends.postgresql',
                'HOST': 'staging.example.invalid',
                'NAME': 'stagingdb',
                'PASSWORD': 'must-not-appear',
            }, clear=True):
                output = self.run_command()

        self.assertIn('Database engine: PostgreSQL', output)
        self.assertIn('host=staging.example.invalid, name=stagingdb', output)
        self.assertIn('Staging PostgreSQL target confirmed.', output)
        self.assertNotIn('must-not-appear', output)
