# Database Audit

Audit date: May 3, 2026  
Database audited: `backend/db.sqlite3`  
Project: AFN Service Management

## Executive Summary

The local SQLite database is structurally healthy. Django checks pass, all migrations are applied, model tables exist, SQLite integrity checks pass, and foreign key checks report no broken references.

The main audit risks are operational rather than structural:

1. Only one technician exists locally, and that technician is not marked available.
2. Three tickets have no assigned technician.
3. One inventory item is below minimum stock.
4. Several feature tables are structurally ready but have no local data yet.
5. Firebase push delivery is not testable locally because `firebase_admin` is not installed.

## Commands Run

```powershell
.\venv\Scripts\python.exe backend\manage.py check
.\venv\Scripts\python.exe backend\manage.py showmigrations
.\venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe backend\manage.py show_tables --compact
```

Additional SQLite and Django ORM audit scripts were run locally to check:

- SQLite `PRAGMA integrity_check`
- SQLite `PRAGMA foreign_key_check`
- Django model table presence
- Table row counts
- User, request, ticket, inventory, and notification status distribution

## Health Check Results

| Check | Result | Notes |
| --- | --- | --- |
| Django system check | Pass | `System check identified no issues`. |
| Migration state | Pass | All migrations are applied. |
| Missing migrations | Pass | `makemigrations --check --dry-run` reports `No changes detected`. |
| SQLite integrity | Pass | `PRAGMA integrity_check` returns `ok`. |
| Foreign key integrity | Pass | `PRAGMA foreign_key_check` returns no issues. |
| Django model tables | Pass | All 39 Django model tables resolve to existing database tables. |
| Local Firebase dependency | Warning | `firebase_admin is not installed; push notifications are disabled`. |

## Database Shape

The compact table report shows 43 tables, including SQLite's internal `sqlite_sequence` table. The audit focuses on 42 application/framework tables.

| Area | Populated Tables | Empty Tables |
| --- | --- | --- |
| Users and access | `users_user`, `users_adminsettings`, `users_usercapabilitygrant`, `users_changelog`, `authtoken_token` | `auth_group`, `auth_group_permissions`, `users_user_groups`, `users_user_user_permissions` |
| Service workflow | `services_servicerequest`, `services_servicelocation`, `services_serviceticket`, `services_servicestatushistory`, `services_inspectionchecklist`, `services_technicianskill`, `services_ticketcrewassignment`, `services_servicetype`, `services_technicianlocationhistory` | `services_aftersalescase`, `services_maintenanceschedule`, `services_serviceanalytics`, `services_demandforecast`, `services_servicetrend`, `services_technicianperformance` |
| Inventory | `inventory_inventorycategory`, `inventory_inventoryitem`, `inventory_inventoryreservation`, `inventory_inventorytransaction`, `inventory_servicetypeinventoryrequirement` | None |
| Communication | `notifications_notification` | `notifications_firebasetoken`, `notifications_notificationlog`, `notifications_notificationtemplate`, `messages_app_message`, `progress_ticketprogress` |
| History and forecasting apps | None | `history_servicehistory`, `forecast_demandforecast` |

## Key Row Counts

| Table | Rows |
| --- | ---: |
| `users_user` | 10 |
| `services_servicetype` | 9 |
| `services_servicerequest` | 11 |
| `services_servicelocation` | 11 |
| `services_serviceticket` | 11 |
| `services_servicestatushistory` | 42 |
| `services_technicianlocationhistory` | 113 |
| `notifications_notification` | 90 |
| `inventory_inventoryitem` | 9 |
| `inventory_inventorytransaction` | 22 |
| `inventory_inventoryreservation` | 9 |
| `django_migrations` | 71 |

## Functional Data Findings

### Users

| Role | Count |
| --- | ---: |
| `admin` | 1 |
| `client` | 5 |
| `follow_up` | 1 |
| `superadmin` | 1 |
| `supervisor` | 1 |
| `technician` | 1 |

Findings:

- All 10 users have `status = active`.
- There is 1 technician.
- There are 0 available technicians.

Risk:

- Auto-dispatch, assignment scoring, technician dashboard testing, and realistic schedule testing may fail or behave oddly because the local database has no available technician.

### Service Requests

| Status | Count |
| --- | ---: |
| `Approved` | 3 |
| `Completed` | 4 |
| `In Progress` | 1 |
| `Pending` | 3 |

| Priority | Count |
| --- | ---: |
| `High` | 1 |
| `Normal` | 9 |
| `Urgent` | 1 |

Findings:

- 11 service requests exist.
- 0 requests are missing a location.
- 0 requests are missing a linked ticket.
- 9 service types exist.

Risk:

- Request-to-ticket linkage looks healthy in the local data.

### Service Tickets

| Status | Count |
| --- | ---: |
| `Completed` | 4 |
| `In Progress` | 2 |
| `Not Started` | 5 |

Findings:

- 11 tickets exist.
- 3 tickets do not have a technician assigned.
- 0 tickets are missing `scheduled_date`.
- 1 ticket has an inspection checklist.

Risk:

- The unassigned tickets may be valid for dispatch testing, but they should be intentional.
- If dashboard counts assume assigned technicians, these 3 records are useful edge cases but may expose gaps.
- Checklist coverage is thin: only 1 of 11 tickets has a checklist.

### Inventory

Findings:

- 9 inventory items exist.
- 1 item is below minimum stock.
- 0 items have negative quantity.
- Reservation statuses: 5 `fulfilled`, 4 `pending`.
- Transaction types: 12 `reservation`, 5 `issue`, 5 `cancellation`.

Risk:

- Low-stock workflows should be checked against the single below-minimum item.
- Inventory data is present enough for dashboard and reservation testing.

### Notifications

| Status | Count |
| --- | ---: |
| `read` | 44 |
| `unread` | 46 |

Findings:

- 90 notification records exist.
- 0 Firebase tokens exist.
- 0 notification templates exist.
- 0 notification logs exist.

Risk:

- In-app notification testing has enough data.
- Push notification testing is not represented locally.
- Delivery audit/history testing is not represented locally.

### Future Feature Tables

These tables exist but have no local rows:

- `services_aftersalescase`
- `services_maintenanceschedule`
- `services_serviceanalytics`
- `services_demandforecast`
- `services_servicetrend`
- `services_technicianperformance`
- `messages_app_message`
- `progress_ticketprogress`
- `history_servicehistory`
- `forecast_demandforecast`

Risk:

- The schema is ready, but local testing cannot prove these flows work end to end until seed/sample records are added.
- After-sales, maintenance, analytics, forecasting, messaging, progress, and service-history screens may render empty states only.

## Model And Schema Notes

- Django sees 39 model entries, including proxy/duplicate table use such as `authtoken.TokenProxy`.
- Every model table checked by Django exists in SQLite.
- `ServiceRequest` reverse relation to tickets currently resolves as `serviceticket`, not `tickets`. Code or scripts that assume `request.tickets` will fail unless a `related_name` is added.
- Two forecast concepts exist: `services.DemandForecast` and `forecast.DemandForecast`. This is documented in the database diagram and should remain intentional or be consolidated later.

## Priority Recommendations

1. Mark at least one technician available, or create a second available technician for local dispatch testing.
2. Decide whether the 3 unassigned tickets are intentional test cases. If yes, document them as dispatch fixtures.
3. Add seed records for after-sales, maintenance, messaging, progress updates, and service history before testing those screens.
4. Add or verify notification templates and Firebase tokens only when push/email/SMS delivery is part of the next test pass.
5. Confirm whether `ServiceRequest -> ServiceTicket` should expose a clearer `related_name`, such as `tickets`.
6. Re-run this audit after any model or migration changes.

## May 4, 2026 Code Audit Addendum

Recent workflow updates were made in backend code and do not require a database migration.

Updated behavior:

- Dispatching now caps each technician at 8 scheduled hours per day.
- The cap is calculated from existing `ServiceType.estimated_duration` values on same-day tickets.
- Manual assignment and automated matchmaking both enforce the cap.
- Automated matchmaking now prefers less-loaded qualified technicians before using score as a tie-breaker.
- Technician checklist warranty data activates only after ticket completion.
- Completed warranty work automatically creates a warranty after-sales handoff case.

Schema impact:

- No new tables.
- No new columns.
- No data migration required.

Related audit file: `docs/CODEBASE_AUDIT_MAY_2026.md`.

## Before The Next Database Change

Use this checklist before changing models, migrations, seed data, or workflow logic:

- Planned change:
- Reason for change:
- Models affected:
- Tables affected:
- Existing local data at risk:
- Migration needed:
- Data migration needed:
- Seed/sample data needed:
- API serializers/views affected:
- Frontend pages affected:
- Verification commands:
- Rollback plan:

Minimum verification after a database change:

```powershell
.\venv\Scripts\python.exe backend\manage.py check
.\venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe backend\manage.py migrate --plan
.\venv\Scripts\python.exe backend\manage.py show_tables --compact
```
