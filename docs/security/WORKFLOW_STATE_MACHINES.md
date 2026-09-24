# Request and Ticket State Machines

This document is the Release 1 workflow contract. API actions must reject
transitions that are not listed here, even when a caller bypasses the UI.

## Service requests

| Current state | Allowed transition | Actor/action |
| --- | --- | --- |
| `Pending` | `Approved` | Admin with `services.requests.review` approves |
| `Pending` | `Cancelled` | Admin reviewer rejects/cancels, or owning client cancels |
| `Approved` | `In Progress` | Synchronized from ticket work |
| `Approved` | `Cancelled` | Admin reviewer or owning client, before ticket work starts |
| `In Progress` | `Completed` | Synchronized from ticket completion |
| `In Progress` | `Cancelled` | Ticket workflow only; direct client cancellation is blocked |
| `Completed` | none | Terminal |
| `Cancelled` | none | Terminal |

Approval and rejection endpoints accept only `Pending` requests. Repeated
decisions return HTTP 400 and do not create another ticket. Critical request
decisions acquire a database row lock, so Aiven PostgreSQL serializes competing
approval, rejection, and cancellation calls. Generic request updates cannot
change status and must use the named workflow actions.

## Service tickets

The authoritative transition map is `ALLOWED_TICKET_TRANSITIONS` in
`backend/services/views/helpers.py`. All operational status actions must call
`validate_ticket_transition` or `apply_ticket_status_change`.

| Current state | Allowed next states |
| --- | --- |
| `Not Started` | `For Inspection`, `Ready for Service`, `Navigating`, `Cancelled` |
| `For Inspection` | `Navigating`, `Inspection Completed`, `Cancelled` |
| `Inspection Completed` | `Ready for Service`, `Awaiting Materials`, `Navigating`, `Completed`, `Cancelled` |
| `Ready for Service` | `Navigating`, `For Inspection`, `Cancelled` |
| `Awaiting Materials` | `Ready for Service`, `Navigating`, `Cancelled` |
| `Navigating` | `Arrived on Site`, `On Hold`, `Cancelled` |
| `Arrived on Site` | `In Progress`, `On Hold`, `Cancelled` |
| `In Progress` | `Inspection Completed`, `Awaiting Materials`, `On Hold`, `Completed`, `Cancelled` |
| `On Hold` | `Ready for Service`, `In Progress`, `Cancelled` |
| `Completed` | `Turned Over / Accepted` |
| `Turned Over / Accepted` | none |
| `Cancelled` | none |

Ticket changes create `ServiceStatusHistory` records containing the actor,
timestamp, resulting state, and notes. Generic ticket updates cannot change
status and must use the validated `update-status` action. Request decisions also
write immutable change/activity records with actor, timestamp, reason, and old
and new states. Assignment, auto-assignment, inspection decisions, navigation,
arrival, work start, status updates, and completion lock the ticket row before
mutation. Dispatch also locks all selected technician rows in deterministic ID
order and revalidates availability and daily capacity after acquiring the lock.
Background automatic dispatch and the Dispatch Board's manual **Find Best
Match** action use the same candidate-ranking contract: active/available
status, exact or General Services skill, daily duration capacity, concrete-time
overlap rejection, location-based fitness, and a score strictly above 30. The
selected technician is locked and the capacity, overlap, and score checks are
repeated before assignment. A technician remains available for additional
scheduled work while capacity permits; the derived busy state is limited to
`Navigating`, `Arrived on Site`, and `In Progress` work.
Ticket and crew-assignment model signals reconcile that derived state after
direct model/admin changes as well as API workflow changes. The
`reconcile_technician_availability` management command reports historical
mismatches without writing by default; `--apply` repairs them after the target
database has been reviewed.
Every call to the central status-change helper must provide a nonblank note of
at most 2,000 characters. Routine named actions provide deterministic event
evidence; the generic administrator status action requires an operator-entered
reason. Rescheduling also requires and preserves an operator reason, and
inspection exceptions (`Awaiting Materials` or cancellation) require a reason
in both the API and review dialog. Whitespace is normalized before the same
evidence is written to the ticket activity log and `ServiceStatusHistory`.

## Ticket progress records

`TicketProgress` is an append-only operational timeline:

- Clients may read progress only for tickets belonging to their own requests.
- Assigned lead and crew technicians may append progress for their tickets.
- Admin and superadmin users may append progress for operational support.
- The API sets `updated_by` from the authenticated user; callers cannot choose it.
- Existing progress entries cannot be edited or deleted through the API. A
  correction must be represented by a new progress entry so the earlier event
  remains auditable.

These rules are enforced by direct API tests in `backend/progress/tests.py`.
