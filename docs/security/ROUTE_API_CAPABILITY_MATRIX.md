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
| Operations dashboard | `/admin/dashboard` | dashboard and SLA summaries | `supervisor.dashboard.view` | Partial |
| Service tickets | `/admin/service-tickets` | service requests and tickets | `supervisor.tickets.view`, `services.requests.review`, `services.tickets.manage` | Parity for core request review and ticket mutations; document/report actions are tracked separately |
| Dispatch board/calendar | `/admin/dispatch-board`, `/admin/calendar` | ticket assignment, calendar, auto-dispatch | `supervisor.dispatch.view` | Partial |
| Technician tracking | `/admin/technician-tracking` | tracking, technician locations | `supervisor.tracking.view` | Parity |
| Coverage and job history | `/admin/coverage-heatmap`, `/admin/job-history` | coverage and history reports | `admin.job_history.view` | Partial |
| User directory | `/admin/user-management` | users and capability grants | `users.directory.view`, `users.directory.manage` | Parity |
| Landing page | `/admin/landing-page` | settings and landing assets | `public_site.view`, `public_site.manage` | Parity at current two-level model; granular publish/upload/delete split planned |
| After-sales cases | `/admin/after-sales-cases` | follow-up cases | `after_sales.cases.view`, `after_sales.cases.manage` | Parity |
| Inventory | `/admin/inventory` | items, categories, transactions, reservations, requirements | `inventory.view`, `inventory.manage` | Parity |
| Service catalog | `/admin/services` | service types, procedures, requirements | `services.catalog.view`, `services.catalog.manage` | Parity for catalog; inventory-template actions additionally require inventory access |
| Documents and commercial records | `/admin/documents` | generated documents, quotations, contracts, commissioning, turnover | `documents.view`, `documents.manage` | Parity; technician checklist/report writes retain assigned-ticket scope and clients retain owned reads |
| Analytics | `/admin/analytics` | analytics, forecasts, trends, supporting dashboard metrics | `analytics.view` | Parity |
| Reports | `/admin/reports`, `/admin/operations-report` | operational and exported reports | `reports.view`, `reports.export` | Parity; exports are browser-side and hidden without export authority |
| Staff messages | `/admin/messages` | staff conversations and WebSockets | `communications.staff.view` | Planned |
| Client support | `/admin/client-support` | support cases/messages | `communications.support.view`, `communications.support.manage` | Planned |
| Activity logs | `/admin/activity-logs` | audit/activity records | `audit.view` | Parity |
| System settings | `/admin/settings` | operational settings | `system.settings.view`, `system.settings.manage` | Planned |
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
| Messages | `/technician/messages` | `technician.messages.view` | Conversation membership | Partial; WebSocket parity audit remains |
| History | `/technician/job-history` | `technician.history.view` | Own completed jobs | Parity |
| Profile | `/technician/profile` | `technician.profile.view` | Own profile | Parity |
| Inventory lookup | API used during field work | Technician role read-only | Own transactions/reservations where applicable | Partial object-scope audit remains |

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
| Support | `/client/support` | Enforced; attachment audit remains |
| Notifications | `/client/notifications` | Enforced |
| Profile | `/client/profile` | Self-service only |

## Implementation order for remaining gaps

1. Messaging, support, and WebSocket membership
2. System settings and granular public-site publishing controls
3. Coverage/job-history object scopes and remaining technician inventory scope
