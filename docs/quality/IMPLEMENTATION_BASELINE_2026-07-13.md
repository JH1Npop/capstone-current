# Implementation Baseline — 2026-07-13

This baseline starts execution of the master system plan and solar workflow
subplan. It distinguishes application failures from test-environment failures.

## Commands and results

| Check | Result | Notes |
| --- | --- | --- |
| `python manage.py check` | Pass | No Django system-check issues |
| `python manage.py makemigrations --check --dry-run` | Pass | No migration drift after `services.0051_solarestimate` |
| `python manage.py test services.test_solar_estimates api.test_landing_page` | Pass | 14 tests passed |
| `npm run build` in `frontend` | Pass | Vite production build completed |
| Public Playwright smoke test, first run | Environment failure | Six tests could not connect because port 5174 had no configured web server |
| Public Playwright smoke test, managed servers | Partial pass | Five public journeys pass; invalid-login receives backend 401 but Windows Playwright teardown remains unstable |

## Baseline findings

- The frontend production build is healthy, but `AdminAnalytics` remains the
  largest lazy chunk and should be split during the quality workstream.
- The Playwright configuration previously required developers to start Django
  and Vite manually. Automatic web-server startup was added after the baseline
  run so local and CI behavior can be reproducible.
- HTTP browser tests use WSGI and dedicated E2E settings; future WebSocket tests
  will use a separate ASGI/Redis harness.
- The service-request creation path emitted the same client submission
  notification twice. The notification path is now centralized and emits once.
- A server-authoritative and versioned solar calculation did not exist before
  this implementation slice.

## First implemented slice

- `SolarEstimate` persistence and migration
- Deterministic backend calculator with bill and appliance modes
- Client ownership filtering and server-side recalculation
- Transactional, idempotent conversion to a pending service request
- Public calculator sign-in continuation and saved-estimate client workspace
- Promotion metadata capture and reuse of the existing mapped request form
