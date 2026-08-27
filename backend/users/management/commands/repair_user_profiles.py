from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

from users.signals import ensure_user_role_profile


class Command(BaseCommand):
    help = 'Create missing role-specific profile rows for existing users.'

    def handle(self, *args, **options):
        User = get_user_model()
        created = 0
        before_counts = {
            'technician': User.objects.filter(role='technician', technician_profile__isnull=True).count(),
            'client': User.objects.filter(role='client', client_profile__isnull=True).count(),
            'management': User.objects.filter(
                role__in=['superadmin', 'admin'],
                management_profile__isnull=True,
            ).count(),
        }

        for user in User.objects.all().order_by('id'):
            missing_before = (
                (user.role == 'technician' and not hasattr(user, 'technician_profile')) or
                (user.role == 'client' and not hasattr(user, 'client_profile')) or
                (user.role in ['superadmin', 'admin'] and not hasattr(user, 'management_profile'))
            )
            ensure_user_role_profile(user)
            if missing_before:
                created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Repaired user profiles. Created or confirmed {created} missing profile row(s).'
        ))
        self.stdout.write(
            'Missing before repair: '
            f"technician={before_counts['technician']}, "
            f"client={before_counts['client']}, "
            f"management={before_counts['management']}"
        )
