r"""
Seed E2E test accounts — run as a standalone script via:
  venv\Scripts\python.exe e2e\seed-test-data-exec.py
"""
import os, sys, django
from datetime import date

# Point to the backend directory and Django settings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings_e2e')
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from inventory.models import InventoryCategory, InventoryItem, InventoryTransaction
from services.models import ServiceLocation, ServiceRequest, ServiceRequestService, ServiceTicket, ServiceType
from users.models import TechnicianProfile, ClientProfile, ManagementProfile, UserCapabilityGrant
from users.rbac import ROLE_CAPABILITY_MAP

User = get_user_model()
TEST_PASSWORD = 'TestPass123!'

ALL_CAPABILITIES = sorted(ROLE_CAPABILITY_MAP['superadmin'])
ADMIN_CAPABILITIES = sorted(ROLE_CAPABILITY_MAP['admin'])
TECH_CAPABILITIES = sorted(ROLE_CAPABILITY_MAP['technician'])

def ensure_user(username, role, email, first_name, last_name, capabilities):
    user, created = User.objects.get_or_create(username=username, defaults={'role': role, 'email': email, 'first_name': first_name, 'last_name': last_name, 'status': 'active', 'is_active': True, 'is_staff': role in ('superadmin', 'admin'), 'is_superuser': role == 'superadmin', 'email_verified': True})
    if not created:
        user.role = role; user.email = email; user.first_name = first_name; user.last_name = last_name
        user.status = 'active'; user.is_active = True; user.is_staff = role in ('superadmin', 'admin')
        user.is_superuser = role == 'superadmin'; user.email_verified = True; user.save()
    user.set_password(TEST_PASSWORD); user.save()
    if role == 'technician':
        TechnicianProfile.objects.get_or_create(user=user, defaults={'is_available': True, 'skill_level': 'expert', 'max_daily_assignments': 5, 'current_latitude': 14.5995, 'current_longitude': 120.9842})
    elif role == 'client':
        ClientProfile.objects.get_or_create(user=user, defaults={'client_type': 'individual', 'preferred_contact_method': 'email'})
    elif role in ('superadmin', 'admin'):
        ManagementProfile.objects.get_or_create(user=user, defaults={'admin_scope': 'general'})
    existing = set(UserCapabilityGrant.objects.filter(user=user).values_list('capability_code', flat=True))
    for cap in capabilities:
        if cap not in existing:
            UserCapabilityGrant.objects.create(user=user, capability_code=cap)
    print(f"  {'Created' if created else 'Updated'} {role}: {username} ({email})")
    return user

print('\n=== Seeding E2E Test Accounts ===\n')
superadmin = ensure_user('superadmin_test', 'superadmin', 'superadmin_test@afntest.com', 'Super', 'Admin', ALL_CAPABILITIES)
ensure_user('admin_test', 'admin', 'admin_test@afntest.com', 'Test', 'Admin', ADMIN_CAPABILITIES)
tech = ensure_user('tech_test', 'technician', 'tech_test@afntest.com', 'Test', 'Technician', TECH_CAPABILITIES)
client = ensure_user('client_test', 'client', 'client_test@afntest.com', 'Test', 'Client', [])

# A deterministic ticket makes the Documents browser test exercise real
# prefill and draft persistence instead of silently passing an empty state.
service_type = ServiceType.objects.create(
    name='E2E Solar Installation',
    estimated_duration=480,
    procedures=[
        {'title': 'Confirm site and work scope', 'description': 'Review the approved scope with the client.'},
        {'title': 'Complete installation work', 'description': 'Perform the assigned installation safely.'},
        {'title': 'Capture final installation evidence', 'requires_photo': True},
    ],
)
secondary_service_type = ServiceType.objects.create(
    name='E2E Electrical Safety Check',
    estimated_duration=60,
    procedures=[
        {'title': 'Verify protection and isolation', 'description': 'Confirm breakers, grounding, and isolation controls.'},
        {'title': 'Photograph the labeled distribution board', 'requires_photo': True},
    ],
    required_equipment=[{'name': 'Clamp meter', 'quantity': 1}],
)
service_request = ServiceRequest.objects.create(
    client=client,
    service_type=service_type,
    description='E2E document workflow fixture.',
    status='Approved',
)
ServiceLocation.objects.create(
    request=service_request,
    address='E2E Solar Job Site, Santa Rosa',
    city='Santa Rosa',
    province='Laguna',
    latitude=14.3122,
    longitude=121.1114,
)
ServiceRequestService.objects.create(request=service_request, service_type=service_type, sort_order=0)
ServiceRequestService.objects.create(request=service_request, service_type=secondary_service_type, sort_order=1)
completed_request = ServiceRequest.objects.create(
    client=client,
    service_type=service_type,
    description='E2E completed ticket for after-sales workflow.',
    status='Completed',
)
completed_ticket = ServiceTicket.objects.create(
    request=completed_request,
    technician=tech,
    scheduled_date=date.today(),
    status='Completed',
    completed_date=timezone.now(),
    completion_notes='E2E completed service fixture.',
)
equipment_category = InventoryCategory.objects.create(
    name='E2E Field Equipment',
    description='Deterministic ticket-return browser fixture.',
)
returnable_equipment = InventoryItem.objects.create(
    name='E2E Safety Kit',
    sku='E2E-RETURN-01',
    category=equipment_category,
    item_type='equipment',
    quantity=6,
    minimum_stock=0,
    unit_of_measurement='kit',
)
InventoryTransaction.objects.create(
    item=returnable_equipment,
    transaction_type='issue',
    quantity=3,
    technician=tech,
    service_ticket=completed_ticket,
    notes='Issued for the completed E2E service fixture.',
    performed_by=superadmin,
)
ServiceTicket.objects.create(
    request=service_request,
    technician=tech,
    scheduled_date=date.today(),
    status='Ready for Service',
    project_details={
        'system_capacity': '5.5 kWp',
        'panel_brand': 'E2E Panel',
        'number_of_panels': 10,
    },
)
inspection_request = ServiceRequest.objects.create(
    client=client,
    service_type=service_type,
    description='E2E pre-installation inspection fixture.',
    status='Approved',
)
ServiceLocation.objects.create(
    request=inspection_request,
    address='E2E Inspection Site, Cabuyao',
    city='Cabuyao',
    province='Laguna',
    latitude=14.2786,
    longitude=121.1250,
)
ServiceTicket.objects.create(
    request=inspection_request,
    technician=tech,
    scheduled_date=date.today(),
    ticket_type='inspection',
    status='For Inspection',
)
print(f'\n=== Done! All test accounts ready (password: {TEST_PASSWORD}) ===\n')
