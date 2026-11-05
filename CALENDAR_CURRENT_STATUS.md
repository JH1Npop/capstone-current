# AFN Service Calendar — Current Implementation Status

**Audit date:** 2026-11-01 (Asia/Singapore)

> **Historical baseline:** This report records the verified pre-redesign state. The same-day Configuration Mode implementation described in the canonical handoff resolves several findings below; the findings are intentionally preserved here so the redesign has an auditable before-state.

**Scope:** Static, read-only investigation of the current worktree. No runtime behavior is assumed where the code does not prove it.

**Purpose:** Establish the current calendar contract before designing a toggleable **Configuration Mode** beside **Include completed**.

## Status legend

| Status | Meaning |
|---|---|
| **Fully implemented** | The user path, backend contract, and relevant validation are present. This does not mean the design is optimal. |
| **Partially implemented** | A usable path exists, but an expected part of the feature is absent or implemented only in another workspace. |
| **Missing** | No implementation was found. |
| **Potentially broken** | Static inspection found a concrete inconsistency, bypass, misleading control, or failure mode. It was not necessarily reproduced at runtime during this documentation-only audit. |

## Executive summary

The admin Service Calendar is a custom React/Tailwind month-and-agenda workspace, not a third-party calendar. It combines three concerns in one large component:

1. operational appointment viewing and filtering;
2. ticket details and rescheduling;
3. global client-booking configuration (slot capacities and date/slot overrides).

The last concern is always visible below the calendar today. There is no Configuration Mode. A UI-only toggle can be added without a new Django model or migration because the configuration API and persistence already exist. However, making Configuration Mode visually show the same automatic green/orange/red availability that clients see would require additional data integration: the admin closure endpoint returns manual overrides and capacities, but not calculated per-day/per-slot occupancy states.

Two separate scheduling systems coexist:

- **Global appointment-slot capacity:** Morning/Midday/Afternoon ticket counts, global capacities, and manual Limited/Closed overrides. This drives the client green/orange/red calendar and blocks Full/Closed scheduling.
- **Technician feasibility:** service skill, service-specific daily assignment count, duration-derived daily minutes, exact-time overlap, and technician/crew assignment. This drives dispatch validation.

They are related only at selected write paths. They are not a single resource-planning engine, and the month UI does not display multi-day duration allocations.

## 1. Calendar UI

### 1.1 Admin Service Calendar

**Status: Fully implemented as a custom operational calendar; Configuration Mode is missing.**

Primary file: `frontend/src/pages/admin/AdminCalendar.jsx`, component `AdminCalendar`.

- No FullCalendar, React Big Calendar, or similar dependency exists in `frontend/package.json`.
- `getCalendarDays()` builds a fixed 42-cell/Sunday-first month grid, including adjacent-month days.
- `getMonthRange()` requests the complete 42-day grid rather than only the named month.
- Layout order:
  1. five operational summary cards;
  2. month toolbar;
  3. filter bar and service-color legend;
  4. mobile or desktop month grid;
  5. selected-date availability configuration;
  6. selected-date agenda;
  7. event-details and reschedule modals.
- Toolbar controls are previous month, next month, **Today**, and **Include completed**. There is no Refresh button and no configuration toggle.
- Mobile has a selectable compact month grid plus a native date control. Desktop has a larger seven-column month grid.
- Desktop cells show at most two events; `+N more` selects that date so the user can inspect the agenda below.
- Event cards use `service_type_color`; `getStatusStyle()` and `getCompactStatusLabel()` provide status styling/labels.
- The legend combines active service-catalog colors with service colors observed in events, which can make it large even when few services occur in the visible month.

#### Date-click behavior

**Status: Fully implemented, but interaction responsibilities are mixed.**

- Clicking a date sets `selectedDateKey`.
- An effect then resets both availability `rangeStart` and `rangeEnd` to that date.
- Therefore, browsing a day also prepares it as the default mutation target.
- Clicking an event calls `openEvent()` and opens `CalendarEventDetailsModal`.
- On desktop, the date cell itself is a clickable `<div>` rather than a keyboard-focusable button. The mobile cells are buttons. **Potentially broken accessibility.**

#### Event rendering

**Status: Fully implemented for ticket/request summaries; partially implemented for schedule semantics.**

- Ticket events show service, compact status, time/slot, and warning decoration where applicable.
- Pending service requests with a preferred date appear as fallback request events when no ticket exists.
- Conflict highlighting comes from frontend `getConflictEventIds()` and is advisory only.
- That helper compares exact-time intervals using the service's current `estimated_duration` and shared **display names** in lead/crew arrays. It cannot detect slot-only conflicts and can false-match two people with the same display name.
- The “Time conflicts” KPI counts affected events, not distinct conflict pairs.
- Automatic green/orange/red appointment availability is **not rendered in the admin month grid**. Only active manual Closed/Limited overrides create red/amber date markers.

#### Existing modals

| UI | File / function | Status | Notes |
|---|---|---|---|
| Event details | `frontend/src/components/shared/CalendarEventDetailsModal.jsx`, `CalendarEventDetailsModal` | **Fully implemented** | Shows client, location, service, team, schedule, status, conflict/reschedule warnings, and navigation actions. Escape/backdrop close and focus restoration behavior are present. |
| Reschedule | `frontend/src/components/shared/RescheduleTicketModal.jsx`, `RescheduleTicketModal` | **Partially implemented** | Captures date, slot, optional exact time, and required notes. It does not show calculated availability, capacity colors, or technician feasibility before submit. |
| Availability configuration | Inline in `AdminCalendar.jsx` | **Fully implemented but not isolated** | It is a permanent page section, not a modal/drawer/component, and is the main candidate for extraction into Configuration Mode. |

The details modal routes to generic ticket/dispatch workspaces rather than reliably focusing the selected ticket. That is a usability limitation, not a data loss issue.

### 1.2 Client appointment calendar

**Status: Fully implemented for advisory booking availability; potentially unsafe failure presentation.**

Files:

- `frontend/src/components/client/AppointmentAvailabilityCalendar.jsx`, `AppointmentAvailabilityCalendar`
- `frontend/src/pages/client/ClientServiceRequests.jsx`

Behavior:

- Custom month calendar; no external calendar library.
- Past dates and red/unavailable dates are disabled.
- Green means available, orange means limited, and red means all slots are Full/Closed.
- Selecting a date updates the request form's sole `preferred_date`; there is no duplicate native appointment-date field.
- The selected day shows Morning/Midday/Afternoon status labels.
- `onSelectedDayChange` supplies slot availability to `ClientServiceRequests`, which disables Full/Closed time-slot choices.
- The office-confirmation/advisory message explicitly says the selection is not a confirmed appointment.

Potential issue: when `fetchAppointmentAvailability()` fails, the component clears availability, displays “You can still choose a preferred date,” and treats unknown days as available. Backend creation validation still protects Closed/Full dates, but the visual contract fails open and may let a client fill a request that will be rejected at submit time.

### 1.3 Technician schedule calendar

**Status: Fully implemented as a separate read-only schedule; not shared with admin configuration.**

File: `frontend/src/pages/technician/TechnicianSchedule.jsx`, `TechnicianSchedule`.

- Separate custom 42-day calendar with previous/next/Today navigation and **Show Completed Jobs**.
- Displays only the authenticated technician's lead or crew tickets.
- Mobile date agenda and desktop job cards link to My Jobs and map navigation.
- It has no client-capacity colors, closure markers, availability configuration, drag/drop, or schedule mutation.
- `FiRefreshCw` is imported but no rendered refresh control was found in the inspected calendar header. This appears unused.

## 2. Calendar functionality

| Feature | Status | Current implementation |
|---|---|---|
| View scheduled appointments | **Fully implemented** | `AdminCalendarView.get()` returns scheduled tickets in the requested date range. |
| View unapproved preferred dates | **Fully implemented** | Ticketless `ServiceRequest` records with `preferred_date` are emitted as fallback request events. |
| Create an appointment directly in calendar | **Missing** | Creation occurs through client/walk-in requests and approval/ticket workflows. |
| Reschedule from calendar | **Fully implemented** | Details modal opens `RescheduleTicketModal`; `handleRescheduleSubmit()` calls the ticket reschedule API and reloads. |
| Assign/reassign technicians in calendar | **Missing** | Calendar shows lead/crew only. Assignment is handled in Dispatch Board/ticket workflows. |
| Show crew assignments | **Fully implemented** | Calendar API serializes lead and crew; details modal displays them. |
| Completed-job visibility | **Fully implemented with a status bug** | **Include completed** controls the backend `show_completed` query. `COMPLETED_TICKET_STATUSES` are included, but `_calendar_status_for_ticket()` recognizes only exact `Completed`; `Turned Over / Accepted` can render as `scheduled`. |
| Filter by workflow | **Partially implemented** | Request/inspection/installation work. “Maintenance” is offered in the UI, but `ServiceTicket.ticket_type` has only inspection/installation and maintenance schedules are not calendar events; this option is effectively empty. |
| Filter by service | **Fully implemented** | Client-side filter using event service names. |
| Filter by technician | **Fully implemented with identity limitation** | Client-side options use display names, not IDs. |
| Filter by calendar status | **Fully implemented** | Options are derived from loaded event statuses. |
| Navigate month/day | **Fully implemented** | Previous, next, Today, mobile date input, date-cell selection. |
| Manual refresh/polling/realtime | **Missing** | Calendar reloads on month/completed changes and after its own mutations only. Notification polling and dashboard change tokens do not refresh it. |
| Drag/drop scheduling | **Missing** | No drag/drop library or handlers. |
| Multi-day project visualization | **Missing** | Only `scheduled_date` is rendered; duration spillover days are invisible. |

Operational summary caveats:

- KPI values use the unfiltered event collection, while the grid/agenda use filtered events.
- “Unassigned” includes ticketless request events because they have no technician, so it can overlap “Pending approval.”
- The selected-date warning uses `selectedDayEvents`, which is derived from **filtered** events. With filters active, “This date already has N appointments” may understate the real visible-date workload and is misleading beside configuration controls.

## 3. Availability management

### 3.1 Admin controls

**Status: Fully implemented, but permanently exposed and globally scoped.**

Inline state and handlers in `AdminCalendar.jsx`:

- `closureSlot`, `availabilityStatus`, `closureReason`
- `rangeStart`, `rangeEnd`
- `capacityDraft`, `capacitySaving`, `closureSaving`
- `handleCapacitySave()`
- `handleCloseAvailability()` (also handles Limited despite its name)
- `handleReopenAvailability()`
- `handleReopenRange()`

Capabilities:

- Capacities for Morning, Midday, and Afternoon, each constrained to integer 1–20.
- Manual override status: Limited (orange) or Closed (red).
- Scope: All day, Morning, Midday, or Afternoon.
- Required reason of at least three characters for setting overrides.
- One date or inclusive date range, up to 93 days.
- Reopen a single active override or matching slot over a date range.
- Past-date changes are rejected by the backend.
- Existing appointments are never cancelled by a new override; changes affect new scheduling.

Limitations/issues:

- Configuration controls are always visible, creating clutter in the operational calendar.
- Selecting a date for inspection silently changes the default edit range.
- No confirmation is required for a 93-day bulk set/reopen.
- Button disabling is tied partly to `selectedDateKey`, so selecting a past date can disable an otherwise future range the user types into the controls.
- Limited is an advisory color; it does not lower numeric capacity or block scheduling.
- Capacity values are global. There is no per-service, weekday, technician, crew, or location capacity.
- Closures are global and not related by foreign key to a service, technician, ticket, or request.

### 3.2 Automatic color indicators

**Status: Fully implemented for the client; partially implemented for admin.**

`backend/services/scheduling_policy.py`:

- `get_scheduled_slot_counts()` counts all non-cancelled tickets by effective slot.
- `resolve_slot_availability()` applies precedence:
  1. manual Closed -> `closed`;
  2. count >= capacity -> `full`;
  3. manual Limited -> `limited`;
  4. one remaining place (when capacity > 1) -> `limited`;
  5. otherwise -> `available`.
- A capacity of 1 changes directly from Available at zero to Full at one; there is no orange state.
- Completed/turned-over tickets are non-cancelled and therefore continue to consume slot count.
- Pending service requests do not consume capacity.

The client endpoint returns these calculated statuses. The admin closure endpoint returns capacities and manual override rows only, so `AdminCalendar` cannot currently paint automatic occupancy colors without an additional request or expanded response.

### 3.3 Bulk date-range configuration

**Status: Fully implemented.**

`AdminCalendarClosureView.post()` creates/reactivates one `CalendarClosure` per date and selected slot within an inclusive range. It uses a transaction and locks existing rows. The database uniqueness rule is `(date, time_slot)`, so repeated configuration updates the historical row instead of creating duplicates.

No weekday-exclusion, holiday template, recurring rule, or “apply only business days” feature exists. A multi-day range includes every calendar date.

## 4. Backend integration

### 4.1 API routes

| Route | Handler | Permission boundary | Status |
|---|---|---|---|
| `GET /api/admin/calendar/` | `AdminCalendarView.get()` in `backend/services/views_dashboard.py` | Authenticated admin workspace role plus any `SUPERVISOR_DISPATCH_CAPABILITIES` | **Fully implemented** |
| `GET /api/admin/calendar/closures/` | `AdminCalendarClosureView.get()` | Same dispatch boundary | **Fully implemented** |
| `POST /api/admin/calendar/closures/` | `AdminCalendarClosureView.post()` | Same dispatch boundary | **Fully implemented** |
| `GET /api/services/service-requests/appointment-availability/` | `ServiceRequestViewSet.appointment_availability()` | Any authenticated user | **Fully implemented** |
| `POST /api/services/service-tickets/{id}/reschedule/` | `ServiceTicketViewSet.reschedule()` | Staff/ticket-management permission | **Fully implemented** |
| `GET /api/technician/schedule/` | `TechnicianScheduleView.list()` | Authenticated technician | **Fully implemented** |

Frontend wrappers:

- `frontend/src/api/admin.js`: `fetchAdminCalendarEvents`, `fetchAdminCalendarClosures`, `updateAdminCalendarClosure`, `rescheduleServiceTicket`
- `frontend/src/api/services.js`: `fetchAppointmentAvailability`
- `frontend/src/api/technician.js`: `fetchTechnicianSchedule`

### 4.2 Models and relationships

| Model | Relevant fields/relationships | Calendar role |
|---|---|---|
| `ServiceType` | `estimated_duration`, `max_daily_assignments`, color | Duration/assignment feasibility and event color. |
| `ServiceRequest` | client FK, service-type FK, `preferred_date`, `preferred_time_slot`, status | Client preference and ticketless fallback event. |
| `ServiceLocation` | one-to-one with request | Event address. |
| `ServiceTicket` | request FK, lead technician FK, assigned-admin FK, date/time/slot/status/type | Primary scheduled calendar event. |
| `TicketCrewAssignment` | ticket FK + technician FK, unique pair | Crew membership and technician schedule visibility. |
| `CalendarClosure` | date, slot, Limited/Closed, reason, active state, actor/timestamps | Manual global override. No relationship to service/technician/ticket. |
| `AdminSettings` | three slot capacities; overtime/daily settings; business hours/days/holidays | Global capacity configuration. Some business-calendar fields are not used by appointment policy. |

No new entity is required for a UI Configuration Mode. `CalendarClosure` and `AdminSettings` already persist the configuration.

### 4.3 Serialization

**Status: Mixed.**

- Admin calendar and closure responses are manually assembled dictionaries in `views_dashboard.py`; no dedicated DRF serializer validates their output contract.
- Ticket CRUD uses `ServiceTicketSerializer.validate()` in `backend/services/serializers/tickets.py` to validate business hours and Full/Closed status.
- Request CRUD uses the request serializer's `validate()` in `backend/services/serializers/requests.py` for preferred-date/slot rules.
- The client availability action intentionally excludes appointment counts, client/ticket/request/service/location/technician IDs, and internal reason text. It does expose override status/slot metadata without the reason string.

### 4.4 Permissions

**Status: Fully enforced, but coarse-grained.**

- Frontend route: `frontend/src/App.jsx`, `/admin/calendar`, admin/superadmin plus `SUPERVISOR_DISPATCH_CAPABILITIES`.
- Sidebar uses the same dispatch capability.
- Backend independently checks admin workspace role and dispatch capability.
- The same capability permits both reading the operational calendar and mutating capacities/closures. There is no separate “calendar configuration manage” capability. A Configuration Mode toggle would hide controls, not add authorization; backend permission separation would require a distinct RBAC change.

### 4.5 Query/response concerns

**Potentially broken or limited:**

- `AdminCalendarView.get()` has no maximum requested range, although the current UI asks for only 42 days.
- It builds a Python set of every `ServiceTicket.request_id` to exclude fallback requests, rather than limiting that lookup to the relevant date range.
- Per-ticket latest reschedule evidence and crew ordering may trigger additional queries despite the surrounding prefetch, creating N+1 risk at scale.
- Fallback requests are not filtered by `show_completed`; any completed/approved orphan request without a ticket can appear as `requested` even when completed tickets are excluded.
- `_calendar_status_for_ticket()` maps only exact `Completed` to completed styling; other closed statuses can fall through to scheduled/unassigned.

## 5. Scheduling logic

### 5.1 Global appointment limits

**Status: Fully implemented at most intended writes, with bypass/race caveats.**

- Defaults are three appointments per Morning/Midday/Afternoon slot.
- Effective slot comes from explicit `scheduled_time_slot`, otherwise exact time maps 08:00–10:59 to Morning, 11:00–13:59 to Midday, and 14:00–16:59 to Afternoon.
- `get_calendar_closure_error()` blocks manual Closed and automatic Full. Limited remains selectable.
- Enforcement is present at:
  - client/walk-in service-request serialization;
  - service-request approval before ticket creation;
  - ordinary ticket serializer create/update;
  - staff rescheduling.
- `lock_appointment_capacity_policy()` locks the first `AdminSettings` row inside capacity-sensitive transactions on databases that support row locks.

Potential issues:

- If no `AdminSettings` row exists, the lock function returns `None`, so there is no shared policy row to serialize competing first writes.
- Setting a `CalendarClosure` locks closure rows but does not acquire the same capacity-policy lock. Closure mutation and appointment creation can race on PostgreSQL.
- `ServiceTicketViewSet.assign()` accepts schedule fields and calls `apply_schedule_fields()` but does **not** call `get_calendar_closure_error()` or acquire the appointment-capacity policy lock. Manual dispatch can therefore move a ticket onto a Closed/Full slot, bypassing the global policy used by create/update/reschedule. **Potentially broken.**

### 5.2 Technician availability and assignment

**Status: Fully implemented for dispatch feasibility, but not represented as calendar availability.**

Relevant functions:

- `backend/services/views/helpers.py`
  - `build_ticket_daily_duration_allocations()`
  - `get_technician_daily_capacity()`
  - `validate_technician_daily_capacity()`
  - `validate_technician_schedule_overlap()`
- `backend/services/views/tickets.py`, `ServiceTicketViewSet.assign()`
- `backend/services/auto_dispatch.py`

Manual assignment checks:

- ticket is in an assignable workflow state;
- lead and crew accounts are active;
- lead has matching service skill;
- service-specific `max_daily_assignments` for the lead;
- lead and crew duration-based daily capacity;
- lead and crew exact-time overlap;
- business start-time range.

Auto-dispatch additionally filters for `technician_profile.is_available=True` and uses scoring/proximity. Manual `assign()` checks account activity but does not directly reject `is_available=False`; the Dispatch UI text says availability is checked, so that wording and behavior are inconsistent. **Potentially broken/misleading.**

### 5.3 Service duration and multi-day work

**Status: Partially implemented.**

- Technician capacity uses `ServiceType.estimated_duration`.
- A project longer than the daily limit is split into consecutive calendar days by `build_ticket_daily_duration_allocations()`.
- Each allocation day is checked against the normal 480-minute limit or configured overtime limit.
- Allocation does not skip weekends, `AdminSettings.business_days`, `holiday_dates`, or `CalendarClosure` dates.
- The ticket still has only one `scheduled_date`, so spillover days are invisible in admin/technician calendars and global slot counts.
- Durations are read from the mutable service template, not snapshotted on the ticket. Changing a service duration can alter later capacity/overlap calculations for existing open tickets.

### 5.4 Overlapping bookings

**Status: Fully enforced for exact times; missing for slot-only schedules.**

- `validate_technician_schedule_overlap()` compares `[start, start + estimated_duration)` for tickets on the same `scheduled_date` and shared technician team membership.
- It ignores cancelled tickets and excludes the ticket being changed.
- Tickets without an exact time rely only on daily-duration capacity because no interval can be compared.
- Multi-day duration spillover is not treated as an exact-time interval on later days.
- The admin frontend repeats a weaker name-based warning algorithm, while backend enforcement uses technician relationships.

### 5.5 Business calendar settings

**Status: Potentially broken/incomplete integration.**

`AdminSettings.business_days`, `business_open_time`, `business_close_time`, and `holiday_dates` exist, but the appointment policy hardcodes 08:00–17:00 and three fixed slots. The duration allocator advances over every calendar day. These settings do not currently control bookable dates/times or allocation days.

### 5.6 SLA interaction

**Status: Deliberately separate.**

Slot capacities and Limited/Closed colors do not alter SLA rules. Appointment dates/statuses can still feed dispatch/workflow SLA evaluation elsewhere, but configuration is not a duration forecast and does not calculate a project completion date.

## 6. State management and refresh behavior

**Status: Fully implemented for local page state; missing shared cache/realtime behavior.**

`AdminCalendar` uses React component state only; there is no Redux, Zustand, React Query, or shared calendar store.

Load sequence:

1. `monthDays` and `monthRange` are memoized from `calendarMonth`.
2. `loadCalendar()` calls `fetchAdminCalendarEvents()` and `fetchAdminCalendarClosures()` in parallel.
3. It stores events, closures, and capacities.
4. A separate effect fetches service types for the legend/filter.
5. Month or Include-completed changes trigger a reload.
6. Reschedule, capacity save, set override, and reopen call `loadCalendar()` after success.
7. Filters are applied entirely client-side through `filteredEvents` and `eventsByDay`.

Failure behavior:

- One shared `error` state is used for load and mutation errors.
- A load error clears both event and closure collections instead of preserving last-known data.
- Service-type load failure silently leaves the catalog list empty.
- There is no request cancellation/stale-response guard in `AdminCalendar`; rapid month changes could allow an older response to overwrite a newer one.
- Client `AppointmentAvailabilityCalendar` does use an `active` effect guard.
- No polling, WebSocket subscription, notification event, visibility refresh, or dashboard-change token refreshes the calendar after another user changes a ticket/configuration.

## 7. Existing issues and limitations

### High-priority findings

1. **Potential scheduling-policy bypass:** `ServiceTicketViewSet.assign()` can change schedule fields without the global closure/capacity validation or policy lock.
2. **Admin availability is incomplete:** the admin grid marks manual overrides but cannot show automatic Limited/Full occupancy, while the explanatory text says slots turn orange/red automatically.
3. **Configuration and browsing are coupled:** date selection resets mutation range, and all configuration controls are always visible.
4. **Filtered warning undercounts:** the existing-appointments warning beside availability controls uses filtered events.
5. **Client availability fails open visually:** on availability API error, unknown dates remain selectable until backend submit validation.
6. **Closed-status presentation bug:** Turned Over / Accepted can be included by Include completed but styled/classified as scheduled.

### Medium-priority findings

- “Maintenance” workflow filter has no corresponding event source/type.
- Completed tickets still consume global slot capacity.
- Pending requests do not reserve capacity; several clients can request the same last place, and later approval may reject all but the first confirmed ticket.
- Manual Limited does not change or reserve capacity; it is a visual/operator advisory only.
- Global appointment capacity and technician capacity can disagree because they model different things.
- Existing appointments remain on newly Closed dates with no automatic conflict list or bulk reschedule workflow.
- Multi-day work is capacity-checked on hidden spillover dates but rendered only on its first scheduled date.
- Business days/hours/holidays are disconnected from appointment scheduling.
- Same dispatch capability grants calendar viewing and configuration mutation.
- No confirmation or preview for large bulk configuration operations.
- No automatic reconciliation of `AdminSettings.holiday_dates` with `CalendarClosure`.
- Event API can have query/performance issues and has no maximum-range guard.

### UI/accessibility clutter

- Five KPI cards, four filters, catalog legend, two calendar layouts, configuration form, overrides list, and agenda all live in one component.
- Two different color languages compete: service colors on events and availability colors on dates.
- Desktop date cells are not keyboard buttons.
- `+N more` requires the user to discover the lower agenda.
- Configuration state and operational load errors share one message channel.
- Generic “Open ticket queue”/“Open dispatch board” navigation may lose selected-event context.
- The technician schedule has a likely unused refresh icon import.

## 8. Dependency map

| Dependent module | Relationship to calendar | Status / impact |
|---|---|---|
| Dispatch Board | Assigns lead/crew and may change schedule; calendar reads resulting ticket fields. | **Fully integrated for event display; potentially broken for global capacity enforcement during `assign()`.** |
| Service Requests | Client/walk-in preferred dates become request fallback events; approval creates capacity-consuming tickets. | **Fully integrated.** Pending requests do not reserve capacity. |
| Service Tickets | Primary calendar records; status, schedule, reschedule, service, client, location, assigned admin, lead, and crew feed events. | **Fully integrated.** |
| Client booking | Reads aggregate availability and submits preferred date/slot; backend validates again. | **Fully integrated with fail-open UI limitation.** |
| Technician schedules | Reads tickets where the authenticated technician is lead or crew. | **Fully integrated, separate presentation.** |
| Auto-dispatch | Uses ticket schedule, skill, availability, duration capacity, overlap, and proximity; assignments later appear on calendar. | **Fully integrated with technician feasibility, separate from colors.** |
| Reschedule workflow | Client can request a reschedule; staff calendar shows request warning and can confirm a schedule. Notifications are emitted. | **Fully integrated.** |
| Notifications | Request submission/approval, assignment, status, reschedule request/confirmation, cancellation, etc. notify relevant users. | **Partially integrated.** Notifications do not cause calendar refresh or carry a calendar-specific synchronization event. |
| SLA | Uses ticket/workflow timing elsewhere; calendar displays missed-dispatch evidence. | **Partially integrated by display.** Availability capacity does not change SLA. |
| Service catalog | Supplies event color, current estimated duration, skill/daily rules, and legend entries. | **Fully integrated, with mutable-duration caveat.** |
| Admin Settings | Supplies slot capacity and overtime limit; also stores unused business-calendar fields. | **Partially integrated.** |
| Activity/Change logs | Calendar closure/settings mutations receive audit actors/reasons through model signal conventions. | **Fully implemented for persistence; not surfaced as calendar history UI.** |
| Maintenance schedules | Separate after-sales workspace and model. | **Missing from Service Calendar** despite the workflow filter option. |
| Analytics | Admin analytics links operational signals to `/admin/calendar` and separately computes duration capacity views. | **Partially integrated by navigation, not shared state.** |

## 9. Test coverage found

### Backend

`backend/services/tests/test_client_appointment_availability.py` covers:

- authenticated privacy-reduced availability;
- maximum 63-day client range;
- close/reopen and authorization;
- Closed-slot request rejection;
- exact-time-to-slot mapping;
- automatic Limited -> Full transition;
- range Limited overrides;
- capacity updates;
- override precedence.

Other scheduling suites cover approval, serializer scheduling, rescheduling, exact-time overlap, technician daily capacity, and auto-dispatch. Admin calendar response/completed-toggle behavior is also covered in dashboard-role/audit regression tests.

### Browser

- `e2e/03-admin-workspace.spec.js` test 3.2 covers operational filters, Include completed, event details, and reschedule visibility using a mocked calendar event response.
- Test 3.2b exercises a real single-slot Close/Reopen path and checks the default capacity value.
- `e2e/05-client-workspace.spec.js` covers client calendar selection/status and a disabled closed date.

Coverage gaps relevant to Configuration Mode:

- no toggle/mode behavior yet;
- no admin automatic Limited/Full color assertion;
- no browser test saving changed capacities;
- no browser test for Limited, multi-day set/reopen, maximum range, or large-range confirmation;
- no test proving filters cannot understate the configuration warning;
- no test that manual assignment cannot bypass Closed/Full capacity;
- no test for concurrent closure creation versus appointment writes;
- no maintenance-event test because maintenance is not an event source;
- no keyboard test for desktop date cells.

## 10. Components required for toggleable Calendar Configuration Mode

### Required frontend change

#### `frontend/src/pages/admin/AdminCalendar.jsx`

This is the only required production-code change for a presentation-only mode.

Expected changes:

- Add `configurationMode` state.
- Add a labeled toggle/button beside **Include completed** in the toolbar.
- Render the capacity/override/range section only while Configuration Mode is active.
- Decide mode-specific date behavior:
  - normal mode: date selection opens/updates agenda only;
  - configuration mode: date selection also sets the configuration target range.
- Keep event click/detail behavior available or explicitly suppress it in configuration mode.
- Give the mode an accessible pressed/checked state and clear explanation.
- On narrow screens, ensure the two toolbar toggles wrap without hiding navigation.
- Consider using unfiltered raw event counts for configuration warnings.

Recommended extraction during the redesign:

- Move the inline configuration block and handlers into a new component such as `CalendarAvailabilityConfigurationPanel.jsx`.
- This is not technically required, but it would separate operational viewing from mutation and materially reduce `AdminCalendar.jsx` responsibility.

### Required test changes

- `e2e/03-admin-workspace.spec.js`
  - assert Configuration Mode is off by default;
  - assert controls are hidden in normal mode;
  - toggle it beside Include completed;
  - exercise capacity, Limited/Closed, range, and reopen behavior;
  - confirm exiting the mode does not change event filters or selected month.
- Add focused frontend/unit coverage if the project introduces component testing; none currently exists for this page.

### Conditionally required changes

#### If Configuration Mode must show automatic green/orange/red admin dates

Current admin data is insufficient. Choose one:

1. call the existing privacy-safe `appointment-availability` endpoint for the admin month; or
2. extend `AdminCalendarClosureView.get()` (or add a dedicated admin availability endpoint) to return calculated slot/day status and optionally staff-only counts.

Affected files would include:

- `frontend/src/pages/admin/AdminCalendar.jsx`
- `frontend/src/api/admin.js`
- `backend/services/views_dashboard.py` and/or `backend/services/views/service_requests.py`
- backend availability tests and `e2e/03-admin-workspace.spec.js`

No model/migration is needed unless product requirements add recurring rules, per-service capacities, weekday templates, or per-technician closures.

#### If only some admins may configure

Add a dedicated capability instead of reusing dispatch view access. This would affect:

- `backend/users/rbac.py`
- backend permission checks in `AdminCalendarClosureView`
- frontend capability constants/route or control gating
- capability matrix and authorization tests.

#### If configuration changes should be real-time

Add a refresh/invalidation mechanism. The current calendar has no polling or shared cache. This could be a manual Refresh button, visibility refresh, bounded polling, or a calendar change token/WebSocket event.

### Components that should not need changes for a UI-only mode

- `CalendarEventDetailsModal.jsx`
- `RescheduleTicketModal.jsx`
- `AppointmentAvailabilityCalendar.jsx`
- `TechnicianSchedule.jsx`
- Django models/migrations
- `scheduling_policy.py`
- App route and Sidebar

They would change only if the redesign alters scheduling semantics, permission boundaries, or the data returned for automatic admin colors.

## 11. Recommended redesign boundary

For the first iteration, treat Configuration Mode as a frontend separation of concerns, not a new scheduling model:

- default mode stays focused on events, filters, details, and rescheduling;
- Configuration Mode reveals capacities, manual overrides, bulk range controls, and override history;
- use raw/unfiltered appointment counts in configuration warnings;
- clearly label Limited as advisory and Closed/Full as blocking;
- do not imply technician feasibility from global slot colors;
- preserve server-side validation as the source of truth.

Before implementation, decide whether the mode must also display automatic occupancy colors to administrators. That decision is the point at which the work changes from a small UI refactor into a frontend-plus-API change.
