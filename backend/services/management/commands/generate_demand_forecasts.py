from django.core.management.base import BaseCommand, CommandError

from services.models import ServiceType
from users.forecasting_service import (
    FORECAST_MONTHS,
    generate_service_forecast,
    reconcile_forecast_actuals,
)


class Command(BaseCommand):
    help = (
        'Backtest the Analytics seasonal-trend model and publish forecasts only '
        'for service types that pass every evidence and validation gate.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--service-type-id', type=int)
        parser.add_argument('--horizon-months', type=int, default=FORECAST_MONTHS)
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Evaluate readiness and backtesting without writing trend or forecast rows.',
        )

    def handle(self, *args, **options):
        horizon = options['horizon_months']
        if not 1 <= horizon <= 12:
            raise CommandError('horizon-months must be between 1 and 12.')

        services = ServiceType.objects.filter(is_active=True).order_by('name')
        if options['service_type_id']:
            services = services.filter(pk=options['service_type_id'])
            if not services.exists():
                raise CommandError('The requested service type does not exist or is inactive.')

        if not options['dry_run']:
            reconciled = reconcile_forecast_actuals()
            self.stdout.write(f'Reconciled {reconciled} completed monthly forecast row(s).')

        published = 0
        evaluated = 0
        for service_type in services:
            evaluated += 1
            result = generate_service_forecast(
                service_type,
                horizon_months=horizon,
                persist=not options['dry_run'],
            )
            if result['published']:
                published += 1
                metrics = result.get('model', {}).get('metrics', {})
                self.stdout.write(self.style.SUCCESS(
                    f"{service_type.name}: published {len(result['predictions'])} month(s); "
                    f"holdout WAPE {metrics.get('wape_percent')}%."
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    f"{service_type.name}: withheld — {result.get('reason') or 'validation gates were not met.'}"
                ))

        self.stdout.write(
            f'Forecast evaluation complete: {published} of {evaluated} active service type(s) published.'
        )
