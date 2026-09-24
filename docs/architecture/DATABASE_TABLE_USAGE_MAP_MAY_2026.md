# Database Table Usage Map

Map date: May 30, 2026
Project: AFN Service Management
Database checked: `backend/db.sqlite3`

## Purpose

This file explains which database tables are:

- framework/internal
- core to the current app
- supporting tables created automatically by workflow logic
- lightly surfaced tables that exist in the backend but are not prominent in the UI
- empty tables that are valid but currently unused in local data

This is meant to answer the practical question:

```text
Why are there rows or tables I do not recognize from the backend screens?
```

## Quick Answer

Not every table maps to a visible page.

Some tables exist because:

- Django needs them internally
- audit/history data is recorded automatically
- workflow helpers create rows behind the scenes
- the API supports a feature even if your main UI barely exposes it
- the local development DB contains seed/test/transition data

That does not automatically mean the database is wrong.

## Status Labels

- `Internal`: framework table, not a business feature table
- `Core`: part of the main current workflow
- `Supporting`: created to support core workflows, audit, notifications, or automation
- `Lightly Surfaced`: real feature table, but not strongly exposed in the current UI
- `Empty but Valid`: active schema, no local rows right now
- `Cleanup Candidate`: active schema that should not drive new work unless intentionally reconnected

## Framework / Internal Tables

These are expected and should not be judged as app clutter.

| Table | Status | Why it exists |
| --- | --- | --- |
| `django_migrations` | Internal | Tracks applied migrations |
| `django_content_type` | Internal | Supports Django content type system |
| `auth_permission` | Internal | Stores Django permissions |
| `auth_group` | Internal | Django groups table |
| `auth_group_permissions` | Internal | Group-to-permission mapping |
| `django_session` | Internal | Session storage |
| `django_admin_log` | Internal | Built-in Django admin action log |
| `authtoken_token` | Supporting | DRF token authentication |
| `users_user_groups` | Internal | Custom user to Django groups |
| `users_user_user_permissions` | Internal | Custom user to Django permissions |
| `sqlite_sequence` | Internal | SQLite auto-increment bookkeeping |

## Core Business Tables

These are the tables that matter most for the app’s real workflow.

| Table | Local Rows | Status | Purpose |
| --- | ---: | --- | --- |
| `users_user` | 15 | Core | Main account table |
| `users_technicianprofile` | 5 | Core | Technician operational fields |
| `users_clientprofile` | 5 | Core | Client-specific fields |
| `users_managementprofile` | 5 | Core | Admin/scope fields |
| `services_servicetype` | 8 | Core | Service catalog |
| `services_servicerequest` | 13 | Core | Client-submitted requests |
| `services_servicelocation` | 13 | Core | Address and coordinates for requests |
| `services_serviceticket` | 13 | Core | Main dispatch/execution record |
| `services_technicianskill` | 5 | Core | Which technician can do which service |
| `inventory_inventorycategory` | 6 | Core | Inventory grouping |
| `inventory_inventoryitem` | 9 | Core | Inventory catalog |
| `inventory_servicetypeinventoryrequirement` | 8 | Core | Inventory needed per service type |

## Supporting Workflow Tables

These tables are real and useful, but many rows are created automatically rather than directly by a user filling out a form.

| Table | Local Rows | Status | Purpose |
| --- | ---: | --- | --- |
| `services_servicestatushistory` | 61 | Supporting | Ticket status audit trail |
| `services_ticketcrewassignment` | 3 | Supporting | Extra crew members on a ticket |
| `services_inspectionchecklist` | 4 | Supporting | Pre/post work checklist workflow |
| `inventory_inventoryreservation` | 18 | Supporting | Reserved stock for jobs |
| `inventory_inventorytransaction` | 51 | Supporting | Inventory movement history |
| `notifications_notification` | 114 | Supporting | In-app notifications |
| `users_usercapabilitygrant` | 6 | Supporting | Fine-grained access grants |
| `users_adminsettings` | 1 | Supporting | Global settings record |
| `users_changelog` | 398 | Supporting | Legacy audit/change tracking |
| `users_activitylog` | 6 | Supporting | Admin-readable operational activity timeline |
| `services_technicianlocationhistory` | 277 | Supporting | GPS trail/history |

## Real Feature Tables That Are Lightly Surfaced

These are not fake or dead, but they are easier to miss because they are not central in the current admin/dashboard flow.

| Table | Local Rows | Status | Why you may not recognize it |
| --- | ---: | --- | --- |
| `services_aftersalescase` | 6 | Lightly Surfaced | Used for follow-up/after-sales flow, but not central in the main admin queue |
| `services_maintenanceschedule` | 4 | Lightly Surfaced | Used for maintenance follow-up scheduling, not a main daily workflow screen |
| `progress_ticketprogress` | 0 | Retained API Contract | Secured append-only progress API; active operation reports also use live service ticket reports |
| `messages_app_message` | 2 | Lightly Surfaced | Staff chat and ticket-linked after-sales messaging |

Note: Firebase push delivery has been removed from the active implementation. Any Firebase token table in an older local database or diagram export is legacy cleanup context, not a current feature surface.

## Analytics / Forecasting Tables

These are valid backend tables, but they are not part of the main operational workflow and may remain empty unless analytics jobs or seeding populate them.

| Table | Local Rows | Status | Purpose |
| --- | ---: | --- | --- |
| `services_serviceanalytics` | 30 | Supporting | Aggregated service analytics generated by `generate_daily_analytics` |
| `services_technicianperformance` | 150 | Supporting | Per-technician performance snapshots generated by `generate_technician_performance` |
| `services_demandforecast` | 0 | Empty but Valid | Forecasted service demand |
| `services_servicetrend` | 0 | Empty but Valid | Trend analysis snapshots |

## Tables You Are Most Likely To Wonder About

### `users_changelog`

Why it exists:

- Every important create/update/delete can write audit rows

Why it feels unfamiliar:

- It is not a normal user-facing feature table
- It grows automatically

Should it stay:

- Yes, unless you intentionally remove audit logging

### `services_servicestatushistory`

Why it exists:

- Tracks ticket state changes over time

Why it feels unfamiliar:

- You may think ticket status only belongs on the ticket itself

Should it stay:

- Yes, because it preserves operational history

### `inventory_inventoryreservation`

Why it exists:

- A ticket can reserve stock before completion

Why it feels unfamiliar:

- You may only think in terms of inventory items and final usage

Should it stay:

- Yes, if you want dispatch/inventory coordination

### `services_technicianlocationhistory`

Why it exists:

- Stores technician GPS updates over time

Why it feels unfamiliar:

- The current UI mostly shows current location, not the whole location trail

Should it stay:

- Usually yes, unless you decide to disable tracking history

### `services_aftersalescase`

Why it exists:

- Supports follow-up, maintenance, warranty, complaint, and revisit workflows

Why it feels unfamiliar:

- It is not part of the plain request-to-ticket flow

Should it stay:

- Yes, if after-sales is part of the product direction

## Empty Tables: Should You Worry?

No. An empty table is often fine.

It usually means one of these:

- the feature exists but has not been used locally
- the feature is used only by certain roles or certain scenarios
- the table is filled by scheduled jobs or reporting flows
- local seed data simply does not cover that feature yet

An empty table is a problem only if:

- the frontend/backend expects rows and breaks without them
- a supposedly active feature never writes any rows
- the table is legacy and you want to remove the feature entirely

## Active But Low-Visibility Backend Features

These are real and wired into routes or code, even if they are not obvious in the main workflow:

- `progress`
  Route present at `/api/progress/ticket-progress/`
  Cleanup candidate: not part of the current main UI flow after operations reports were reconnected to live ticket reports

- `history`
  Route present at `/api/history/history/`
  Cleanup candidate: model and API are active, but completed ticket history is already served from service ticket data

- `messages_app`
  Route present at `/api/messages/`
  Staff messaging and ticket-linked after-sales client messages are active

- `notifications`
  Route present at `/api/notifications/`
  Clearly active; local notification rows exist

## Current Main Flow Source Of Truth

Use these models as the primary operational flow when explaining or refactoring the system:

```text
User/Profile/Capability
  -> ServiceRequest
  -> ServiceLocation
  -> ServiceTicket
  -> ServiceStatusHistory
  -> InspectionChecklist
  -> AfterSalesCase / MaintenanceSchedule
  -> InventoryReservation / InventoryTransaction
  -> Message
  -> Notification
  -> ActivityLog
```

The older `history_servicehistory` model was retired. `TicketProgress` remains
only because it has an explicit append-only API and authorization contract.

## What Is Probably Safe To Ignore Day To Day

If you are focusing on normal operations, these are not usually where you should spend attention:

- `django_*`
- `auth_*`
- `sqlite_sequence`
- `users_user_groups`
- `users_user_user_permissions`

## What You Should Focus On If Admin Feels Messy

If the admin area feels confusing, the most important tables to understand are:

- `users_user`
- `users_technicianprofile`
- `users_clientprofile`
- `users_managementprofile`
- `services_servicerequest`
- `services_servicelocation`
- `services_serviceticket`
- `services_servicestatushistory`
- `services_ticketcrewassignment`
- `inventory_inventoryitem`
- `inventory_inventoryreservation`
- `inventory_inventorytransaction`

These are the tables that shape most of the visible operational behavior.

## Practical Recommendation

Do not try to delete unfamiliar tables first.

First decide which tables are:

- required for the current product
- useful but poorly surfaced
- truly unwanted or legacy

The right next step is usually:

1. improve admin visibility of the important related tables
2. document which tables are internal versus operational
3. only then consider cleanup or removal

## Completed Schema Cleanup

The following zero-row, disconnected structures were retired after static and
runtime verification:

- `history_servicehistory`; completed ticket history already comes from
  `ServiceTicket` and `ServiceStatusHistory`
- `notifications_notificationtemplate`; no runtime producer or consumer
- `notifications_notificationlog`; no runtime producer or consumer

`progress_ticketprogress` was reviewed but retained because its authenticated,
append-only API and authorization tests are active contracts.

- analytics tables
  Reason: valid backend structures, but not part of the core daily operational flow

## Bottom Line

Your database is not randomly unorganized.

What you are seeing is a mix of:

- Django internal tables
- core operational tables
- automatic audit/workflow tables
- lightly surfaced features
- empty but valid future/reporting tables

The confusion is mostly a visibility and architecture-explanation problem, not a broken-database problem.
