# AFN SmartServe Render Production Audit

Audit date: 2026-10-27

Environment observed: `afn-capstone-backend-staging.onrender.com` and its paired static frontend/Redis service

Audit safety: service metadata, deploy metadata, public health/headers and logs were read only

## Current deployment state

At audit time:

- backend liveness returned HTTP 200;
- dependency readiness returned HTTP 200;
- the static frontend returned HTTP 200;
- current backend deploy `dep-dbg14l7b9u1s73fpbt90` was `live` on application commit `e92db58`;
- the local `staging-deploy` tracking commit was `43712e9`;
- the backend ran one free-plan instance in Singapore;
- the application process was Daphne, not Gunicorn;
- the frontend was a Render static site;
- Channels used a free Render Key Value/Redis service.

This proves reachability and dependency readiness at the observation time. It does not prove production reliability, capacity or the absence of route-specific failures.

## Confirmed post-deploy application failure

Current deployed-staging logs contain six repeated 503 responses for:

```text
POST /api/services/service-tickets/16/upload_photos/
```

Correlated exceptions show:

```text
psycopg2.errors.FeatureNotSupported:
FOR UPDATE is not allowed with DISTINCT clause
```

The trace reaches `ServiceTicketViewSet.upload_photos` and `get_locked_ticket`. Response durations were approximately 592–724 ms. This is a confirmed application/PostgreSQL query defect, not evidence that Render or Aiven was down. Retrying deployment without changing the query cannot repair it.

The centralized error handler correctly returned a sanitized 503 rather than the database traceback. The failure happened during locked ticket lookup, before media or database mutation.

## Process model and concurrency

The start command is:

```text
python manage.py migrate --noinput &&
daphne afn_service_management.asgi:application --bind 0.0.0.0 --port $PORT
```

Consequences:

- Gunicorn settings are irrelevant because Gunicorn is not in the deployed path.
- Django HTTP, WebSockets and synchronous ORM/provider work share one Daphne service instance.
- Daphne/ASGI thread concurrency is not explicitly bounded in repository configuration.
- every restart/deploy runs migrations before accepting traffic;
- synchronous uploads, email and external API calls can occupy the only application instance.

The Render free plan permits one instance, so there is no rolling application redundancy. Render explicitly says free instances are not for production, spin down after inactivity, and can take about a minute to restart. Free services also lack one-off jobs/SSH and have usage limits. See [Render free instance documentation](https://render.com/docs/free) and [Render scaling documentation](https://render.com/docs/scaling).

### Deployment configuration inventory

| Control | Repository contract | Assessment |
|---|---|---|
| Python | 3.13.15 in `render.yaml:21`, `backend/runtime.txt` and `backend/Dockerfile` | consistent/pinned |
| Build | install requirements then `collectstatic --noinput` (`render.yaml:15`) | appropriate; dependency audit must gate the build |
| Start | migrate then Daphne (`render.yaml:18`) | unsafe as a scaled production release step |
| HTTP/ASGI server | Daphne 4.2.2; no Gunicorn (`backend/requirements.txt:7`, `backend/Procfile:1`) | correct for Channels; concurrency/timeouts not explicitly budgeted |
| Static files | collected by backend build; React deployed as a separate static site | separation is appropriate |
| Database | PostgreSQL URL, `verify-full`, CA path, 10-second connect timeout, `CONN_MAX_AGE=0`, health checks | fail-closed and conservative; connection/capacity metrics missing |
| Hosts/origins | `ALLOWED_HOSTS`, CORS and CSRF origins are required external values | production validation fails closed; values were not exposed |
| HTTPS/cookies | HTTPS/proxy flags, secure settings and HSTS under `DEBUG=False` | live HSTS confirmed; CSP absent |
| Media | Cloudinary credentials required by production validation | durable provider; transactional upload lifecycle needs hardening |
| Redis | service-bound URL, health/readiness, non-persistent free plan | suitable only for ephemeral fan-out |
| Email | Brevo HTTPS backend, 15-second timeout | avoids blocked SMTP; still synchronous on request paths |
| Health | Render liveness path plus separate dependency readiness | sound split; external readiness alert missing |
| Logs | JSON structured request/exception output to service logs | correlation is good; aggregation/alerts/retention absent |

## Startup and migration safety

Running migrations in the start command is the largest deployment-process defect:

- a migration error prevents the application from starting;
- a long migration extends downtime/startup;
- future scaling would allow multiple instances to invoke the same migration;
- schema and application rollout cannot be staged independently.

Render supports a pre-deploy command for migrations on paid web/private/background services, not free web services. A pre-deploy failure prevents the new deploy from replacing the current version. See [Render deploy documentation](https://render.com/docs/deploys).

Recommended production contract:

1. build immutable application artifact;
2. verify database backup/restore evidence;
3. run one backward-compatible migration job;
4. deploy application processes without migration side effects;
5. run readiness and workflow smoke checks;
6. retain/roll back the prior application version when safe.

## Health-check design

Render monitors `/api/health/liveness/`, which tests that the process responds. A separate readiness endpoint checks dependencies such as the database, cache/realtime layer and durable storage.

This split is technically sound: restarting a healthy process repeatedly during a database outage can make recovery worse. The missing piece is an external readiness monitor and alert. Today a dependency can fail while Render continues to regard the instance as live.

Recommended alerts:

- readiness failure for two or more consecutive probes;
- 5xx rate and specific `database_unavailable` count;
- p95/p99 latency by high-value route;
- PostgreSQL connections/lock waits;
- Redis reconnect/error rate;
- storage/email/provider timeout rate;
- automation command missed/failed run;
- disk/database growth and backup failure.

## Redis and WebSockets

The recent Redis 8 idle-socket correction is deployed. Post-cutover observation previously showed two authenticated notification sockets staying connected for more than eight idle minutes without Redis timeout, application error or 5xx log entries. Readiness is green.

Remaining constraints:

- Render free Key Value has persistence disabled and loses in-memory state on restart; the application correctly should treat it as ephemeral fan-out, not a database.
- A single free instance means reconnect storms and HTTP fallback polling hit the same process.
- the browser quality gate starts Django without ASGI, so its 20 passing scenarios do not validate real WebSocket negotiation/push.
- a live authenticated notification-push UAT remains useful evidence.

Render documents that free Key Value data is not persisted and restarts can lose state: [Render free instance documentation](https://render.com/docs/free).

## Scheduler and worker gap

The Blueprint contains no cron job or background worker. Management commands implement SLA, auto-assignment, maintenance reminders, analytics/performance refresh, location cleanup and demand forecasting, but repository-controlled deployment does not schedule them.

A Render Cron Job has a minimum monthly charge and runs UTC schedules with overlap prevention. See [Render Cron Jobs](https://render.com/docs/cronjobs). Before enabling jobs, audit idempotency and stale backlog behavior; do not activate every command simultaneously against client data.

A durable background worker is also needed for email, route calculations and other retriable external calls. A raw daemon thread and synchronous commit callbacks do not survive instance restarts.

## Resource and latency risks

Confirmed structural pressures on the free single instance:

- synchronous Cloudinary/object-storage uploads, including large video limits;
- synchronous email/provider requests with multi-second timeouts;
- 20-second AI-summary call and 8-second routing/geocoding calls;
- five-second dashboard/fallback polling from active visible clients;
- live analytics calculations;
- cold starts after idle periods.

Two legacy checklist requests in historical logs took approximately 4.1 and 6.1 seconds. Those durations are confirmed; the precise cause is not. They justify route-level tracing but do not prove database or provider failure.

No CPU, memory, request-concurrency, queue-depth or Aiven connection graphs were available. Resource exhaustion and connection saturation therefore remain hypotheses until metrics or bounded load tests demonstrate them.

## Headers and transport security

Observed live responses use HTTPS and HSTS:

- backend: one-year HSTS including subdomains;
- frontend: long-lived HSTS including subdomains/preload.

Neither observed response sent `Content-Security-Policy`. Add a report-only policy first, inventory required API/WebSocket/media origins, then enforce it after browser validation.

Production settings otherwise fail closed for allowed hosts, CORS, CSRF, PostgreSQL, Redis, media storage and email configuration. Secret values were not printed or copied into this audit.

## Log and error behavior

Strengths:

- JSON request logging includes correlation/request IDs, method, path, status and duration.
- database errors are logged with tracebacks and returned as a stable sanitized 503.
- deployed-staging logs enabled a direct root-cause trace for the upload incident.

Gaps:

- no central error tracker or metrics alert pipeline;
- no documented log retention/export contract;
- some endpoint-local exception handlers return raw exception text;
- log inspection is reactive and manual.

## Plan disposition

| Use | Current free deployment |
|---|---|
| final defense/demo | acceptable, after the confirmed upload/start/complete defect is fixed or those flows are not claimed as working |
| development integration environment | acceptable, with cold-start expectations |
| controlled staging | acceptable, but scheduled automation and ASGI UAT remain explicit gaps |
| real client production | not recommended |

Upgrading hosting will improve availability and operational controls, but it will not fix the PostgreSQL `DISTINCT` lock query. Code remediation and PostgreSQL regression coverage come first; paid hosting follows before external production use.

## Production exit criteria

- DRF and relevant HTTP-server dependency advisories resolved or formally mitigated.
- Every shared technician lock path passes on disposable PostgreSQL.
- Migrations run as one controlled release step.
- Always-on paid application and Redis services sized from a bounded load test.
- Scheduler and durable worker deployed with idempotency/retry visibility.
- External readiness, 5xx, latency, connection and automation alerts tested.
- Backup restore, media failure/reconciliation and incident drills recorded.
- Real ASGI WebSocket connect/idle/push/reconnect test passes.
- No critical/high unresolved item in `BACKEND_ERROR_REPORT.md` without a signed risk acceptance.
