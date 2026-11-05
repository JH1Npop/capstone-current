from datetime import time, timedelta

from django.utils import timezone
from rest_framework.test import APIClient
from django.test import TestCase

from services.models import CalendarClosure, ServiceRequest, ServiceTicket, ServiceType
from services.scheduling_policy import get_calendar_closure_error
from users.models import User


class ClientAppointmentAvailabilityTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            username='availability-client',
            password='pass',
            role='client',
        )
        self.other_client = User.objects.create_user(
            username='availability-other-client',
            password='pass',
            role='client',
        )
        self.service_type = ServiceType.objects.create(
            name='Availability Test Service',
            description='Calendar privacy test',
            estimated_duration=60,
        )
        self.appointment_date = timezone.localdate() + timedelta(days=5)
        self.api_client = APIClient()
        self.superadmin = User.objects.create_user(
            username='availability-superadmin',
            password='pass',
            role='superadmin',
            is_staff=True,
            is_superuser=True,
        )

    def create_ticket(self, *, status='Not Started', slot='morning'):
        request_obj = ServiceRequest.objects.create(
            client=self.other_client,
            service_type=self.service_type,
            description='Private appointment details',
            preferred_date=self.appointment_date,
            preferred_time_slot=slot,
            status='Approved',
        )
        return ServiceTicket.objects.create(
            request=request_obj,
            scheduled_date=self.appointment_date,
            scheduled_time_slot=slot,
            status=status,
        )

    def test_client_receives_only_aggregate_schedule_activity(self):
        self.create_ticket(slot='morning')
        self.create_ticket(status='Cancelled', slot='afternoon')
        self.api_client.force_authenticate(user=self.client_user)

        response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['days'], [{
            'date': self.appointment_date.isoformat(),
            'has_appointments': True,
            'slots': {
                'morning': True,
                'midday': False,
                'afternoon': False,
                'unspecified': False,
            },
            'availability': {
                'status': 'available',
                'slots': {
                    'morning': {'status': 'available', 'source': 'capacity'},
                    'midday': {'status': 'available', 'source': 'capacity'},
                    'afternoon': {'status': 'available', 'source': 'capacity'},
                },
            },
            'closure': {
                'all_day': False,
                'slots': {'morning': False, 'midday': False, 'afternoon': False},
                'reasons': [],
            },
        }])
        serialized = str(response.data)
        self.assertNotIn(self.other_client.username, serialized)
        self.assertNotIn('Private appointment details', serialized)

    def test_availability_requires_authentication(self):
        response = self.api_client.get('/api/services/service-requests/appointment-availability/')
        self.assertIn(response.status_code, {401, 403})

    def test_availability_rejects_ranges_longer_than_63_days(self):
        self.api_client.force_authenticate(user=self.client_user)
        response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': (self.appointment_date + timedelta(days=63)).isoformat(),
        })
        self.assertEqual(response.status_code, 400)

    def test_admin_can_close_and_reopen_a_slot(self):
        self.api_client.force_authenticate(user=self.superadmin)
        close_response = self.api_client.post('/api/admin/calendar/closures/', {
            'action': 'close',
            'date': self.appointment_date.isoformat(),
            'time_slot': 'morning',
            'reason': 'Team safety training',
        }, format='json')
        self.assertEqual(close_response.status_code, 201)

        list_response = self.api_client.get('/api/admin/calendar/closures/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data['closures']), 1)
        self.assertEqual(list_response.data['closures'][0]['reason'], 'Team safety training')
        self.assertEqual(list_response.data['closures'][0]['availability_status'], 'closed')
        self.assertEqual(list_response.data['daily_capacity'], 3)

        reopen_response = self.api_client.post('/api/admin/calendar/closures/', {
            'action': 'reopen',
            'date': self.appointment_date.isoformat(),
            'time_slot': 'morning',
        }, format='json')
        self.assertEqual(reopen_response.status_code, 200)
        self.assertFalse(CalendarClosure.objects.get().is_active)

    def test_admin_closure_response_includes_authoritative_slot_occupancy(self):
        self.create_ticket(slot='morning')
        CalendarClosure.objects.create(
            date=self.appointment_date,
            time_slot='afternoon',
            availability_status='closed',
            reason='Afternoon safety review',
            created_by=self.superadmin,
            updated_by=self.superadmin,
        )
        self.api_client.force_authenticate(user=self.superadmin)

        response = self.api_client.get('/api/admin/calendar/closures/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['availability_days']), 1)
        day = response.data['availability_days'][0]
        self.assertEqual(day['date'], self.appointment_date.isoformat())
        self.assertEqual(day['status'], 'limited')
        self.assertEqual(day['booked'], 1)
        self.assertEqual(day['capacity'], 3)
        self.assertEqual(day['remaining'], 2)
        self.assertEqual(day['slots']['morning'], {
            'status': 'available',
            'source': 'capacity',
            'booked': 1,
        })
        self.assertEqual(day['slots']['afternoon']['status'], 'closed')
        self.assertEqual(day['slots']['afternoon']['source'], 'admin')

    def test_closed_slot_is_exposed_privately_and_blocks_client_submission(self):
        CalendarClosure.objects.create(
            date=self.appointment_date,
            time_slot='morning',
            reason='Company holiday',
            created_by=self.superadmin,
            updated_by=self.superadmin,
        )
        self.api_client.force_authenticate(user=self.client_user)

        availability_response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })
        self.assertEqual(availability_response.status_code, 200)
        day = availability_response.data['days'][0]
        self.assertFalse(day['has_appointments'])
        self.assertTrue(day['closure']['slots']['morning'])
        self.assertEqual(day['availability']['slots']['morning']['status'], 'closed')
        self.assertNotIn('Company holiday', str(day))

        create_response = self.api_client.post('/api/services/service-requests/', {
            'service_type': self.service_type.id,
            'description': 'Need an appointment',
            'preferred_date': self.appointment_date.isoformat(),
            'preferred_time_slot': 'morning',
            'location_address': '123 Calendar Street',
            'location_city': 'Calamba',
            'location_province': 'Laguna',
            'latitude': '14.2117',
            'longitude': '121.1653',
        }, format='json')
        self.assertEqual(create_response.status_code, 400)
        self.assertIn('closed for morning', str(create_response.data).lower())

    def test_non_admin_cannot_manage_calendar_closures(self):
        self.api_client.force_authenticate(user=self.client_user)
        response = self.api_client.post('/api/admin/calendar/closures/', {
            'date': self.appointment_date.isoformat(),
            'time_slot': 'all_day',
            'reason': 'Unauthorized closure',
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def test_exact_time_is_mapped_to_its_closed_slot(self):
        CalendarClosure.objects.create(
            date=self.appointment_date,
            time_slot='afternoon',
            reason='Afternoon team meeting',
        )
        error = get_calendar_closure_error(self.appointment_date, scheduled_time=time(15, 0))
        self.assertIn('closed for afternoon', error.lower())

    def test_shared_daily_capacity_changes_all_slots_from_limited_to_full(self):
        self.create_ticket(slot='morning')
        self.api_client.force_authenticate(user=self.client_user)

        available_response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })
        self.assertEqual(available_response.status_code, 200)
        self.assertEqual(
            available_response.data['days'][0]['availability']['slots']['morning']['status'],
            'available',
        )

        self.create_ticket(slot='midday')
        limited_response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })
        self.assertEqual(limited_response.status_code, 200)
        self.assertEqual(
            limited_response.data['days'][0]['availability']['slots']['morning']['status'],
            'limited',
        )

        self.assertEqual(
            limited_response.data['days'][0]['availability']['slots']['afternoon']['status'],
            'limited',
        )

        self.create_ticket(slot=None)
        full_response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })
        self.assertEqual(
            full_response.data['days'][0]['availability']['slots']['midday']['status'],
            'full',
        )

        create_response = self.api_client.post('/api/services/service-requests/', {
            'service_type': self.service_type.id,
            'description': 'Need a fourth job on a full date',
            'preferred_date': self.appointment_date.isoformat(),
            'preferred_time_slot': 'morning',
            'location_address': '123 Calendar Street',
            'location_city': 'Calamba',
            'location_province': 'Laguna',
            'latitude': '14.2117',
            'longitude': '121.1653',
        }, format='json')
        self.assertEqual(create_response.status_code, 400)
        self.assertIn('daily appointment capacity of 3 jobs', str(create_response.data).lower())

    def test_admin_can_apply_limited_override_to_a_date_range_with_fixed_daily_limit(self):
        self.api_client.force_authenticate(user=self.superadmin)
        end_date = self.appointment_date + timedelta(days=2)

        range_response = self.api_client.post('/api/admin/calendar/closures/', {
            'action': 'set',
            'start_date': self.appointment_date.isoformat(),
            'end_date': end_date.isoformat(),
            'time_slot': 'afternoon',
            'availability_status': 'limited',
            'reason': 'Large installation project',
        }, format='json')
        self.assertEqual(range_response.status_code, 201)
        self.assertEqual(len(range_response.data['closures']), 3)
        self.assertEqual(
            CalendarClosure.objects.filter(is_active=True, availability_status='limited').count(),
            3,
        )

        list_response = self.api_client.get('/api/admin/calendar/closures/', {
            'start': self.appointment_date.isoformat(),
            'end': end_date.isoformat(),
        })
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data['daily_capacity'], 3)

    def test_slot_closed_override_takes_priority_over_all_day_limited_override(self):
        CalendarClosure.objects.create(
            date=self.appointment_date,
            time_slot='all_day',
            availability_status='limited',
            reason='Reduced project capacity',
        )
        CalendarClosure.objects.create(
            date=self.appointment_date,
            time_slot='morning',
            availability_status='closed',
            reason='Morning team unavailable',
        )
        self.api_client.force_authenticate(user=self.client_user)

        response = self.api_client.get('/api/services/service-requests/appointment-availability/', {
            'start': self.appointment_date.isoformat(),
            'end': self.appointment_date.isoformat(),
        })

        self.assertEqual(response.status_code, 200)
        slots = response.data['days'][0]['availability']['slots']
        self.assertEqual(slots['morning']['status'], 'closed')
        self.assertEqual(slots['midday']['status'], 'limited')
