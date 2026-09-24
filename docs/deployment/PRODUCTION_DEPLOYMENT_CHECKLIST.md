# Production Deployment Checklist

Status: Current contract

This checklist targets a separate React frontend and Django/Daphne backend,
with Aiven PostgreSQL, durable media storage, managed Redis, and SMTP. Secrets
belong in the hosting provider's secret manager, never in Git or frontend
`VITE_*` variables.

## Required services and environment

| Area | Required production configuration |
| --- | --- |
| Django | `DJANGO_ENV=production`, `DEBUG=False`, strong `SECRET_KEY`, `ENABLE_HTTPS=True` |
| Stage marker | `DEPLOYMENT_STAGE=staging` during staging validation and `DEPLOYMENT_STAGE=production` in production |
| Hosts | Exact `ALLOWED_HOSTS`, HTTPS `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, and `FRONTEND_BASE_URL` |
| PostgreSQL | Aiven `DATABASE_URL`; prefer `DB_SSLMODE=verify-full` and `DB_SSLROOTCERT` with the project CA |
| Media | All three Cloudinary credentials, or an explicitly approved persistent volume with `ALLOW_LOCAL_MEDIA_IN_PRODUCTION=True` |
| Realtime | `USE_REDIS=True` and the managed provider's `REDIS_URL` (`rediss://` when TLS is supported) |
| Email | SMTP backend, host/port/TLS choice, username, app password, and verified sender |
| Frontend | `VITE_API_BASE_URL=https://backend-host.example/api` only; never expose backend secrets through Vite |
| Technician location | Approved `TRACKING_REGION_*` bounds/label, `TECHNICIAN_LOCATION_RETENTION_DAYS`, and `TECHNICIAN_LOCATION_TRAIL_MINUTES`; retain the daily cleanup automation |

The backend intentionally refuses unsafe production startup when critical
values are absent. In-memory Channels and SQLite remain development/test tools.

## Pre-deployment gate

1. Back up the active database and verify the backup can be read.
2. Review pending migrations and run them on staging first.
3. Run `python manage.py check --deploy` under the real production environment.
4. Run `python manage.py makemigrations --check --dry-run`.
5. Run `npm run quality` and require its Django checks, dependency integrity,
   migration drift, backend tests, frontend build, and Playwright smoke suite to pass.
6. Require clean Python and npm security audits (`pip-audit` plus root/frontend
   `npm audit --audit-level=high`); the GitHub quality workflow runs these in its
   dependency-security job.
7. Run `npm run quality:staging` against disposable production-shaped staging
   and require all dependency, PostgreSQL concurrency, and perimeter probes to
   pass. Follow [Production-shaped staging validation](STAGING_VALIDATION.md).
8. Confirm `.env`, databases, media, logs, test artifacts, and credentials are untracked.
9. Approve the technician location policy, give it to field staff, and verify the configured region and retention period match actual operations.
10. Record the current application revision and database backup identifier for rollback.

## Deployment order

1. Put the application into a maintenance window if a migration is not backward-compatible.
2. Apply committed migrations once with `python manage.py migrate --noinput`.
3. Collect static files with `python manage.py collectstatic --noinput` when the platform does not do it during the image build.
4. Start Daphne using the repository `Procfile` or container command.
5. Deploy the frontend with the final backend API URL.
6. Verify `/api/health/liveness/` and `/api/health/readiness/` before accepting traffic.
7. Smoke-test login, one owned read, one notification/WebSocket connection, one media read, and email delivery.
8. Configure `python manage.py run_operational_automations --mode frequent`
   every 30 minutes and `--mode daily` once per day. Record the last successful
   run of each group and alert on non-zero exits. Do not run overlapping copies.

## Rollback and recovery

- Roll back application code to the recorded revision only when its schema is
  compatible with the migrated database.
- Restore a database backup only through an approved recovery window; restoring
  overwrites newer production data.
- Never edit or remove migration history to force a rollback.
- Preserve audit, inventory, request, ticket, document, and after-sales history.
- If Redis fails, treat readiness as unavailable and restore the managed service;
  do not silently switch a multi-instance deployment to in-memory Channels.

## Operations after release

- Monitor application errors, probe failures, email failures, database capacity,
  Redis connections, Cloudinary usage, and response latency.
- Schedule encrypted PostgreSQL backups and periodic restore drills.
- Rotate database, Redis, Cloudinary, SMTP, and Django secrets after exposure or
  personnel/access changes.
- Run dependency audits and the GitHub quality workflow for every release.
- Monitor both operational scheduler groups separately from web-process health;
  deploying the command without cron/platform scheduling does not activate SLA
  escalation, catch-up auto-dispatch, maintenance reminders, analytics jobs, or
  technician-location retention cleanup.

Primary references:

- Django deployment checklist: https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/
- Aiven Python/PostgreSQL TLS guidance: https://aiven.io/docs/products/postgresql/howto/connect-python
- Channels production layer guidance: https://channels.readthedocs.io/en/latest/topics/channel_layers.html
- Cloudinary Django integration: https://cloudinary.com/documentation/django_integration
