# AFN-SERVE Chapters 1–5 to Current System: End-to-End Alignment Audit

**Audit date:** 2026-11-04 (Asia/Singapore)  
**Mode:** Investigation and documentation only  
**Paper reviewed:** Google Doc `Copy of AFN-SERVE: REVISION CAPSTONE 2`, tabs `CHAPTER 1-3 Revising` and `CHAPTER 4-5`  
**System reviewed:** Current repository frontend, backend, deployment contracts, maintained automated tests, and canonical living handoff

## 1. Executive conclusion

The paper and application describe the same core AFN-SERVE service-management system, but they are **not yet aligned end to end**.

- **Chapter I is broadly aligned** with the system's purpose, actors, service lifecycle, dispatch, tracking, inventory, after-sales, communications, notifications, analytics, forecasting, role access, and PWA direction. It is incomplete because the application has since gained materially deeper calendar capacity control, quotations/deposits/sales gates, dynamic documents, operational capabilities, audit/security controls, and maintenance workflows.
- **Chapter II is thematically compatible**, but this audit did not independently open and authenticate every cited publication. Its literature claims must not be treated as verified merely because the implemented system has similar features.
- **Chapter III is materially stale.** Its 30-table data dictionary no longer represents the current model graph, its polling-only description conflicts with the implemented Django Channels/WebSocket architecture, and its generic deployment description does not match the repository's actual Render/Aiven/Redis/Cloudinary/Brevo contracts.
- **Chapter IV is not defensible as final evaluation evidence in its current form.** Tables 22–57 all report `5.00 / Strongly Agree`, narrative text remains in future tense, and the displayed results do not show response counts or distributions consistent with the declared 159-person allocation.
- **Chapter V is missing substantive content.** The tab contains only the chapter title and heading.

The application is much more complete than the paper implies, but the complete release gate is not green on this audit date: the frontend production build passed; Django configuration and migration-drift checks passed; the backend suite produced **693 tests with 1 deterministic failure and 7 skips**; and the separate browser suite produced **224 passed and 6 failed out of 230**.

## 2. Classification key

| Classification | Meaning |
|---|---|
| **Aligned** | The paper claim is represented by current code and supporting evidence. |
| **Partially aligned** | The capability exists, but the paper omits important behavior or overstates proof/readiness. |
| **Stale / contradicted** | Current code or deployment contracts materially differ from the paper. |
| **Unproven** | A claim may be plausible but is not established by repository evidence or supplied research data. |
| **Missing** | Required paper content or system evidence is absent. |

## 3. Chapter-by-chapter findings

### Chapter I — The Problem and Its Background

| Paper area | Status | Current-system finding |
|---|---|---|
| Centralized service management | **Aligned** | `ServiceRequest`, `ServiceTicket`, status history, inspection/dispatch/completion workflows, role dashboards, and client/technician/admin routes implement the central operational lifecycle. |
| Client service requests and tracking | **Aligned** | Clients can create and track requests, review history, receive notifications, use support, and inspect ticket detail. The current booking calendar also exposes global date availability. |
| Dispatch and technician assignment | **Aligned** | Dispatch supports lead/crew assignments, skills/capability-aware access, inventory planning, dispatch restrictions, and technician job views. |
| Route guidance and live location | **Partially aligned** | Leaflet mapping, technician location history, service locations, coverage/heatmap data, and OpenRouteService integration exist. This is operational guidance and tracking, not autonomous route optimization. |
| Inventory monitoring | **Aligned** | Catalogs, categories, append-only movements, reservations, requirements, equipment returns, low-stock/statistics endpoints, retirement, and ticket-linked inventory flows exist. |
| Notifications and communication | **Aligned, paper stale** | The system has persistent notifications, support cases, direct messages, email delivery, and WebSocket consumers. Chapter III's polling-only framing is no longer accurate. |
| Analytics and demand forecasting | **Partially aligned** | Live analytics and historical forecasts exist, but future publication is deliberately gated by history, freshness, holdout error, WAPE, and baseline comparison. The paper should not imply every dataset automatically yields a reliable forecast. |
| After-sales and maintenance | **Aligned** | After-sales cases/events, maintenance schedules, installed equipment, client support, and service history are present. |
| Role-based access | **Aligned, understated** | Authentication uses roles plus delegated capability grants and backend permission checks. Administrator access is not simply an unrestricted role switch. |
| Progressive Web Application | **Aligned with limits** | A manifest and registered service worker exist. The paper should say installable/resilient web application, not promise complete offline business workflows. |
| Online payment exclusion | **Aligned** | Deposits/payments are externally recorded and verified; no online payment gateway is implemented. |
| SMS, RFID/biometrics, and advanced multi-stop routing exclusions | **Aligned** | These remain outside the implemented boundary. |

**Chapter I changes needed:** add the quotation/deposit/dispatch gate, calendar capacity and closures, dynamic document generation, sales records, maintenance, capability-based permissions, MFA/audit controls, and the distinction between historical analytics and validated forecast publication. Preserve the explicit exclusions.

### Chapter II — Review of Related Literature and Systems

The topics—service operations, scheduling, routing, inventory, notifications, analytics, PWA delivery, and role security—are consistent with the product. However:

1. Repository inspection can prove that AFN-SERVE implements a capability; it cannot prove that a cited author made the stated claim.
2. Every citation, quotation, DOI/URL, publication year, and bibliography entry still needs a separate source-verification pass.
3. Comparative-system claims need explicit criteria and dated evidence rather than feature-name similarity.
4. Literature about AI or forecasting must not be used to imply that AFN-SERVE uses paid AI. Its current forecast publication is deterministic and evidence-gated.

**Classification:** **Partially aligned / citations unproven**.

### Chapter III — Methodology and Technical Design

#### Actual current technical architecture

```text
React 18 + Vite 8 PWA
        |
        | HTTPS REST + authenticated WebSockets
        v
Django 6 + Django REST Framework + Daphne/ASGI
        |                |                 |
        v                v                 v
Aiven PostgreSQL   Redis/Channels    Cloudinary private media
        |
        +-- Brevo HTTPS transactional email
        +-- OpenRouteService + Leaflet mapping

Deployment contract: Render static frontend + Render Daphne backend
Local development: guarded SQLite unless remote access is explicitly authorized
```

| Chapter III claim/area | Status | Correction |
|---|---|---|
| React frontend and Django REST backend | **Aligned** | Retain, but specify React 18/Vite and Django 6/DRF/Daphne. |
| Relational database | **Aligned but incomplete** | Production/staging use PostgreSQL through `DATABASE_URL`; ordinary local development uses guarded SQLite. |
| Polling for messages/updates, no full WebSockets | **Stale / contradicted** | `afn_service_management/asgi.py` mounts message, notification, and inventory WebSocket routes; Redis backs the production channel layer. HTTP refresh/fallbacks may coexist, but the architecture is not polling-only. |
| Vercel/Render/Hostinger/ngrok deployment discussion | **Stale** | The controlled deployment contract is Render static frontend, Render Daphne backend, Aiven PostgreSQL, Redis, Cloudinary, and Brevo HTTPS email. Hostinger/ngrok are not the current application contract. |
| PWA/offline support | **Partially aligned** | Manifest and service worker exist; business mutations still require server connectivity. Avoid claiming broad offline transaction support. |
| Role-based security | **Partially aligned** | Add delegated capability grants, object/workflow checks, optional administrator TOTP MFA, recovery codes, audit/change logs, correlated request logging, and private-file authorization. |
| Forecast generation | **Partially aligned** | Describe readiness gates and error/backtesting evidence; do not present withheld forecasts as predictions. |
| 30-table data dictionary | **Stale** | Django's live application registry reports 60 first-party application models across users, services, inventory, messages, and notifications, with materially different relationships. Replace the chapter dictionary from current schema artifacts. |

#### Major current entities omitted from the paper dictionary

The paper's table list does not adequately represent these implemented domains:

- capability grants, administrator settings, landing assets, activity/change logs;
- calendar closures, request-to-service joins, ticket crew assignments, service locations, and solar estimates;
- document definitions, designs, versions, template fields, instances, generated files, outputs, attachments, quotations, contracts, project profiles, and field reports;
- sales records, sales lines, and recorded payments;
- inventory reservations, service requirements, equipment-return requests/items, and append-only inventory transactions;
- after-sales cases/events, installed equipment, and maintenance schedules;
- technician skills, arrival validation, and location history;
- customer support, messages, notifications, status history, ticket progress, SLA rules, analytics, performance, trends, and forecasts.

The maintained schema sources under `docs/architecture/` should be used to rebuild the Chapter III dictionary and diagrams. A manually copied table list will become stale again.

#### Research-method inconsistencies

- The population is stated as 264 and the allocation as **151 clients + 6 technicians + 1 administrator + 1 superadministrator = 159**.
- Another sentence states **150 + 6 + 1 + 1 = 159**, but that arithmetic is **158**.
- The paper mixes Yamane/proportional sampling language with purposive selection of complete staff groups. It should distinguish the client sampling method from total enumeration/purposive inclusion of staff.
- The instrument and analysis section must state the actual number of valid responses per role, missing-response handling, administration dates, consent procedure, and calculation method.

### Chapter IV — Presentation, Analysis, and Interpretation

Tables 22–57 cover client, technician, administrator, and superadministrator evaluations against functional and ISO-style criteria. Their present form is **potentially placeholder data**, not credible final results:

- every table reports a perfect weighted mean of `5.00` and `Strongly Agree`;
- no frequency distribution (`f` per Likert choice), respondent count (`n`), standard deviation, or item-level computation is shown;
- narrative repeatedly says respondents **will evaluate**, indicating a proposed rather than completed evaluation;
- the perfect results are not reconciled with the declared 159-person sample;
- no limitations, negative findings, or observed usability defects are discussed.

**Required correction:** import the actual questionnaire dataset, report valid `n` for each role/table, show frequency and weighted-mean computations, disclose exclusions/nonresponses, use past tense only after data collection, and generate conclusions from real values. If data collection has not happened, label Chapter IV as a proposed evaluation plan and remove fabricated-looking results.

### Chapter V — Summary, Conclusions, and Recommendations

Chapter V currently contains only its title and heading. It is **Missing**. It should be written only after Chapters I–IV are corrected and real evaluation results are available. It should separate:

- what the implemented system demonstrably does;
- what automated tests establish;
- what respondents actually evaluated;
- remaining limitations (provider dependence, connectivity, forecast readiness, external security/UAT gates, and excluded functions);
- prioritized recommendations grounded in findings.

## 4. Current system capability map

| Domain | Implementation status | Primary evidence |
|---|---|---|
| Authentication, verification, reset, role/capability access | **Implemented; one current test-contract failure** | `backend/users/`, `frontend/src/context/AuthContext.jsx`, protected routes in `frontend/src/App.jsx` |
| Optional administrator MFA and recovery | **Implemented** | users security endpoints/models/tests and protected settings UI |
| Service request, inspection, ticket, progress, SLA, completion | **Implemented** | `backend/services/models/core.py`, ticket/request views and serializers, admin/client/technician pages |
| Calendar availability, capacity colors, closures/ranges | **Implemented** | `CalendarClosure`, appointment-availability APIs, admin calendar, client request calendar |
| Dispatch, lead/crew assignment, job controls | **Implemented** | ticket crew model, dispatch APIs/UI, technician job flows |
| Mapping, route guidance, tracking, coverage/heatmap | **Implemented with provider/connectivity dependence** | ORS proxy/service, Leaflet pages, location models, tracking APIs |
| Inventory lifecycle and ticket reservations | **Implemented** | `backend/inventory/`, dispatch/checklist integrations |
| Quotations, deposits, sales and dispatch gate | **Implemented** | document quotation records, sales models, payment/deposit verification and ticket gates |
| Six protected documents plus custom Smart Documents | **Implemented; arbitrary uploads still require mapping/configuration** | `backend/services/models/documents.py`, document-template APIs/services, `AdminDocuments.jsx` |
| After-sales and maintenance | **Implemented** | `backend/services/models/after_sales.py`, admin/client flows |
| Messages, support, notifications and email | **Implemented** | `messages_app`, `notifications`, Channels routes, Brevo backend |
| Operational analytics | **Implemented** | analytics endpoints and Admin Analytics workspaces |
| Forecast publication | **Implemented but gated** | `DemandForecast`, validation/readiness logic and UI explanations |
| PWA shell | **Implemented with limited offline behavior** | `frontend/index.html`, `frontend/src/pwa.js`, `frontend/public/sw.js` |
| Audit/security/observability controls | **Implemented baseline; external assurance still required** | activity/change logs, request correlation, security and privacy runbooks |

## 5. Workflow trace that the paper should describe

1. A client registers/verifies, creates a service request, selects services and an available date/location, and can track its status.
2. Staff review/inspect the request and create or advance the service ticket.
3. Quotations and contract/document records can be produced; acceptance and externally verified deposits affect downstream eligibility.
4. Dispatch assigns technician lead/crew, schedule, and required/reserved inventory. Backend gates—not only UI buttons—protect invalid transitions.
5. Technicians navigate, validate arrival, start work, complete checklists, upload evidence, record equipment/material use, and finish eligible jobs.
6. Completion/turnover and sales records preserve operational and financial history.
7. Notifications, messages, support, status history, analytics, after-sales cases, and maintenance schedules continue beyond the initial job.

This lifecycle is more accurate than treating requests, dispatch, documents, inventory, and reports as independent modules.

## 6. Performance, hosting, and operational limits

- Render free-tier cold starts can delay initial authentication/API requests; the frontend includes wake-up handling, but this does not remove provider latency.
- DOCX generation is supported server-side; accurate arbitrary DOCX/PDF browser editing and server PDF conversion are not equivalent capabilities. Uploaded templates require validation and field/placeholder mapping.
- Cloudinary and Redis are external dependencies. Private-media authorization and channel health must remain release-tested.
- Routing depends on OpenRouteService availability and configured geographic bounds.
- Forecasts require sufficient clean history; the system intentionally withholds unqualified future quantities.
- The local SQLite suite cannot prove every PostgreSQL locking/dialect behavior. Guarded staging tests remain relevant.

## 7. Validation evidence from this audit

| Command | Result |
|---|---|
| `backend/manage.py check` | **PASS** — no system-check issues. |
| `backend/manage.py makemigrations --check --dry-run` | **PASS** — no model/migration drift. |
| `npm run build` | **PASS** — Vite production build transformed 2,564 modules. |
| `npx playwright test --list` | **PASS** — 230 tests discovered in 11 maintained spec files. |
| Django application-registry model count | **PASS** — 60 first-party models reported across users, services, inventory, messages, and notifications. |
| `npm run quality:full` backend stage | **FAIL** — 693 tests ran; 1 failed, 7 skipped, therefore 685 passed. The gate stopped before its later stages. |
| Exact failing backend test rerun | **FAIL, reproduced** — `users.tests.EmailVerificationTests.test_unverified_client_is_removed_after_verification_window` expected HTTP 401 but login returned HTTP 403. |
| Separate `npx playwright test --reporter=line` | **FAIL** — 224 passed and 6 failed in 32.9 minutes on the isolated E2E database. |

The 401/403 discrepancy is a **contract mismatch**. This audit does not infer whether implementation or assertion should change; that requires an explicit authentication-contract decision. It does mean the repository cannot presently be described as passing its complete backend gate.

The six browser failures are bounded but material:

1. Admin Calendar's full-cell configuration button is visually present but event content above it intercepts pointer input.
2. The calendar desktop quality test reports three element collisions between that cell button and scheduled-event content; this is the same calendar-layering defect expressed by a second test.
3. The all-six document persistence journey did not receive the expected `Solar commissioning checklist saved.` confirmation after saving.
4. Both major cross-role journeys still look for the removed single-page location placeholder `E.g., near SM Mall of Asia`; the current client request experience is step-based, so those E2E selectors/workflow steps are stale or the new UI no longer exposes an equivalent accessible control at that point.
5. The reschedule/cancel/rejection journey reached a page state where the expected admin `Reject Request` action was absent; its captured page was under client navigation, requiring an auth/navigation-state investigation before deciding whether product code or the journey is wrong.

The repeated Vite `ws proxy ... ECONNABORTED` messages occurred during browser navigation/teardown. They were noisy but were not themselves the six recorded Playwright assertion failures.

## 8. Paper revision priorities

### Priority 0 — validity blockers

1. Replace Chapter IV placeholder/proposed results with auditable questionnaire data, or label it honestly as a future evaluation plan.
2. Write Chapter V only from corrected implementation and evaluation evidence.
3. Correct the 150/151 and 158/159 sample inconsistency and document actual valid responses.

### Priority 1 — technical accuracy

1. Replace the Chapter III architecture/deployment narrative with the actual stack shown in this report.
2. Regenerate the data dictionary and diagrams from maintained current schema artifacts.
3. Correct polling-only language to explain REST plus authenticated WebSockets and fallbacks.
4. Add quotation/deposit/sales, calendar capacity, documents, maintenance, capabilities, MFA, storage, and audit controls.

### Priority 2 — claim discipline

1. Distinguish implemented, automated-test-proven, staging-UAT-proven, and respondent-evaluated claims.
2. Describe forecasting as validation-gated rather than guaranteed prediction.
3. Independently verify every Chapter II source and bibliography record.
4. Retain clear non-goals: no payment gateway, SMS, RFID/biometrics, or advanced multi-stop optimization.

## 9. Evidence map

- Routes and role surfaces: `frontend/src/App.jsx`
- PWA: `frontend/index.html`, `frontend/src/pwa.js`, `frontend/public/sw.js`
- Deployment: `render.yaml`, `backend/afn_service_management/settings.py`
- ASGI/realtime: `backend/afn_service_management/asgi.py`, `backend/messages_app/routing.py`, `backend/notifications/routing.py`, `backend/inventory/routing.py`
- Core/calendar/tickets: `backend/services/models/core.py`
- Documents: `backend/services/models/documents.py`, `backend/services/views/document_templates.py`
- Analytics/forecasting: `backend/services/models/analytics.py`, `backend/services/views/analytics.py`
- Sales and after-sales: `backend/services/models/sales.py`, `backend/services/models/after_sales.py`
- Messages/notifications: `backend/messages_app/models.py`, `backend/notifications/models.py`
- Maintained architecture/schema: `docs/architecture/`
- Living evidence and risk record: `docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md`
- Maintained browser coverage: `e2e/`

## 10. Audit limitations

- The Google Doc content was read end to end for its Chapters 1–5 tabs, but external literature sources were not independently authenticated in this pass.
- No production or staging data was changed or used for destructive validation.
- No migration was applied. Browser tests use the isolated E2E database.
- Repository evidence establishes implemented behavior and maintained tests; it does not substitute for real respondent data, independent penetration testing, provider SLAs, or final client acceptance.

