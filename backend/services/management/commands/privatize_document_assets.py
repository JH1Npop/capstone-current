import cloudinary.uploader
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from afn_service_management.storage import AFNMediaCloudinaryStorage
from services.models import DocumentAttachment, DocumentOutput, DocumentTemplateVersion


class Command(BaseCommand):
    help = 'Inspect and optionally move existing Cloudinary document assets from public upload delivery to authenticated delivery.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Change legacy public document assets to authenticated delivery.')
        parser.add_argument('--actor', help='Authorized administrator username recorded in the audit log (required with --apply).')

    @staticmethod
    def _asset_names():
        names = set()
        for model in (DocumentTemplateVersion, DocumentOutput, DocumentAttachment):
            for name in model.objects.exclude(file='').values_list('file', flat=True):
                if name:
                    names.add(name)
        return sorted(names)

    @staticmethod
    def _classify(storage, name):
        authenticated = storage._request('HEAD', storage._resource_url(name, 'authenticated'))
        if authenticated.status_code == 200:
            return 'authenticated'
        if authenticated.status_code not in {401, 403, 404}:
            authenticated.raise_for_status()
        public = storage._request('HEAD', storage._resource_url(name, 'upload'))
        if public.status_code == 200:
            return 'legacy_public'
        if public.status_code not in {401, 403, 404}:
            public.raise_for_status()
        return 'missing'

    def handle(self, *args, **options):
        apply_changes = options['apply']
        actor = None
        if apply_changes:
            username = (options.get('actor') or '').strip()
            if not username:
                raise CommandError('--actor is required with --apply.')
            actor = get_user_model().objects.filter(username=username, is_active=True).first()
            if not actor or not (actor.is_superuser or actor.role in {'admin', 'superadmin'}):
                raise CommandError('--actor must identify an active administrator or superadministrator.')

        storage = default_storage
        storage._setup()
        storage = storage._wrapped
        if not isinstance(storage, AFNMediaCloudinaryStorage):
            raise CommandError('Configured default storage is not AFNMediaCloudinaryStorage; no Cloudinary asset was changed.')

        names = self._asset_names()
        counts = {'authenticated': 0, 'legacy_public': 0, 'migrated': 0, 'missing': 0}
        for name in names:
            if not storage._is_protected_document(name):
                raise CommandError(f'Refusing non-document asset path: {name}.')
            state = self._classify(storage, name)
            counts[state] += 1
            if state == 'authenticated':
                self.stdout.write(f'{name}: already authenticated.')
                continue
            if state == 'missing':
                self.stdout.write(self.style.ERROR(f'{name}: missing from authenticated and legacy public delivery.'))
                continue
            if not apply_changes:
                self.stdout.write(f'{name}: legacy public; would migrate to authenticated delivery.')
                continue

            result = cloudinary.uploader.rename(
                name,
                name,
                resource_type=storage._get_resource_type(name),
                type='upload',
                to_type='authenticated',
                invalidate=True,
            )
            if result.get('public_id') != name:
                raise CommandError(f'Cloudinary returned an unexpected public ID while migrating {name}.')
            if self._classify(storage, name) != 'authenticated':
                raise CommandError(f'Authenticated read verification failed after migrating {name}. Rerun the command safely.')
            counts['migrated'] += 1
            self.stdout.write(self.style.SUCCESS(f'{name}: migrated and authenticated read verified.'))

        if counts['missing']:
            raise CommandError(
                f'{counts["missing"]} referenced document asset(s) are missing. '
                'No database reference was removed; investigate storage before activation.'
            )
        if apply_changes and counts['migrated']:
            from users.signals import log_activity
            log_activity(
                actor=actor,
                category='documents',
                action='document_storage_privatize',
                message=f'Migrated {counts["migrated"]} document asset(s) to authenticated Cloudinary delivery.',
                metadata={
                    'migrated_count': counts['migrated'],
                    'already_authenticated_count': counts['authenticated'],
                },
            )
        mode = 'APPLY' if apply_changes else 'DRY RUN'
        self.stdout.write(self.style.SUCCESS(
            f'{mode}: {len(names)} referenced asset(s); {counts["authenticated"]} already authenticated, '
            f'{counts["legacy_public"]} legacy public, {counts["migrated"]} migrated, 0 missing.'
        ))
