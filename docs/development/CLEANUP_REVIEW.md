# Codebase Cleanup Review

This document records the cleanup completed before starting mobile app work.

## Completed

- Removed generated/debug artifacts from git and disk:
  - `backend/admin_dashboard_response.txt`
  - `backend/db-backup-20260320-223713.sqlite3`
  - `backend/db-backup-20260322-133854.sqlite3`
  - `backend/media/checklists/ticket-1/*`
  - `debug_output.txt`
  - `test_output.txt`
  - `track_test.txt`
- Removed duplicate local Python environment:
  - `backend/venv/`
- Removed local generated folders:
  - `frontend/dist/`
  - `frontend/.vite/`
  - `frontend/.vite-check/`
  - backend `__pycache__/` folders
- Removed local `desktop.ini` if present.
- Removed archived unsafe one-off scripts:
  - `docs/archive/unsafe-dev-scripts/`
- Applied pending migration:
  - `services.0025_slarule`
- Verified:
  - `python manage.py check`
  - `npm run build`

## Files To Keep

These are project files and should stay:

```text
backend/requirements.txt
backend/runtime.txt
backend/manage.py
docker-compose.yml
frontend/package.json
frontend/package-lock.json
frontend/vite.config.js
frontend/tailwind.config.js
```

## Intentional Reorganization Still In Progress

The worktree still contains a large app reorganization. These are not cleanup leftovers; they are source changes that should be reviewed and committed as feature/refactor work.

Examples:

- `backend/services/views.py` split into `backend/services/views/`
- `backend/users/views.py` split into `backend/users/views/`
- old root docs moved into `docs/` and `docs/archive/`
- old frontend component files replaced by organized `components/layout`, `components/shared`, and `components/ui`
- old supervisor/follow-up/client pages consolidated or redirected
- new Docker and automation files added

## Suggested Commit Order

1. Cleanup and ignore rules:
   - `.gitignore`
   - removed generated/runtime files
   - `docs/development/CLEANUP_REVIEW.md`
   - removal of `docs/archive/unsafe-dev-scripts/`
2. Backend reorganization:
   - split views packages
   - migrations
   - management commands
   - tests
3. Frontend reorganization:
   - route/page consolidation
   - API barrel updates
   - layout/shared/ui component folders
4. Deployment and docs:
   - Docker files
   - automation folder
   - active docs/archive docs

## Remaining Cleanup Ideas

- Split the largest backend modules:
  - `backend/services/tests.py`
  - `backend/services/views/reports.py`
  - `backend/services/views/tickets.py`
  - `backend/services/views/helpers.py`
  - `backend/services/views_dashboard.py`
  - `backend/services/serializers.py`
- Split the largest frontend pages into page-local components:
  - `AdminJobHistory.jsx`
  - `TechnicianChecklist.jsx`
  - `AdminServiceTickets.jsx`
  - `AdminUserManagement.jsx`
  - `ClientRequestDetail.jsx`
  - `TechnicianJobs.jsx`
  - `AdminAnalytics.jsx`
- Keep active documentation aligned with the Firebase removal and the current in-app/SMTP notification flow.
