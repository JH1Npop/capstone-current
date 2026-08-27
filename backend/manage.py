#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings')
    if len(sys.argv) == 2 and sys.argv[1] == 'test':
        sys.argv.extend([
            'users.tests',
            'services.tests',
            'services.test_assignment_scoring',
            'services.test_auto_dispatch_and_sla',
            'inventory.tests',
            'notifications.tests',
            'messages_app.tests',
            'api.tests',
        ])
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
