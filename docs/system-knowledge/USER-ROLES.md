# User Roles

Four stored roles are used: `superadmin`, `admin`, `technician`, and `client` (`users/models.py`). Self-registration creates a client pending email verification. Login is blocked until verification; administrators may optionally enroll TOTP MFA with one-time recovery codes. DRF token authentication supplies API identity.

- Superadmin: full administrative role baseline, user/capability governance, and Django-admin eligibility when flags align.
- Admin: access is capability-driven, not universally equivalent to superadmin. Capabilities split dashboard, tickets, dispatch, tracking, history, inventory, documents, analytics, reports, catalog, after-sales, messaging/support, users, settings, public site, and audit operations.
- Technician: capability/role-scoped dashboard, jobs, schedule, navigation/location, checklists, messages, history, notifications, profile, and assigned-client visibility.
- Client: own dashboard, requests/details/tracking, estimates, service and purchase records, support/messages, notifications, and profile.

Frontend route guards improve navigation but backend permissions and queryset ownership are authoritative. Object filtering restricts clients to owned records and technicians to assigned/participating records. Unauthorized API calls return 401/403/404 as appropriate; frontend protected routes redirect to the first allowed workspace. See `frontend/src/rbac.js`, `users/rbac.py`, `users/permissions.py`, and the route/API capability matrix.
