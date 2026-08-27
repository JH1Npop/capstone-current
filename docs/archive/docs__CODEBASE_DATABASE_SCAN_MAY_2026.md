# Codebase And Database Scan

Scan date: May 17, 2026
Project: AFN Service Management

## Scope

This scan reviewed the repository end to end with extra focus on database-related code:

- Django settings and database configuration
- Django models, migrations, and schema shape
- ORM usage in views, serializers, management commands, and automation
- Frontend API calls connected to persisted data
- Local verification commands that could run in the current environment

This report and the backend virtual environment config were updated during the scan.

## Repository Shape

The outer folder is a wrapper. The actual app lives in:

```text
sanagumana/
```

The project is a Django + React/Vite application:

- Backend: `backend/`
- Frontend: `frontend/`
- Database snapshots/local DB: `backend/*.sqlite3`
- Database/audit docs: `docs/`
- Automation scripts: `automation/`

The worktree is currently very dirty, with many modified, deleted, and untracked files. Treat this scan as a review of the current filesystem state, not a clean git revision.

## Database Configuration

Database configuration lives in:

```text
backend/afn_service_management/settings.py
```

The backend defaults to SQLite:

```text
DATABASE_ENGINE=sqlite3
SQLITE_DB_PATH=db.sqlite3
```

It also supports PostgreSQL through environment variables:

```text
DATABASE_ENGINE=postgresql
DB_NAME
DB_USER
DB_PASSWORD
DB_HOST
DB_PORT
```

The local active DB appears to be:

```text
backend/db.sqlite3
```

## Main Database Areas

The schema is organized around these Django apps:

- `users`: custom `User`, role profiles, capability grants, admin settings, change log
- `services`: service types, requests, tickets, assignments, status history, inspections, after-sales, maintenance, analytics, forecasts
- `inventory`: categories, items, reservations, transactions, service-type inventory requirements
- `notifications`: notifications, templates, logs, Firebase tokens
- `messages_app`: ticket-linked messages
- `progress`: ticket progress updates
- `history`: completed service history

## Key Findings

### 1. Backend Verification Was Repaired

The backend virtual environment was initially broken:

```text
backend/venv/pyvenv.cfg
```

It originally pointed to:

```text
C:\Python314\python.exe
```

That executable path was invalid for this machine. A usable Python install exists at:

```text
C:\Users\Iman\AppData\Local\Programs\Python\Python314\python.exe
```

After correcting `backend/venv/pyvenv.cfg`, these backend checks now run successfully:

```powershell
backend\venv\Scripts\python.exe backend\manage.py check
backend\venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
backend\venv\Scripts\python.exe backend\manage.py showmigrations --plan
backend\venv\Scripts\python.exe backend\manage.py show_tables --compact
```

Observed results:

- `manage.py check`: passed
- `makemigrations --check --dry-run`: `No changes detected`
- `showmigrations --plan`: all current migrations applied
- `show_tables --compact`: succeeded

Remaining warning:

- Firebase initialization warns because the configured certificate material is invalid for local initialization

### 2. Frontend Build Passes

The frontend production build completed successfully:

```powershell
npm run build
```

Run from:

```text
frontend/
```

### 3. Role Migration Is Mostly Modernized, But Legacy References Remain

The active `User` model now supports:

```text
superadmin
admin
technician
client
```

Legacy roles still appear in old files, tests, scripts, and some compatibility naming:

```text
follow_up
supervisor
after_sales
```

Most live permission classes map these concepts back to admin workspace roles, but one live risk remains in inventory notifications:

```text
backend/inventory/automation.py
```

The default notification roles are:

```python
target_roles = roles or ['admin', 'supervisor']
```

Since `supervisor` has been removed as a real role, and `superadmin` is omitted, inventory shortage notifications can miss the owner/superadmin.

Recommendation: change the default target roles to:

```python
['superadmin', 'admin']
```

### 4. Technician Profile Fields Are Nested In Backend But Expected Top-Level In Frontend

Backend user serialization nests technician-specific data under:

```text
technician_profile
```

The frontend normalization expects these fields at the top level:

```text
is_available
current_latitude
current_longitude
```

Affected backend file:

```text
backend/users/serializers.py
```

Affected frontend file:

```text
frontend/src/api/core.js
```

Impact:

- Technicians can appear unavailable/offline in UI even when `TechnicianProfile.is_available` is correct.
- Maps/tracking/admin dispatch may receive `0` coordinates from frontend normalization if only nested profile values exist.

Recommendation: either expose compatibility top-level fields from `UserSerializer`, or update frontend normalization to read `user.technician_profile`.

### 5. ChangeLog Tracks Stale Field Names

ChangeLog tracking includes:

```python
'User': ['role', 'status', 'is_available', 'email', 'is_active']
```

But `is_available` now lives on `TechnicianProfile`, not directly on `User`.

It also includes:

```python
'AfterSalesCase': ['status', 'priority', 'case_type', 'assigned_to_id', 'resolution']
```

But the actual model field is:

```text
resolution_notes
```

Affected file:

```text
backend/users/signals.py
```

Impact:

- Some audit rows may not capture the intended before/after values.
- Availability changes are saved on profile rows and may not be captured by the user-level ChangeLog.

Recommendation: update tracked fields and add explicit tracking for `TechnicianProfile` if technician availability/location changes matter for audit.

### 6. Auto-Dispatch Adds Primary Technician As Crew

Manual/API assignment keeps crew members separate from the lead technician.

Auto-dispatch command path does this:

```python
TicketCrewAssignment.objects.get_or_create(
    ticket=ticket,
    technician=technician,
)
```

Affected file:

```text
backend/services/auto_dispatch.py
```

Impact:

- The same technician can be both `ServiceTicket.technician` and a row in `TicketCrewAssignment`.
- UI/API code that treats crew as additional technicians may show duplicate team members or count team size incorrectly.

Recommendation: remove the crew assignment for the lead technician in `auto_assign_technician`, or document and normalize the invariant everywhere.

### 7. Inventory Transactions Need More Guardrails

Inventory transaction save logic updates item quantities directly:

```text
backend/inventory/models.py
```

Potential risks:

- Issue/transfer can drive stock negative unless blocked at serializer/view level.
- Reservation cancellation can reduce `reserved_quantity` below zero if inconsistent data is submitted.
- Concurrent stock operations could race without row-level locking.

Recommendation:

- Validate non-negative `quantity` and `reserved_quantity`.
- Consider `select_for_update()` around item updates in high-concurrency paths.
- Keep all stock movement through service functions rather than direct model saves where possible.

## Verification Performed

Successful:

```powershell
backend\venv\Scripts\python.exe --version
backend\venv\Scripts\python.exe backend\manage.py check
backend\venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
backend\venv\Scripts\python.exe backend\manage.py showmigrations --plan
backend\venv\Scripts\python.exe backend\manage.py show_tables --compact
npm run build
backend\venv\Scripts\python.exe -c "import sqlite3; ..."
```

Current backend verification summary:

```text
Python 3.14.5
System check identified no issues.
No changes detected by makemigrations.
All current migrations are applied.
Database report command succeeded.
SQLite integrity_check returned ok.
SQLite foreign_key_check returned no violations.
```

## Recommended Next Steps

1. Run SQLite integrity and foreign-key checks against `backend/db.sqlite3`.
2. Fix the live inventory notification role target.
3. Resolve the backend/frontend technician profile field mismatch.
4. Fix ChangeLog tracked fields for profile and after-sales data.
5. Decide whether lead technicians should ever appear in `TicketCrewAssignment`.
6. Repair Firebase credential configuration for local or production use.

## Commands To Re-Run As Needed

```powershell
backend\venv\Scripts\python.exe backend\manage.py check
backend\venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
backend\venv\Scripts\python.exe backend\manage.py showmigrations --plan
backend\venv\Scripts\python.exe backend\manage.py show_tables --compact
```

If SQLite CLI is available:

```powershell
sqlite3 backend\db.sqlite3 "PRAGMA integrity_check;"
sqlite3 backend\db.sqlite3 "PRAGMA foreign_key_check;"
```

## AI Agent Project Context

The following context is suitable as an AI agent prompt for future work on this codebase. It has been adjusted to match the current filesystem scan where the original notes were out of date.

### Role

You are a senior full-stack developer and technical assistant embedded in the AFN Service Management project. You assist with debugging, feature development, code review, architecture decisions, database work, and deployment tasks.

### Project Overview

AFN Service Management is a full-stack Django REST Framework + React/Vite application for managing field service operations:

- Service requests
- Technician dispatch
- Inventory
- Customer communication
- After-sales workflows
- Maintenance follow-up
- Reporting and analytics

Current stack:

- Backend: Django + Django REST Framework
- Frontend: React + Vite + TailwindCSS
- Database: SQLite for local development, PostgreSQL-ready through environment variables
- Auth: DRF token auth using `Authorization: Token <token>`
- Realtime: Django Channels support exists; Redis is optional/configurable and currently falls back to in-memory unless `USE_REDIS=true`
- Maps/routing: Leaflet frontend and OpenRouteService integration

### Current Role Model

The active `User.role` choices in `backend/users/models.py` are:

```text
superadmin
admin
technician
client
```

Older role names still appear in legacy files, tests, scripts, routes, and capability labels:

```text
supervisor
follow_up
after_sales
```

These should be treated as legacy or workspace concepts unless the current active model explicitly supports them. Current admin/supervisor/follow-up style access is mostly represented through admin roles, `ManagementProfile.admin_scope`, and capability strings.

Admin scope values:

```text
service_follow_up
task_management
operations
general
```

Fine-grained permissions are represented by `UserCapabilityGrant`.

Frontend capability checks live in:

```text
frontend/src/rbac.js
```

### Key File Locations

| Area | File |
| --- | --- |
| User model and role profiles | `backend/users/models.py` |
| User serializers | `backend/users/serializers.py` |
| User API routes | `backend/users/urls.py` |
| User/admin views | `backend/users/views/` |
| Permission classes | `backend/users/permissions.py` |
| RBAC/capability definitions | `backend/users/rbac.py` |
| Service and ticket models | `backend/services/models.py` |
| Service API routes | `backend/services/urls.py` |
| Ticket views | `backend/services/views/tickets.py` |
| Technician views | `backend/services/views/technician.py` |
| Shared service helpers | `backend/services/views/helpers.py` |
| Auto-dispatch logic | `backend/services/auto_dispatch.py` |
| Inventory models/views | `backend/inventory/models.py`, `backend/inventory/views.py` |
| Inventory automation | `backend/inventory/automation.py` |
| Notifications | `backend/notifications/` |
| Messages | `backend/messages_app/` |
| Django settings | `backend/afn_service_management/settings.py` |
| Root API routes | `backend/afn_service_management/urls.py`, `backend/api/urls.py` |
| React auth context | `frontend/src/context/AuthContext.jsx` |
| React app router | `frontend/src/App.jsx` |
| Current layout/sidebar | `frontend/src/components/layout/Sidebar.jsx` |
| Axios core API layer | `frontend/src/api/core.js` |
| Frontend API modules | `frontend/src/api/services.js`, `frontend/src/api/admin.js`, `frontend/src/api/technician.js` |

### Core Data Model Summary

```text
User
  ├── TechnicianProfile
  ├── ClientProfile
  ├── ManagementProfile
  └── UserCapabilityGrant

ServiceRequest
  └── ServiceTicket
        ├── technician
        ├── supervisor
        ├── crew_assignments
        ├── ServiceStatusHistory
        ├── InspectionChecklist
        ├── AfterSalesCase
        ├── MaintenanceSchedule
        └── inventory reservations / transactions
```

Ticket status values in the current model:

```text
Not Started
In Progress
Completed
On Hold
Cancelled
```

Service request status values:

```text
Pending
Approved
In Progress
Completed
Cancelled
```

### Important API Endpoints

Auth:

```text
POST /api/users/login/
GET /api/users/me/
POST /api/users/register/
POST /api/users/password_reset_request/
POST /api/users/password_reset_confirm/
```

Services:

```text
GET /api/services/service-types/
GET /api/services/service-requests/
POST /api/services/service-requests/
POST /api/services/service-requests/{id}/approve/
POST /api/services/service-requests/{id}/cancel/
GET /api/services/service-tickets/
POST /api/services/service-tickets/{id}/assign/
POST /api/services/service-tickets/{id}/auto_assign/
POST /api/services/service-tickets/{id}/request_reschedule/
POST /api/services/service-tickets/{id}/reschedule/
POST /api/services/service-tickets/{id}/submit_feedback/
GET /api/services/follow-up-cases/
```

Technician/service operations:

```text
GET /api/services/technician-dashboard/
GET /api/services/technician-jobs/
GET /api/services/technician-schedule/
POST /api/services/technician/location/
```

Inventory:

```text
GET /api/inventory/items/
GET /api/inventory/categories/
GET /api/inventory/reservations/
GET /api/inventory/transactions/
GET /api/inventory/service-type-requirements/
```

Notifications and messages:

```text
GET /api/notifications/
POST /api/notifications/{id}/mark_read/
POST /api/notifications/mark_all_read/
GET /api/messages/
POST /api/messages/
```

### Frontend Routing Summary

Frontend routes are defined in:

```text
frontend/src/App.jsx
```

Main route groups:

```text
/admin/*
/technician/*
/client/*
/follow-up/*
```

Some legacy `/supervisor/*` routes redirect to `/admin/*`.

### Authentication Flow

The frontend login flow is:

1. `POST /api/users/login/`
2. Store token and user in `localStorage`
3. Set Axios `Authorization: Token {token}`
4. Load current user from `GET /api/users/me/`
5. Logout clears token, user, and auth headers

Key files:

```text
frontend/src/context/AuthContext.jsx
frontend/src/api/core.js
```

### Current Known Issues And Priorities

High priority:

- Technician profile fields are nested in backend responses but some frontend code expects top-level fields.
- ChangeLog tracks stale field names for technician availability and after-sales resolution.
- Inventory shortage notification defaults include removed `supervisor` role and omit `superadmin`.
- Firebase local initialization warns because the configured certificate material is invalid.

Production concerns:

- SQLite should remain development-only; use PostgreSQL for production.
- CORS origins should be locked down before go-live.
- Secret keys, Firebase credentials, ORS keys, email credentials, and other secrets must come from environment variables.
- Redis should be configured if production WebSocket/channel behavior is required.

Medium priority:

- Add integration tests for request-to-ticket, dispatch, inventory reservation, notification, and after-sales flows.
- Add OpenAPI/Swagger docs for maintainability.
- Improve error handling consistency on API endpoints.
- Decide whether lead technicians should ever be duplicated in `TicketCrewAssignment`.

### Django Apps Observed In Settings

Active apps in `INSTALLED_APPS` include:

```text
users
services
progress
messages_app
notifications
history
inventory
```

The earlier `forecast` app appears to be removed or disabled in the current filesystem state, although old docs and references may remain.

### Dev Commands

Backend, after Python/venv is repaired:

```powershell
cd backend
python manage.py migrate
python manage.py runserver
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

### Agent Behavior Rules

- Always reference exact file paths when suggesting code changes.
- Preserve RBAC and capability checks.
- Distinguish local development concerns from production concerns.
- When editing Django views, check and preserve the endpoint permission class.
- When editing React components, check capability guards from `frontend/src/rbac.js`.
- For new API endpoints, follow the pattern: model/serializer if needed, view, URL/router registration, frontend API function, React usage.
- Flag security risks immediately.
- Do not reintroduce removed legacy roles as active `User.role` values without an explicit model/migration decision.
- Treat SQLite as development-only.
- If runtime checks are needed, fix Python/venv first before trusting backend behavior.
