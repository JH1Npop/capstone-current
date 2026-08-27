import sqlite3
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from users.models import User


class Command(BaseCommand):
    help = 'Import verified users from the legacy SQLite backup into the current database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--source',
            required=True,
            help='Path to the SQLite database backup file to inspect.',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually write changes. Without this flag, the command runs as a dry run.',
        )
        parser.add_argument(
            '--only-active',
            action='store_true',
            help='Import only users that are both verified and active in the SQLite backup.',
        )
        parser.add_argument(
            '--overwrite',
            action='store_true',
            help='Overwrite existing matching users with SQLite values instead of only filling missing data.',
        )

    def handle(self, *args, **options):
        source = Path(options['source'])
        apply_changes = bool(options['apply'])
        only_active = bool(options['only_active'])
        overwrite = bool(options['overwrite'])

        if not source.exists():
            raise CommandError(f'SQLite backup not found: {source}')

        users = self._load_sqlite_users(source=source, only_active=only_active)
        if not users:
            self.stdout.write(self.style.WARNING('No matching verified users were found in the SQLite backup.'))
            return

        summary = {
            'create': 0,
            'update': 0,
            'skip': 0,
        }

        operations = []
        for record in users:
            existing_user = self._find_existing_user(record)
            if existing_user is None:
                summary['create'] += 1
                operations.append(('create', record, None))
                continue

            changed_fields = self._build_update_payload(existing_user, record, overwrite=overwrite)
            if changed_fields:
                summary['update'] += 1
                operations.append(('update', record, (existing_user, changed_fields)))
            else:
                summary['skip'] += 1
                operations.append(('skip', record, existing_user))

        self.stdout.write(
            f"SQLite verified users found: {len(users)} | "
            f"create: {summary['create']} | update: {summary['update']} | skip: {summary['skip']}"
        )

        preview = operations[:10]
        for action, record, detail in preview:
            self.stdout.write(
                f" - {action.upper():6} username={record['username']} "
                f"email={record['email'] or '-'} role={record['role']} active={record['is_active']}"
            )
        if len(operations) > len(preview):
            self.stdout.write(f" ... {len(operations) - len(preview)} more")

        if not apply_changes:
            self.stdout.write(self.style.WARNING('Dry run only. Re-run with --apply to import these users.'))
            return

        with transaction.atomic():
            for action, record, detail in operations:
                if action == 'create':
                    self._create_user(record)
                elif action == 'update':
                    existing_user, changed_fields = detail
                    for field, value in changed_fields.items():
                        setattr(existing_user, field, value)
                    existing_user.save(update_fields=list(changed_fields.keys()))

        self.stdout.write(self.style.SUCCESS('Verified SQLite users imported successfully.'))

    def _load_sqlite_users(self, *, source: Path, only_active: bool):
        connection = sqlite3.connect(source)
        connection.row_factory = sqlite3.Row
        cursor = connection.cursor()

        query = """
            SELECT
                id,
                password,
                last_login,
                is_superuser,
                username,
                first_name,
                last_name,
                email,
                is_staff,
                is_active,
                date_joined,
                role,
                phone,
                address,
                status,
                created_at,
                updated_at,
                email_verified,
                email_verification_sent_at
            FROM users_user
            WHERE email_verified = 1
        """
        if only_active:
            query += " AND is_active = 1"
        query += " ORDER BY id"

        rows = cursor.execute(query).fetchall()
        connection.close()

        return [dict(row) for row in rows]

    def _find_existing_user(self, record):
        username = str(record.get('username') or '').strip()
        email = str(record.get('email') or '').strip()

        if username:
            existing_user = User.objects.filter(username__iexact=username).first()
            if existing_user:
                return existing_user

        if email:
            existing_user = User.objects.filter(email__iexact=email).first()
            if existing_user:
                return existing_user

        return None

    def _build_update_payload(self, user, record, *, overwrite):
        fields = {
            'password': record.get('password'),
            'last_login': record.get('last_login'),
            'is_superuser': bool(record.get('is_superuser')),
            'first_name': record.get('first_name') or '',
            'last_name': record.get('last_name') or '',
            'email': record.get('email') or '',
            'is_staff': bool(record.get('is_staff')),
            'is_active': bool(record.get('is_active')),
            'date_joined': record.get('date_joined'),
            'role': record.get('role') or 'client',
            'phone': record.get('phone'),
            'address': record.get('address'),
            'status': record.get('status') or 'active',
            'created_at': record.get('created_at'),
            'updated_at': record.get('updated_at'),
            'email_verified': bool(record.get('email_verified')),
            'email_verification_sent_at': record.get('email_verification_sent_at'),
        }

        changed_fields = {}
        for field, incoming_value in fields.items():
            current_value = getattr(user, field)

            if overwrite:
                if current_value != incoming_value:
                    changed_fields[field] = incoming_value
                continue

            if self._should_fill(current_value, incoming_value):
                changed_fields[field] = incoming_value

        return changed_fields

    def _should_fill(self, current_value, incoming_value):
        if incoming_value in [None, '']:
            return False
        if current_value in [None, '']:
            return True
        if current_value is False and incoming_value is True:
            return True
        return False

    def _create_user(self, record):
        user = User(
            username=record.get('username') or '',
            first_name=record.get('first_name') or '',
            last_name=record.get('last_name') or '',
            email=record.get('email') or '',
            is_staff=bool(record.get('is_staff')),
            is_active=bool(record.get('is_active')),
            is_superuser=bool(record.get('is_superuser')),
            last_login=record.get('last_login'),
            date_joined=record.get('date_joined'),
            role=record.get('role') or 'client',
            phone=record.get('phone'),
            address=record.get('address'),
            status=record.get('status') or 'active',
            email_verified=bool(record.get('email_verified')),
            email_verification_sent_at=record.get('email_verification_sent_at'),
            created_at=record.get('created_at'),
            updated_at=record.get('updated_at'),
        )
        user.password = record.get('password') or ''
        user.save()
