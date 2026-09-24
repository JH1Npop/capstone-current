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
| Operations dashboard | `/admin/dashboard` | dashboard and SLA summaries | `supervisor.dashboard.view` | Parity; unrelated admin capabilities cannot retrieve the full dashboard and login redirects select the first authorized workspace |
| Service tickets | `/admin/service-tickets` | service requests and tickets | `supervisor.tickets.view`, `services.requests.review`, `services.tickets.manage` | Parity for core request review and ticket mutations; document/report actions are tracked separately |
| Dispatch board/calendar | `/admin/dispatch-board`, `/admin/calendar` | ticket assignment, calendar, auto-dispatch | `supervisor.dispatch.view` | Parity; routes, calendar reads, dispatch lists, and dispatch actions share the capability boundary |
| Technician tracking | `/admin/technician-tracking` | tracking, technician locations | `supervisor.tracking.view` | Parity |
| Coverage and job history | `/admin/coverage-heatmap`, `/admin/job-history` | coverage and history reports | `supervisor.tracking.view` for coverage; `admin.job_history.view` for completed-job evidence | Parity; action-specific API permissions prevent either capability from unlocking the other dataset |
| User directory | `/admin/user-management` | users and capability grants | `users.directory.view`, `users.directory.manage` | Parity |
| Landing page | `/admin/landing-page` | settings and landing assets | `public_site.view`, `public_site.publish`, `public_site.assets.upload`, `public_site.assets.delete`; legacy `public_site.manage` umbrella | Parity; publish, upload, and delete actions are independently enforced, while existing manage grants retain all three authorities |
| After-sales cases | `/admin/after-sales-cases` | follow-up cases | `after_sales.cases.view`, `after_sales.cases.manage` | Parity |
| Inventory | `/admin/inventory` | items, categories, transactions, reservations, requirements | `inventory.view`, `inventory.manage` | Parity |
| Service catalog | `/admin/services` | service types, procedures, requirements | `services.catalog.view`, `services.catalog.manage` | Parity for catalog; inventory-template actions additionally require inventory access |
| Documents and commercial records | `/admin/documents`, `/admin/sales-records` | generated documents, quotations, contracts, commissioning, turnover, connected sales records | `documents.view`, `documents.manage` | Parity; Sales Record mutations require manage authority, technicians receive no Sales Record rows, and clients retain owned confirmed-record reads |
| Analytics | `/admin/analytics` | analytics, forecasts, trends, supporting dashboard metrics | `analytics.view` | Parity |
| Reports | `/admin/reports`, `/admin/operations-report` | operational and exported reports | `reports.view`, `reports.export` | Parity; exports are browser-side and hidden without export authority |
| Staff messages | `/admin/messages` | staff conversations and WebSockets | `communications.staff.view` | Parity; REST routes, participants, sidebar/route guards, and WebSocket staff messaging use the same capability |
| Client support | `/admin/client-support` | support cases/messages | `communications.support.view`, `communications.support.manage` | Parity; view/manage are split across REST mutations, notifications, navigation, and ticket WebSockets |
| Activity logs | `/admin/activity-logs` | audit/activity records | `audit.view` | Parity |
| System settings | `/admin/settings` | operational settings | `system.settings.view`, `system.settings.manage` | Parity; view/manage are split, while public-site-only administrators receive only landing-page fields |
| Profile | `/admin/profile` | authenticated self-profile | object ownership | Existing self-service rule |

## Technician workspace

| Feature | React route | Capability | Object scope | Status |
| --- | --- | --- | --- | --- |
| Dashboard | `/technician/dashboard` | `technician.dashboard.view` | Signed-in technician | Parity |
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
| Ticket progress | Used by request detail/timeline consumers | Owned tickets are read-only; create, edit, and delete are blocked |
| Service history | `/client/service-history` | Enforced |
| Purchase records | `/client/purchase-records` | Confirmed records restricted to the owning client; mutations blocked and directly tested |
| Support | `/client/support` | Enforced; image size, signature, declared type, ownership, and spoofed-content rejection are directly validated |
| Notifications | `/client/notifications` | Enforced |
| Profile | `/client/profile` | Self-service only |

## Implementation order for remaining gaps

1. Staging concurrency validation against PostgreSQL, Redis, and durable media
2. Authenticated penetration testing and deployed network/IAM review
