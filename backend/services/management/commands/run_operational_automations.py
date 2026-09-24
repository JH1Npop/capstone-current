"""Run the service-management automations on a deployment-friendly schedule."""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'Run operational automations. Use frequent every 30 minutes and daily '
        'once per day; all is intended for manual verification.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--mode',
            choices=('frequent', 'daily', 'all'),
            default='all',
            help='Automation group to run (default: all).',
        )

    def handle(self, *args, **options):
        mode = options['mode']
        commands = []
        if mode in ('frequent', 'all'):
            commands.extend((
                ('SLA checks', 'check_sla_violations'),
                ('pending-ticket auto-dispatch', 'auto_assign_tickets'),
            ))
        if mode in ('daily', 'all'):
            commands.extend((
                ('maintenance alerts', 'send_maintenance_alerts'),
                ('service analytics', 'generate_daily_analytics'),
                ('technician performance', 'generate_technician_performance'),
                ('technician location retention', 'purge_technician_locations'),
                ('validated demand forecasts', 'generate_demand_forecasts'),
            ))

        self.stdout.write(
            f'Starting {mode} operational automations at {timezone.now().isoformat()}'
        )
        for label, command_name in commands:
            self.stdout.write(f'Running {label}...')
            try:
                call_command(command_name, stdout=self.stdout, stderr=self.stderr)
            except Exception as exc:
                raise CommandError(
                    f'Operational automation failed during {label}: {exc}'
                ) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f'Completed {mode} operational automations at {timezone.now().isoformat()}'
            )
        )
