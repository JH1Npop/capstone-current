"""
Seed E2E test accounts — run as a standalone script via:
  venv\Scripts\python.exe e2e\seed-test-data-exec.py
"""
import os, sys, django

# Point to the backend directory and Django settings
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings')
django.setup()

from django.contrib.auth import get_user_model
from users.models import TechnicianProfile, ClientProfile, ManagementProfile, UserCapabilityGrant

User = get_user_model()
TEST_PASSWORD = 'TestPass123!'

ALL_CAPABILITIES = [
    'after_sales.dashboard.view', 'after_sales.cases.view', 'after_sales.cases.manage',
    'supervisor.dashboard.view', 'supervisor.tickets.view', 'supervisor.dispatch.view',
    'supervisor.tracking.view', 'technician.dashboard.view', 'technician.jobs.view',
    'technician.schedule.view', 'technician.navigation.view', 'technician.checklist.view',
    'technician.messages.view', 'technician.history.view', 'technician.profile.view',
    'users.capabilities.manage_staff', 'users.directory.view', 'users.directory.manage',
    'admin.job_history.view',
]

TECH_CAPABILITIES = [c for c in ALL_CAPABILITIES if c.startswith('technician.')]

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
ensure_user('superadmin_test', 'superadmin', 'superadmin_test@afntest.com', 'Super', 'Admin', ALL_CAPABILITIES)
ensure_user('admin_test', 'admin', 'admin_test@afntest.com', 'Test', 'Admin', ALL_CAPABILITIES)
ensure_user('tech_test', 'technician', 'tech_test@afntest.com', 'Test', 'Technician', TECH_CAPABILITIES)
ensure_user('client_test', 'client', 'client_test@afntest.com', 'Test', 'Client', [])
print(f'\n=== Done! All test accounts ready (password: {TEST_PASSWORD}) ===\n')
