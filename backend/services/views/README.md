# Service Views

Service API views are split by operational area:

- `service_requests.py` handles incoming client/admin requests and approval.
- `tickets.py` handles dispatch, ticket status, rescheduling, proof, and ticket reports.
- `technician.py` handles technician dashboard, jobs, schedule, profile, and history endpoints.
- `inspection.py` handles checklist, technician skills, status history, and location history.
- `analytics.py` and `reports.py` handle reporting, GIS, forecasts, coverage, and routing support.
- `service_types.py` handles service catalog CRUD.
- `helpers.py` contains shared constants and cross-view helper functions.

When adding new behavior, prefer the narrowest module that matches the workflow.
