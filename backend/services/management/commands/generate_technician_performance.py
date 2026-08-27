from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum, Avg, Q
from services.models import TechnicianPerformance, ServiceTicket
from users.models import User


class Command(BaseCommand):
    help = 'Generate daily technician performance metrics. Run daily via cron.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Date to generate metrics for (YYYY-MM-DD). Defaults to yesterday.',
        )
        parser.add_argument(
            '--backfill',
            type=int,
            help='Number of days to backfill (e.g., --backfill 90)',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force regeneration even if metrics already exist',
        )

    def handle(self, *args, **options):
        if options['backfill']:
            self.stdout.write(f"Backfilling technician metrics for last {options['backfill']} days...")

            for i in range(options['backfill']):
                target_date = timezone.now().date() - timedelta(days=i)
                self._generate_for_date(target_date, options['force'])

            self.stdout.write(
                self.style.SUCCESS(f'Successfully backfilled {options["backfill"]} days')
            )

        elif options['date']:
            try:
                from datetime import datetime
                target_date = datetime.strptime(options['date'], '%Y-%m-%d').date()
                self._generate_for_date(target_date, options['force'])
                self.stdout.write(
                    self.style.SUCCESS(f'Successfully generated metrics for {target_date}')
                )
            except ValueError:
                self.stdout.write(
                    self.style.ERROR('Invalid date format. Use YYYY-MM-DD')
                )

        else:
            target_date = timezone.now().date() - timedelta(days=1)
            self._generate_for_date(target_date, options['force'])
            self.stdout.write(
                self.style.SUCCESS(f'Successfully generated metrics for {target_date}')
            )

    def _generate_for_date(self, target_date, force=False):
        """Generate technician performance metrics for a specific date"""
        technicians = User.objects.filter(role='technician', is_active=True)

        for technician in technicians:
            # Check if already exists
            if (not force and
                TechnicianPerformance.objects.filter(
                    technician=technician,
                    date=target_date
                ).exists()):
                continue

            try:
                # Get all tickets for this technician on this date
                tickets = ServiceTicket.objects.filter(
                    technician=technician,
                    request__request_date__date=target_date
                )

                # Calculate metrics
                completed_tickets = tickets.filter(status='Completed')

                tickets_assigned = tickets.count()
                tickets_completed = completed_tickets.count()
                tickets_pending = tickets.filter(status__in=['Not Started', 'In Progress']).count()

                # Calculate time metrics
                total_work_hours = 0
                response_times = []
                completion_times = []

                for ticket in tickets:
                    # Response time
                    if ticket.assigned_at and ticket.request.request_date:
                        delta = ticket.assigned_at - ticket.request.request_date
                        response_times.append(delta.total_seconds() / 3600)

                    # Completion time
                    if ticket.assigned_at and ticket.completed_date:
                        delta = ticket.completed_date - ticket.assigned_at
                        completion_times.append(delta.total_seconds() / 3600)

                    # Work hours
                    if ticket.start_time and ticket.end_time:
                        delta = ticket.end_time - ticket.start_time
                        total_work_hours += delta.total_seconds() / 3600

                avg_response_time = (
                    sum(response_times) / len(response_times)
                    if response_times else 0
                )
                avg_completion_time = (
                    sum(completion_times) / len(completion_times)
                    if completion_times else 0
                )

                # Customer satisfaction
                ratings = [t.client_rating for t in tickets if t.client_rating]
                customer_satisfaction = (
                    sum(ratings) / len(ratings)
                    if ratings else 0
                )

                # Rework rate (tickets with revisits/complaints)
                rework_tickets = 0
                for ticket in completed_tickets:
                    if ticket.after_sales_cases.exists():
                        rework_tickets += 1

                rework_rate = (
                    (rework_tickets / completed_tickets.count() * 100)
                    if completed_tickets.count() > 0 else 0
                )

                # Create or update performance record
                performance, created = TechnicianPerformance.objects.get_or_create(
                    technician=technician,
                    date=target_date,
                    defaults={
                        'tickets_assigned': tickets_assigned,
                        'tickets_completed': tickets_completed,
                        'tickets_pending': tickets_pending,
                        'total_work_hours': round(total_work_hours, 2),
                        'avg_response_time_hours': round(avg_response_time, 2),
                        'avg_completion_time_hours': round(avg_completion_time, 2),
                        'customer_satisfaction': round(customer_satisfaction, 1),
                        'rework_rate': round(rework_rate, 2),
                        'distance_traveled_km': 0,  # Would need GPS data
                        'fuel_efficiency': 0,  # Would need fuel tracking
                    }
                )

                if not created:
                    performance.tickets_assigned = tickets_assigned
                    performance.tickets_completed = tickets_completed
                    performance.tickets_pending = tickets_pending
                    performance.total_work_hours = round(total_work_hours, 2)
                    performance.avg_response_time_hours = round(avg_response_time, 2)
                    performance.avg_completion_time_hours = round(avg_completion_time, 2)
                    performance.customer_satisfaction = round(customer_satisfaction, 1)
                    performance.rework_rate = round(rework_rate, 2)
                    performance.save()

                if tickets_assigned > 0:
                    self.stdout.write(
                        f"{technician.username}: {tickets_completed}/{tickets_assigned} completed, "
                        f"satisfaction {customer_satisfaction:.1f}/5"
                    )

            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"Error generating metrics for {technician.username}: {str(e)}"
                    )
                )
