# AFN SmartServe Backend Error and Risk Report

Audit date: 2026-10-27

Scope: backend code, tests, dependency manifests, deployment configuration, read-only Render metadata/logs, and read-only public health/header checks

Classification: **Confirmed** means reproduced or directly observed; **Hypothesis** means code/configuration supports the risk but production causality is not proven; **Unknown** means required telemetry or external evidence was unavailable.

## Severity model

- **Critical**: exploitable unauthenticated resource exhaustion, broad compromise, unrecoverable corruption, or a release-blocking failure across core production workflows.
- **High**: confirmed failure of a primary workflow, material security weakness, or missing control likely to cause sustained operational failure.
- **Medium**: bounded workflow/data-consistency, performance, information-disclosure or operability risk.
- **Low**: resilience, maintainability or test-coverage weakness with limited immediate impact.

## Priority summary

| ID | Severity | Status | Finding |
|---|---|---|---|
| SEC-001 | Critical | Confirmed dependency exposure | Public DRF parsing/content negotiation is affected by unauthenticated resource-exhaustion advisories fixed in 3.18.2 |
| REL-001 | High | Confirmed live defect | PostgreSQL rejects the technician ticket lock query because it combines `FOR UPDATE` and `DISTINCT` |
| SEC-002 | High | Confirmed vulnerable dependency; exploitability conditional | Twisted/Daphne HTTP stack has a request-smuggling advisory; proxy-chain exploitability was not proven |
| OPS-001 | High | Confirmed configuration gap | Scheduled SLA, maintenance, analytics and cleanup commands have no deployed scheduler |
| AUTH-001 | High | Confirmed design gap | Static API tokens have no expiry/refresh lifecycle |
| PERF-001 | High | Confirmed code pattern | Slow object-storage writes occur while ticket/database locks can be held; upload budget is only per file/group |
| DEPLOY-001 | High | Confirmed configuration gap | Every web process start runs migrations before Daphne |
| HOST-001 | High | Confirmed platform mismatch | Free Render/Aiven topology is not an appropriate client-production service level |
| FLOW-001 | Medium | Confirmed design; failure observed at step 2 | Inspection submit is a recoverable but non-atomic three-request workflow |
| ASYNC-001 | Medium | Confirmed code pattern | Email/provider calls occupy request capacity; registration sends email inside a transaction |
| ASYNC-002 | Medium | Confirmed design gap | Route calculation uses an in-process daemon thread with no durability or retries |
| DB-001 | Medium | Confirmed schema/query mismatch | Notification and message access patterns lack matching composite indexes |
| DB-002 | Medium | Hypothesis | Unbounded ASGI concurrency can contend with Aiven Free's 20-connection ceiling |
| API-001 | Medium | Confirmed | Several exception handlers expose raw exception strings and use inconsistent error envelopes |
| OBS-001 | Medium | Confirmed | No central error/metric alerting; Render monitors process liveness rather than dependency readiness |
| PERF-002 | Medium | Confirmed code pattern | Unpaginated lists, full-catalog filtering and uncached analytics can grow without bounds |
| FILE-001 | Medium | Confirmed control gap | Upload paths lack end-to-end orphan cleanup, whole-request limits and malware scanning |
| DOC-001 | Medium | Confirmed design | Multi-document saves span separate API transactions and can partially succeed |
| SEC-003 | Medium | Confirmed header gap | Live frontend/backend responses do not send a Content-Security-Policy header |
| RATE-001 | Medium | Confirmed configuration | DRF throttling is partial and stored in per-process local memory |
| BUILD-001 | Medium | Confirmed development dependency exposure | Frontend build/dev graph has four audited vulnerable packages |
| WS-001 | Low | Confirmed robustness/test gap | Inventory consumer does not gracefully handle invalid JSON; browser gate does not run ASGI WebSockets |
| ARCH-001 | Low | Confirmed maintainability issue | Compatibility/dead surfaces and generated route variants enlarge the audit surface |

## Detailed findings

### SEC-001 — Django REST Framework unauthenticated resource exhaustion

- Severity/status: **Critical / Confirmed dependency exposure**.
- Module/path: `backend/requirements.txt` (`djangorestframework==3.17.2`); global DRF parser/renderer configuration in `backend/afn_service_management/settings.py`.
- Evidence: `pip-audit -r backend/requirements.txt` reports CVE-2026-114138 and CVE-2026-114136 with fixed version 3.18.2. The issues affect Accept-header content negotiation and JSON `Content-Type` charset processing and can consume excessive CPU or memory before normal application authorization protects a view.
- Root cause: the pinned DRF version predates upstream validation/bounding fixes.
- Reproduction: in an isolated environment only, run the advisory's upstream regression cases against an anonymous JSON endpoint. Do not load-test the deployed service.
- Recommended fix: upgrade DRF to at least 3.18.2, run the full gate, and add bounded regression requests for the two parser/content-negotiation cases.
- Dependencies: confirm Django 6 compatibility and review DRF 3.18 release notes.
- Regression risk: medium; renderer, validation and router behavior can change.
- Verification: `pip-audit` clean for DRF; all backend tests; anonymous-auth contract tests; bounded staging requests remain fast and memory-stable.

`pip-audit` also reports CVE-2026-114137 for DRF `TokenProxy.delete()`. Current revocation call sites use `Token.objects.filter(...).delete()`, so that specific bug is not presently on the active revocation path, but the upgrade still removes the latent hazard.

### REL-001 — PostgreSQL `FOR UPDATE` with `DISTINCT`

Remediation status (2026-10-27): an authorization-safe outer-row-lock/subquery repair and two regressions pass the complete local release gate. Deployment and live UAT evidence are pending; the original finding remains the authoritative incident evidence until those checks complete.

- Severity/status: **High / Confirmed live defect**.
- Module/path: `backend/services/views/tickets.py:308-317`, `backend/services/views/helpers.py:466-472`; confirmed action `tickets.py:1950-1952`.
- Evidence: six deployed-staging requests to `POST /api/services/service-tickets/16/upload_photos/` returned 503 after the current deployment. Correlated Render traces show `psycopg2.errors.FeatureNotSupported: FOR UPDATE is not allowed with DISTINCT clause`, raised from `get_locked_ticket()`. Durations were approximately 592–724 ms. The response was correctly sanitized by the centralized database-error handler. No separate production service was inspected.
- Root cause: `get_locked_ticket()` applies `select_for_update(of=('self',))` after `filter_queryset(self.get_queryset())`; the technician lead-or-crew queryset uses `.distinct()`.
- Blast radius: technician-facing ticket actions using the helper, including photo upload, start, complete and equipment-return submission/review. Client/admin branches without the distinct technician queryset are not automatically affected. The separate `/api/technician/jobs/...` status implementation has its own lock query and is not evidence that this shared path is safe.
- Reproduction: run the technician action against disposable PostgreSQL with a technician authorized through lead or crew membership. SQLite will not reproduce the dialect error.
- Recommended fix: select/lock the base `ServiceTicket` row by an authorized ticket ID in a query without `DISTINCT`, keeping authorization and locking as explicit steps inside one transaction. Do not merely remove access filtering.
- Dependencies: disposable PostgreSQL test database.
- Regression risk: high if authorization and locking are reordered incorrectly.
- Verification: PostgreSQL integration tests for every helper call site, including lead, crew, unauthorized, concurrent and repeated requests; then a single controlled staging UAT with correlated logs.

The observed exception occurs before media storage or database mutation, so the six confirmed failures did not partially upload evidence. That does not eliminate the general retry risk described in FLOW-001.

### SEC-002 — Twisted HTTP request-smuggling advisory

- Severity/status: **High / Confirmed vulnerable dependency; deployed exploitability unknown**.
- Module/path: transitive Twisted 26.4.0 through Daphne 4.2.2.
- Evidence: `pip-audit` reports CVE-2026-115877 for inconsistent handling of bare CR/LF in Twisted HTTP parsing. Daphne is the deployed HTTP server. The Render proxy's exact normalization behavior was not available, so end-to-end exploitability is not claimed as confirmed.
- Root cause: the deployed HTTP server dependency contains the advisory.
- Reproduction: only in an isolated proxy+Daphne test fixture using upstream safe test vectors; never probe production with request-smuggling payloads.
- Recommended fix: upgrade to an upstream fixed stable Twisted/Daphne combination when available, or apply vendor guidance; verify proxy/backend parsing agreement.
- Dependencies: upstream fix status, Daphne compatibility, Render proxy documentation/support if ambiguity remains.
- Regression risk: medium; ASGI/WebSocket transport behavior must be retested.
- Verification: `pip-audit`, ASGI HTTP tests, WebSocket connect/idle/push/reconnect tests, and a safe proxy conformance test.

Other Twisted advisories reported for IMAP, Telnet, XMPP and IRC are not exposed by this application. They remain dependency-maintenance items, not demonstrated AFN attack paths.

### OPS-001 — Management-command automations are not scheduled

- Severity/status: **High / Confirmed configuration gap**.
- Module/path: `backend/*/management/commands/`, including the grouped `run_operational_automations` command; `render.yaml` contains no cron or worker service.
- Evidence: commands exist for SLA processing, auto-assignment, maintenance alerts, analytics/performance refresh, location cleanup and demand forecasting. No repository deployment resource invokes them periodically.
- Root cause: automation implementation was added without an external durable scheduler.
- Reproduction: inspect deployed service definitions over time; only the web/static/Redis resources exist, and no scheduler invocation appears.
- Recommended fix: inventory each command's cadence/idempotency, add a paid Render Cron Job or equivalent scheduler with overlap protection, and alert on missed/failed runs.
- Dependencies: hosting plan and command-level runtime/locking review.
- Regression risk: high if all commands are first enabled at once; stale records may trigger a burst of actions/notifications.
- Verification: dry-run where supported, disposable-data execution, one command/cadence at a time, recorded run IDs/durations/results, and missed-run alert test.

### AUTH-001 — Non-expiring static bearer tokens

- Severity/status: **High / Confirmed design gap**.
- Module/path: `backend/afn_service_management/settings.py:470-472` and user authentication views.
- Evidence: global authentication uses DRF `TokenAuthentication`; there is no token expiry, rotation age or refresh-token contract. Browser storage is session-scoped, but a copied token remains valid until an explicit revocation event.
- Root cause: the original single-token authentication model was retained as the system expanded.
- Reproduction: authenticate, copy a token, close the browser, and use it later before password/status/MFA change or logout.
- Recommended fix: adopt short-lived signed access tokens with refresh rotation/revocation or add enforced expiry/rotation to the token model. Preserve logout, password reset, role/status and MFA revocation semantics.
- Dependencies: frontend interceptor/refresh flow, WebSocket auth, migration strategy and forced re-login plan.
- Regression risk: high; authentication touches all clients and sockets.
- Verification: expiry, refresh rotation/reuse, logout, role downgrade, disabled account, password reset, MFA and WebSocket expiry tests.

### PERF-001 — External upload work inside locked transactions

- Severity/status: **High / Confirmed code pattern**.
- Module/path: `backend/services/views/tickets.py:1950` and shared proof-media helpers; legacy checklist in `backend/api/views.py:440`.
- Evidence: ticket upload is `@transaction.atomic` and locks the ticket before storage writes. Files may be 10 MB per image and 50 MB per video, with separate limits of 20 images and 20 videos rather than one total-byte/request limit.
- Root cause: file validation, durable object write and relational update are combined under a database transaction for consistency.
- Reproduction: use a throttled fake object store in an isolated test while a second request attempts to lock the same ticket; measure lock wait and transaction duration.
- Recommended fix: stage validated uploads outside the ticket row lock, apply a whole-request byte/file budget, then use a short atomic attach/finalize operation with ownership tokens and compensating cleanup.
- Dependencies: storage API, orphan lifecycle, idempotency design.
- Regression risk: high; incorrect staging can attach unowned media or lose evidence.
- Verification: slow/failing storage tests, concurrent ticket action tests, duplicate retry tests, orphan sweeper tests and request-size rejection tests.

### DEPLOY-001 — Migrations run in the web start command

- Severity/status: **High / Confirmed configuration gap**.
- Module/path: `render.yaml:18`, `Dockerfile`/`Procfile` deployment contracts.
- Evidence: startup runs `python manage.py migrate --noinput && daphne ...`.
- Root cause: free-tier deployment lacks a separate repository-defined release/pre-deploy phase.
- Reproduction: deploy a slow/failing migration; the web process cannot start until it completes. Multiple instances would race the same migration command.
- Recommended fix: use a controlled one-shot/pre-deploy migration phase, block application rollout on failure, and document backward-compatible migration sequencing.
- Dependencies: paid Render feature or external CI release job; database backup/restore evidence.
- Regression risk: medium; a missing release step can leave application/schema versions mismatched.
- Verification: disposable PostgreSQL deployment with expand/migrate/deploy/contract rehearsal and deliberate migration failure.

### HOST-001 — Free-tier production mismatch

- Severity/status: **High / Confirmed platform constraint**.
- Module/path: `render.yaml:4,12`; Aiven service metadata/docs.
- Evidence: Render free web services spin down, permit one instance and do not offer production guarantees; free Redis has no persistence. Aiven Free is single-node, 1 GB RAM/storage with 20 database connections and no SLA. Current services are healthy, but health at one instant is not capacity or availability evidence.
- Root cause: a defense/staging-cost architecture is being considered for external-client operation.
- Reproduction: allow idle spin-down and measure cold start; inspect plan limits. Do not intentionally overload production.
- Recommended fix: keep free resources for defense/staging; use the paid pilot or production baseline in `HOSTING_RECOMMENDATION.md` before client launch.
- Dependencies: expected users, operating hours, recovery targets and budget.
- Regression risk: low technical risk; recurring cost and migration timing are business risks.
- Verification: always-on uptime observation, capacity test, backup/restore drill and alerting test on the selected plans.

### FLOW-001 — Inspection submission is not end-to-end atomic

- Severity/status: **Medium / Confirmed design; current step-2 failure observed**.
- Module/path: `frontend/src/api/technician.js:319-375`, inspection and ticket upload actions.
- Evidence: inspection create/update, ticket photo upload and inspection completion are three independent requests. Existing incomplete inspection reuse makes retries recoverable. Current PostgreSQL failure leaves the inspection incomplete before photo mutation.
- Root cause: metadata, general ticket media and lifecycle completion are separate API resources.
- Reproduction: interrupt the browser after each step or inject 503 at upload/completion.
- Recommended fix: introduce an idempotent submission session/finalize contract, or expose one server orchestration endpoint while keeping staged uploads. Return current step/state for safe resume.
- Dependencies: PERF-001 storage staging and API compatibility.
- Regression risk: medium.
- Verification: failure injection at every boundary, double-click/retry, browser restart/resume and concurrent completion tests.

### ASYNC-001 — Synchronous email and provider calls consume request capacity

- Severity/status: **Medium / Confirmed code pattern**.
- Module/path: `backend/notifications/notification_utils.py:138,268`, `backend/services/views/helpers.py:310-322`, `backend/users/views/auth.py:181-190`.
- Evidence: `on_commit()` delivery is synchronous after commit. Fan-out can issue sequential email calls with a 15-second timeout. Registration sends its verification email from inside `transaction.atomic()`.
- Root cause: no durable task queue; commit callbacks are being used as though they were asynchronous jobs.
- Reproduction: delay/fail a fake email endpoint and measure request and transaction durations.
- Recommended fix: transactional outbox plus a durable worker; registration should commit the account/outbox entry before provider I/O. Use retries, deduplication and dead-letter visibility.
- Dependencies: worker/queue hosting and email idempotency.
- Regression risk: medium; notification ordering and duplicate delivery require care.
- Verification: provider timeout, retry/dedup, process-kill, and transaction rollback tests.

### ASYNC-002 — In-process daemon thread can lose route calculations

- Severity/status: **Medium / Confirmed design gap**.
- Module/path: `backend/services/views/tickets.py:1644`.
- Evidence: a daemon `Thread` is launched in an `on_commit` callback. Daemon work has no persistent job record, retry or completion monitor and is terminated with its process.
- Root cause: lightweight background execution was implemented inside the web service.
- Reproduction: start the task in an isolated test, terminate the process and observe no retry.
- Recommended fix: persist a job/outbox record and execute it from the durable worker introduced for ASYNC-001.
- Dependencies: queue/outbox platform.
- Regression risk: low to medium.
- Verification: process-kill/retry, duplicate-delivery and provider-timeout tests.

### DB-001 — Notification/message indexes do not match hot queries

- Severity/status: **Medium / Confirmed schema/query mismatch**.
- Module/path: notification and message models/querysets.
- Evidence: notifications repeatedly filter/order by user, unread status and creation time, but lack composite indexes such as `(user, status)` / `(user, created_at)`. Message listing/group/room/ticket/direct patterns likewise lack workload-specific composite indexes. Existing foreign-key indexes do not fully cover combined filters/order.
- Root cause: schema indexes reflect entity relationships more than current polling/list workloads.
- Reproduction: populate production-shaped disposable PostgreSQL data and capture `EXPLAIN (ANALYZE, BUFFERS)` for unread counts and recent-message queries.
- Recommended fix: add only indexes justified by query plans and cardinality; consider partial unread indexes.
- Dependencies: representative row counts and PostgreSQL plans.
- Regression risk: medium; indexes increase write/storage cost and migration time.
- Verification: before/after plans and p95 latency under read/write load.

### DB-002 — Aiven connection ceiling versus unbounded concurrency

- Severity/status: **Medium / Hypothesis**.
- Module/path: `backend/afn_service_management/settings.py:116,348`, Daphne deployment command.
- Evidence: connections default to `CONN_MAX_AGE=0`; Aiven Free documents a maximum of 20 connections. Daphne/ASGI thread concurrency is not explicitly capped. No Aiven connection metrics were accessed.
- Root-cause hypothesis: concurrent synchronous ORM work may open enough short-lived connections to approach the plan limit during bursts.
- Reproduction: read Aiven metrics first; then run a bounded staging load against disposable data while measuring active connections and errors.
- Recommended fix: size/cap concurrency from evidence, retain connection health checks, and move to a plan/pooler appropriate for measured demand.
- Dependencies: Aiven monitoring and production-shaped load model.
- Regression risk: medium; over-restricting concurrency reduces throughput.
- Verification: active connections remain below a defined safety threshold at target concurrency with no connection errors.

### API-001 — Raw exception text and inconsistent error contracts

- Severity/status: **Medium / Confirmed**.
- Module/path: `backend/services/views_dashboard.py:337-338,821`; `backend/services/views/tickets.py:1000`; ORS proxy error branches; `backend/messages_app/consumers.py:149`.
- Evidence: these paths return or send `str(exc)` while database failures elsewhere are sanitized into stable envelopes.
- Root cause: endpoint-local exception handling predates/avoids the centralized handler.
- Reproduction: inject provider/internal failures and inspect HTTP/WebSocket response bodies.
- Recommended fix: map errors to stable public codes/messages, log the detailed exception with request/correlation ID, and centralize provider-error translation.
- Dependencies: frontend error renderer contract.
- Regression risk: low; clients may currently display free-form messages.
- Verification: contract tests assert no internal exception details while logs retain tracebacks and IDs.

### OBS-001 — No proactive production error/performance alerting

- Severity/status: **Medium / Confirmed**.
- Module/path: deployment/operations configuration.
- Evidence: structured logs and readiness exist, but no Sentry-equivalent error ingestion, metrics dashboards, alert rules or external readiness monitor are defined. Render monitors `/api/health/liveness/`, which checks the process rather than PostgreSQL/Redis/storage.
- Root cause: logging was implemented without the surrounding monitoring/incident loop.
- Reproduction: simulate a dependency failure in staging; liveness can stay healthy while readiness fails.
- Recommended fix: add error tracking, p95 latency/5xx/dependency/connection/storage metrics, external readiness monitoring and alert ownership/runbooks. Keep liveness process-only to avoid restart loops.
- Dependencies: operations provider/budget and privacy redaction review.
- Regression risk: low.
- Verification: synthetic failure alerts, request-ID traceability and incident drill.

### PERF-002 — Unbounded reads and uncached analytics

- Severity/status: **Medium / Confirmed code pattern**.
- Module/path: administrator user viewset (`pagination_class=None`), inventory full-catalog consumers, analytics workspaces.
- Evidence: selected endpoints return or Python-filter complete collections; analytics are calculated live. Query-budget tests cap query counts but not returned rows, CPU, memory or payload size.
- Root cause: current datasets are small and UI convenience favored whole-result fetches.
- Reproduction: seed production-shaped disposable data and record query count, rows, payload, memory and p95 latency.
- Recommended fix: server-side pagination/filtering, bounded date ranges, response-size limits and short-lived versioned analytics caches.
- Dependencies: frontend pagination/search behavior.
- Regression risk: medium; existing screens may assume all rows are locally available.
- Verification: contract/UI tests plus load profiles at forecast one- and three-year volumes.

### FILE-001 — Incomplete upload safety lifecycle

- Severity/status: **Medium / Confirmed control gap**.
- Module/path: shared proof upload helpers and ticket/checklist actions.
- Evidence: signature/type and per-file size validation exist, but there is no malware scanner, global request budget or consistent compensating delete when storage succeeds and a later database step fails. `complete_work` has a cleanup path that `upload_photos`/legacy checklist do not consistently share.
- Root cause: validation and happy-path persistence were prioritized over a staged object lifecycle.
- Reproduction: make storage save succeed and force the subsequent database operation to fail; inspect for unattached objects.
- Recommended fix: quarantine/stage, scan, finalize by ownership token, maintain an orphan ledger, and schedule cleanup.
- Dependencies: storage provider APIs and malware-scanning service.
- Regression risk: high for evidence retention; never delete files without verified ownership/reference checks.
- Verification: infected-file fixture, spoofed signature, oversize batch, post-upload rollback and orphan reconciliation tests.

### DOC-001 — Multi-document workflow can partially save

- Severity/status: **Medium / Confirmed design**.
- Module/path: Documents workspace APIs for quotation, technical data, contract, commissioning, turnover and service report.
- Evidence: individual records are validated, but saving a complete packet involves separate requests/transactions. A failure after earlier requests leaves a valid but incomplete packet.
- Root cause: documents are independently addressable resources without a packet-level commit state.
- Reproduction: save several document stages and inject a failure mid-sequence.
- Recommended fix: expose packet completeness/status and idempotent per-document saves; use a server orchestration/finalization endpoint only where the business requires all-or-none publication.
- Dependencies: business definition of draft versus finalized packet.
- Regression risk: medium.
- Verification: partial-save/resume, duplicate submission and finalization-precondition tests.

### SEC-003 — Missing Content Security Policy

- Severity/status: **Medium / Confirmed header gap**.
- Module/path: frontend/static hosting and backend response headers.
- Evidence: read-only live header checks found HSTS on both services but no `Content-Security-Policy` header.
- Root cause: no CSP is declared in frontend host headers or Django middleware.
- Reproduction: `HEAD`/`GET` the deployed frontend and backend and inspect headers.
- Recommended fix: start with report-only CSP, inventory required API/WebSocket/media/font/script origins, remove violations, then enforce. Protect browser bearer tokens by minimizing script origins.
- Dependencies: Cloudinary, API/WebSocket and any third-party UI resources.
- Regression risk: medium; an incorrect policy can block application assets or connections.
- Verification: browser E2E with enforced CSP and zero unexplained violations.

### RATE-001 — Partial, per-process throttling

- Severity/status: **Medium / Confirmed configuration**.
- Module/path: DRF settings and scoped endpoint throttles.
- Evidence: sensitive endpoints have scoped rates, but there is no shared Django cache configuration, so throttle counters use process-local memory. Unscoped endpoints have no global safety rate.
- Root cause: throttling is implemented as endpoint protection rather than a distributed traffic-control layer.
- Reproduction: restart or scale workers and observe counter reset/separation in an isolated environment.
- Recommended fix: use Redis-backed shared cache throttling, retain endpoint-specific rates, and add proxy/WAF limits for anonymous parsing and authentication endpoints.
- Dependencies: Redis isolation/capacity and trusted proxy/IP handling.
- Regression risk: medium; NAT/shared-office users can be over-throttled.
- Verification: multi-worker rate tests and forwarded-IP trust tests.

### BUILD-001 — Frontend dev/build dependency advisories

- Severity/status: **Medium / Confirmed, mostly non-runtime**.
- Module/path: `frontend/package-lock.json`.
- Evidence: `npm audit` reports four vulnerable packages (three high, one moderate): `follow-redirects`, `source-map-js`, Vite and `postcss-selector-parser`. The deployed frontend is static, so Vite dev-server and Node-only transitive issues are primarily developer/CI exposure rather than browser-runtime exposure.
- Root cause: current lockfile versions lag advisory fixes.
- Reproduction: `npm --prefix frontend audit`.
- Recommended fix: update the lockfile using compatible patched versions, then rebuild and rerun browser tests. Do not use a breaking forced upgrade without review.
- Dependencies: Vite/plugin compatibility.
- Regression risk: medium for build/tooling, low for application data.
- Verification: both npm audits clean or formally accepted, production build and browser smoke pass.

The root package audit reports zero vulnerabilities. `pip-audit` also reports `cryptography` 49.0.0 / CVE-2026-69247, fixed in 50.0.0. The application uses Fernet rather than the affected PKCS#7 RSA decrypt API, so current exploitability is not demonstrated; update it during dependency remediation.

### WS-001 — WebSocket robustness and gate coverage

- Severity/status: **Low / Confirmed**.
- Module/path: inventory WebSocket consumer and browser release scripts.
- Evidence: the inventory consumer directly parses JSON without a client-error response path. The browser gate runs Django with `--noasgi`; WebSocket requests are handled as HTTP and polling keeps tests green. Channels unit tests and live readiness provide other evidence, but the release browser journey does not prove ASGI push delivery.
- Root cause: the E2E harness optimizes for deterministic isolated HTTP tests.
- Reproduction: send malformed JSON to the inventory consumer; inspect the quality-run proxy logs for WebSocket fallback.
- Recommended fix: reject malformed frames without crashing the consumer and add a small ASGI E2E suite for authenticated connect, idle, push, reconnect and authorization.
- Dependencies: dedicated test ports/Redis or an in-memory channel layer for the appropriate layer of testing.
- Regression risk: low.
- Verification: malformed-frame test and real ASGI browser/WebSocket smoke.

### ARCH-001 — Large compatibility and generated surface

- Severity/status: **Low / Confirmed maintainability issue**.
- Module/path: `history` compatibility app, legacy checklist/public routes and DRF-generated suffix/root variants.
- Evidence: route resolution reports about 448 URL patterns while the active model set is 52. `history` has no active model and its legacy endpoint intentionally returns 404.
- Root cause: backward compatibility was preserved as the product evolved.
- Reproduction: enumerate Django resolver patterns and installed models.
- Recommended fix: document/deprecate legacy routes with usage evidence; do not remove tables/routes solely to reduce diagram size.
- Dependencies: client usage logs and migration/deprecation policy.
- Regression risk: high if apparently unused compatibility paths still have consumers.
- Verification: access-log review, contract tests and staged deprecation headers.

## Unknowns requiring evidence

- Aiven active/max connection history, slow-query log, CPU, memory, disk/IO and table/index sizes.
- Production p50/p95/p99 latency by route and payload size.
- Actual user concurrency, upload volume, notification fan-out and one-/three-year data growth.
- Backup restore time and recovery point achieved with the current Aiven plan.
- Render proxy behavior relevant to the Twisted parsing advisory.
- Malware scanning and external penetration-test evidence.
- A real authenticated live notification-push UAT after the Redis repair.

These are deliberately not converted into claims. They are collection tasks in the remediation plan.
