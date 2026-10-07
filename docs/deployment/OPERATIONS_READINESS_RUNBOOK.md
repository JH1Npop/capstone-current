# Operations Readiness Runbook

This runbook covers the controls that must be exercised outside the application repository before a real production launch. Never paste credentials or customer data into this document.

## Release gate

1. Run `npm run quality` locally or require the equivalent CI jobs.
2. Provision a disposable PostgreSQL database whose name begins with `test_`, disposable Redis, and disposable durable media credentials.
3. Run `npm run quality:staging` with its documented confirmation guard.
4. Run the read-only load smoke against the deployed environment:

   ```powershell
   $env:LOAD_BASE_URL = 'https://staging.example.com'
   npm run load:smoke
   ```

   Tune `LOAD_REQUESTS`, `LOAD_CONCURRENCY`, `LOAD_MAX_P95_MS`, and `LOAD_MAX_ERROR_RATE` only to agreed service objectives. Do not point high concurrency at a free-tier service without provider approval.

## Backup and restore drill

Create a PostgreSQL custom-format backup with a SHA-256 sidecar:

```powershell
.\scripts\postgres-backup.ps1 -DatabaseUrl $env:DATABASE_URL
```

Restore only into a disposable database whose name begins with `test_`:

```powershell
.\scripts\postgres-restore-drill.ps1 `
  -BackupFile .\backups\afn-postgres-YYYYMMDDTHHMMSSZ.dump `
  -TargetDatabaseUrl $env:RESTORE_TEST_DATABASE_URL `
  -ConfirmRestore RESTORE
```

Then run `python backend/manage.py check`, inspect representative record counts, sign in to the restored test environment, and record the date, recovery-point age, and recovery duration in the handoff. Backups are not proven until a restore drill succeeds. Store production backups encrypted outside the application host with provider retention and access controls.

## Monitoring and alerting

Production defaults to JSON logs on stdout and every HTTP response includes `X-Request-ID`. Configure the host or a log provider to retain and alert on:

- readiness failures or repeated HTTP 5xx responses;
- elevated login failures, MFA failures, or throttling;
- database/Redis connectivity errors;
- email delivery failures;
- unusual latency relative to the agreed p95 objective;
- storage quota and backup failures.

Set `LOG_FORMAT=text` only for local readability. Never log passwords, tokens, MFA secrets, recovery codes, connection URLs, or uploaded customer content.

## Incident response

1. Assign an incident lead and timestamp the start.
2. Preserve evidence: request IDs, deployment commit, provider events, sanitized logs, affected accounts, and time range.
3. Contain: revoke affected tokens, rotate exposed credentials, disable the affected integration or route, and restrict access. Do not destroy evidence.
4. Recover from a known-good build/data point and exercise liveness, readiness, sign-in, RBAC, and one representative business flow.
5. Notify affected parties and regulators according to applicable contracts and law; obtain qualified legal advice for real incidents.
6. Document root cause, customer impact, timeline, corrective actions, owner, and due dates. Add regression tests before closing.

## Go-live evidence still requiring people or providers

- verified SMTP delivery and bounce handling;
- named monitoring/alert recipients and an escalation channel;
- successful disposable PostgreSQL concurrency gate;
- successful encrypted backup restoration;
- signed manual UAT by each role;
- data retention/deletion policy approved for the actual jurisdiction;
- malware scanning provider for untrusted uploads if customer risk requires it.
