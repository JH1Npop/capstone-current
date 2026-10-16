# Project Structure

- `frontend/src/pages/`: 54 canonical route destinations grouped by public, admin, technician, client, and shared pages.
- `frontend/src/components/`, `context/`, `hooks/`, `api/`, `utils/`: reusable UI, global auth/notification state, device/network/GPS behavior, HTTP clients, and presentation helpers.
- `backend/afn_service_management/`: Django settings, ASGI/WSGI, health, logging, email backend, upload validation, and root serving.
- `backend/users/`: custom user, profiles, capability grants, auth/MFA/account recovery, admin settings, activity/change logs.
- `backend/services/`: requests, tickets, dispatch, checklists, documents, sales records, after-sales, maintenance, analytics, reports, routing, and operational commands.
- `backend/inventory/`: catalog, append-only movements, reservations, return requests, stock automation, and WebSockets.
- `backend/messages_app/`, `notifications/`, `progress/`: participant-scoped communication, per-user alerts, and persisted ticket progress.
- `backend/api/`: public landing/health/geocode/tracking compatibility routes and aggregate routing.
- `backend/history/`: retained migration shell; its redundant runtime model was deleted by migration.
- `e2e/`, backend tests, `scripts/`: isolated browser journeys, unit/API tests, release/staging/load/backup gates.
- `automation/`: scheduler wrappers; scheduling is external, not an in-process worker.
- `docs/`: current contracts, deployment runbooks, diagrams, and archived historical material. Archived docs are not implementation authority.

Application initialization is Vite -> `main.jsx` -> `App.jsx` on the frontend and Daphne/WSGI -> settings -> URL/ASGI routing on the backend. See `package.json`, `frontend/package.json`, `render.yaml`, and `backend/Procfile`.
