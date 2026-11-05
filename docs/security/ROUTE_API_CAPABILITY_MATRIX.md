# Route-to-API Capability Matrix

This matrix is the Release 1 authorization contract. A feature is considered
complete only when its sidebar item, React route, API permission, object
visibility, and regression tests enforce the same access rule.

Status meanings:

- **Parity** — frontend and backend capability checks match.
- **Partial** — some endpoints or actions remain role-only.
- **Planned** — capability split is defined by the master plan but not implemented yet.

## Administrator workspace

| Feature | React route | Primary APIs | Capability | Status |
| --- | --- | --- | --- | --- |
| Operations dashboard | `/admin/dashboard` | dashboard and SLA summaries; `/api/dashboard/changes/?role=admin` change token polled every 5 seconds (full reload only when it changes or once a minute) | `supervisor.dashboard.view` | Parity; unrelated admin capabilities cannot retrieve the full dashboard and login redirects select the first authorized workspace |
| Service tickets | `/admin/service-tickets` | service requests, tickets, service locations, inspections, and administrator progress updates | `supervisor.tickets.view`, `services.requests.review`, `services.tickets.manage` | Parity for core request review and ticket mutations, including legacy location/inspection/progress endpoints; document/report actions are tracked separately |
| Dispatch board/calendar | `/admin/dispatch-board`, `/admin/calendar`; `GET/POST /api/admin/calendar/closures/` | ticket assignment, calendar, auto-dispatch, authoritative per-day/per-slot occupancy, configurable per-slot appointment capacity, and reversible Limited/Closed date or date-range overrides | `supervisor.dispatch.view` | Parity; routes, calendar reads, dispatch lists/actions, capacities, and availability overrides share the capability boundary. The closure read returns server-derived booked/capacity/remaining/status values for Configuration Mode. Limited/Closed changes require a reason and affect new scheduling rather than cancelling existing appointments |
| Technician tracking | `/admin/technician-tracking` | tracking, technician locations, legacy GIS dashboard | `supervisor.tracking.view` | Parity |
| Coverage and job history | `/admin/coverage-heatmap`, `/admin/job-history` | coverage and history reports | `supervisor.tracking.view` for coverage; `admin.job_history.view` for completed-job evidence | Parity; action-specific API permissions prevent either capability from unlocking the other dataset |
| User directory | `/admin/user-management` | users and capability grants | `users.directory.view`, `users.directory.manage` | Parity; current technician-skill mutations remain superadmin-only, matching the editor |
| Landing page | `/admin/landing-page` | settings and landing assets | `public_site.view`, `public_site.publish`, `public_site.assets.upload`, `public_site.assets.delete`; legacy `public_site.manage` umbrella | Parity; publish, upload, and delete actions are independently enforced, while existing manage grants retain all three authorities |
| After-sales cases | `/admin/after-sales-cases` | follow-up cases | `after_sales.cases.view`, `after_sales.cases.manage` | Parity; mutations require manage authority and deletion remains disabled to preserve the audit trail |
| Inventory | `/admin/inventory` | items, categories, transactions, reservations, requirements | `inventory.view`, `inventory.manage` | Parity |
| Service catalog | `/admin/services` | service types, procedures, requirements | `services.catalog.view`, `services.catalog.manage` | Parity for catalog; inventory-template actions additionally require inventory access |
| Documents and commercial records | `/admin/documents`, `/admin/sales-records` | generated documents, quotations, contracts, commissioning, turnover, connected sales records | `documents.view`, `documents.manage` | Parity; Sales Record mutations require manage authority, technicians receive no Sales Record rows, and clients retain owned confirmed-record reads |
| Analytics | `/admin/analytics` | analytics, forecasts, trends, supporting dashboard metrics | `analytics.view` | Parity |
| Reports | `/admin/reports`, `/admin/operations-report` | operational, ticket-progress, and exported reports | `reports.view`, `reports.export` | Parity; the legacy ticket-progress report follows the same read boundary, and exports are hidden without export authority |
| Staff messages | `/admin/messages` | staff conversations and WebSockets | `communications.staff.view` | Parity; REST routes, participants, sidebar/route guards, and WebSocket staff messaging use the same capability |
| Client support | `/admin/client-support` | support cases/messages | `communications.support.view`, `communications.support.manage` | Parity; view/manage are split across REST mutations, notifications, navigation, and ticket WebSockets |
| Activity logs | `/admin/activity-logs` | audit/activity records | `audit.view` | Parity |
| System settings | `/admin/settings` | operational settings | `system.settings.view`, `system.settings.manage` | Parity; view/manage are split, while public-site-only administrators receive only landing-page fields |
| Profile | `/admin/profile` | authenticated self-profile | object ownership | Existing self-service rule |

## Technician workspace

| Feature | React route | Capability | Object scope | Status |
| --- | --- | --- | --- | --- |
| Dashboard | `/technician/dashboard` | `technician.dashboard.view` | Signed-in technician; `/api/dashboard/changes/?role=technician` uses the same workspace check | Parity |
| Jobs | `/technician/my-jobs` | `technician.jobs.view` | Lead or crew assignment | Parity |
| Schedule | `/technician/schedule` | `technician.schedule.view` | Own schedule | Parity |
| Navigation | `/technician/map-navigation` | `technician.navigation.view` | Assigned jobs | Parity |
| Checklists | `/technician/checklist`, `/technician/inspection-checklist` | `technician.checklist.view` | Assigned jobs | Parity |
| Ticket progress | API used by assigned job workflows | Technician role | Lead or crew assignment; append-only | Parity and directly tested |
| Messages | `/technician/messages` | `technician.messages.view` | Conversation membership | Parity; REST and WebSocket access both require the capability and valid ticket participation |
| History | `/technician/job-history` | `technician.history.view` | Own completed jobs | Parity |
| Profile | `/technician/profile` | `technician.profile.view` | Own profile | Parity |
| Inventory lookup | API used during field work | `technician.inventory.view` | Catalog read-only; own transactions/reservations; dashboard stock alerts require the same capability | Parity and directly tested |

## Client workspace

Client features use ownership rather than assignable staff capabilities. Every
queryset must restrict records to `request.user`, including requests, estimates,
messages, notifications, documents, support cases, and history.

| Feature | Route | Ownership status |
| --- | --- | --- |
| Solar estimates | `/client/solar-estimates` | Enforced and tested |
| Requests and request detail | `/client/requests`, `/client/requests/:id` | Enforced; transition audit remains |
| Request appointment availability | `/client/service-requests`; aggregate `GET /api/services/service-requests/appointment-availability/` | Authentication required; returns privacy-reduced Available/Limited/Full/Closed date and slot states computed from configured capacity plus active overrides. It exposes no counts, override reasons, client, ticket, request, service, location, or technician identity. Full/Closed choices are disabled and rejected again at request creation, approval, and ticket scheduling/rescheduling boundaries; Limited remains requestable |
| Ticket progress | Used by request detail/timeline consumers | Owned tickets are read-only; create, edit, and delete are blocked |
| Service history | `/client/service-history` | Enforced |
| Purchase records | `/client/purchase-records` | Confirmed records restricted to the owning client; mutations blocked and directly tested |
| Support | `/client/support` | Enforced; image size, signature, declared type, ownership, and spoofed-content rejection are directly validated |
| Notifications | `/client/notifications` | Enforced |
| Profile | `/client/profile` | Self-service only |

## Document design actions added 2026-11-05 (`/api/services/document-template-versions/<id>/...`)

| Action | Method | Capability (server) | Notes |
| --- | --- | --- | --- |
| `revalidate` | POST | `documents.templates.manage` | Checks a **draft** DOCX design again against the current approved and registered fields. The stored file is not changed. Active and retired versions are refused (409). |
| `accept-fields` | POST | `documents.definitions.manage` | Registers plain names found in a draft design of a **custom** document as text fields, then checks the design again. Names must be in the design's own `possible_fields` list. Core documents are refused (409). |
| `use-design` | POST | `documents.templates.publish` | Checks a draft again, then activates it, makes its design the default, and switches a custom document on. The same activation rules apply (valid design, all required core components). Enabling a custom document additionally needs `documents.definitions.manage`; without it the design is activated and the response reports `definition_enabled: false`. |

Read-only addition: every version response now carries a plain-language `checklist` (status `ok`, `problem`, or `note`).

## Implementation order for remaining gaps

1. Staging concurrency validation against PostgreSQL, Redis, and durable media
2. Authenticated penetration testing and deployed network/IAM review

## Starter download added 2026-11-05 (`/api/services/document-definitions/<id>/starter/`)

| Action | Method | Capability (server) | Notes |
| --- | --- | --- | --- |
| `starter` | GET | `documents.view` (same access as listing the definition) | Downloads a blank Word design listing the document's fields in plain `[Field Name]` form. Custom documents only; the six core documents return 409 because their required tables make a blank file invalid. Writes an activity-log entry (`starter_download`). The UI shows the button only in the template manager. |

## Fill blanks added 2026-11-05 (`/api/services/document-template-versions/<id>/fill-blanks/`)

| Action | Method | Capability (server) | Notes |
| --- | --- | --- | --- |
| `fill-blanks` | POST | `documents.templates.upload` (creates a version) | Draft **Word** designs only. Body `{names: [...]}` must be labels offered in the version's `placeholder_manifest.blank_suggestions` (lines like `Client Name: ______` whose label is an approved field). The uploaded file is never edited: the result is saved as a new draft version through the normal upload validation, with a change note. Definition access capabilities are enforced. |

## PDF field placement and document-type delete added 2026-11-05

| Route | Method | Capability (server) | Notes |
| --- | --- | --- | --- |
| `/api/services/document-template-versions/<id>/place-fields/` | POST | `documents.templates.manage` | Draft **PDF** designs only. Body `{names: [...]}` must be labels in the version's `placeholder_manifest.field_suggestions` (found by `services/pdf_suggestions.py` at upload from real PDF text). Creates AFN-filled (`system`) `DocumentTemplateField` rows with estimated placements; does not activate. Scanned PDFs have no suggestions. Logged `template_fields_placed`. |
| `/api/services/document-definitions/<id>/` | DELETE | `documents.definitions.manage` | **Custom** documents only, and only if no output and no prepared instance ever existed. Removes its designs, versions, stored files and fields. Core documents and used types return 409 (disable instead). Logged `custom_definition_delete`. |

## Built-in design download added 2026-11-06

| Route | Method | Capability (server) | Notes |
| --- | --- | --- | --- |
| `/api/services/document-definitions/<id>/built-in-design/` | GET | `documents.view` | The six core documents only: returns AFN's own Word design with its field markers (`backend/document_templates/<file>.docx`, not the unmarked copies in `document_templates/originals/`). Custom documents return 409. Logged `built_in_design_download`. Shown in the template manager as **Download the original design** when no version is in use. |
