"""
Seed script for E2E tests.
Run with: python manage.py shell < ../e2e/seed-test-data.py

Creates test accounts for all roles with known credentials and full capabilities.
"""
import os
import sys
import django

# Ensure Django settings are loaded
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings')

from django.contrib.auth import get_user_model
from users.models import TechnicianProfile, ClientProfile, ManagementProfile, UserCapabilityGrant

User = get_user_model()

TEST_PASSWORD = 'TestPass123!'

# All known capabilities in the system
ALL_CAPABILITIES = [
    'after_sales.dashboard.view',
    'after_sales.cases.view',
    'after_sales.cases.manage',
    'supervisor.dashboard.view',
    'supervisor.tickets.view',
    'supervisor.dispatch.view',
    'supervisor.tracking.view',
    'technician.dashboard.view',
    'technician.jobs.view',
    'technician.schedule.view',
    'technician.navigation.view',
    'technician.checklist.view',
    'technician.messages.view',
    'technician.history.view',
    'technician.profile.view',
    'users.capabilities.manage_staff',
    'users.directory.view',
    'users.directory.manage',
    'admin.job_history.view',
]

ADMIN_CAPABILITIES = ALL_CAPABILITIES  # admins get everything

TECHNICIAN_CAPABILITIES = [
    'technician.dashboard.view',
    'technician.jobs.view',
    'technician.schedule.view',
    'technician.navigation.view',
    'technician.checklist.view',
    'technician.messages.view',
    'technician.history.view',
    'technician.profile.view',
]


def ensure_user(username, role, email, first_name, last_name, capabilities):
    """Create or update a test user with the given attributes and capabilities."""
    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            'role': role,
            'email': email,
            'first_name': first_name,
            'last_name': last_name,
            'status': 'active',
            'is_active': True,
            'is_staff': role in ('superadmin', 'admin'),
            'is_superuser': role == 'superadmin',
            'email_verified': True,
        }
    )

    if not created:
        user.role = role
        user.email = email
        user.first_name = first_name
        user.last_name = last_name
        user.status = 'active'
        user.is_active = True
        user.is_staff = role in ('superadmin', 'admin')
        user.is_superuser = role == 'superadmin'
        user.email_verified = True
        user.save()

    user.set_password(TEST_PASSWORD)
    user.save()

    # Create role-specific profiles
    if role == 'technician':
        TechnicianProfile.objects.get_or_create(
            user=user,
            defaults={
                'is_available': True,
                'skill_level': 'expert',
                'max_daily_assignments': 5,
                'current_latitude': 14.5995,
                'current_longitude': 120.9842,
            }
        )
    elif role == 'client':
        ClientProfile.objects.get_or_create(
            user=user,
            defaults={
                'client_type': 'individual',
                'preferred_contact_method': 'email',
            }
        )
    elif role in ('superadmin', 'admin'):
        ManagementProfile.objects.get_or_create(
            user=user,
            defaults={
                'admin_scope': 'general',
            }
        )

    # Set capabilities
    existing = set(
        UserCapabilityGrant.objects.filter(user=user).values_list('capability_code', flat=True)
    )
    for cap in capabilities:
        if cap not in existing:
            UserCapabilityGrant.objects.create(user=user, capability_code=cap)

    action = 'Created' if created else 'Updated'
    print(f'  {action} {role}: {username} ({email})')
    return user


print('\n=== Seeding E2E Test Accounts ===\n')

superadmin = ensure_user(
    username='superadmin_test',
    role='superadmin',
    email='superadmin_test@afntest.com',
    first_name='Super',
    last_name='Admin',
    capabilities=ALL_CAPABILITIES,
)

admin = ensure_user(
    username='admin_test',
    role='admin',
    email='admin_test@afntest.com',
    first_name='Test',
    last_name='Admin',
    capabilities=ADMIN_CAPABILITIES,
)

tech = ensure_user(
    username='tech_test',
    role='technician',
    email='tech_test@afntest.com',
    first_name='Test',
    last_name='Technician',
    capabilities=TECHNICIAN_CAPABILITIES,
)

client = ensure_user(
    username='client_test',
    role='client',
    email='client_test@afntest.com',
    first_name='Test',
    last_name='Client',
    capabilities=[],
)

print(f'\n=== Done! All test accounts ready (password: {TEST_PASSWORD}) ===\n')
