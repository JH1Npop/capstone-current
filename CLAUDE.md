# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

- `AGENTS.md` holds the shared rules. Read it, then `docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md`, the canonical living handoff (architecture, route/schema/env contracts, validation ledger, risks).
- Handoff update, worktree safety, and commit rules are in `AGENTS.md`; follow them. CI (`.github/workflows/quality.yml`) fails changes that skip the handoff file.
- Do not assume docs are more accurate than the code. Verify against the implementation. Use the narrower contracts in `docs/security/` (`ROUTE_API_CAPABILITY_MATRIX.md`, `WORKFLOW_STATE_MACHINES.md`, and the inventory, sales, and auth contracts) only when touching those areas.

## Commands

Run from the repo root on Windows. The scripts hardcode `..\venv\Scripts\python.exe`.

```powershell
npm run dev:full          # Django (127.0.0.1:8000) + Vite (localhost:5174)
npm run env:check         # confirm DB/email target BEFORE working; local must say SQLite
npm run check:backend     # manage.py check
npm run test:backend      # manage.py test (all backend tests)
npm run build:frontend    # Vite build
npm run test:e2e          # Playwright (all specs)
npm run test:e2e:smoke    # public pages + auth specs only
npm run quality           # release gate (scripts/release-gate.mjs); quality:full adds full E2E
```

Single tests:

```powershell
cd backend
..\venv\Scripts\python.exe manage.py test services.tests.test_dashboard_role
..\venv\Scripts\python.exe manage.py test users.tests.UserRegistrationTests
cd ..
npx playwright test e2e/03-admin-workspace.spec.js -g "title substring"
```

There is no frontend lint or unit-test script. Frontend verification is the build plus Playwright.

## Environment rules

- Local dev uses SQLite. Never put `DATABASE_URL` in the local `.env`. Settings refuse it unless `ALLOW_REMOTE_DATABASE_IN_DEVELOPMENT=True`. Production requires PostgreSQL (Aiven), and staging DB credentials live only in Render's environment.
- Playwright uses an isolated `backend/db.e2e.sqlite3`. Its `e2e/global-setup.js` migrates, flushes, and seeds it via `e2e/seed-test-data-exec.py`. It never touches `backend/db.sqlite3`.
- Production media uses Cloudinary. Never expose secrets through `VITE_*` variables or docs.
- Deploy: `render.yaml`, with releases pushed to `origin/staging-deploy`. See `docs/deployment/`.

## Architecture

Django REST + Channels (Daphne/Redis) backend in `backend/`, React 18 + Vite + Tailwind SPA (PWA) in `frontend/`. Roles are `client`, `technician`, `admin`, and `superadmin`.

- **Backend apps**: `services` (service requests, tickets, scheduling, dispatch, documents, sales, SLA, analytics dashboards; the largest domain), `users` (auth, MFA, profiles, audit logs, RBAC, analytics/forecasting services), `inventory` (stock and reservation ledger), plus `notifications`, `messages_app`, `history`, `progress`, and `api` (shared/aggregate routes). Project settings and ASGI are in `backend/afn_service_management/`.
- **`services` is split by concern, not one big file.** Models are in `services/models/` (`core.py`, `documents.py`, ...), serializers in `services/serializers/`, and views in `services/views/` (plus `views_dashboard.py` and `views_follow_up.py`). Business rules live in standalone modules, not views: `scheduling_policy.py`, `business_time.py`, `sla.py`, `auto_dispatch.py`, `ticket_status.py`, `deposits.py`, and `job_progress.py`. Document generation spans `document_generation.py`, `dynamic_document_generation.py`, `pdf_document_generation.py`, and `document_templates.py`, with templates in `backend/document_templates/`. Check these modules before adding logic to a view.
- **Authorization is capability-based, not just role-based.** `backend/users/rbac.py` and `permissions.py` define capabilities enforced by the API. `frontend/src/rbac.js` mirrors them for UI gating. Changing access means updating both sides plus `docs/security/ROUTE_API_CAPABILITY_MATRIX.md`. Preserve existing RBAC when adding endpoints.
- **Workflows are state machines** (requests, tickets, documents, inventory, payments). Transitions are documented in `docs/security/WORKFLOW_STATE_MACHINES.md`. Update it when changing states.
- **Frontend** layout: `src/pages/` for routes, `src/components/` for UI (shared, documents, sales, ...), `src/api/` for axios clients per domain, `src/context/` and `src/hooks/` for state. Routing is in `src/App.jsx`.
- **E2E specs** in `e2e/` are numbered by area (public, auth, admin, technician, client, flows, accessibility, all-pages quality). New role behavior usually needs a matching update to the seed data.
- `backend/services/test_postgres_concurrency.py` needs PostgreSQL. Most other tests run on SQLite.
