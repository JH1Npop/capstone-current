from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Show the active environment and database target without exposing credentials.'

    def handle(self, *args, **options):
        database = settings.DATABASES['default']
        engine = database.get('ENGINE', '')
        is_sqlite = engine == 'django.db.backends.sqlite3'

        self.stdout.write(f'Deployment stage: {settings.DEPLOYMENT_STAGE}')
        self.stdout.write(f'Django environment: {settings.ENVIRONMENT}')
        if is_sqlite:
            self.stdout.write('Database engine: SQLite')
            self.stdout.write(f'Database target: local ({Path(database["NAME"]).resolve()})')
        else:
            self.stdout.write('Database engine: PostgreSQL')
            self.stdout.write(
                'Database target: remote '
                f'(host={database.get("HOST") or "unset"}, name={database.get("NAME") or "unset"})'
            )
        self.stdout.write(f'Email backend: {settings.EMAIL_BACKEND}')

        if settings.DEPLOYMENT_STAGE == 'development' and not is_sqlite:
            self.stdout.write(self.style.WARNING(
                'WARNING: local development is connected to a remote database by explicit override.'
            ))
        elif settings.DEPLOYMENT_STAGE == 'development':
            self.stdout.write(self.style.SUCCESS('Safe local-development target confirmed.'))
        elif settings.DEPLOYMENT_STAGE == 'staging' and not is_sqlite:
            self.stdout.write(self.style.SUCCESS('Staging PostgreSQL target confirmed.'))
