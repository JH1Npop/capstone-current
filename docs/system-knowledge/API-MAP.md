# API Map

All paths are under `/api/`. Source authority is the named URL file and its viewset actions.

| Prefix | Responsibility | Main source |
| --- | --- | --- |
| `users/` | register/login/logout, verification/reset, profile, MFA, admin users/services/settings/analytics/activity | `users/urls.py`, `users/views/` |
| `services/` | catalog, requests, tickets, dispatch actions, inspections/documents, estimates, sales, after-sales, analytics/reports/maps | `services/urls.py`, `services/views/` |
| `inventory/` | categories/items/transactions/reservations/requirements and return review | `inventory/urls.py`, `inventory/views.py` |
| `messages/` | staff/direct messages and client support cases | `messages_app/urls.py`, `messages_app/views.py` |
| `notifications/` | owned list/read/read-all/unread/delete | `notifications/urls.py`, `notifications/views.py` |
| `progress/` | ticket progress records | `progress/urls.py`, `progress/views.py` |
| root explicit routes | public landing, health, tracking/geocode, dashboard/calendar, technician compatibility | `api/urls.py`, `api/views.py` |

DRF routers generate list/create and detail retrieve/update/delete according to each viewset's implemented methods and permissions. Custom actions are declared with `@action`; notable ticket actions include assignment, equipment reconciliation, document prefill/draft/generation, project updates, status/start/complete/reschedule, inspection decisions, and promotion. Request actions include approve/reject/cancel. Exact capability enforcement is documented in `docs/security/ROUTE_API_CAPABILITY_MATRIX.md` and implemented by `users/permissions.py` plus view `get_permissions()` methods.

WebSockets are separate: message rooms and inventory updates are registered by `messages_app/routing.py` and `inventory/routing.py`, authenticated in `websocket_auth.py` and consumer checks.
