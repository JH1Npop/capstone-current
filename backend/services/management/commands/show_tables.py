"""
Management command: python manage.py show_tables

Displays all database tables, their columns (with types), and row counts.
Use this to prove the database exists and stores real data.
"""

import sqlite3
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Display all database tables, their columns, and row counts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--compact',
            action='store_true',
            help='Show only table names and row counts (no columns).',
        )

    def handle(self, *args, **options):
        compact = options['compact']

        with connection.cursor() as cursor:
            # Get all table names
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
            )
            tables = [row[0] for row in cursor.fetchall()]

        self.stdout.write(self.style.SUCCESS(f'\n{"=" * 70}'))
        self.stdout.write(self.style.SUCCESS('  AFN SERVICE MANAGEMENT — DATABASE REPORT'))
        self.stdout.write(self.style.SUCCESS(f'{"=" * 70}\n'))
        self.stdout.write(f'  Total tables: {len(tables)}\n')

        total_rows = 0

        for table in tables:
            with connection.cursor() as cursor:
                # Row count
                cursor.execute(f'SELECT COUNT(*) FROM [{table}]')
                count = cursor.fetchone()[0]
                total_rows += count

                if compact:
                    status = self.style.SUCCESS(f'{count:>6} rows') if count > 0 else self.style.WARNING(f'{count:>6} rows')
                    self.stdout.write(f'  {table:50s} {status}')
                    continue

                # Column info
                cursor.execute(f'PRAGMA table_info([{table}])')
                columns = cursor.fetchall()

                status_color = self.style.SUCCESS if count > 0 else self.style.WARNING
                self.stdout.write(status_color(f'  ┌─ {table} ({count} rows)'))

                for col in columns:
                    col_id, col_name, col_type, not_null, default, pk = col
                    flags = []
                    if pk:
                        flags.append('PK')
                    if not_null:
                        flags.append('NOT NULL')
                    flag_str = f' [{", ".join(flags)}]' if flags else ''
                    self.stdout.write(f'  │  {col_name:30s} {col_type:15s}{flag_str}')

                self.stdout.write(f'  └{"─" * 50}')
                self.stdout.write('')

        self.stdout.write(self.style.SUCCESS(f'\n  Total rows across all tables: {total_rows}'))
        self.stdout.write(self.style.SUCCESS(f'{"=" * 70}\n'))
