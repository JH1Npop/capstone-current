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

Inspection requirements are evaluated across the primary service and every
requested service item. A secondary inspection-first service forces inspection
approval and inspection dispatch too; the request serializer exposes the same
aggregate flag to the office screens. The shared pre-service transition guard
uses that rule so a direct API call cannot skip the inspection visit.

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
After an inspection reaches `Inspection Completed`, an approval continues the
same ticket instead of creating a second ticket. The decision requires an
installation date and, when that date is today, a later installation time. It
changes the ticket type to `installation`, clears the inspection lead and crew,
route/start metadata, and old time-slot value, then moves the ticket to
`Ready for Service`. The office must dispatch the installation stage again, so
the same technician may be selected but is not assumed to be available. When
quotation acceptance is enabled, an accepted quotation remains a prerequisite;
the deposit gate is enforced at installation dispatch.
Inspection guards (2026-10-18): a technician may create, update, or complete an
inspection report only while the ticket is `Arrived on Site` or `In Progress`,
so travel and GPS arrival always precede the report; the technician page shows
an "Arrive on site first" notice in any other state. Office staff may still
record a report directly. An `inspection`-type ticket can never be finished as
`Completed` (technician status action, legacy `complete_work`, or manual
office status change); it ends with the report (`Inspection Completed`) and
the office decision. Because the inspection report and the later service
checklist share one per-ticket record, the approval/awaiting-materials decision
first tags the existing site photos with `phase: inspection` and appends an
`Inspection findings:` entry (answers, recommendation, notes, photo count) to
the append-only status history; later service checklist saves keep tagged
inspection photos instead of replacing them. Every inspection lead and crew
member receives the decision notification, captured before the handoff clears
the team.
Every inspection asks the three built-in general checks (site access,
electrical supply, safety equipment). Each requested service may add its own
Yes/No checks (`ServiceType.inspection_procedures`, at most 30, edited in
Admin Services for inspection-first services). The server requires an answer
for every configured check of every service on the ticket and a note for each
No, ignores unconfigured extras, and stores normalized answers
(`service_type_id`, `service_name`, `title`, `answer`, `notes`) in the report's
`checklist_items`; the office decision copies them into the findings history.
Ticket and crew-assignment model signals reconcile that derived state after
direct model/admin changes as well as API workflow changes. The
`reconcile_technician_availability` management command reports historical
mismatches without writing by default; `--apply` repairs them after the target
database has been reviewed.
Field-sequence robustness (2026-10-19): the map page records `Navigating` as
soon as the technician shares GPS; directions are optional and loaded
separately, so a slow or failed routing provider never blocks travel or GPS
arrival (the ORS client times out after `ROUTING_HTTP_TIMEOUT_SECONDS` without
rate-limit retries and the synthetic fallback route is used). Finish Job
evidence is uploaded as image files (`completion_photo_files`, JPG/PNG/WebP up
to 10 MB, signature-checked) and stored as media URLs; `data:` images are
refused, as are arbitrary URL/string/object references submitted as new
completion evidence. Both completion endpoints require fresh validated file
uploads; previously saved historical evidence stays readable. Failed completion
transactions remove the files saved by that attempt, including partial storage
failures, without touching older evidence. Storage cleanup failures are logged.
A technician who still leads or crews a non-closed ticket cannot be
deactivated or changed to another role (HTTP 409 listing the tickets to reassign,
on both the user and technician update endpoints). A request rejected by
the office is stored as `Cancelled` with an explicit `rejected` closure in its
activity metadata, which the client sees as "Rejected" with the reason.
Assigned lead or crew technicians may request additional equipment while a
ticket is `Not Started` or in a supported inspection, active, awaiting-materials,
or hold state. Every request creates pending inventory reservations and a
status-history note without changing the ticket status: asking for equipment
never pauses the job by itself (since 2026-10-18; previously an `In Progress`,
`Inspection Completed`, or `Ready for Service` request switched the ticket to
`Awaiting Materials` automatically, which also stranded jobs whose request was
rejected). Travel and work states still advance only through their named
actions. Terminal tickets reject new requests.
The lead technician alone may put field work on hold, and only from
`Navigating`, `Arrived on Site`, or `In Progress`: either through the
technician status action (`on_hold`, reason of at least 5 characters required)
or by ticking **Pause job while waiting** on an equipment request, which applies
the same hold in the same transaction after permission and status are checked
and before any stock is reserved. A crew member's pause request is refused
without side effects. The hold notifies the client and office; resuming uses the
existing `On Hold` → `In Progress` action without a new GPS arrival. A rejected
equipment request leaves the job's status unchanged. `Awaiting Materials`
remains an office decision from inspection review (stock unavailable, return
trip required), whose return still travels through navigation and arrival.
Automatic reassignment skips any ticket whose work has started, so a paused job
stays with the crew that began it.
Pending ticket reservations are reviewed in Admin Inventory as one grouped
request per service ticket, while their individual `RSV-*` lines remain intact
for stock accounting. An authorized inventory manager assigns **Approve** or
**Reject** to each line in the grouped review. Approved lines release their hold
and deduct issued physical stock; rejected lines require a meaningful shared
reason and release their hold without reducing physical stock. Mixed results
are allowed when only some items can be issued. Every submitted line is
row-locked and applied in one transaction, so a failure rolls back that complete
submission; unseen new pending lines remain open. Each assigned technician
receives one combined result notification with separate issued and rejected
items. Repeated or competing decisions are rejected. The dashboard counts
distinct pending ticket requests, and equipment-request notifications route
operators to this Inventory queue, optionally focused on the related ticket.
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

## Maintenance schedules

Maintenance schedules preserve their history; administrators do not delete a
schedule when a client no longer wants reminders. Read access requires an
after-sales view capability. The named lifecycle actions require
`after_sales.cases.manage`, acquire a row lock, and require a nonblank reason
of at most 2,000 characters.

| Current state | Allowed transition | Named action and effect |
| --- | --- | --- |
| `scheduled`, `due_soon`, `due` | `dismissed` | `dismiss`; stops future automation and closes any active linked maintenance case |
| `dismissed` | Date-derived `scheduled`, `due_soon`, or `due` | `resume`; keeps already-sent reminder timestamps so the same stage is not duplicated |
| `scheduled`, `due_soon`, `due` | Date-derived active state | `reschedule`; changes the due/notification dates and resets delivery timestamps for the new reminder cycle |
| `scheduled`, `due_soon`, `due` | `completed` | `complete`; only for work actually performed and resolves any active linked maintenance case |
| `completed` | none | Terminal |

Rescheduling cannot use a past date. A future reschedule closes the obsolete
active maintenance case; a due or due-soon schedule ensures a current linked
case exists. `dismissed` means reminders stopped, not record deleted, and the
schedule remains visible through the **Stopped** filter. The default list is
the active queue and excludes both completed and stopped schedules.
