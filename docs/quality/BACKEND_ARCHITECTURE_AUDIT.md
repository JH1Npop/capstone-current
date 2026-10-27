# AFN SmartServe Backend Architecture Audit

Audit date: 2026-10-27 (Asia/Singapore)

Audit mode: read-only application and deployment audit; no business data was queried or changed

Repository commit inspected: `43712e9`

## Executive summary

AFN SmartServe is a Django 6 / Django REST Framework monolith with an ASGI entry point, PostgreSQL persistence, Redis-backed Channels, Cloudinary-compatible media storage, and a separately built React client. The domain model is broad: 52 active application models, 107 documented relationships, 63 service migrations, and approximately 448 resolved API URL patterns when DRF-generated aliases and format-suffix variants are included.

The architecture is viable for an academic defense and a controlled pilot. It is not yet a safe production baseline for an external client. The most important reason is not the size of the system: it is that a shared ticket-lock helper combines `SELECT ... FOR UPDATE` with a technician queryset containing `DISTINCT`. PostgreSQL rejects this SQL. The defect is confirmed in the deployed staging logs and affects multiple field-service actions, while the default SQLite test gate accepts the same query. No separate production target was inspected.

The codebase otherwise has meaningful safeguards: production settings fail closed, mutating inventory and payment flows use transactions and row locks, role/capability checks are extensive, health endpoints distinguish liveness from readiness, and request logs carry correlation IDs. The main architectural gaps are synchronous provider calls on request workers, an unreliable in-process background thread, no deployed scheduler for management-command automations, non-expiring static API tokens, and no production-like PostgreSQL workflow gate in the default release command.

## System topology

```text
React static site
    |
    | HTTPS REST + token authentication
    | WebSocket notifications/messages/inventory
    v
Render web service: Daphne + Django ASGI
    |-- Django REST Framework viewsets/actions
    |-- Channels WebSocket consumers
    |-- synchronous Brevo/email, routing, geocoding, AI calls
    |
    +--> Aiven PostgreSQL (system of record)
    +--> Render Key Value / Redis (Channels fan-out; no durable business data)
    +--> Cloudinary-compatible object storage (photos/videos/documents)
    +--> Brevo, Google Gemini, Nominatim, ORS/OSRM
```

The deployed process is Daphne, not Gunicorn. Gunicorn worker counts, thread limits, and Gunicorn timeouts therefore do not apply. Daphne concurrency and `ASGI_THREADS` are not explicitly bounded in repository deployment configuration.

## Application and data inventory

| Area | Responsibility | Principal records / surfaces |
|---|---|---|
| `users` | identity, roles, MFA, presence, settings, staff/client administration | user, profile, login/security events, verification/reset, TOTP/recovery |
| `services` | request-to-service lifecycle, dispatch, inspection, documents, sales, maintenance, analytics | requests, tickets, inspections, quotations, contracts, technical sheets, commissioning, turnover, reports, payments, schedules |
| `inventory` | catalog, stock movement, reservations, issue/return and requirements | items, categories, transactions, reservations, return requests |
| `notifications` | persistent alerts and WebSocket/email delivery | notification records, unread state, user fan-out |
| `messages_app` | staff/client conversations and support cases | rooms, messages, attachments, support cases |
| `progress` | service progress evidence | progress records and attachments |
| `history` | compatibility routing only | no current active application model |
| `api` | public/legacy integrations and checklist compatibility | public landing/tracking/geocode, health, legacy checklist |

Repository discovery found 369 Python files and about 55,847 Python lines. The backend has 58 test files and 624 discovered tests; five PostgreSQL-dependent tests are intentionally skipped under the default SQLite configuration.

## API surface map

The API is broad but consistently grouped. Major authenticated resources include:

- Service catalog, SLA rules, requests, locations, tickets, technician skills, status history, inspections, commissioning, turnover, technical data sheets, contracts, field-service reports, quotations, solar profiles and installed equipment.
- Dispatch, technician jobs/schedules/locations, GIS, coverage heatmaps, analytics, performance, demand forecasts, service trends, sales, maintenance and follow-up cases.
- User/authentication, administrator users/technicians/clients/settings/services/analytics/activity, dashboard statistics/change tokens/calendar.
- Inventory categories/items/transactions/reservations/requirements and equipment-return review.
- Notifications, messaging, support, progress, public landing/tracking/geocoding and health endpoints.

WebSocket consumers cover notifications, messages and inventory. Route-level behavior is enforced through both DRF permissions and explicit action checks; the large surface nevertheless makes capability-regression tests important.

### Endpoint inventory by responsibility

The prefixes below are the maintained resource families; DRF adds detail routes, named actions, optional format suffixes and an API root, which explains why the resolved pattern count is much higher than the number of business resources.

| Module | Principal HTTP/API families | Permission/data/side-effect notes |
|---|---|---|
| Users/auth | `/api/users/register/`, verification/resend, login/logout, password reset/change, profile, heartbeat, MFA; `/api/admin/users/`, technicians, clients, settings, services, analytics/activity | public auth endpoints are explicitly opened and throttled; privileged listing/mutation uses role/capability checks; security changes revoke tokens |
| Service catalog/request | `/api/services/service-types/`, `sla-rules/`, `service-requests/`, `service-locations/` | clients are owner-scoped; staff decision/configuration paths are capability-scoped; accepted rules are snapshotted where financial semantics require it |
| Tickets/dispatch | `/api/services/service-tickets/`, status history, technician skills/locations, GIS dashboard, coverage/ORS; admin dashboard stats/changes/calendar | action-specific permissions; assignment, scheduling, reschedule, start/complete and evidence transitions; route provider calls and notifications |
| Technician portal | `/api/technician/jobs/`, schedule, status/location/checklist routes | assigned lead/crew object scope; GPS/status state machine; inventory/evidence side effects on completion |
| Inspection/project | `/api/services/inspections/`, solar commissioning, turnover acceptances, technical data sheets, installation contracts, project profiles | one canonical inspection per ticket; document records have separate lifecycle and permissions; completion can transition the same ticket or create a fresh service dispatch |
| Commercial records | `/api/services/quotations/`, solar estimates, sales records, payments/deposit actions | locked financial updates, accepted snapshots and reasoned void/replacement; records external payment, not an online payment gateway |
| Reports/analytics | analytics workspaces, technician performance, demand forecasts, service trends, completed/field-service reports, exports | read-only capability scopes and query-budget tests; live aggregates plus scheduled snapshot/forecast commands |
| Maintenance/after-sales | maintenance schedules, follow-up cases and action routes | view/manage capabilities are distinct; stop/resume/reschedule/complete are locked, reasoned transitions; scheduled reminders depend on external command execution |
| Inventory | `/api/inventory/categories/`, items, transactions, reservations, requirements and return-review actions | admin/warehouse mutation versus technician field visibility; stock locks, constraints and ledger entries; grouped and per-item approval semantics |
| Notifications | `/api/notifications/`, unread/mark-read/delete actions | current-user scoping; persistent unread state, Channels fan-out and optional email side effect |
| Messaging/support | `/api/messages/`, rooms/support cases and support actions | participant/ticket/capability isolation; attachment validation, notification fan-out and WebSocket parity |
| Progress | `/api/progress/` resources/actions | ticket-related progress and evidence; participant/capability scoping |
| Public/compatibility | landing data/projects, tracking, geocoding proxy, liveness/readiness, legacy `/api/checklist/`; retired history route | deliberately anonymous only where documented; provider proxy/fallbacks; legacy history returns 404 by contract |

### WebSocket inventory

| Socket | Authentication/scope | State/side effects |
|---|---|---|
| Notifications | token-authenticated user channel | unread refresh/push; HTTP polling fallback |
| Messages | authenticated participant/capability and ticket checks | creates direct/group/ticket messages and notifications |
| Inventory | authenticated operational roles | broadcasts inventory changes; malformed JSON handling needs hardening |

## End-to-end request dependency map

```text
React action / polling / WebSocket frame
  -> Render TLS/proxy and CORS/CSRF/host policy
  -> Django request-ID/observability middleware
  -> URL router / DRF action or Channels consumer
  -> token authentication
  -> global + capability + object-level permission checks
  -> serializer/parser validation
  -> service/view business-state validation
  -> transaction.atomic + locked ORM rows where required
  -> PostgreSQL constraints and commit
  -> on_commit notification/provider callback or Channels group send
  -> serializer / stable error envelope
  -> React API error formatter and state refresh
```

Failure boundaries discovered at each stage:

- proxy/process: free-tier sleep, single instance and synchronous work saturation;
- parser/auth: vulnerable DRF version, non-expiring tokens and per-process throttles;
- permission/query: the technician `DISTINCT` scope becomes invalid when the shared helper adds a PostgreSQL row lock;
- validation/business logic: broad and generally explicit, but several endpoint-local exception paths expose raw messages;
- database: PostgreSQL-specific semantics are not exercised by the default SQLite gate;
- side effects: storage/email/provider I/O may be synchronous or inside a transaction, and route calculation uses an undurable thread;
- response/client: generic 5xx rendering hides stable backend details; multi-request inspection/document flows can be left incomplete and must resume safely.

## Serializer, permission, middleware and signal assessment

- Serializers perform meaningful field and workflow validation across inspection answers, documents, inventory, messages and financial records. Business invariants also live in view/service helpers and database constraints; callers must not bypass those layers through a “performance” shortcut.
- Permissions combine role classes, capability maps and object-scoped querysets. Technician lead/crew and client ownership filters are material security controls. The row-lock repair must retain them.
- Middleware supplies request IDs, method/path/status/duration logging and production security headers. A centralized DRF exception handler sanitizes `DatabaseError`; manually constructed error responses are the consistency gap.
- No problematic circular Django signal chain was found in the reviewed request paths. Most operational side effects are explicit helper calls or `transaction.on_commit()` callbacks. That improves traceability, but those callbacks are synchronous unless handed to a durable worker.
- Database/model hooks exist for selected integrity/automation behavior; the dominant concurrency controls are explicit transactions and constraints rather than hidden signals.

## Authentication and authorization

The runtime uses DRF `TokenAuthentication` (`backend/afn_service_management/settings.py:470`), not JWT. Login normally replaces the user's existing token, and logout, password/reset, MFA, role and status changes revoke tokens through queryset deletion. This avoids the currently disclosed DRF `TokenProxy.delete()` defect in present call sites, but tokens have no protocol-level expiry or refresh lifecycle.

The default API permission is authenticated. Public endpoints are explicitly opened. Elevated self-registration is blocked, administrator MFA is available, and capability-level controls are applied to sensitive operational workspaces. The browser stores the token in `sessionStorage`, reducing persistence across browser restarts but not protecting it from same-origin script execution.

## Transaction and concurrency design

Strong patterns are present in inventory, sales/payment, assignment and lifecycle code:

- `transaction.atomic()` surrounds multi-row state changes.
- `select_for_update()` protects stock, payment and ticket transitions.
- database constraints and `F()` expressions reduce lost updates.
- notification side effects commonly use `transaction.on_commit()`.

One shared implementation defeats that otherwise sound design. `ServiceTicketViewSet.get_locked_ticket()` applies `select_for_update(of=('self',))` after action-specific filtering (`backend/services/views/tickets.py:308-317`). For technicians, the queryset is produced by a lead-or-crew union expressed with `.distinct()` (`backend/services/views/helpers.py:466-472`). PostgreSQL does not permit `FOR UPDATE` with `DISTINCT`, producing the confirmed production 503.

The affected call sites include technician photo upload, start work, complete work, equipment-return submission/review, and potentially any action that uses the shared locked lookup while the technician queryset is active. Administrator/client paths whose querysets do not add `DISTINCT` are not automatically affected.

## Inspection and field-service workflow

The modern inspection submission is a three-request client workflow:

1. Create or patch the ticket's one-to-one inspection record.
2. Upload photo evidence through the ticket `upload_photos` action (`frontend/src/api/technician.js:365`).
3. Complete the inspection through the inspection completion action.

The design is recoverable: a retry reuses the incomplete inspection instead of creating a duplicate, and completion is transactional and idempotent. It is not atomic across all three HTTP requests. The confirmed row-lock failure occurs at step 2 before file or database mutation, so the current observed incidents leave an incomplete inspection that can be retried after a code correction. More generally, ambiguous network failure after an upload commit can duplicate evidence because there is no idempotency key.

Inspection validation requires service checks, explicit yes/no values, notes for failed checks, a recommendation, and at least one valid image. Upload validation checks type/signature and per-file limits. The action permits up to 20 photos and 20 videos in separate groups and lacks a total request byte budget.

## External integrations and async behavior

| Integration | Current behavior | Architectural concern |
|---|---|---|
| Email/Brevo | delivery commonly registered with `on_commit`; 15-second network timeout | callback still executes synchronously on the request worker; team fan-out is sequential |
| Registration email | sent inside a database transaction (`backend/users/views/auth.py:181`) | network latency holds a database transaction open |
| Cloud media | storage writes performed during ticket transactions | ticket row locks can remain held for slow external uploads; incomplete cleanup can orphan media |
| Google Gemini | synchronous request with 20-second timeout and local fallback | ties up request capacity during provider delay |
| Nominatim / ORS / OSRM | synchronous 8-second calls with cache/fallback | latency and provider availability propagate into request duration |
| Route calculation | raw daemon `Thread` started after commit (`backend/services/views/tickets.py:1644`) | work is lost on process restart and is not observable/retriable |
| Operational automations | management commands exist | no Render cron/worker/scheduler is declared, so repository configuration does not run them automatically |

There is no Celery or other durable task worker. `transaction.on_commit()` protects ordering relative to database commit, but it does not make a callback asynchronous.

## Configuration and production safety

Production configuration is substantially fail-closed:

- `DEBUG=False` requires deployed host, CORS and CSRF configuration.
- PostgreSQL is required outside explicit local/test modes.
- durable storage and Redis are required unless explicit overrides are provided.
- email credentials are validated.
- database connections default to `CONN_MAX_AGE=0`, avoiding stale connection retention at the cost of connection setup overhead.
- HTTPS, secure cookies and HSTS are configured.
- JSON structured request logs contain request ID, method, path, status and duration.

The service exposes liveness and dependency readiness separately. Render monitors liveness only (`render.yaml:19`), so a database/cache/storage outage does not automatically replace the process. That can be a valid anti-restart-loop choice, but only if an external monitor alerts on readiness; no such monitor is defined in the repository.

## Deployment architecture

`render.yaml` declares a free web service, a free Redis-compatible service and a static frontend. The web start command runs migrations and then Daphne (`render.yaml:18`). This couples schema change duration/failure to every process start and becomes unsafe if the service is scaled beyond one instance. A paid Render pre-deploy command or a controlled release job should own migrations before application processes start.

The current free topology has one application instance and non-durable Redis. Redis is used for ephemeral channel fan-out rather than business state, which limits data-loss impact, but restarts cause lost live presence/messages-in-flight and force reconnect/fallback behavior.

## Observability and failure handling

Positive controls:

- Correlated JSON request logs and duration measurements.
- Sanitized `DatabaseError` responses use a stable 503 contract.
- Liveness/readiness endpoints and tested Redis configuration.
- Client fallback polling if a notification socket is unavailable.

Gaps:

- No error tracker, metrics backend, distributed tracing or alert definitions are present.
- Some manually caught exceptions return `str(exc)` to clients, bypassing the otherwise sanitized error contract.
- The release browser test starts Django without ASGI, so it does not exercise actual WebSocket negotiation.
- Render log inspection is currently the primary production error-detection method.

## Performance assessment

The repository contains query-budget tests for analytics and dashboard change detection. The dashboard uses a low-cost change token and refreshes every five seconds only while visible; notifications use a 120-second poll while WebSocket-connected and a five-second fallback otherwise. These are reasonable individually, but the aggregate polling load matters on a one-instance free service.

Potential scaling hotspots are unpaginated administrator user listing, full inventory catalog serialization/filtering, live analytics calculations without a result cache, notification/message tables lacking workload-specific composite indexes, and synchronous provider calls. No `EXPLAIN ANALYZE`, Aiven slow-query data, connection metrics, CPU/memory metrics or real-client load evidence was available, so precise capacity claims would be speculation.

## Architecture disposition

| Decision | Result |
|---|---|
| Suitable for final defense / controlled staging | Yes, with the confirmed production defect disclosed and avoided/fixed before demonstration |
| Suitable for a tightly monitored internal pilot | After the critical/high remediation gate and paid always-on hosting |
| Suitable for unsupervised client production today | No |
| Requires provider migration to fix the current 503 | No; the root cause is application SQL |
| Requires a rewrite or reduced schema | No; targeted reliability, release and operations work is sufficient |

See `BACKEND_ERROR_REPORT.md` for issue-level evidence and `BACKEND_REMEDIATION_PLAN.md` for the ordered release plan.
