# Codebase Audit

Audit date: May 4, 2026  
Project: AFN Service Management  
Scope: backend workflow, dispatching, technician checklist, warranty, after-sales handoff, and database impact.

## Executive Summary

The core role flow is now structurally supported:

```text
Client request
 -> Admin/Superadmin approval
 -> Service ticket creation
 -> Admin/Supervisor dispatch
 -> Technician checklist and completion
 -> Warranty activation
 -> After-sales handoff
 -> Client service history/detail visibility
```

Recent backend changes improved three important workflow areas:

1. Technician checklist data can drive warranty, maintenance, and after-sales behavior.
2. Warranty activates only after the ticket is completed, not merely when checklist data is saved.
3. Dispatching now respects an 8-hour technician daily workload cap and prefers less-loaded technicians during automated assignment.

No database migration is needed for these updates because the existing schema already stores the required data.

## Verification Run

Commands run during this audit/update:

```powershell
.\venv\Scripts\python.exe backend\manage.py check
.\venv\Scripts\python.exe backend\manage.py makemigrations --check --dry-run
.\venv\Scripts\python.exe backend\manage.py test services.tests.SchedulingWarrantyAndAssignmentTests.test_assignment_rejects_technician_over_daily_duration_limit services.tests.SchedulingWarrantyAndAssignmentTests.test_smart_assignment_skips_technician_over_daily_duration_limit services.tests.SchedulingWarrantyAndAssignmentTests.test_smart_assignment_prefers_less_loaded_technician_after_completed_work
```

Results:

| Check | Result | Notes |
| --- | --- | --- |
| Django system check | Pass | No system check issues. |
| Migration check | Pass | `No changes detected`. |
| Dispatch capacity tests | Pass | Manual dispatch, smart dispatch, and fairness case pass. |
| Local Firebase warning | Expected warning | `firebase_admin` is not installed locally, so push notifications are skipped. |

## Database Impact

No schema change was required.

The dispatch workload rule uses existing fields:

- `ServiceTicket.scheduled_date`
- `ServiceTicket.technician`
- `ServiceTicket.status`
- `ServiceTicket.request`
- `ServiceRequest.service_type`
- `ServiceType.estimated_duration`

The warranty and after-sales flow uses existing fields:

- `InspectionChecklist.warranty_provided`
- `InspectionChecklist.warranty_period_days`
- `InspectionChecklist.warranty_notes`
- `ServiceTicket.warranty_status`
- `ServiceTicket.warranty_start_date`
- `ServiceTicket.warranty_end_date`
- `AfterSalesCase.service_ticket`
- `AfterSalesCase.client`
- `AfterSalesCase.case_type`
- `AfterSalesCase.creation_source`

Because the system calculates workload and warranty dates from existing records, these are code-only changes.

## Dispatching Audit

### Current Behavior

Dispatch now enforces an 8-hour daily technician capacity.

The system totals the estimated duration of a technician's same-day tickets and checks whether the new ticket would exceed the cap:

```text
existing same-day scheduled minutes + new ticket estimated duration <= 480 minutes
```

Example:

```text
4 jobs x 2 hours = 8 hours -> allowed
additional 2-hour job -> blocked
```

### Manual Dispatch

Manual technician assignment now validates:

- The ticket is assignable.
- The technician is active.
- The service-specific daily assignment limit is not exceeded.
- The 8-hour daily workload cap is not exceeded.
- Crew members also fit within the same daily workload cap.

Relevant files:

- `backend/services/views/tickets.py`
- `backend/services/views/helpers.py`

### Automated Matchmaking

Automated dispatch now:

1. Skips technicians who would exceed the 8-hour cap.
2. Prefers technicians with fewer scheduled/completed minutes on that day.
3. Uses the smart score as a tie-breaker.

This prevents the system from repeatedly assigning the next job to the same technician immediately after they finish a task, when other qualified technicians are less loaded.

Relevant files:

- `backend/services/views/helpers.py`
- `backend/services/views/tickets.py`
- `backend/services/auto_dispatch.py`

### Remaining Dispatch Risk

The workload cap is currently a constant in backend code:

```python
DAILY_TECHNICIAN_CAPACITY_MINUTES = 8 * 60
```

This is fine for now. If the limit should be configurable per company, branch, technician, or day type, move it into `AdminSettings` or a dedicated scheduling settings model later.

## Checklist And Service Customization Audit

Service-specific technician checklists are already supported.

The source of custom service checklist templates is:

- `ServiceType.procedures`
- `ServiceType.required_equipment`

The technician checklist page uses this order:

```text
1. Admin-configured ServiceType procedures
2. Built-in frontend fallback checklist
3. Generic checklist
```

When submitted, the actual checklist used is stored as a snapshot on:

- `InspectionChecklist.checklist_items`
- `InspectionChecklist.required_equipment_snapshot`
- `InspectionChecklist.procedure_source`
- `InspectionChecklist.service_type_label`

This is good because old completed jobs keep the checklist that was used at the time, even if the service template is changed later.

### Remaining Checklist Risk

Confirm the admin/superadmin service UI can edit `procedures` and `required_equipment` in a usable way. The backend supports it, but the frontend may need a better checklist-template editor.

## Warranty And After-Sales Audit

### Current Behavior

The technician records warranty information on the checklist:

- Warranty included: yes/no
- Warranty period in days
- Warranty notes

Warranty is activated only when the ticket becomes `Completed`.

At completion, the system calculates and stores:

- `warranty_status`
- `warranty_period_days`
- `warranty_start_date`
- `warranty_end_date`
- `warranty_notes`

Then it creates a warranty after-sales handoff case so the after-sales team can see and manage it.

### Intended Flow

```text
Technician checklist
 -> warranty fields captured
 -> technician completes ticket
 -> warranty dates/status calculated
 -> warranty after-sales case created
 -> client can see service warranty details
```

Relevant files:

- `backend/services/maintenance.py`
- `backend/services/views/helpers.py`
- `backend/services/tests.py`

### Remaining Warranty Risk

If the business wants a full warranty ledger, warranty claims, renewals, or multiple warranty items per ticket, create a separate `Warranty` model later. For now, the ticket-level warranty fields are enough for one warranty coverage period per ticket.

## Client Name On Tickets

The ticket table does not store `client_name` directly. This is normal.

The relationship is:

```text
ServiceTicket
 -> ServiceRequest
 -> User/client
```

The API should expose the client name through nested request data or a serializer shortcut. If any frontend ticket table cannot show the client name, fix the serializer/frontend mapping rather than duplicating the client name in the database.

Recommended shortcut if needed:

```python
client_name = serializers.CharField(source='request.client.username', read_only=True)
```

## End-To-End Flow To Test Next

Test this manually from the UI:

1. Client creates a service request with service type, location, preferred date/time.
2. Admin or superadmin approves the request.
3. Confirm a service ticket is created and shows the client identity.
4. Admin/supervisor dispatches a technician.
5. Confirm dispatch blocks overloaded technicians at 8 daily hours.
6. Confirm automated matchmaking prefers a less-loaded qualified technician.
7. Technician starts the job.
8. Technician submits the service-specific checklist.
9. Technician includes warranty, maintenance, proof media, and optional follow-up notes.
10. Technician completes the ticket.
11. Confirm warranty activates only after completion.
12. Confirm after-sales receives a warranty/follow-up case.
13. Client checks completed service details and warranty dates.

## Priority Recommendations

1. Add at least 3 available technicians in local seed data to test fair dispatch properly.
2. Ensure each service type has realistic `estimated_duration` values because dispatch capacity depends on them.
3. Add admin UI controls for editing service checklist templates if not already polished.
4. Confirm ticket list/detail screens consistently show client name through `request.client`.
5. Add seed data for after-sales cases, maintenance schedules, messages, progress updates, and service history.
6. Consider making the 8-hour dispatch cap configurable after the core flow is stable.

