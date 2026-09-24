#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
from pathlib import Path


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'afn_service_management.settings')
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        # Django's label-free discovery starts at the current directory. The
        # project is commonly invoked as ``python backend/manage.py test`` from
        # the repository root, where discovery finds no tests because
        # ``backend`` is not a Python package. Always anchor test discovery to
        # the directory containing manage.py so local scripts and CI execute
        # the same complete suite, including every ``test_*.py`` module.
        os.chdir(Path(__file__).resolve().parent)
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
