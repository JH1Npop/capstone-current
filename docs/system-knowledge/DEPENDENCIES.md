# Dependency Map

`users` is upstream of every protected operation. `services` is the central hub. `inventory` and `messages_app` attach to users and service tickets; `notifications` and `progress` are downstream projections/communications; analytics and reports read across all operational domains.

High-coupling change points:

- User roles/capabilities: backend permissions, querysets, frontend RBAC/routes/sidebar, Django admin, tests.
- Request/ticket status: serializers, transition views/helpers, progress/history, notifications, dashboards, technician/client pages, reports/analytics, after-sales, sales records.
- Service catalog: request forms, dispatch skill matching, checklists, inventory requirements, forecast grouping.
- Inventory quantities: constraints, ledger automation, reservations, dispatch plan, technician completion/return, dashboards.
- Record IDs/serializer fields: API clients, tables/dialogs, deep links, exports, tests.
- Scheduling fields: dispatch, calendar, technician schedule, overlap/capacity rules, reminders.
- Media/document storage: upload validation, templates, Cloudinary/local URLs, evidence viewers, deployment readiness.

Before changing any of these, search both backend and frontend for the model field, serializer key, endpoint, capability, and display identity; then inspect related E2E and backend regression tests.
