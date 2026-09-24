# Production-Shaped Staging Validation

Status: Current contract

Use this gate only against a disposable staging deployment. It verifies the
production configuration contract, live PostgreSQL/Redis/Cloudinary
dependencies, real PostgreSQL row-lock behavior, and the deployed HTTPS
perimeter. It never uses the development SQLite database.

## Safety boundary

The gate refuses to run unless all of these are explicit:

- `DJANGO_ENV=production` and `DEPLOYMENT_STAGE=staging`;
- `STAGING_GATE_CONFIRM=disposable-staging`;
- an HTTPS `STAGING_BASE_URL` and exactly matching `STAGING_EXPECTED_HOST`;
- a separate `STAGING_TEST_DATABASE_URL` and a
  `STAGING_TEST_DATABASE_NAME` beginning with `test_`;
- the test database name differs from the connection database.

Set `PRODUCTION_BASE_URL` as an additional guard; the perimeter probe refuses
to run if it matches the staging origin. Store URLs and credentials in the
hosting provider's secret manager or the current shell. Never commit them.

The PostgreSQL account must be allowed to create and destroy only the named
disposable test database. Do not grant it authority over the production
database. The dependency probe writes one uniquely named Cloudinary health
object and deletes it immediately; it does not mutate business records.

## Required staging services

- A staging application database supplied through `DATABASE_URL`.
- A separate PostgreSQL connection supplied through
  `STAGING_TEST_DATABASE_URL`; Django creates the explicit `test_...` database
  named by `STAGING_TEST_DATABASE_NAME`.
- Managed Redis through `USE_REDIS=True` and `REDIS_URL`.
- Dedicated staging Cloudinary credentials.
- A deployed backend reachable through HTTPS.

## Free Render staging blueprint

The root `render.yaml` provisions a disposable Singapore-region staging stack:

- one free Django/Daphne web service;
- one free React static site with an SPA rewrite; and
- one free Render Key Value instance used by Channels.

During the first Blueprint creation, Render prompts for the values marked
`sync: false`. Use the generated frontend and backend HTTPS origins for the
host/CORS values, the Aiven URI for `DATABASE_URL`, the three dedicated
Cloudinary credentials, and the deployed backend `/api` origin for
`VITE_API_BASE_URL`. Do not commit any of those values.

Upload the Aiven project CA to the backend as a Render secret file named
`aiven-ca.pem`; Django expects it at `/etc/secrets/aiven-ca.pem` and uses
`verify-full`. The first backend deployment cannot connect successfully until
that file and all prompted values are present.

This free stack is intentionally not production:

- the web service sleeps after idle time and can lose WebSocket connections;
- free Key Value data is non-persistent;
- Render blocks outbound SMTP on ports 25, 465, and 587, so the Blueprint uses
  Django's console email backend and verification messages appear only in logs;
- free web services do not support pre-deploy commands, so the single staging
  instance applies migrations before Daphne starts; and
- paid cron jobs are omitted, so frequent and daily operational automations
  must be exercised manually in an appropriately authorized staging runner.

Use a paid web service with a separate pre-deploy migration command, real email
delivery, persistent Redis, and externally scheduled operational commands before
production traffic.

## Run the gate

Configure the required values in the process environment, then run:

```powershell
npm run quality:staging
```

The gate performs, in order:

1. Django's production deployment check.
2. Live PostgreSQL query, Redis channel round-trip, and durable-media
   write/existence/delete probes.
3. Three PostgreSQL concurrency contracts: competing request approval,
   simultaneous stock receipts, and competing reservations.
4. HTTPS liveness/readiness, critical security headers, hostile-origin CORS,
   anonymous protected-route denial, and HTTP `TRACE` rejection.

Every stage is fail-closed. A failure stops the gate and returns a non-zero
exit code. Record the command result and application revision in the living
handoff. Do not describe the environment as production-shaped until this gate
has actually passed against the deployed staging services.
