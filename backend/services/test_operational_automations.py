from io import StringIO
from unittest.mock import patch

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase


class OperationalAutomationCommandTests(SimpleTestCase):
    @patch('services.management.commands.run_operational_automations.call_command')
    def test_frequent_mode_runs_sla_and_auto_dispatch(self, mock_call_command):
        call_command('run_operational_automations', mode='frequent', stdout=StringIO())

        self.assertEqual(
            [item.args[0] for item in mock_call_command.call_args_list],
            ['check_sla_violations', 'auto_assign_tickets'],
        )

    @patch('services.management.commands.run_operational_automations.call_command')
    def test_daily_mode_runs_maintenance_and_analytics(self, mock_call_command):
        call_command('run_operational_automations', mode='daily', stdout=StringIO())

        self.assertEqual(
            [item.args[0] for item in mock_call_command.call_args_list],
            [
                'send_maintenance_alerts',
                'generate_daily_analytics',
                'generate_technician_performance',
                'purge_technician_locations',
                'generate_demand_forecasts',
            ],
        )

    @patch('services.management.commands.run_operational_automations.call_command')
    def test_failure_stops_the_run_and_returns_nonzero_error(self, mock_call_command):
        mock_call_command.side_effect = RuntimeError('scheduler failure')

        with self.assertRaisesMessage(CommandError, 'SLA checks'):
            call_command('run_operational_automations', mode='all', stdout=StringIO())

        self.assertEqual(mock_call_command.call_count, 1)
