from django.core.management import CommandError, call_command
from django.test import SimpleTestCase


class StagingDependencyCommandSafetyTests(SimpleTestCase):
    def test_command_refuses_to_run_without_explicit_confirmation(self):
        with self.assertRaisesMessage(CommandError, 'without --confirm-staging'):
            call_command('verify_staging_dependencies')

    def test_command_refuses_non_staging_environment(self):
        with self.settings(DEPLOYMENT_STAGE='development', IS_PRODUCTION=True):
            with self.assertRaisesMessage(CommandError, 'DEPLOYMENT_STAGE must be staging'):
                call_command('verify_staging_dependencies', confirm_staging=True)
