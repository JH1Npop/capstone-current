# Session Summary

## Current Understanding

AFN Service Management is a Django + React service operations system. The current live workflow is a service lifecycle:

```text
Client request
  -> Admin review and approval
  -> Service ticket creation
  -> Technician or crew assignment
  -> Job execution, checklist, and proof
  -> Ticket completion
  -> After-sales, warranty, and maintenance monitoring
  -> New request or ticket when another visit is needed
```

The final return step is intentionally manual in the current implementation. The system creates and monitors after-sales cases, warranty handoffs, maintenance schedules, and notifications, but it does not automatically create a new `ServiceRequest` or `ServiceTicket` from every follow-up or maintenance record.

## Current Role Model

The current user model uses these active roles:

- `superadmin`
- `admin`
- `technician`
- `client`

After-sales and supervisor-like work are handled through the admin workspace and capability-based access rather than separate active roles. Some older docs, tests, migrations, and backup files still mention legacy `follow_up` or `supervisor` roles.

## Verification Notes

- Frontend production build passed with `npm run build`.
- Backend `manage.py check` could not be run in this environment because the configured `.venv` points to a missing `C:\Python314\python.exe`, and `python` is not available on PATH.

## Documentation Cleanup Done

- Updated `docs/academic/CHAPTER_3_METHODOLOGY_REQUIREMENTS_CAPSTONE.md` to describe the service lifecycle and clarify that the return to a new request/ticket is manual.
- Updated `docs/academic/REQUIREMENT_MODELING_CAPSTONE.md` so the workflow diagram shows after-sales/maintenance monitoring and the semi-automated lifecycle boundary.
- Updated `docs/features/AFTER_SALES_FLOW_AND_AUDIT.md` to align with the current admin/capability-based after-sales workflow.
