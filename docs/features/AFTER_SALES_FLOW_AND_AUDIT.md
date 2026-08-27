# After-Sales Data Flow and Audit

Date: May 4, 2026
Updated: May 30, 2026

## Purpose

The after-sales module manages work that happens after a service ticket is completed. It does not replace the client request dashboard. Client requests first enter the system as `ServiceRequest` records, then become `ServiceTicket` records, and only completed tickets can create after-sales records.

## User Flow

```text
Client creates service request
  -> ServiceRequest is stored
  -> Admin/superadmin approves and schedules work
  -> ServiceTicket is stored
  -> Technician completes checklist
  -> InspectionChecklist is stored
  -> Technician completes the ticket
  -> ServiceTicket.status becomes Completed
  -> Backend creates AfterSalesCase and/or MaintenanceSchedule when needed
  -> Client can send ticket-linked after-sales messages from the request detail page
  -> Admin/superadmin receives a customer inquiry notification for the ticket message
  -> Admin after-sales dashboard and queue show database records
  -> A new request or ticket is created manually when another service visit is needed
```

## Main Database Tables

| Table / Model | Purpose | Important Fields |
| --- | --- | --- |
| `ServiceRequest` | Original client request | `client`, `service_type`, `description`, `status`, `preferred_date`, `request_date` |
| `ServiceTicket` | Scheduled/assigned job created from a request | `request`, `technician`, `status`, `scheduled_date`, `completed_date`, `warranty_end_date` |
| `InspectionChecklist` | Technician checklist submission | `ticket`, `checklist_items`, `warranty_provided`, `warranty_period_days`, `follow_up_required`, `follow_up_case_type` |
| `AfterSalesCase` | After-sales work queue record | `service_ticket`, `client`, `case_type`, `status`, `priority`, `creation_source`, `due_date` |
| `MaintenanceSchedule` | Planned future maintenance reminder | `service_ticket`, `client`, `next_due_date`, `notify_on_date`, `status`, `risk_level` |
| `Message` | Ticket-linked after-sales conversation | `ticket`, `sender`, `receiver`, `room_type`, `group_key`, `message_text` |
| `Notification` | In-app alert for admins/clients/technicians | `user`, `ticket`, `request`, `title`, `message`, `type`, `status` |

## Backend Connections

| Feature | Endpoint / Function | Database Source |
| --- | --- | --- |
| After-sales dashboard | `GET /api/dashboard/stats/?role=admin` or compatible after-sales dashboard requests | `AfterSalesCase`, `MaintenanceSchedule`, completed `ServiceTicket` rows |
| After-sales case queue | `GET /api/services/follow-up-cases/` | `AfterSalesCase` |
| Create manual after-sales case | `POST /api/services/follow-up-cases/` | Creates `AfterSalesCase` |
| Update after-sales case status | `PATCH /api/services/follow-up-cases/{id}/` | Updates `AfterSalesCase.status` |
| Technician checklist | `POST /api/checklist/` | Creates/updates `InspectionChecklist` |
| Complete service ticket | `POST /api/services/service-tickets/{id}/complete_work/` | Updates `ServiceTicket`, then syncs after-sales records |
| Completion sync | `sync_ticket_maintenance_schedule(ticket)` | Creates warranty, follow-up, and maintenance records when rules match |
| Ticket after-sales messages | `GET/POST /api/messages/` | Reads/writes `Message` rows linked to `ServiceTicket` |
| Client message alert | `notify_admins_of_client_ticket_message(message)` | Creates `customer_inquiry` notifications for admin/superadmin users |

## Frontend Connections

| Page | File | Data Loaded |
| --- | --- | --- |
| Admin after-sales dashboard area | `frontend/src/pages/admin/AdminDashboard.jsx` | Loads dashboard statistics and after-sales summaries for authorized admin users |
| After-sales case queue | `frontend/src/pages/follow_up/FollowUpCases.jsx` | `fetchFollowUpCases()`, `fetchServiceTickets({ workspace: 'after_sales' })` |
| Client request detail | `frontend/src/pages/client/ClientRequestDetail.jsx` | Shows ticket after-sales messages and lets clients send a message |
| Admin/staff messages | `frontend/src/pages/technician/TechnicianMessages.jsx` | Shows staff chat plus ticket-linked after-sales rooms |
| Shared API helpers | `frontend/src/api/services.js` | Sends filters/search to backend endpoints |
| Message API helpers | `frontend/src/api/communications.js` | Loads and sends ticket-linked messages |

## When Data Appears in After-Sales

After-sales records appear when one of these happens:

1. A completed technician checklist requests follow-up work.
2. A completed ticket has warranty coverage and creates a warranty case.
3. A maintenance schedule reaches its notification window.
4. An authorized admin user manually creates a case from a completed ticket.
5. A client sends an after-sales message for a linked service ticket.

Checklist submission alone does not immediately mean the after-sales dashboard changes. The checklist is stored first. The after-sales record is created after the ticket reaches `Completed`.

Client after-sales messaging does not replace `AfterSalesCase`. Messages are the conversation layer on top of a ticket. A message can alert the admin team, and the admin team can decide whether to open or update an `AfterSalesCase`.

## Current UI Behavior

### Dashboard

The dashboard shows:

| Section | Meaning |
| --- | --- |
| Total cases | Count of `AfterSalesCase` rows |
| Open pipeline | Cases with `open` or `in_progress` status |
| Overdue recoveries | Open/in-progress cases with a past due date |
| Recent after-sales cases | Table of latest `AfterSalesCase` records |
| Maintenance watch | Active `MaintenanceSchedule` rows due soon or due now |
| Completed jobs awaiting review | Completed tickets without any after-sales case |

### Case Queue

The case queue is now table-based and supports:

| Control | Backend Filter |
| --- | --- |
| Search | DRF search against summary, details, client, and service |
| Status | `status`, including `open_work` and `overdue` |
| Case type | `case_type` |
| Priority | `priority` |
| Source | `creation_source` |

## Scalability Audit

| Area | Status | Notes |
| --- | --- | --- |
| Database table exists | Passed | `AfterSalesCase` is a real Django model with migrations. |
| Frontend connected to backend | Passed | Dashboard and queue call API helpers instead of mock data. |
| Backend connected to database | Passed | Viewsets/querysets read `AfterSalesCase`, `MaintenanceSchedule`, and `ServiceTicket`. |
| Filtering scalability | Improved | Filters now run through backend query params instead of only React-side filtering. |
| Search usability | Improved | Queue search is available from the UI and maps to backend search. |
| Table usability | Improved | Dashboard and queue use tables for scan-friendly case management. |
| Empty-state clarity | Improved | UI explains that after-sales is populated after completed ticket handoff/warranty/maintenance/manual case creation. |
| Database indexing | Passed | Existing migration adds indexes for `AfterSalesCase.status`, `assigned_to`, `client`, and `due_date`. |
| Role access | Passed | Access is controlled by after-sales/admin capability permissions. |
| Client ticket messages | Passed | Clients can message only on their own tickets; admins can see ticket rooms. |
| Message notifications | Passed | Client ticket messages create `customer_inquiry` notifications for admin/superadmin. |
| Automated tests | Passed | Backend tests verify creation, rejection, database filters, search behavior, and ticket message access. |

## Demo Checklist

Use this sequence to prove the full flow:

1. Log in as a client and create a service request.
2. Log in as admin/superadmin and approve or schedule the request.
3. Assign the generated ticket to a technician.
4. Log in as technician and submit the checklist.
5. Enable warranty or after-sales handoff in the checklist.
6. Complete the ticket.
7. Log in as an admin user with after-sales access.
8. Open the admin dashboard after-sales area.
9. Confirm the case appears in the dashboard table.
10. Open the after-sales case queue and use filters/search.
11. Change the case status to `In Progress`, `Resolved`, or `Closed`.
12. Log in as the client, open request detail, and send an after-sales message.
13. Log in as admin/superadmin and confirm the message room and notification appear.

## Audit Result

The after-sales module is connected across frontend, backend, and database. The main workflow is intentionally completion-based: client requests do not directly appear as after-sales cases until the service work is completed or a manual after-sales case is created.

The current implementation is acceptable for a professor demo because it shows:

- Real database-backed records.
- Clear lifecycle from client request to after-sales case.
- API endpoints that read and write real models.
- Search and filters that scale better than frontend-only filtering.
- UI tables that make stored data visible and easier to explain.

## Lifecycle Boundary

After-sales and maintenance records keep the service lifecycle active after ticket completion, but they do not automatically generate a new `ServiceRequest` or `ServiceTicket`. This is intentional in the current implementation. A follow-up case or due maintenance item tells the administrator what needs attention; the next service request or ticket is created manually when another visit is confirmed.

## Next Discussion: Client Visibility

Question to revisit: should clients see after-sales tickets directly on the client dashboard?

Current state:

- The problem/after-sales ticket model is `AfterSalesCase`.
- `AfterSalesCase` supports complaint, warranty, revisit, feedback, maintenance, and general follow-up cases.
- These cases are managed through the admin after-sales workspace at `/api/services/follow-up-cases/`.
- The client dashboard currently shows service requests, live service tickets, recent completed history, alerts, recommendations, and ratings.
- The client dashboard does not currently show a clear "My after-sales tickets" or "My complaints/warranty cases" section.
- Client service history can expose related `after_sales_cases` counts for completed services, but that is not the same as a dashboard queue.
- Client request detail now supports ticket-linked after-sales messages, which is the client-facing contact point for a specific service ticket.

Decision needed later:

- Keep after-sales cases as admin-only internal work items, or
- expose read-only after-sales case status to clients, or
- extend the current client after-sales message flow into a formal "Report a problem" action that creates an `AfterSalesCase` linked to a completed `ServiceTicket`.

Likely clean direction:

Add a small client dashboard panel for open after-sales cases and a client request/detail entry point for "Report a problem" on completed services. That would make the flow obvious without confusing `ServiceTicket` job tracking with after-sales problem tracking.
