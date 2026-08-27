# AFN Service Management System End-to-End Implementation Plan

## Purpose

This is the master implementation plan for the complete AFN system. It covers
all current user workspaces and backend modules, their handoffs, operational
quality, and production deployment. The solar calculator and solar-project flow
are one product stream within this plan; their field-level work is tracked in
[`SOLAR_SYSTEM_IMPLEMENTATION_PLAN.md`](./SOLAR_SYSTEM_IMPLEMENTATION_PLAN.md).

Production targets:

- Aiven PostgreSQL for relational data
- Cloudinary for managed images and media
- Django REST Framework and Channels backend
- React/Vite frontend and PWA
- Managed Redis when production WebSockets or distributed jobs require it

## Product actors

| Actor | Primary responsibilities |
| --- | --- |
| Visitor | Read public content, view promotions, calculate a solar estimate, register |
| Client | Submit and track requests, communicate, view history and notifications, provide feedback |
| Administrator | Review requests, dispatch work, manage services, inventory, documents, support, reports, and content according to capabilities |
| Superadministrator | Govern users, capabilities, system settings, publishing authority, and audits |
| Technician | Receive jobs, navigate, update status, complete checklists, use materials, communicate, and close field work |

## Complete product flow

```text
Public site / referral / returning client
  -> Registration, verification, authentication, recovery
  -> Client profile and service location
  -> Service request or saved solar estimate
  -> Administrative review and SLA monitoring
  -> Ticket creation, inspection decision, scheduling, and dispatch
  -> Technician navigation, arrival, checklist, work, and progress updates
  -> Inventory reservation, consumption, return, or adjustment
  -> Technical documents, quotation, contract, and approvals
  -> Completion, commissioning, turnover, and installed-equipment record
  -> Client notification, service history, acknowledgment, and feedback
  -> Warranty, maintenance, support, and after-sales follow-up
  -> Auditable operational analytics, forecasts, and management reports
```

## Definition of end-to-end completeness

Every production feature must have:

- A defined actor, entry point, success state, failure state, and recovery path
- Backend authorization and matching frontend capability behavior
- Validated API contracts and transactional writes where multiple records change
- Status history or audit events for important business changes
- Relevant in-app and email notification behavior without duplicates
- Empty, loading, offline, permission-denied, and error states
- Unit/API coverage plus at least one critical browser journey
- A migration, retention, backup, monitoring, and rollback consideration

## Workstream A: Identity, account security, and capability governance

Current scope: registration, login, email verification, password reset, profiles,
admin user directory, roles, capabilities, activity logs, and settings.

- [x] Build a route-to-API capability matrix for every admin and technician feature.
- [ ] Replace remaining role-only admin routes with explicit view/manage capabilities.
- [ ] Verify object-level authorization for clients and assigned technicians.
- [ ] Separate sensitive actions such as user suspension, capability assignment,
      publishing, inventory adjustment, document finalization, and report export.
- [ ] Add session/token revocation for password, role, suspension, and capability changes.
- [ ] Add login throttling, security event logging, and administrator alerts.
- [ ] Review email verification, password-reset expiry, and recovery enumeration risks.
- [ ] Add tests proving forbidden APIs remain forbidden even when called directly.

Exit criteria:

- Navigation, React routes, and APIs use the same permission matrix.
- Privilege changes take effect without leaving stale elevated sessions.

## Workstream B: Public website, content, promotions, and solar acquisition

Current scope: landing page, about page, promotions/products, calculator, and
administrator content editing and uploads.

- [ ] Add true drafts, unsaved preview, publishing, scheduling, revision history, and rollback.
- [ ] Split public-site capabilities into view, edit, upload, publish, and delete.
- [ ] Link promoted products to inventory/product records instead of duplicating specifications.
- [ ] Complete Cloudinary validation, transformations, replacement, retention, and orphan cleanup.
- [ ] Add campaign/source attribution to registrations, estimates, and requests.
- [ ] Implement the saved solar-estimate and site-assessment conversion subplan.
- [ ] Add accessible responsive layouts, metadata, social previews, and performance budgets.

Exit criteria:

- A campaign can be drafted, approved, published, measured, and rolled back.
- A calculator visitor can become a traceable client request without re-entry.

## Workstream C: Client relationship and request lifecycle

Current scope: client dashboard, request creation/tracking/detail, service history,
notifications, support, profile, locations, rescheduling, cancellation, and feedback.

- [x] Define and enforce the service-request state machine and allowed transitions.
- [ ] Prevent duplicate submissions and make conversion endpoints idempotent.
- [ ] Support multiple saved service locations with a clear default and validation.
- [ ] Show request timeline, SLA expectations, schedule, technician, and next action.
- [ ] Unify cancellation, rejection, rescheduling, and reason capture across views.
- [ ] Provide document/quotation acknowledgment and completion feedback where applicable.
- [ ] Test that clients can access only their own requests, messages, files, and history.

Exit criteria:

- A client can understand the status, owner, next action, and history of every request.

## Workstream D: Service catalog, request review, SLA, and ticket control

Current scope: service types, procedures, equipment requirements, inventory
requirements, SLA rules, service requests, tickets, approval, and status history.

- [ ] Normalize request, ticket, inspection, job, and completion status transitions.
- [ ] Make approval/ticket creation atomic and safe to retry.
- [ ] Remove duplicate notification paths and add notification preference handling.
- [ ] Validate service procedures, required skills, duration, price, and required stock.
- [ ] Surface SLA warning/overdue reasons and escalation ownership.
- [x] Add concurrency protection for approval, cancellation, assignment, and completion.
- [ ] Record actor, timestamp, reason, before state, and after state for critical transitions.

Exit criteria:

- Each request creates no more than one ticket and has a complete auditable timeline.

## Workstream E: Scheduling, dispatch, GIS, and technician capacity

Current scope: admin calendar, dispatch board, auto-dispatch, technician tracking,
coverage heatmap, ORS routing, skills, availability, schedules, and assignment scoring.

- [ ] Define assignment rules for skills, workload, travel, availability, SLA, and stock.
- [ ] Add conflict-safe schedule and assignment writes.
- [ ] Explain auto-dispatch recommendations and allow audited manual overrides.
- [ ] Handle no-route, stale-location, geocoding failure, and technician-offline cases.
- [ ] Set retention and privacy rules for technician location history.
- [ ] Add dispatch acceptance/rejection and reassignment reasons where required.
- [ ] Verify calendar, board, map, ticket, and technician views remain synchronized.

Exit criteria:

- Dispatch cannot double-book technicians and every override has an explanation.

## Workstream F: Technician field execution and progress

Current scope: technician dashboard, jobs, schedule, map navigation, inspection and
service checklists, status updates, progress, messages, history, and profile.

- [ ] Define navigation, en-route, arrival, inspection, work, blocked, and completion transitions.
- [ ] Require the correct checklist and evidence before applicable completion actions.
- [ ] Support retry-safe updates and useful offline/PWA behavior for field conditions.
- [ ] Record material usage, readings, notes, photos, signatures, and exceptions against the job.
- [ ] Prevent technicians from viewing or changing unassigned jobs unless explicitly authorized.
- [ ] Provide escalation paths for access issues, missing stock, unsafe sites, and rescheduling.
- [ ] Reconcile progress events with ticket status and service history.

Exit criteria:

- A technician can complete a job from assignment through evidence-backed handover,
  including intermittent connectivity.

## Workstream G: Inventory, reservations, and equipment traceability

Current scope: categories, items/SKUs, stock transactions, reservations, service
requirements, real-time updates, and installed equipment.

- [ ] Define transaction types and immutable stock-ledger rules.
- [ ] Make reservation, release, consume, return, and adjustment operations atomic.
- [ ] Prevent negative available stock and race conditions during concurrent dispatch.
- [ ] Connect service requirements and solar BOMs to ticket reservations.
- [ ] Add reorder thresholds, supplier/lead-time fields, and actionable low-stock alerts.
- [ ] Trace serialized equipment from receipt to installation, warranty, and replacement.
- [ ] Require reason and capability for manual stock adjustments.
- [ ] Reconcile reservation totals, transaction totals, and physical counts.

Exit criteria:

- Every stock change has a source, actor, quantity, reason, and resulting balance.

## Workstream H: Documents, quotation, contract, commissioning, and turnover

Current scope: generated documents, templates, technical data sheets, quotations,
installation contracts, field-service reports, commissioning, turnover, signatures,
and installed-equipment records.

- [ ] Resolve documented frontend/backend field-shape mismatches.
- [ ] Establish a shared project/service profile for reusable document data.
- [ ] Version documents and distinguish draft, finalized, signed, and superseded files.
- [ ] Prevent finalized commercial/technical records from changing without a revision.
- [ ] Link quotation items to inventory/SKUs and approved project quantities.
- [ ] Reuse commissioning and turnover results in installed-equipment and warranty records.
- [ ] Add authorization, file-integrity, retention, and signature audit rules.
- [ ] Split the oversized document UI into builders, schemas, previews, and workflow components.

Exit criteria:

- Customer, site, technical, commercial, and equipment values are entered once and
  reused without silently overwriting historical documents.

## Workstream I: Messaging, support, and notifications

Current scope: staff/technician messaging, client support cases, WebSockets,
notifications, and email delivery.

- [ ] Define conversation membership and object-level visibility rules.
- [ ] Connect support conversations to clients, requests, tickets, or after-sales cases.
- [ ] Add delivery/read state, retry behavior, unread consistency, and attachment policy.
- [ ] Deduplicate notifications and define which events produce in-app versus email messages.
- [ ] Use Redis-backed Channels for multi-instance production real-time delivery.
- [ ] Add abuse throttling, attachment validation, retention, and audit behavior.
- [ ] Provide graceful polling/fallback when WebSockets are unavailable.

Exit criteria:

- Messages and notifications reach only intended participants and remain consistent after reconnect.

## Workstream J: Completion, history, warranty, maintenance, and after-sales

Current scope: service history, job history, installed equipment, maintenance
schedules, follow-up cases, outcomes, feedback, and warranty-related service.

- [ ] Create completion records from authoritative ticket/checklist/document data.
- [ ] Automatically establish installed-equipment and warranty dates at turnover.
- [ ] Generate maintenance schedules according to service/equipment policy.
- [ ] Connect follow-up cases to original work, equipment, technician, and client feedback.
- [ ] Track resolution, recurrence, warranty cost, and root cause.
- [ ] Prevent historical records from being modified through operational endpoints.
- [ ] Add client-visible warranty and upcoming-maintenance information.

Exit criteria:

- Completed work remains traceable through maintenance, warranty, and repeat service.

## Workstream K: Analytics, forecasts, dashboards, and reports

Current scope: dashboards, operations reports, service analytics, technician
performance, demand forecasts, trends, coverage maps, and inventory demand.

- [ ] Define every metric, source table, time zone, filter, and exclusion rule.
- [ ] Reconcile dashboard totals with operational list views.
- [ ] Label trend-based forecasts accurately and report insufficient-data cases.
- [ ] Add calculation run metadata, freshness, failure status, and backfill controls.
- [ ] Protect sensitive exports and record report generation/download activity.
- [ ] Add drill-down links from aggregates to permission-filtered source records.
- [ ] Test date boundaries, cancellation handling, duplicates, and incomplete records.

Exit criteria:

- Every displayed number has a documented definition and reproducible source query.

## Workstream L: Audit, settings, data governance, and administration

Current scope: activity logs, application settings, content settings, capability
configuration, service-level rules, and administrative profiles.

- [ ] Establish an audit-event taxonomy and retention policy.
- [ ] Capture critical before/after values without logging secrets or excessive personal data.
- [ ] Version settings that affect calculations, SLAs, publishing, or automation.
- [ ] Add safe defaults, validation, change previews, and rollback for operational settings.
- [ ] Define data export, correction, anonymization, and deletion procedures.
- [ ] Normalize timestamps to UTC in storage and Asia/Singapore for business display.

Exit criteria:

- Administrators can explain who changed important system state and recover from a bad setting.

## Workstream M: Platform, PWA, automation, and production operations

Current scope: Django/ASGI, React PWA, scheduled analytics, email, media, database,
health endpoints, logging, backups, and deployment.

- [ ] Validate Aiven PostgreSQL TLS, connection lifetime, migration, and health behavior.
- [ ] Validate Cloudinary upload, transformation, deletion, and backup/retention policy.
- [ ] Use managed Redis for production Channels and distributed background work when enabled.
- [ ] Replace workstation-specific scheduled tasks with environment-based management jobs.
- [ ] Add job locking, idempotency, run history, heartbeat, retry, and failure alerts.
- [ ] Configure SMTP, structured logs, centralized error reporting, and request correlation IDs.
- [ ] Add liveness/readiness checks that distinguish application, database, Redis, and media health.
- [ ] Test PWA cache invalidation, offline boundaries, and safe handling of authenticated data.
- [ ] Document encrypted backups, restore drills, staging migrations, and rollback.

Exit criteria:

- Production has no dependency on a developer workstation and failures are observable and recoverable.

## Workstream N: Architecture, quality, security, and delivery

- [ ] Add an API schema and contract checks between frontend and backend.
- [ ] Add frontend unit/component tests for business-critical logic.
- [ ] Stabilize and repair the complete Playwright suite.
- [ ] Add accessibility, responsive, and browser-compatibility gates.
- [ ] Refactor oversized pages into domain components, hooks, services, and schemas.
- [ ] Add database indexes from measured query patterns and remove N+1 queries.
- [ ] Add CI for checks, migrations, tests, lint, builds, E2E smoke, and dependency scanning.
- [ ] Add security review coverage for authentication, authorization, uploads, WebSockets,
      object ownership, injection, CSRF/CORS, rate limits, and secret handling.
- [ ] Normalize repository documentation to UTF-8 and remove stale paths/routes.

Exit criteria:

- A release cannot proceed when a critical contract, permission, migration, or journey fails.

## Cross-module acceptance journeys

### Journey 1: Standard service

- [ ] Client registers and verifies account.
- [ ] Client submits a located service request.
- [ ] Admin reviews and approves exactly once.
- [ ] System creates one ticket and evaluates SLA.
- [ ] Dispatcher assigns an eligible, available technician and reserves stock.
- [ ] Technician navigates, arrives, completes required work/evidence, and consumes stock.
- [ ] System generates completion history and notifies the client.
- [ ] Client views history and submits feedback.

### Journey 2: Solar acquisition and installation

- [ ] Visitor calculates using bill or appliances.
- [ ] Client saves the estimate and requests assessment.
- [ ] Admin reviews the request and dispatches inspection.
- [ ] Approved design becomes the solar project profile and BOM.
- [ ] Quotation and contract use approved project data.
- [ ] Inventory is reserved and installed equipment is serialized.
- [ ] Commissioning records actual results and turnover starts warranty/maintenance.

### Journey 3: Support and after-sales

- [ ] Client starts a support case linked to completed work/equipment.
- [ ] Staff and client communicate with correct visibility and notifications.
- [ ] Staff converts the issue to after-sales or warranty work when required.
- [ ] Resolution records cause, cost, outcome, and recurrence.
- [ ] Analytics reflects the case without double counting the original service.

### Journey 4: Governance and publishing

- [ ] Superadministrator grants narrowly scoped capabilities.
- [ ] Editor creates a landing-page draft and uploads Cloudinary media.
- [ ] Publisher previews and schedules the revision.
- [ ] Public cache updates at publication time.
- [ ] Audit history identifies editor, publisher, version, and rollback.

## Delivery sequence

### Release 1: Trustworthy foundation

- [ ] Capture baseline tests and repair critical red journeys.
- [ ] Complete route/API capability parity.
- [ ] Formalize state machines and audit events.
- [ ] Add CI migration, backend, frontend-build, and E2E smoke gates.

### Release 2: Connected customer-to-field workflow

- [ ] Make request approval, ticket creation, dispatch, reservation, field progress,
      completion, history, and notifications transactionally consistent.
- [ ] Add concurrency and idempotency protections.

### Release 3: Solar and commercial workflow

- [ ] Complete saved estimates and assessment conversion.
- [ ] Normalize the solar project profile, documents, quotation, BOM, commissioning,
      turnover, warranty, and estimated-versus-actual reporting.

### Release 4: Content, communication, and after-sales

- [ ] Complete landing publishing and Cloudinary lifecycle.
- [ ] Harden messaging/support delivery and after-sales traceability.

### Release 5: Intelligence and production hardening

- [ ] Reconcile analytics definitions and automation reliability.
- [ ] Complete Aiven/Cloudinary/Redis/SMTP observability, backup, restore, security,
      performance, accessibility, and release verification.

## Progress log

- 2026-07-13: Master plan created after inventorying frontend routes and backend
  modules. The earlier solar-only plan is retained as a detailed subplan.
- 2026-07-13: Baseline recorded. Added automatic Playwright web-server startup,
  centralized request-submission notifications, and completed the first saved
  solar-estimate-to-service-request slice. See
  [`quality/IMPLEMENTATION_BASELINE_2026-07-13.md`](./quality/IMPLEMENTATION_BASELINE_2026-07-13.md).
- 2026-07-14: Added the
  [`security/ROUTE_API_CAPABILITY_MATRIX.md`](./security/ROUTE_API_CAPABILITY_MATRIX.md)
  and completed inventory view/manage parity across User Management, routes,
  navigation, API permissions, action controls, and regression tests.
- 2026-07-14: Completed service-catalog view/manage parity while preserving
  public access to active service choices. Inactive definitions and catalog
  writes now require explicit capabilities; inventory-template operations keep
  their separate inventory authorization boundary.
- 2026-07-14: Split service-queue access into view, request-review, and
  ticket-management capabilities. Enforced pending-only approval/rejection,
  documented the request/ticket state machines, aligned admin action controls,
  and added direct-API regression coverage.
- 2026-07-14: Added PostgreSQL row locking around request approval, rejection,
  and cancellation; verified request-decision audit records include actor,
  reason, and before/after states; and blocked generic request/ticket updates
  from bypassing their validated status actions.
- 2026-07-14: Added ticket and technician row locking for manual dispatch,
  auto-dispatch, inspection decisions, navigation, arrival, work start, status
  changes, and completion. Technician rows are locked in stable ID order and
  availability/capacity is revalidated after locking to avoid stale dispatches.
- 2026-07-14: Added `documents.view` and `documents.manage` parity across the
  Documents route, navigation, editor actions, ticket prefill/drafts, generated
  documents, quotations, contracts, commissioning, turnover, installed
  equipment, solar project profiles, and field-service reports. Client reads
  remain ownership-scoped and technician writes remain assignment-scoped.
- 2026-07-14: Added separate `analytics.view`, `reports.view`, `reports.export`,
  and `audit.view` capabilities. Enforced them across admin routes, navigation,
  analytics/forecast APIs, operational report data, activity logs, and
  browser-side print/CSV controls, with direct-API regression coverage.
