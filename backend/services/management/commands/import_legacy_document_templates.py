from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Max

from services.document_generation import TEMPLATE_FILENAMES, resolve_template_path
from services.document_templates import DOCX_MIME, validate_docx
from services.models import DocumentDefinition, DocumentTemplate, DocumentTemplateVersion


class Command(BaseCommand):
    help = 'Validate and optionally register the six legacy DOCX files as inactive Standard template versions.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist missing validated baseline versions. Without this flag the command is read-only.',
        )
        parser.add_argument(
            '--actor',
            help='Username of the authorized administrator recorded as the uploader (required with --apply).',
        )

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

        summary = {'valid': 0, 'existing': 0, 'created': 0}
        for code in TEMPLATE_FILENAMES:
            definition = DocumentDefinition.objects.filter(code=code, category='core').first()
            if not definition:
                raise CommandError(f'Missing core document definition: {code}. Apply services.0065 first.')
            template = DocumentTemplate.objects.filter(definition=definition, name='Standard').first()
            if not template:
                raise CommandError(f'Missing Standard design for {code}. Apply services.0065 first.')

            source_path = resolve_template_path(code)
            if not source_path.is_file():
                raise CommandError(f'Missing legacy template file: {source_path}.')
            data = source_path.read_bytes()
            validation = validate_docx(
                SimpleUploadedFile(source_path.name, data, content_type=DOCX_MIME),
                definition,
            )
            if validation['status'] != 'valid':
                raise CommandError(f'{code} failed validation: {validation["report"]}.')
            summary['valid'] += 1

            duplicate = template.versions.filter(sha256=validation['sha256']).first()
            if duplicate:
                summary['existing'] += 1
                self.stdout.write(
                    f'{code}: valid, already registered as v{duplicate.version_number} '
                    f'({validation["sha256"][:12]}).'
                )
                continue
            if not apply_changes:
                self.stdout.write(
                    f'{code}: valid, would register {source_path.name} '
                    f'({validation["size"]} bytes, {validation["sha256"][:12]}).'
                )
                continue

            version = DocumentTemplateVersion(
                template=template,
                original_filename=Path(source_path.name).name,
                mime_type=DOCX_MIME,
                file_size=validation['size'],
                sha256=validation['sha256'],
                placeholder_manifest=validation['manifest'],
                validation_report=validation['report'],
                validation_status='valid',
                publication_status='draft',
                uploaded_by=actor,
                change_notes='Imported from the protected legacy baseline; inactive pending acceptance.',
            )
            version.file.save(source_path.name, ContentFile(data), save=False)
            try:
                with transaction.atomic():
                    locked_template = DocumentTemplate.objects.select_for_update().get(pk=template.pk)
                    existing = locked_template.versions.filter(sha256=validation['sha256']).first()
                    if existing:
                        version.file.storage.delete(version.file.name)
                        summary['existing'] += 1
                        self.stdout.write(f'{code}: concurrently registered as v{existing.version_number}; reused existing version.')
                        continue
                    version.template = locked_template
                    version.version_number = (locked_template.versions.aggregate(value=Max('version_number'))['value'] or 0) + 1
                    version.save(force_insert=True)
                    from users.signals import log_activity
                    log_activity(
                        actor=actor,
                        category='documents',
                        action='template_upload',
                        target=version,
                        message=f'Imported protected legacy baseline for {definition.name} as v{version.version_number}.',
                        metadata={
                            'template_id': locked_template.id,
                            'version_id': version.id,
                            'validation_status': version.validation_status,
                            'sha256': version.sha256,
                            'source': 'legacy_baseline_import',
                        },
                    )
            except Exception:
                if version.file and version.file.name:
                    version.file.storage.delete(version.file.name)
                raise
            summary['created'] += 1
            self.stdout.write(self.style.SUCCESS(f'{code}: registered inactive v{version.version_number}.'))

        mode = 'APPLY' if apply_changes else 'DRY RUN'
        self.stdout.write(
            self.style.SUCCESS(
                f'{mode}: {summary["valid"]} valid, {summary["created"]} created, '
                f'{summary["existing"]} already registered. No version was activated.'
            )
        )
