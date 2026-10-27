# AFN SmartServe Hosting Recommendation

Recommendation date: 2026-10-27

Currency: USD list prices, excluding taxes, bandwidth and provider-specific overages

Decision: keep the current providers for now, but do not use their free plans for an external client's production workload

## Recommendation in one sentence

Fix and prove the PostgreSQL workflow first, then use paid Render application/Redis services with Aiven PostgreSQL for the pilot; provider migration would add risk and would not fix the confirmed SQL defect.

## Why the present failure is not a hosting-provider failure

The deployed backend, readiness endpoint, frontend, Redis integration and PostgreSQL connection were reachable during this audit. The repeated 503 is caused by application SQL that combines `FOR UPDATE` and `DISTINCT`, which PostgreSQL rejects. The same defect would remain on another managed PostgreSQL provider.

Hosting changes are still required for availability, scheduling, monitoring and capacity, but they should follow the release-blocking code/dependency repair.

## Current free-tier constraints

Render states that free instances are not for production, spin down after 15 minutes without inbound traffic, may take about a minute to restart, permit only one instance and impose other limitations. Free Key Value has no persistence. Sources: [Render free instances](https://render.com/docs/free) and [Render scaling](https://render.com/docs/scaling).

Aiven Free PostgreSQL is single-node with 1 CPU, 1 GB RAM, 1 GB disk and a maximum of 20 connections; it has backups but no SLA, pooling or integrations. Source: [Aiven PostgreSQL Free tier](https://aiven.io/docs/products/postgresql/concepts/pg-free-tier).

These constraints are acceptable for defense, demonstration and non-critical staging. They do not match an externally relied-upon service-management system with uploads, field technicians, notifications and scheduled maintenance/SLA workflows.

## Four options

### Option A — Keep everything free

Use: defense, demo and disposable staging only.

Approximate platform cost: **$0/month**.

Benefits:

- no immediate hosting spend;
- current environment and deployment knowledge are retained;
- enough for supervised demonstration after the application defect is corrected.

Risks:

- cold starts and one application instance;
- no production service commitment;
- non-durable Redis;
- no separate migration phase on the free web service;
- no scheduled automation unless another scheduler is introduced;
- Aiven 20-connection/1 GB limits and no SLA.

Verdict: **not approved for client production**.

### Option B — Upgrade only the Render backend; keep Aiven

Use: the lowest-change, lowest-cost reliability improvement after the code fixes.

Illustrative monthly baseline: Render Starter web service about **$7/month** while Aiven PostgreSQL and the existing Redis tier remain unchanged. A managed cron has a separate usage charge with an approximately **$1/month** minimum. Current sources: [Render pricing](https://render.com/pricing) and [Render Cron Jobs](https://render.com/docs/cronjobs).

Benefits:

- an always-on application process without free-web cold starts;
- controlled pre-deploy migration support on paid Render services;
- cron can be added without changing application/database providers;
- smallest operational change from the current stack.

Risks:

- Aiven Free's 1 GB/20-connection/no-SLA limit remains;
- free Redis remains non-durable;
- one web instance remains a single point of application failure unless a second instance/eligible plan is added;
- capacity must be verified against uploads, analytics, polling and worker jobs.

Verdict: **recommended next hosting step after code remediation**, suitable for a monitored pilot. It is not, by itself, the final production architecture.

### Option C — Migrate the backend to another provider; keep Aiven

Use: only if Render-specific limitations remain after paid-plan and application remediation evidence.

Illustrative candidate: Fly.io Machines can run an ASGI container and bill by provisioned compute; official examples put roughly 1 GB shared-CPU machines around **$6–9/month depending on region/configuration**, before storage, egress, Redis, worker and support costs. Source: [Fly.io pricing](https://fly.io/pricing/).

Benefits:

- more direct control of machine size, region, process groups and scaling;
- Aiven data remains in place, limiting the migration to application/worker/Redis/network contracts;
- per-second compute can be inexpensive at small sizes.

Risks:

- container, networking, secrets, health, deployment, TLS, WebSocket and rollback contracts must be rebuilt and retested;
- cross-provider database latency/egress depends on chosen regions;
- the Aiven Free ceiling/no SLA remains;
- current evidence does not identify Render as the root cause, so migration has no demonstrated reliability benefit for the confirmed 503.

Verdict: **not recommended now**. Reconsider only if paid Render measurements fail an agreed requirement that an alternative demonstrably meets.

### Option D — Migrate both backend and database

Use: only for a proved provider/region/compliance/availability requirement that the current vendors cannot meet economically.

Potential targets include a single cloud/platform with managed PostgreSQL, ASGI application/worker services, Redis, scheduler, object-storage integration and observability. A price is intentionally not asserted without selecting a provider, region, availability topology, backup retention and support level.

Benefits:

- one-provider networking/operations may be simpler after migration;
- a selected managed HA database can provide stronger SLA, pooling, replicas and regional control;
- architecture can be sized cleanly around measured workload.

Risks:

- highest migration and data-integrity risk;
- database export/import, sequence, extension, timezone, role, SSL, backup and cutover behavior all require rehearsal;
- simultaneous backend/database movement makes rollback and root-cause isolation harder;
- application defects move unchanged.

For cost context, keeping Aiven and upgrading it is currently straightforward: Developer is about **$5**, Hobbyist starts around **$12**, Startup with a stated 99.99% SLA starts around **$75**, and two-node Business starts around **$180**. Source: [Aiven PostgreSQL pricing](https://aiven.io/pricing/postgresql).

Verdict: **do not migrate both now**. There is no evidence that Aiven caused the current failures.

## Decision matrix

| Criterion | A: Render Free + Aiven | B: Upgrade Render only | C: Move backend, keep Aiven | D: Move backend + DB |
|---|---:|---:|---:|---:|
| Defense/demo suitability | High | High | High | High |
| Client-production suitability | Low | Medium, controlled | Unknown until migration proof | Depends on selected architecture |
| Cold-start avoidance | No | Yes | Yes | Yes |
| Scheduler/release controls | Weak | Improved | Provider-dependent | Provider-dependent |
| Database limit/SLA improved | No | No | No | Potentially |
| Operational change | None | Low | High | Very high |
| Approximate monthly floor | $0 | about $7 (+ optional cron) | roughly $6–9 compute + supporting services | quote after architecture selection |

## Practical production baseline after choosing B

Option B is the correct immediate choice among the requested alternatives, but a real client-production baseline should then independently upgrade the constrained supporting services when measurements require it:

- paid Render Key Value, approximately **$10/month**;
- Render Cron, approximately **$1+/month**;
- Aiven Developer/Hobbyist for a pilot (**$5/$12+**) or Startup for a stated production SLA (**$75+**).

That produces an illustrative monitored-pilot floor of approximately **$23–30/month** before bandwidth, or approximately **$93/month** with Aiven Startup and the smallest Render web/Redis/cron combination. Use a larger Render web plan if the measured upload/analytics/worker load requires it.

## Required architecture on Options B–D

Paying for larger plans is insufficient by itself. The production design should include:

- separate one-time migration/release command;
- durable worker/outbox for email, route calculations and retriable provider calls;
- managed cron schedules with run logging and alerts;
- shared Redis-backed throttling;
- error tracking and external readiness monitoring;
- database connection/concurrency budget based on measured load;
- object upload staging/scanning/orphan cleanup;
- tested backup restore and incident runbook;
- real ASGI WebSocket release smoke.

## Sizing information still needed

Before committing to C or D, collect:

- concurrent admins, technicians and clients during peak hours;
- average/95th-percentile uploads per job and video usage;
- requests per minute from dashboard/notification polling;
- PostgreSQL row growth, storage, active connections and slow queries;
- analytics runtimes and cacheability;
- acceptable outage/recovery time and acceptable data-loss window;
- required support hours and contractual SLA.

## Final decision

Use **Option A only through final defense/staging**. After the critical/high application and dependency items pass a disposable-PostgreSQL gate, choose **Option B for a limited monitored pilot**, then upgrade Redis/Aiven within the retained-provider architecture as measurements and service requirements demand. Do not choose C or D unless evidence identifies a requirement the current paid providers cannot meet.

The frontend can generally remain a static free site; spend first on the always-on backend, durable task execution, Redis, PostgreSQL capacity/recovery and monitoring.
