# AFN SmartServe Backend Remediation Plan

Plan date: 2026-10-27

Purpose: move from defense/staging readiness to a controlled small-business production baseline

Rule: each phase requires evidence before the next phase is treated as complete

## Release principles

- Fix confirmed failures before speculative optimization.
- Preserve role/capability authorization while correcting database locking.
- Test PostgreSQL-specific behavior on disposable PostgreSQL, never the business database.
- Separate code, schema and service rollout so each can fail safely.
- Use idempotency, durable jobs and observable state at external-system boundaries.
- Do not shrink the physical database solely for presentation; use conceptual diagrams.
- A green SQLite/browser gate is necessary but not sufficient for production release.

## Phase 0 — Immediate release hold and evidence preservation

Objective: prevent a known bad production workflow from being represented as safe while preserving diagnostic evidence.

Actions:

1. Mark technician ticket photo upload, shared-helper start/complete and equipment-return paths as release-blocking until PostgreSQL tests pass.
2. Preserve request IDs and sanitized traces for the six confirmed 503 requests; do not copy secrets or client media.
3. Record the currently deployed commit/deploy IDs and avoid blind redeploys.
4. Keep the production database and client records untouched during diagnosis.
5. Establish an issue owner and rollback/communication decision for any live client usage.

Exit evidence:

- confirmed affected route/action matrix;
- preserved correlation IDs and stack location;
- explicit production-use decision communicated to stakeholders.

## Phase 1 — Stabilize critical backend workflows

Status update (2026-10-27): the REL-001 shared ticket-lock code repair and regression coverage pass the complete release gate. Commit `a9da39758cfc466b896b6e9a7c7adba9149d3cfc` is live on PostgreSQL-backed staging through Render deployment `dep-dbg4feoae00c73fo0ml0`; startup, health, perimeter, and post-cutover error-log checks passed without recurrence. The exact authenticated technician action remains a manual live-UAT step. Dependency and public-error-safety work in this phase is not yet complete.

Objective: restore core technician workflows and remove immediately actionable security exposure.

### 1A. PostgreSQL ticket-lock repair

- Refactor authorization and locking so the locked base query contains no `DISTINCT`.
- Cover lead technician, crew technician, admin, client and unauthorized branches.
- Add PostgreSQL tests for upload photos, start work, complete work, return submission/review and every `get_locked_ticket()` call site.
- Verify concurrent attempts preserve state-machine rules and do not allow unauthorized row discovery.

### 1B. Dependency remediation

- Upgrade DRF to at least 3.18.2 for the three reported advisories.
- Upgrade `cryptography` to at least 50.0.0 after compatibility validation.
- Track a stable Twisted/Daphne resolution for CVE-2026-115877; apply upstream/vendor mitigation and test the Render proxy chain.
- Update the vulnerable frontend build/dev graph without an unreviewed forced breaking upgrade.

### 1C. Public error safety

- Replace raw `str(exc)` responses/WebSocket frames with stable public codes and correlation IDs.
- Keep full exception context only in structured server logs.

Exit evidence:

- clean or accepted dependency audits;
- full existing gate passes;
- new disposable-PostgreSQL workflow suite passes;
- bounded security regression tests pass;
- one controlled staging UAT succeeds with no matching 5xx/log exception.

Expected benefit: restores the broken technician workflow and closes the most urgent public dependency exposure.

Primary risk: separating authorization from locking incorrectly could disclose or mutate an unauthorized ticket.

Rollback: retain the prior artifact and database-compatible API shape; if staging authorization/concurrency checks fail, roll back the application artifact and keep the affected actions out of client use.

## Phase 2 — Fix database errors and transaction problems

Objective: remove schema changes from web-process startup and prove recoverability.

Actions:

1. Complete the authorization-safe base-row lock design from Phase 1 and audit every `select_for_update()` path for PostgreSQL validity, lock order and nullable joins.
2. Add idempotency/uniqueness protection for retriable inspection/media/finalization boundaries without changing approved business states.
3. Shorten database transactions so registration email and object-storage transfer do not occur while transactions/row locks are open.
4. Move `migrate` from the Daphne start command to one pre-deploy/release job.
5. Define expand/deploy/contract migration rules and maximum lock/runtime budgets.
6. Run backup/restore into an isolated target and record achieved RPO/RTO.
7. Rehearse migration failure and application rollback.
8. Verify repository migration state, deployed migration state and application commit as one release record.
9. Ensure all test scripts fail closed unless the database name is explicitly disposable/test-prefixed.

Exit evidence:

- successful isolated restore;
- successful production-shaped migration rehearsal;
- deliberate failing migration blocks rollout without replacing the healthy version;
- documented recovery procedure tested by someone other than its author.

Expected benefit: valid PostgreSQL locking, smaller failure boundaries and recoverable schema releases.

Primary risk: lock-order or idempotency changes can introduce authorization gaps, deadlocks or duplicated side effects.

Rollback: use backward-compatible schema expansion, leave old columns/contracts readable through the rollback window, and restore only from the verified backup when forward correction is unsafe.

## Phase 3 — Optimize slow endpoints and resource usage

Objective: remove external network work and unreliable threads from request-critical transactions.

Actions:

1. Introduce a transactional outbox and durable worker.
2. Move notification email, registration verification delivery, route calculation and retriable provider calls to jobs.
3. Give jobs idempotency keys, bounded exponential retries, timeout budgets and dead-letter visibility.
4. Refactor inspection submission into staged upload plus idempotent finalize/resume state.
5. Add a whole-request media byte/file budget, quarantine/scan/finalize lifecycle and orphan ledger/sweeper.
6. Define document-packet draft/completeness/finalization semantics; preserve independently valid drafts.

### 3B. Schedule existing operational commands

1. Inventory every command, owner, cadence, expected duration, idempotency and notification effect.
2. Add Render Cron Jobs or an equivalent scheduler, initially one command at a time.
3. Use UTC schedules with documented Asia/Manila business interpretation.
4. Prevent overlap and record each run's ID, start/end, counts and error summary.
5. Review stale data before first enablement so old records do not trigger an uncontrolled message/action burst.

### 3C. Bound query, payload and connection growth

1. Capture PostgreSQL active connections, lock waits, slow queries, table/index sizes and growth.
2. Build a production-shaped disposable dataset for one- and three-year forecasts.
3. Add server pagination/filtering to users, inventory and other unbounded lists; update UI contracts.
4. Capture plans for notification/message hot queries and add only proven composite/partial indexes.
5. Add short-lived versioned caches for expensive analytics where freshness permits.
6. Set explicit application concurrency and database connection budgets with at least 25–30% headroom.
7. Run bounded read-only and mixed-workload load tests; never stress the live client database.

Exit evidence:

- process termination does not lose committed work;
- repeated delivery does not duplicate email, media, routes or lifecycle transitions;
- provider timeout does not hold a database row lock or registration transaction;
- interrupted inspection/document workflows resume deterministically;
- malware/oversize/spoofed and orphan-cleanup tests pass.

Additional exit evidence:

- two successful scheduled cycles per command in staging;
- before/after query plans, payload sizes and p50/p95/p99 measurements;
- no database connection errors and peak connections below the agreed safety threshold.

Expected benefit: releases request workers/locks quickly, makes automations dependable and bounds database/API growth.

Primary risk: job retries, caching, pagination and new indexes can change ordering/freshness or duplicate side effects.

Rollback: feature-flag worker/scheduler consumers, retain synchronous fallback only for non-locking critical messages during transition, deploy pagination compatibly, and remove an index/cache only after reverting dependent query code.

### Detailed scheduler activation checklist

Objective: make existing SLA, maintenance, cleanup and analytics commands actually run without causing a backlog incident.

Actions:

1. Inventory every command, owner, cadence, expected duration, idempotency and notification effect.
2. Add Render Cron Jobs or an equivalent scheduler, initially one command at a time.
3. Use UTC schedules with documented Asia/Manila business interpretation.
4. Prevent overlap and record each run's ID, start/end, counts and error summary.
5. Add missed-run/failure alerts and a manual replay procedure.
6. Review stale data before first enablement so old records do not trigger an uncontrolled message/action burst.

Exit evidence:

- two successful scheduled cycles per command in staging;
- duplicate/overlap and stale-backlog tests;
- deliberate job failure triggers the expected alert and safe replay.

### Detailed performance acceptance targets

Objective: size from measurements and keep route cost predictable.

Actions:

1. Capture PostgreSQL active connections, lock waits, slow queries, table/index sizes and growth.
2. Build a production-shaped disposable dataset for one- and three-year forecasts.
3. Add server pagination/filtering to users, inventory and other unbounded lists; update UI contracts.
4. Capture plans for notification/message hot queries and add only proven composite/partial indexes.
5. Add short-lived versioned caches for expensive analytics where freshness permits.
6. Set explicit application concurrency and database connection budgets with at least 25–30% headroom.
7. Run bounded read-only and mixed-workload load tests; never stress the live client database.

Suggested initial service objectives for pilot validation (to be confirmed with the client):

- non-upload API p95 under 750 ms and p99 under 2 s at target concurrency;
- dashboard change-token p95 under 300 ms;
- no database connection errors; peak connections below 70–75% of plan maximum;
- 5xx below 0.5% excluding deliberate failure injection;
- upload/finalize timing reported separately from ordinary API latency.

Exit evidence:

- before/after query plans and payload sizes;
- p50/p95/p99, CPU/memory and active-connection report;
- no correctness regression in inventory, payment or lifecycle concurrency tests.

## Phase 4 — Improve logging, monitoring and exception handling

Objective: detect failures before a client reports them and make every failure traceable without leaking internals.

Actions:

1. Replace raw `str(exc)` response/WebSocket bodies with stable error codes, safe messages and request IDs.
2. Add centralized error tracking with PII/token scrubbing and release identifiers.
3. Export p50/p95/p99 latency, request/5xx counts, provider timeouts, database connections/lock waits, Redis errors and job outcomes.
4. Monitor readiness externally while retaining process-only liveness to avoid restart loops.
5. Define alert thresholds, owner/escalation paths, log retention and incident runbooks.
6. Add synthetic probes for authentication, a read-only core API and authenticated notification push.

Exit evidence:

- injected application, database, Redis, storage and job failures generate the intended safe response, correlated trace and alert;
- no secret/token/client-media content appears in sampled logs;
- an incident drill follows the runbook from alert to resolution.

Expected benefit: shortens detection/root-cause time and replaces manual Render-log inspection with actionable alerts.

Primary risk: noisy alerts or accidental sensitive-data collection.

Rollback: disable individual exporters/alert rules without removing core request logging; retain correlation IDs and sanitized exception handling.

## Phase 5 — Strengthen security and permission enforcement

Objective: limit credential lifetime and reduce abuse/XSS blast radius.

Actions:

1. Replace indefinite static tokens with short-lived access and rotated/revocable refresh credentials, or implement equivalent enforced token expiry.
2. Preserve immediate revocation on logout, password/reset, role/status change and MFA events.
3. Move DRF throttle state to shared Redis and add proxy/WAF limits for anonymous/auth/parser endpoints.
4. Introduce report-only then enforced Content Security Policy.
5. Add authenticated ASGI tests for WebSocket authorization, idle, push, reconnect and token expiry.
6. Arrange an external penetration test and remediate verified findings.

Exit evidence:

- auth lifecycle and socket expiry tests;
- multi-worker rate-limit tests including trusted proxy/IP handling;
- enforced CSP with clean browser E2E and reviewed violations;
- penetration-test report with no unresolved critical/high issue.

Expected benefit: bounds stolen-token lifetime, makes abuse controls consistent across instances and reduces XSS impact.

Primary risk: authentication/CSP/rate-limit changes can lock out valid clients.

Rollback: stage token compatibility and CSP report-only modes, keep emergency administrator recovery, and revert enforcement policies independently while retaining audit logs.

## Phase 6 — Add automated regression tests

Objective: make the discovered production-specific and cross-module failures release-blocking in automation.

Actions:

1. Add a disposable PostgreSQL CI/staging lane for every shared ticket-lock call site and existing concurrency tests.
2. Add failure-injection tests for inspection steps, uploads, provider timeouts, worker retries, duplicate submissions and transaction rollback.
3. Add real ASGI browser/WebSocket tests; keep the fast SQLite/`--noasgi` suite for broad UI coverage.
4. Add security regressions for DRF advisory vectors, token expiry/revocation, object permissions, CSP and multi-worker throttling.
5. Add migration-upgrade tests from the currently deployed schema and restore verification automation where safe.
6. Track performance budgets for queries, rows/payload bytes, duration, memory and database connections on production-shaped fixtures.

Exit evidence:

- the old `FOR UPDATE` plus `DISTINCT` implementation demonstrably fails the new regression and the repaired implementation passes;
- all required PostgreSQL, ASGI, failure-injection, security and migration lanes pass from a clean environment;
- test reports identify skipped production-specific checks as release failures rather than silently acceptable skips.

Expected benefit: prevents SQLite/protocol differences and cross-request partial failures from escaping again.

Primary risk: slower or flaky gates can encourage bypasses.

Rollback: quarantine only a proven nondeterministic test with an owner/deadline; never downgrade a reproducible production regression to optional.

## Phase 7 — Production hosting, monitoring and client cutover

Objective: operate the system as a service rather than a demo deployment.

Actions:

1. Adopt Option B from `HOSTING_RECOMMENDATION.md` for a controlled pilot, or the production baseline if client reliance is immediate.
2. Keep the static frontend on the free tier if its limits fit; move backend and Redis to always-on paid plans.
3. Choose an Aiven plan from measured storage/connections/recovery needs, not only current database size.
4. Add error tracking, metrics, external readiness monitoring and alert escalation.
5. Define backup retention, restore cadence, incident response, privacy/access review and log retention.
6. Execute a staged data-import rehearsal for the client's spreadsheet/export data with validation/reconciliation and rollback.
7. Run acceptance journeys for admin, superadmin, technician and client roles.
8. Cut over with named support ownership and a rollback window.

Exit evidence:

- seven days of stable pilot monitoring or an agreed observation window;
- successful restore and incident drill;
- no unresolved critical/high finding without written risk acceptance;
- client sign-off on migrated counts/balances/inventory and core workflows.

Expected benefit: always-on service, controlled releases, scheduled work, monitored dependencies and evidence-backed capacity.

Primary risk: cutover/data import/provider configuration errors.

Rollback: retain the prior application artifact and source data export, use a rehearsed DNS/service rollback window, and restore database/media only through the verified recovery procedure.

## Required regression matrix

| Domain | Minimum scenarios |
|---|---|
| Authentication | login failure/success, verification, reset, MFA, role/status revocation, expiry/refresh, WebSocket auth |
| Service lifecycle | request, approval, quotation/deposit gate, assignment, reschedule/lead change, arrival, start, hold/resume, complete |
| Inspection | incomplete resume, same-day continuation, next-day service, upload failure, duplicate retry, unauthorized access |
| Inventory | reserve grouped items, partial approval/rejection, issue, installed quantity, return, discrepancy and concurrent stock use |
| Documents | quotation, technical sheet, contract, commissioning, turnover and report save/reload/finalize/partial failure |
| Maintenance | create/manual import, reminder stages, disable/remove, scheduled run and duplicate prevention |
| Messaging/notifications | permissions, unread state, WebSocket push/reconnect, polling fallback, email retry/dedup |
| Production dependencies | PostgreSQL, Redis, storage, email, routing/geocoding, AI fallback and provider timeout |

## Change-management order

Do not combine all phases into one deployment. The preferred release train is:

```text
locking + security dependency fix
  -> PostgreSQL/staging proof
  -> migration/recovery separation
  -> durable jobs and media lifecycle
  -> scheduler
  -> measured database/performance work
  -> auth/CSP/rate hardening
  -> paid production cutover
```

Each production change should have a small rollback unit, a database compatibility statement and a handoff/validation-ledger update.
