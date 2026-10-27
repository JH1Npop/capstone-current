# AFN SmartServe Database Audit

Audit date: 2026-10-27

Database engines considered: SQLite for local/default automated tests; PostgreSQL for deployed operation

Safety boundary: no development, staging or production business database was queried or mutated

## Executive assessment

The physical schema is large but coherent for the product: 52 active application models, 708 documented fields/attributes and 107 relationships. Reducing the database merely to simplify an ERD would remove real workflow history, evidence, inventory, payment, dispatch or after-sales responsibilities. The safer presentation strategy is a 12–18 entity conceptual ERD for the defense while retaining the full physical model and DBML as technical appendices.

The principal database defect is query construction, not schema corruption: a technician-scoped `ServiceTicket` queryset includes `DISTINCT`, then the shared helper adds `SELECT ... FOR UPDATE`. PostgreSQL rejects that combination. SQLite does not, which explains why 624 backend tests can pass while the deployed action returns 503.

## Schema inventory

| App | Migration count | Database role |
|---|---:|---|
| `services` | 63 | central workflow, ticketing, inspection, documents, sales, maintenance and analytics records |
| `users` | 42 | accounts, roles, presence and security records |
| `notifications` | 10 | durable notification/unread state |
| `inventory` | 8 | items, reservations, stock transactions and return control |
| `messages_app` | 7 | rooms, messages, attachments and support |
| `history` | 5 | historical migrations; current legacy model removed |
| `progress` | 4 | ticket progress and evidence |

Local migration checks report no model drift and no planned operations. This is repository evidence only; it does not prove that an unqueried external database has exactly the expected migration state.

## Integrity and concurrency controls

### Strengths

- Core inventory movements and reservations use atomic transactions, row locking, `F()` expressions and database constraints.
- Ticket assignment/status transitions and sales/payment updates use explicit transactions and locked reads.
- Inspection is one-to-one with its ticket, preventing duplicate canonical inspection records.
- Quotation/deposit/payment state is snapshotted and guarded so later service-catalog edits do not silently rewrite accepted financial terms.
- Notifications are generally emitted after commit, reducing false notifications for rolled-back transactions.

### Confirmed locking defect

Remediation status (2026-10-27): the local candidate now retains the permission-scoped `DISTINCT` inside an ID subquery and applies `FOR UPDATE OF self` only to the non-distinct outer ticket query. Query-shape/full release tests pass; disposable-PostgreSQL execution and deployed live evidence remain the final gates.

`ServiceTicketViewSet.get_locked_ticket()` builds this logical sequence:

```text
permission-scoped ticket queryset
  -> technician lead OR crew filter
  -> DISTINCT
  -> SELECT ... FOR UPDATE OF service_ticket
```

PostgreSQL raises `FeatureNotSupported: FOR UPDATE is not allowed with DISTINCT clause`. The deployed staging log proves the defect on photo upload. The correct repair must preserve both authorization and the row lock: determine an authorized ticket identifier using a non-locking permission query, then lock the base ticket row without `DISTINCT` inside the same transaction, rechecking any state-dependent authorization as necessary.

Affected shared-helper paths should all receive PostgreSQL integration coverage rather than fixing only `upload_photos`.

## Transaction-boundary review

| Flow | Current boundary | Assessment |
|---|---|---|
| Inventory reservation/issue/return | server-side atomic blocks and row locks | good foundation; retain PostgreSQL concurrency tests |
| Deposit/payment recording | atomic locked updates and constraints | good foundation; verify concurrent duplicate/overpayment cases on PostgreSQL |
| Ticket transitions | generally atomic and locked | sound intent, but shared technician lock query is invalid on PostgreSQL |
| Inspection submit | create/update, media upload and completion are separate requests | recoverable but not all-or-none; needs idempotent orchestration |
| Media attachment | external object write can occur inside atomic block | long lock/transaction risk and orphan risk |
| Registration | verification email occurs inside transaction | external latency extends transaction duration |
| Document packet | each document/resource commits separately | valid drafts may be partial; packet completion needs explicit state |
| Notifications | usually `on_commit()` | commit ordering is sound; callback remains synchronous |

## Query and index review

### Existing positive evidence

The schema includes many targeted indexes and constraints around services, schedules, inventory, sales, analytics and after-sales. Query-budget tests bound database round trips for major analytics workspaces and the dashboard change token:

- unified analytics: at most 20 queries;
- technician: 20;
- demand: 28;
- sales: 25;
- inventory: 32;
- after-sales: 40;
- forecasting: 12;
- dashboard change token: at most 6.

These protect against query-count regressions, but not slow scans, result size, CPU, lock waits or connection saturation.

### Candidate index gaps

The following must be validated with production-shaped `EXPLAIN (ANALYZE, BUFFERS)` before migration:

| Workload | Candidate index direction | Why it may help |
|---|---|---|
| unread notification count | `(user_id, status)` or a partial unread index | five-second fallback polling and badge counts combine these fields |
| recent notifications | `(user_id, created_at DESC)` | per-user ordered feed |
| room/group/ticket messages | composite foreign/group key plus `created_at` | frequent scoped conversation timelines |
| direct messages | sender/recipient plus `created_at` based on actual query shape | current relation indexes do not necessarily serve combined filters/order |

Do not add all candidates blindly. Measure selectivity, write rate, index size and the actual query plan.

## Pagination and growth risks

Most DRF resources inherit page-number pagination with a page size of 10. Important exceptions or equivalent full-result behavior include:

- privileged user administration (`pagination_class=None`);
- full inventory catalog reads followed by Python-side filtering in consumers;
- selected reservation/manual lists;
- analytics that recompute over live records without a result-cache layer.

With present academic data these are functional. At client scale they can create large payloads and table scans. Introduce server-side filters/search/pagination without breaking UI assumptions that currently expect a complete local list.

## Connection management

The production settings default to `CONN_MAX_AGE=0` and health checks. This closes each request connection rather than retaining stale connections, which is conservative for Aiven Free but adds connection setup overhead. Aiven Free documents a 20-connection maximum and no built-in connection pooling. Daphne concurrency is not explicitly capped in deployment configuration.

Risk classification: **hypothesis**, not a confirmed outage. No Aiven connection metrics were read. Before changing connection lifetime or adding a pooler:

1. capture active/peak connection counts and connection errors;
2. define target concurrent HTTP/WebSocket workloads;
3. run a bounded test against a disposable PostgreSQL database;
4. size application concurrency, pool size and headroom together.

## Migration and release safety

The repository currently runs `migrate --noinput` in the web start command. This is tolerable for one disposable/staging instance but is not a robust production release design. Migrations should execute once in a controlled pre-deploy/release job with:

- a verified backup and restore procedure;
- backward-compatible expand/deploy/contract sequencing;
- explicit timeout and failure visibility;
- one migration actor, never every scaled web process;
- post-migration `check` and smoke verification.

The local commands `makemigrations --check --dry-run` and `migrate --plan` passed during this audit. No migration was applied.

## Data durability and recovery

- PostgreSQL is the business system of record. Aiven Free includes backups but has no SLA; actual recovery point/time has not been demonstrated by a repository-controlled restore drill.
- Redis is used for Channels/presence fan-out and is non-durable on the free Render plan. No business-of-record data should be moved there.
- Media uses external object storage in production. Referential reconciliation and orphan cleanup are incomplete.
- Local E2E tests use an isolated SQLite database and do not mutate the user's development or production database.

Required evidence before client production:

- successful restore into an isolated database with recorded RPO/RTO;
- migration rehearsal against a production-shaped PostgreSQL copy;
- table/index size and growth forecast;
- slow-query and lock-wait sampling;
- concurrent inventory/payment/ticket-transition tests;
- media reference/orphan reconciliation.

## Database error classifications

| Area | Classification | Evidence |
|---|---|---|
| technician ticket lock | Confirmed defect | deployed-staging PostgreSQL traceback and six 503 requests |
| schema drift in repository | Not detected | dry-run model check and migration plan pass |
| data corruption from observed photo failures | Not detected | failure occurred during ticket lookup before mutation |
| connection exhaustion | Unknown/hypothesis | plan limit known; metrics unavailable |
| slow-query/index severity | Unknown | no Aiven plans/metrics or production-shaped `EXPLAIN` collected |
| transaction correctness on PostgreSQL | Partially proven | targeted PostgreSQL tests exist but five are skipped in default SQLite run |
| backup restorability | Unknown | no audited restore result for current external database |

## Recommended database gate

Before any client-production deployment, require a disposable PostgreSQL pipeline that runs:

1. migration from the currently deployed schema;
2. all ticket-lock paths for admin, lead technician, crew technician, client and unauthorized users;
3. concurrent inventory reservation/issue/return and payment/deposit cases;
4. inspection interruption/retry and media failure injection;
5. production-shaped query plans and bounded load;
6. backup/restore verification;
7. a final assertion that no test connection targets the business database.

The full physical ERD should remain authoritative. For presentation, use a conceptual projection centered on User/Client, Service Request, Ticket, Technician Assignment, Inspection, Quotation, Payment/Sale, Inventory/Reservation, Documents, Maintenance, Notifications and Support; state clearly that it is a presentation view, not a different database.
