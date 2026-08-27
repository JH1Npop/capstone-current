from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from services.models import ServiceLocation, ServiceRequest, ServiceTicket, ServiceType
from users.models import User


class Command(BaseCommand):
    help = 'Create five connected mock tickets for document autofill testing.'

    def handle(self, *args, **options):
        today = timezone.localdate()

        admin = self._get_or_create_admin()
        technicians = self._get_or_create_technicians()
        service_types = self._get_or_create_service_types()

        mock_rows = [
            {
                'username': 'doc_client_001',
                'first_name': 'Emanuel',
                'last_name': 'Rivera',
                'email': 'doc_client_001@example.com',
                'phone': '09171234501',
                'address': 'Blk 4 Lot 8, Ibabang Iyam, Lucena City',
                'service_type': service_types[0],
                'description': 'Routine rooftop solar inspection before commissioning turnover.',
                'location_address': 'Blk 4 Lot 8, Ibabang Iyam, Lucena City',
                'city': 'Lucena City',
                'province': 'Quezon',
                'latitude': Decimal('13.941100'),
                'longitude': Decimal('121.617300'),
                'technician': technicians[0],
                'scheduled_offset': 1,
                'time_slot': 'morning',
            },
            {
                'username': 'doc_client_002',
                'first_name': 'Marissa',
                'last_name': 'Tolentino',
                'email': 'doc_client_002@example.com',
                'phone': '09171234502',
                'address': 'Purok 2, Pagbilao Grande, Pagbilao',
                'service_type': service_types[1],
                'description': 'Corrective maintenance for low inverter output and panel cleaning.',
                'location_address': 'Purok 2, Pagbilao Grande, Pagbilao',
                'city': 'Pagbilao',
                'province': 'Quezon',
                'latitude': Decimal('13.970400'),
                'longitude': Decimal('121.698400'),
                'technician': technicians[1],
                'scheduled_offset': 2,
                'time_slot': 'midday',
            },
            {
                'username': 'doc_client_003',
                'first_name': 'Jerson',
                'last_name': 'Villanueva',
                'email': 'doc_client_003@example.com',
                'phone': '09171234503',
                'address': 'Sitio Centro, Tayabas Road, Sariaya',
                'service_type': service_types[2],
                'description': 'Field service visit for breaker tripping and DC cable inspection.',
                'location_address': 'Sitio Centro, Tayabas Road, Sariaya',
                'city': 'Sariaya',
                'province': 'Quezon',
                'latitude': Decimal('13.960700'),
                'longitude': Decimal('121.530500'),
                'technician': technicians[0],
                'scheduled_offset': 3,
                'time_slot': 'afternoon',
            },
            {
                'username': 'doc_client_004',
                'first_name': 'Clarisse',
                'last_name': 'De Mesa',
                'email': 'doc_client_004@example.com',
                'phone': '09171234504',
                'address': 'Phase 1, Barangay Isabang, Tayabas',
                'service_type': service_types[0],
                'description': 'Post-installation quality check and client punch-list review.',
                'location_address': 'Phase 1, Barangay Isabang, Tayabas',
                'city': 'Tayabas',
                'province': 'Quezon',
                'latitude': Decimal('13.937400'),
                'longitude': Decimal('121.589800'),
                'technician': technicians[1],
                'scheduled_offset': 4,
                'time_slot': 'morning',
            },
            {
                'username': 'doc_client_005',
                'first_name': 'Paolo',
                'last_name': 'Natividad',
                'email': 'doc_client_005@example.com',
                'phone': '09171234505',
                'address': 'Maharlika Highway, Barangay Domoit, Lucena City',
                'service_type': service_types[1],
                'description': 'Warranty visit for inverter alarm investigation and site validation.',
                'location_address': 'Maharlika Highway, Barangay Domoit, Lucena City',
                'city': 'Lucena City',
                'province': 'Quezon',
                'latitude': Decimal('13.930800'),
                'longitude': Decimal('121.596800'),
                'technician': technicians[0],
                'scheduled_offset': 5,
                'time_slot': 'afternoon',
            },
        ]

        created_count = 0
        for row in mock_rows:
            client, _ = User.objects.get_or_create(
                username=row['username'],
                defaults={
                    'role': 'client',
                    'first_name': row['first_name'],
                    'last_name': row['last_name'],
                    'email': row['email'],
                    'phone': row['phone'],
                    'address': row['address'],
                    'status': 'active',
                    'email_verified': True,
                },
            )
            if not client.check_password('Password123!'):
                client.set_password('Password123!')
                client.save(update_fields=['password'])

            service_request, request_created = ServiceRequest.objects.get_or_create(
                client=client,
                service_type=row['service_type'],
                description=row['description'],
                defaults={
                    'priority': 'Normal',
                    'status': 'Approved',
                    'preferred_date': today + timedelta(days=row['scheduled_offset']),
                    'preferred_time_slot': row['time_slot'],
                    'request_source': 'admin_created',
                    'scheduling_notes': 'Seeded for AFN document autofill preview.',
                    'auto_ticket_created': True,
                },
            )

            ServiceLocation.objects.update_or_create(
                request=service_request,
                defaults={
                    'address': row['location_address'],
                    'city': row['city'],
                    'province': row['province'],
                    'latitude': row['latitude'],
                    'longitude': row['longitude'],
                },
            )

            ticket, ticket_created = ServiceTicket.objects.get_or_create(
                request=service_request,
                defaults={
                    'ticket_type': 'installation',
                    'technician': row['technician'],
                    'assigned_admin': admin,
                    'scheduled_date': today + timedelta(days=row['scheduled_offset']),
                    'scheduled_time_slot': row['time_slot'],
                    'status': 'Not Started',
                    'priority': 'Normal',
                    'notes': 'Seeded for AFN document autofill preview.',
                    'assigned_at': timezone.now(),
                },
            )

            if ticket_created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Created TKT-{ticket.id} for {client.get_full_name().strip() or client.username}"
                    )
                )
            elif request_created:
                self.stdout.write(
                    self.style.WARNING(
                        f"Request existed without new ticket for {client.get_full_name().strip() or client.username}"
                    )
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"Reused existing TKT-{ticket.id} for {client.get_full_name().strip() or client.username}"
                    )
                )

        self.stdout.write(self.style.SUCCESS(f'Document mock seeding complete. New tickets created: {created_count}'))

    def _get_or_create_admin(self):
        admin = User.objects.filter(role__in=['superadmin', 'admin'], status='active').order_by('id').first()
        if admin:
            return admin

        admin = User.objects.create_user(
            username='doc_admin',
            password='Password123!',
            role='admin',
            first_name='Document',
            last_name='Admin',
            email='doc_admin@example.com',
            phone='09179990000',
            address='Pagbilao, Quezon',
            status='active',
        )
        admin.email_verified = True
        admin.save(update_fields=['email_verified'])
        return admin

    def _get_or_create_technicians(self):
        technicians = list(User.objects.filter(role='technician', status='active').order_by('id')[:2])
        while len(technicians) < 2:
            index = len(technicians) + 1
            username = f'doc_tech_{index:03d}'
            technician, _ = User.objects.get_or_create(
                username=username,
                defaults={
                    'role': 'technician',
                    'first_name': f'DocTech{index}',
                    'last_name': 'AFN',
                    'email': f'{username}@example.com',
                    'phone': f'0917888000{index}',
                    'address': 'Pagbilao, Quezon',
                    'status': 'active',
                    'email_verified': True,
                    'is_available': True,
                    'skill_level': 'intermediate',
                    'max_daily_assignments': 5,
                },
            )
            if not technician.check_password('Password123!'):
                technician.set_password('Password123!')
                technician.save(update_fields=['password'])
            technicians.append(technician)
        return technicians[:2]

    def _get_or_create_service_types(self):
        names = [
            'Solar Panel Installation',
            'Solar Preventive Maintenance',
            'Field Service Diagnostic',
        ]
        service_types = []
        for name in names:
            service_type, _ = ServiceType.objects.get_or_create(
                name=name,
                defaults={
                    'description': f'{name} seeded for AFN document mock tickets.',
                    'estimated_duration': 120,
                    'estimated_cost': Decimal('1500.00'),
                    'is_active': True,
                },
            )
            service_types.append(service_type)
        return service_types
