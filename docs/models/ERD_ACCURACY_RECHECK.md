# ERD Accuracy Recheck

Rechecked against the Django model files on 2026-05-31.

## Verification

Command used:

```powershell
D:\Caps\venv\Scripts\python.exe backend\manage.py check
```

Result:

```text
System check identified no issues (0 silenced).
```

Firebase push delivery has since been removed from the active implementation; older warnings or tables in historical diagram exports should be treated as legacy notes.

## Best ERD Files To Use

Use this for draw.io presentation:

```text
docs/models/AFN_ERD_SNOWFLAKE_DRAWIO.drawio
```

Use this as the most complete database source:

```text
docs/models/AFN_ERD.dbml
```

## Accuracy Notes

The snowflake draw.io ERD is accurate for the main operational system flow:

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
- `ServiceHistory`
- Analytics records

The DBML file is more complete for the full physical database because it also includes supporting/admin tables:

- `SLARule`
- `AdminSettings`
- `UserCapabilityGrant`
- `ChangeLog`
- `NotificationTemplate`
- `NotificationLog`
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

## Legacy But Real Models

Two older apps still exist in the codebase and were added to the ERD materials:

- `progress.TicketProgress`
- `history.ServiceHistory`

They are marked as legacy/support records in the snowflake ERD because the newer main flow mostly uses:

- `ServiceStatusHistory`
- `InspectionChecklist`
- `ActivityLog`
- `ServiceTicket`

## Final Recommendation

For Chapter III, use the snowflake draw.io diagram as the clean visual ERD. Keep the DBML file as backup evidence that the diagram was based on the real Django database structure.
