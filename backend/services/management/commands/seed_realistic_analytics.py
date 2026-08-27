import random
from datetime import timedelta, datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction

from services.models import (
    ServiceType, ServiceRequest, ServiceTicket, ServiceLocation, ServiceAnalytics
)
from services.views import ServiceAnalyticsViewSet
from faker import Faker

User = get_user_model()
fake = Faker('en_PH')  # Philippine locale for names

class Command(BaseCommand):
    help = "Seed 400 realistic CALABARZON historical completed jobs over 3 years."

    def handle(self, *args, **options):
        self.stdout.write("Starting realistic data generation...")

        # 1. Clean up old auto-generated historical data to avoid overlap/duplication
        with transaction.atomic():
            ServiceAnalytics.objects.all().delete()
            # We identify our fake data by a specific tag in description
            ServiceRequest.objects.filter(description__startswith='[Historical Seed]').delete()

        # 2. Get existing base data
        technicians = list(User.objects.filter(role='technician', status='active'))
        service_types = list(ServiceType.objects.all())
        admins = list(User.objects.filter(role__in=['admin', 'superadmin']))
        
        if not technicians or not service_types:
            self.stdout.write(self.style.ERROR("Error: Need technicians and service types."))
            return

        admin_user = admins[0] if admins else None

        # 3. Create Fictional Clients Pool (50 clients)
        clients = []
        for _ in range(50):
            username = fake.unique.user_name()
            email = fake.unique.email()
            # Try to get or create just in case of username clash
            client, _ = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'first_name': fake.first_name(),
                    'last_name': fake.last_name(),
                    'phone': f"+639{random.randint(10000000, 99999999)}",
                    'role': 'client',
                    'status': 'active',
                }
            )
            clients.append(client)

        # 4. Define CALABARZON Geographical bounds & cities
        cities_coords = {
            'Pagbilao': (13.9722, 121.6847), 'Tayabas': (14.0250, 121.5817), 'Lucena': (13.9314, 121.6111), 'Sariaya': (13.9633, 121.5244),
            'Atimonan': (14.0000, 121.9208), 'Gumaca': (13.9242, 122.1011), 'Lopez': (13.8822, 122.2589), 'Catanauan': (13.5939, 122.3211),
            'Calamba': (14.2146, 121.1628), 'San Pablo': (14.0719, 121.3233), 'Santa Cruz': (14.2783, 121.4144), 'Los Baños': (14.1706, 121.2431),
            'Batangas City': (13.7565, 121.0583), 'Lipa': (13.9416, 121.1633), 'San Juan': (13.8286, 121.3967)
        }
        


        # 5. Generate 400 tickets over 3 years
        # Use a non-uniform distribution to mimic growth and seasonality.
        now = timezone.now()
        three_years_ago = now - timedelta(days=1095)
        
        self.stdout.write("Generating 400 completed service tickets...")
        
        for i in range(400):
            # Weighted dates: favor more recent years slightly (simulating growth)
            # Pick a year
            year_weights = [1, 2, 3] # Year 1 (oldest), Year 2, Year 3 (newest)
            year_choice = random.choices([0, 1, 2], weights=year_weights)[0]
            
            # Pick a month with slight summer (Mar-May) / rainy (Jul-Sep) weighting
            month = random.choices(
                range(1, 13), 
                weights=[1, 1, 2, 2, 2, 1, 1.5, 1.5, 1.5, 1, 1, 1]
            )[0]
            
            day = random.randint(1, 28) # Keep simple
            
            target_year = three_years_ago.year + year_choice
            
            try:
                request_date = timezone.make_aware(datetime(target_year, month, day, random.randint(8, 16), random.randint(0, 59)))
                if request_date > now:
                    request_date = now - timedelta(days=random.randint(1, 30))
            except Exception:
                request_date = now - timedelta(days=random.randint(1, 1000))

            # Assignments and Durations
            client = random.choice(clients)
            tech = random.choice(technicians)
            service_type = random.choice(service_types)
            
            # Realistic timeline: assigned within 2-24 hours, started 1-3 days later, completed after duration
            assigned_at = request_date + timedelta(hours=random.uniform(2, 24))
            start_time = assigned_at + timedelta(days=random.uniform(1, 3))
            
            # Variation around estimated duration
            est_duration_mins = service_type.estimated_duration or 120
            actual_duration_mins = est_duration_mins * random.uniform(0.8, 1.5)
            completed_date = start_time + timedelta(minutes=actual_duration_mins)

            # Location Generation based on requested distribution
            choice = random.uniform(0, 100)
            if choice < 60:
                region_name, cities = 'Quezon', ['Pagbilao', 'Tayabas', 'Lucena', 'Sariaya']
            elif choice < 75:
                region_name, cities = 'Quezon', ['Atimonan', 'Gumaca', 'Lopez', 'Catanauan']
            elif choice < 87.5:
                region_name, cities = 'Laguna', ['Calamba', 'San Pablo', 'Santa Cruz', 'Los Baños']
            else:
                region_name, cities = 'Batangas', ['Batangas City', 'Lipa', 'San Juan']
                
            city = random.choice(cities)
            c = cities_coords.get(city)
            lat = c[0] + random.uniform(-0.02, 0.02) if c else 14.5 + random.uniform(-0.01, 0.01)
            lng = c[1] + random.uniform(-0.02, 0.02) if c else 121.0 + random.uniform(-0.01, 0.01)
            address = f"{fake.building_number()} {fake.street_name()}, {city}"

            # Create Database Records
            req = ServiceRequest.objects.create(
                client=client,
                service_type=service_type,
                description=f"[Historical Seed] Realistic historical job for {service_type.name}.",
                status='Completed',
                priority=random.choice(['Normal', 'Normal', 'Normal', 'High', 'Urgent']),
                request_date=request_date,
                preferred_date=start_time.date(),
                preferred_time_slot=random.choice(['morning', 'afternoon', 'midday']),
            )

            ServiceLocation.objects.create(
                request=req,
                address=address,
                city=city,
                province=region_name,
                latitude=lat,
                longitude=lng
            )

            # Rating logic (mostly 4-5 stars)
            rating = random.choices([3, 4, 5], weights=[1, 4, 5])[0]

            ticket = ServiceTicket.objects.create(
                request=req,
                technician=tech,
                assigned_admin=admin_user,
                scheduled_date=start_time.date(),
                scheduled_time_slot=req.preferred_time_slot,
                status='Completed',
                priority=req.priority,
                assigned_at=assigned_at,
                start_time=start_time,
                end_time=completed_date,
                completed_date=completed_date,
                client_rating=rating,
                client_feedback="Auto-generated realistic feedback." if rating >= 4 else "Could be better.",
            )

            # Force exact timestamps for auto_now_add fields
            ServiceRequest.objects.filter(id=req.id).update(request_date=request_date)
            ServiceTicket.objects.filter(id=ticket.id).update(created_at=request_date)

        self.stdout.write(self.style.SUCCESS("Successfully generated 400 completed jobs."))

        # 6. Backfill Analytics via existing viewset method
        self.stdout.write("Backfilling Analytics for the last 1095 days (3 years)...")
        viewset = ServiceAnalyticsViewSet()
        
        # We only need to backfill days that actually have data to speed it up
        dates_with_data = set(
            ServiceRequest.objects.filter(description__startswith='[Historical Seed]')
            .values_list('request_date__date', flat=True)
        )
        dates_with_completions = set(
            ServiceTicket.objects.filter(request__description__startswith='[Historical Seed]', status='Completed')
            .values_list('completed_date__date', flat=True)
        )
        
        all_active_dates = dates_with_data.union(dates_with_completions)
        
        for active_date in sorted(all_active_dates):
            if active_date <= now.date():
                viewset._generate_daily_analytics(active_date)
                
        # Also run yesterday and today just to be sure current stats are populated
        viewset._generate_daily_analytics(now.date() - timedelta(days=1))
        viewset._generate_daily_analytics(now.date())

        self.stdout.write(self.style.SUCCESS("Analytics backfill complete! The system is now populated for CALABARZON."))
