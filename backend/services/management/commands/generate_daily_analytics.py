from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from services.models import ServiceAnalytics
from services.views import ServiceAnalyticsViewSet


class Command(BaseCommand):
    help = 'Generate daily analytics for service metrics. Run daily via cron.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Date to generate analytics for (YYYY-MM-DD). Defaults to yesterday.',
        )
        parser.add_argument(
            '--backfill',
            type=int,
            help='Number of days to backfill (e.g., --backfill 90 generates last 90 days)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force regeneration even if analytics already exist',
        )

    def handle(self, *args, **options):
        viewset = ServiceAnalyticsViewSet()

        if options['backfill']:
            # Backfill mode: generate for last N days
            self.stdout.write(f"Backfilling analytics for last {options['backfill']} days...")

            for i in range(options['backfill']):
                target_date = timezone.now().date() - timedelta(days=i)
                self._generate_for_date(target_date, viewset, options['force'])

            self.stdout.write(
                self.style.SUCCESS(f'Successfully backfilled {options["backfill"]} days of analytics')
            )

        elif options['date']:
            # Specific date
            try:
                from datetime import datetime
                target_date = datetime.strptime(options['date'], '%Y-%m-%d').date()
                self._generate_for_date(target_date, viewset, options['force'])
                self.stdout.write(
                    self.style.SUCCESS(f'Successfully generated analytics for {target_date}')
                )
            except ValueError:
                self.stdout.write(
                    self.style.ERROR('Invalid date format. Use YYYY-MM-DD')
                )

        else:
            # Default: yesterday's analytics
            target_date = timezone.now().date() - timedelta(days=1)
            self._generate_for_date(target_date, viewset, options['force'])
            self.stdout.write(
                self.style.SUCCESS(f'Successfully generated analytics for {target_date}')
            )

    def _generate_for_date(self, target_date, viewset, force=False):
        """Generate analytics for a specific date"""
        # Check if already exists
        if not force and ServiceAnalytics.objects.filter(date=target_date).exists():
            self.stdout.write(f"Analytics for {target_date} already exist. Skipping...")
            return

        try:
            analytics = viewset._generate_daily_analytics(target_date)
            self.stdout.write(
                f"Generated analytics for {target_date}: "
                f"{analytics.total_requests} requests, "
                f"avg response time {analytics.avg_response_time_hours}h, "
                f"satisfaction {analytics.satisfaction_score}/5"
            )
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f"Error generating analytics for {target_date}: {str(e)}")
            )
