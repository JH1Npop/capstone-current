**Migration Deep Clean**

The project now includes squashed baseline migrations for the apps with the longest history:

- `services`: `0001_squashed_0049_alter_generateddocument_data_json_and_more.py`
- `users`: `0001_squashed_0032_alter_activitylog_metadata_and_more.py`
- `notifications`: `0001_squashed_0008_alter_notificationtemplate_variables.py`

These squashed migrations are already recognized by Django and recorded in the local database.

**What This Means**

- Existing databases are still safe because the original migrations remain in place.
- New environments can use the squashed baseline instead of replaying dozens of historical files.
- The migration graph is cleaner without changing the current schema or application flow.

**Important Rule**

Do not delete the old migration files yet.

Only remove the replaced migrations after all environments that use this codebase have already applied the squashed baselines or have been rebuilt from scratch.

**Safe Future Cleanup**

When the team is sure all active environments are aligned:

1. Keep the squashed migration files.
2. Delete only the migration files listed in each squashed migration's `replaces` section.
3. Keep `__init__.py` in each migrations folder.
4. Run:
   - `python manage.py showmigrations services users notifications`
   - `python manage.py check`
5. Test a fresh database setup from zero.

**Current Verification**

- `manage.py makemigrations --check` -> no changes detected
- `manage.py migrate` -> no pending migrations
- `manage.py showmigrations services users notifications` -> squashed migrations marked applied
