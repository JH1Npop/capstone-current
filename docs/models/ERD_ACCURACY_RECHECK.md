# ERD Accuracy Recheck

Rechecked against the Django model files on 2026-10-17.

## Verification

Command used:

```powershell
.\venv\Scripts\python.exe backend\manage.py check
```

Result:

```text
System check identified no issues (0 silenced).
```

Firebase push delivery has since been removed from the active implementation; older warnings or tables in historical diagram exports should be treated as legacy notes.

## Best ERD Files To Use

Use this for the maintained draw.io presentation:

```text
docs/models/AFN_ERD_CHEN_PRESENTATION.drawio
```

Use this as the most complete database source:

```text
docs/models/AFN_ERD.dbml
```

The maintained physical and presentation sources now contain 52 entities, 707
local attributes, and 107 in-scope relationships. Migration
`services.0061_service_deposit_policy` is represented by the Service Type
deposit defaults, Quotation Record snapshot fields, nullable Sales Payment to
Quotation Record foreign key, and its relationship diamond.

## Accuracy Notes

Older snowflake and manually maintained draw.io exports are supporting legacy
views. The generated Chen ERD and DBML are authoritative. Their operational
scope includes:

- `Users`
- `TechnicianProfile`
- `ClientProfile`
- `ManagementProfile`
- `ServiceRequest`
- `ServiceRequestService`
- `ServiceLocation`
- `ServiceTicket`
- `TicketCrewAssignment`
- `ServiceStatusHistory`
- `InspectionChecklist`
- `AfterSalesCase`
- `MaintenanceSchedule`
- `TechnicianSkill`
- `InventoryCategory`
- `InventoryItem`
- `InventoryReservation`
- `InventoryTransaction`
- `ServiceTypeInventoryRequirement`
- `Message`
- `Notification`
- `ActivityLog`
- `TicketProgress`
- Analytics records

The DBML file is more complete for the full physical database because it also includes supporting/admin tables:

- `SLARule`
- `AdminSettings`
- `UserCapabilityGrant`
- `ChangeLog`
- `TechnicianLocationHistory`
- `ServiceAnalytics`
- `TechnicianPerformance`
- `DemandForecast`
- `ServiceTrend`

## Important Correction Made

The first snowflake draft used a broad label from `Users` to `ServiceTicket`. The correct wording should now be:

```text
technician / assigned admin
```

That matches the actual `ServiceTicket` model:

- `technician_id`
- `assigned_admin_id`

The client reaches the ticket through:

```text
User -> ServiceRequest -> ServiceTicket
```

That is the correct system flow.

## Retained Legacy API Model

`progress.TicketProgress` remains because it provides a secured append-only API.
The disconnected `history.ServiceHistory`, `notifications.NotificationTemplate`,
and `notifications.NotificationLog` models were retired. The main flow uses:

- `ServiceStatusHistory`
- `InspectionChecklist`
- `ActivityLog`
- `ServiceTicket`

## Final Recommendation

For Chapter III, use the regenerated Chen draw.io ERD and current DBML. The DBML
is the maintained physical-schema source; older draw.io exports can still omit
new fields or contain retired legacy nodes.
