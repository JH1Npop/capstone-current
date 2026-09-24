# AFN Service Management System

AFN is a full-stack service-management platform for solar engineering operations. It combines a Django REST/Channels backend with a React and Vite frontend, plus Playwright end-to-end tests.

## Repository layout

```text
.
|-- backend/            Django project and domain applications
|   |-- afn_service_management/  Project settings, URLs, ASGI, and WSGI
|   |-- services/       Service requests, tickets, documents, and analytics
|   |-- users/          Authentication, profiles, permissions, and audit logs
|   |-- inventory/      Inventory and reservation workflows
|   |-- scripts/        Maintenance and administrative utilities
|   `-- local_backups/  Ignored local SQLite snapshots
|-- frontend/           React/Vite application
|   `-- src/            Pages, components, hooks, services, and utilities
|-- e2e/                Playwright end-to-end tests
|-- automation/         Local scheduled-task helpers
|-- docs/               Architecture, feature, deployment, and academic docs
|-- docker-compose.yml  Local multi-container stack
|-- playwright.config.js
`-- package.json        Workspace-level commands
```

Runtime data, generated builds, dependencies, uploaded media, logs, secrets, and local databases are intentionally excluded from source control.

## Local setup

1. Copy `.env.example` to `.env` and configure the required values.
2. Create and activate a Python virtual environment, then install `backend/requirements.txt`.
3. Install the locked workspace and frontend packages with `npm ci` and `npm --prefix frontend ci`.
4. Apply migrations with `python backend/manage.py migrate`.
5. Start both applications with `npm run dev:full`.

The frontend normally runs at `http://localhost:5174`; the Django API runs at `http://127.0.0.1:8000`.

## Common commands

```powershell
npm run dev:full
npm run check:backend
npm run test:backend
npm run build:frontend
npx playwright test
```

Playwright uses an ignored, isolated `backend/db.e2e.sqlite3` database. Its
global setup migrates, flushes, and seeds only that browser-test database; it
does not modify the development `backend/db.sqlite3` database.

For Docker-based development, set `SECRET_KEY` in `.env`, then run `docker compose up --build`.

For production, follow the [production deployment checklist](docs/deployment/PRODUCTION_DEPLOYMENT_CHECKLIST.md)
and [Aiven PostgreSQL guide](docs/deployment/AIVEN_DEPLOYMENT.md). Do not copy a
local `.env` file into Git or expose database, Cloudinary, Redis, SMTP, or Django
secrets through frontend `VITE_*` variables.

## Documentation

See [docs/README.md](docs/README.md) for the documentation index. Frontend-specific notes are in [frontend/README.md](frontend/README.md), and local database snapshot guidance is in [backend/local_backups/README.md](backend/local_backups/README.md).
