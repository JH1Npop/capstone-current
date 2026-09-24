# Implementation Checkpoint - Phases 4 to 9 - 2026-08-29

Status: Snapshot

## Scope completed

- Request idempotency, locked lifecycle decisions, scheduling validation, dispatch
  eligibility, evidence-backed completion, cancellation reasons, and immutable history.
- Document JSON contracts, retry-safe quotations, finalized-record immutability,
  project-profile promotion permissions, commissioning, turnover, warranty, and
  installed-equipment consistency.
- Signature-checked image/video uploads, upload limits, safe media references,
  participant-scoped messaging, active-recipient notifications, and after-sales validation.
- Audit coverage for commercial/technical records; corrected analytics time bases,
  active-user filters, bounded idempotent forecasts, and available-stock reporting.
- Fail-fast production configuration for PostgreSQL, durable media, Redis,
  HTTPS/hosts/origins, and SMTP; Aiven CA support and real Redis readiness probing.
- Isolated E2E database setup, cross-platform seeding, session-auth alignment,
  persisted document-draft coverage, mobile/keyboard/overlap coverage, and
  GitHub quality gates.
- Route-complete desktop/mobile page auditing for public, admin, technician,
  and client destinations, including runtime errors, HTTP 5xx responses,
  horizontal overflow, clipped or overlapping buttons, and unnamed actions.

## Schema changes not yet applied locally

| Migration | Purpose |
| --- | --- |
| `inventory.0005_inventory_integrity_constraints` | Inventory balance, reservation, and transaction integrity |
| `services.0053_servicerequest_idempotency_key` | Client-scoped request idempotency key |
| `services.0054_quotation_reference_and_warranty_terms` | Quotation number and warranty terms |
| `services.0055_unique_demand_forecast_period` | One forecast per service/period/date |

No migration was applied to the user's development SQLite database. The E2E
runner applied migrations only to ignored `backend/db.e2e.sqlite3` and flushes
only that isolated browser-test database.

## Validation results

| Validation | Result |
| --- | --- |
| Django system check | Passed; no issues |
| Migration drift | Passed; no model changes detected |
| Full discovered Django suite | Passed; 321 tests |
| Production Django deployment check | Passed; optional HSTS-preload advisory only |
| Python dependency integrity | Passed; no broken requirements |
| Root npm audit | Passed; 0 known vulnerabilities |
| Frontend npm audit | Passed; 0 known vulnerabilities |
| Frontend production build | Passed with Vite 8.2.2 |
| Public/auth browser journeys | Passed; 13 tests |
| Admin workspace browser journeys | Passed; 20 tests |
| Technician/client/lifecycle/side-flow browser journeys | Passed; 37 tests |
| Responsive, keyboard, and document-overlap browser smoke | Passed; 5 tests |
| All routed pages on desktop and mobile | Passed; 104 tests |
| Analytics capability regression suite | Passed; 6 tests |

The Playwright suite now contains 179 maintained browser tests: 75 functional
journey tests and 104 route-level desktop/mobile quality checks. The Documents
journey selects a real seeded ticket, saves a quotation draft through the API,
reloads the page, and verifies that the stored draft returns to the editor. An ignored local
`debug_login.spec.js` artifact is explicitly excluded by the configuration and
is not part of the release suite.

The E2E server ports are configurable with `E2E_BACKEND_PORT` and
`E2E_FRONTEND_PORT`. The all-pages verification used isolated ports 8011 and
5181 so pre-existing VS Code development servers on 8000 and 5174 could not
serve stale code or alter the audit result.

## Preserved data findings

The local SQLite data contains one historical service request with two related
tickets (`request_id=40`). It was not merged, deleted, or edited. Because that
legacy duplicate exists, this phase did not add a request-to-ticket uniqueness
constraint that would make the migration fail. Reconcile it manually after a
business-owner review, then consider adding the constraint in a later migration.

## Git state

All implementation and documentation changes remain uncommitted as requested.
No push was performed. Generated build, browser report, isolated E2E database,
dependency, log, media, and secret files remain ignored.
