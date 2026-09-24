import uuid

from asgiref.sync import async_to_sync
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from afn_service_management.health import _probe_realtime_layer


class Command(BaseCommand):
    help = 'Verify production-shaped staging database, Redis, and durable-media dependencies.'

    def add_arguments(self, parser):
        parser.add_argument('--confirm-staging', action='store_true')

    def handle(self, *args, **options):
        if not options['confirm_staging']:
            raise CommandError('Refusing to probe dependencies without --confirm-staging.')
        if getattr(settings, 'DEPLOYMENT_STAGE', '') != 'staging':
            raise CommandError('DEPLOYMENT_STAGE must be staging for this command.')
        if not getattr(settings, 'IS_PRODUCTION', False):
            raise CommandError('Run staging verification with DJANGO_ENV=production settings.')

        failures = []
        self._verify_database(failures)
        self._verify_realtime(failures)
        self._verify_storage(failures)

        if failures:
            raise CommandError('Staging dependency verification failed: ' + '; '.join(failures))
        self.stdout.write(self.style.SUCCESS('Staging dependencies verified: PostgreSQL, Redis, and durable media are ready.'))

    def _verify_database(self, failures):
        if connection.vendor != 'postgresql':
            failures.append(f'database vendor is {connection.vendor}, expected postgresql')
            return
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT 1')
                if cursor.fetchone() != (1,):
                    failures.append('PostgreSQL returned an unexpected probe result')
        except Exception as exc:
            failures.append(f'PostgreSQL probe failed ({exc.__class__.__name__})')

    def _verify_realtime(self, failures):
        if not getattr(settings, 'USE_REDIS', False):
            failures.append('Redis-backed Channels is disabled')
            return
        try:
            async_to_sync(_probe_realtime_layer)()
        except Exception as exc:
            failures.append(f'Redis channel probe failed ({exc.__class__.__name__})')

    def _verify_storage(self, failures):
        if not getattr(settings, 'USE_CLOUDINARY_MEDIA', False):
            failures.append('durable Cloudinary media storage is not configured')
            return

        probe_name = f'health/staging-{uuid.uuid4().hex}.txt'
        stored_name = None
        try:
            stored_name = default_storage.save(probe_name, ContentFile(b'afn-staging-storage-probe'))
            if not default_storage.exists(stored_name):
                failures.append('durable media write was not visible after upload')
        except Exception as exc:
            failures.append(f'durable media probe failed ({exc.__class__.__name__})')
        finally:
            if stored_name:
                try:
                    default_storage.delete(stored_name)
                except Exception as exc:
                    failures.append(f'durable media probe cleanup failed ({exc.__class__.__name__})')
