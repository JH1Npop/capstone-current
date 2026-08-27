# Solar Workflow Implementation Subplan

> This document covers the solar vertical in detail. The complete system plan,
> including every current module and actor, is
> [`SYSTEM_END_TO_END_IMPLEMENTATION_PLAN.md`](./SYSTEM_END_TO_END_IMPLEMENTATION_PLAN.md).

## Objective

Connect the public solar calculator, customer service requests, technical design,
quotation, inventory, installation, and commissioning into one traceable workflow.
The system will use Aiven PostgreSQL for production data and Cloudinary for
production media.

## Guiding decisions

- `SolarEstimate` is the preliminary, versioned calculation created from a bill
  or appliance load breakdown.
- The existing `SolarProjectProfile` is the approved technical source of truth
  after site assessment.
- Calculator results are always estimates and are recalculated by the backend
  before they are saved or converted.
- Service requests created from estimates remain pending until an authorized
  administrator approves them.
- Access is enforced in both the API and frontend. Hiding a button is not a
  substitute for backend authorization.
- Deployment remains provider-neutral through environment variables, while the
  production runbook targets Aiven PostgreSQL and Cloudinary.

## Target workflow

```text
Landing page / Solar calculator
  -> Saved solar estimate
  -> Client registration or sign-in
  -> Site-assessment service request
  -> Administrative review
  -> Service ticket
  -> Approved solar project profile
  -> Technical documents and quotation
  -> Inventory/BOM reservation
  -> Installation and commissioning
  -> Estimated-versus-actual performance
  -> Warranty and after-sales service
```

## Phase 1: Baseline and safeguards

- [x] Record the current backend test, frontend build, and Playwright smoke-test results.
- [x] Confirm migration consistency and PostgreSQL-compatible fields and constraints.
- [ ] Inventory current calculator, service-request, project-profile, document,
      inventory, RBAC, and public-site APIs.
- [ ] Preserve unrelated local changes throughout implementation.

Acceptance criteria:

- Baseline commands and known failures are documented.
- No existing workflow is silently removed or bypassed.

## Phase 2: Solar estimate foundation

- [x] Add a `SolarEstimate` model with client ownership, calculation mode,
      inputs, appliance loads, assumptions, calculated results, selected
      promotion, status, calculation version, and timestamps.
- [x] Link an estimate to at most one converted service request.
- [ ] Extend `SolarProjectProfile` with normalized, typed technical fields where
      the current profile is incomplete.
- [x] Add migrations that work with Aiven PostgreSQL and local development SQLite.

Acceptance criteria:

- An authenticated client can persist and retrieve their own estimates.
- Staff visibility follows existing service-management permissions.
- Historical inputs and formula versions remain reproducible.

## Phase 3: Calculation service and API

- [x] Move authoritative formulas into pure backend calculation functions.
- [x] Validate bill-based and appliance-based input modes.
- [x] Calculate consumption, PV size, panel count, roof-area estimate,
      generation, savings, inverter guidance, and optional battery guidance.
- [ ] Add an explicit recalculate action; create, list, retrieve, update, delete,
      submit, and convert actions are implemented.
- [x] Recalculate results server-side rather than trusting browser totals.
- [ ] Add throttling; ownership and conversion tests are implemented.

Acceptance criteria:

- Identical valid inputs produce deterministic results.
- Invalid or unrealistic inputs return field-specific errors.
- Clients cannot access or convert another client's estimates.

## Phase 4: Calculator-to-request experience

- [x] Keep instant browser-side results for public visitors.
- [x] Prompt visitors to register or sign in only when saving or requesting an assessment.
- [x] Add saved-estimate management to the client workspace.
- [x] Prefill a pending site-assessment request from the estimate.
- [x] Link the estimate and resulting request in both directions.
- [x] Show the conversion and review status to the client.

Acceptance criteria:

- A visitor can calculate without an account.
- An authenticated client can save and convert an estimate without re-entering load data.
- Conversion is transaction-safe and cannot create duplicate requests.

## Phase 5: Project lifecycle integration

- [ ] Promote reviewed estimate data into `SolarProjectProfile` after assessment.
- [ ] Reuse project-profile data in technical sheets and commissioning documents.
- [ ] Connect selected equipment to inventory items and a bill of materials.
- [ ] Carry approved quantities and prices into quotations and contracts.
- [ ] Record commissioned capacity and actual generation separately from estimates.
- [ ] Report estimated-versus-actual differences without overwriting history.

Acceptance criteria:

- Core project values are entered once and reused downstream.
- Estimate, approved design, quotation, installed equipment, and actual results
  remain independently auditable.

## Phase 6: Landing content and Cloudinary lifecycle

- [ ] Add true draft preview, publishing, scheduling, revision history, and rollback.
- [ ] Record who edited and published each revision.
- [ ] Split public-site access into view, edit, upload, publish, and delete capabilities.
- [ ] Store production uploads in Cloudinary.
- [ ] Add safe replacement, deletion, orphan cleanup, dimensions, and transformations.
- [ ] Link promoted products to inventory records where possible.

Acceptance criteria:

- Editors can prepare content without immediately publishing it.
- Only users with publish permission can change the live page.
- Replaced or deleted assets follow a documented retention policy.

## Phase 7: Quality, accessibility, and CI

- [ ] Add formula unit tests and API lifecycle tests.
- [ ] Add frontend/backend RBAC parity tests.
- [ ] Add Playwright coverage for calculate, save, convert, review, and publish journeys.
- [ ] Add keyboard, focus, contrast, and responsive-layout checks.
- [ ] Refactor oversized components touched by the workflow.
- [ ] Add CI for Django checks/tests, migration drift, frontend lint/build,
      Playwright smoke tests, and dependency scanning.

Acceptance criteria:

- Required checks run automatically for every proposed release.
- Critical user journeys have stable automated coverage.

## Phase 8: Aiven and Cloudinary production readiness

- [ ] Validate Aiven `DATABASE_URL`, required TLS, connection lifetime, and health checks.
- [ ] Test migrations against a staging Aiven PostgreSQL service.
- [ ] Configure Cloudinary credentials, transformations, and deletion verification.
- [ ] Configure SMTP, centralized error reporting, and structured logs.
- [ ] Select managed Redis for multi-process Channels/background work if required.
- [ ] Document backup retention and perform a restore drill.
- [ ] Replace hardcoded Task Scheduler paths with environment-based operations guidance.

Acceptance criteria:

- Staging uses the same service classes and security settings as production.
- Database restore and application rollback procedures have been tested.

## Phase 9: Release verification

- [ ] Run migrations against staging.
- [ ] Verify visitor, client, administrator, superadministrator, and technician access.
- [ ] Verify calculator, upload, publish, request, quotation, inventory, and commissioning paths.
- [ ] Record performance, security, accessibility, and remaining-risk findings.
- [ ] Create a rollback checkpoint before production deployment.

## Current execution order

1. Establish the baseline.
2. Implement `SolarEstimate` and the calculation service.
3. Expose ownership-safe APIs and request conversion.
4. Connect the public calculator and client workspace.
5. Integrate the approved project lifecycle.
6. Complete publishing, Cloudinary lifecycle, CI, and production hardening.

## Progress log

- 2026-07-13: Plan created. Aiven PostgreSQL and Cloudinary confirmed as the
  intended production services. Existing `SolarProjectProfile` will be reused.
- 2026-07-13: Completed the first persisted-estimate slice, migration, API,
  client workspace, request conversion, focused tests, and production build.
