# Deployment

Local default: SQLite, in-memory Channels, console or configured email, Vite dev frontend, Django/Daphne backend. Tests use isolated SQLite (`settings_e2e.py` for browser tests). Staging: Render static frontend + Daphne backend, Aiven PostgreSQL, Render Redis, Cloudinary, HTTPS, and Brevo HTTPS email (`render.yaml`). Future production must use a separate PostgreSQL database and production-grade scheduler/monitoring/backups.

Build/start contracts are in root/frontend `package.json`, `build.sh`, `backend/Procfile`, Dockerfiles, and `render.yaml`. Production order is backup/preflight -> install/build -> migrate once -> collect/serve static -> start ASGI -> readiness/smoke -> schedule commands. Recovery requires a database backup/restore plan and compatible media retention; `scripts/postgres-backup.ps1` and guarded restore drill exist but real evidence is pending.

Do not use the deployed database for ordinary debugging. Reproduce code behavior locally; use deployment logs/readiness for environment-specific failures; validate PostgreSQL locking in disposable staging. Never copy production secrets or personal data locally. Docker Compose intentionally runs a development Vite server and is not a hardened production shape.
