# AFN ERD Materials and Codes

## Best Tool For This ERD

Use **dbdiagram.io** for the ERD.

Why: ERD tools understand tables, primary keys, foreign keys, and one-to-many links automatically. Figma AI is better for visual mockups, but it may invent or misplace relationships.

## Main ERD Code

Paste this file into dbdiagram.io:

```text
docs/models/AFN_ERD.dbml
```

Steps:

1. Open `https://dbdiagram.io`.
2. Create a new diagram.
3. Delete the sample code.
4. Paste the contents of `docs/models/AFN_ERD.dbml`.
5. Click `Save` or wait for the diagram to render.
6. Export as PNG/PDF for your paper.

## ERD Scope

This ERD is based on the real Django models in the codebase.

Core flow tables:

- `users_user`
- `users_technicianprofile`
- `users_clientprofile`
- `users_managementprofile`
- `services_servicetype`
- `services_servicerequest`
- `services_servicelocation`
- `services_serviceticket`
- `services_servicestatushistory`
- `services_inspectionchecklist`
- `services_aftersalescase`
- `services_maintenanceschedule`
- `services_technicianskill`
- `inventory_inventorycategory`
- `inventory_inventoryitem`
- `inventory_inventoryreservation`
- `inventory_inventorytransaction`
- `inventory_servicetypeinventoryrequirement`
- `messages_app_message`
- `notifications_notification`
- `users_activitylog`

Support/reporting tables:

- `services_serviceanalytics`
- `services_technicianperformance`
- `services_demandforecast`
- `services_servicetrend`
- `services_slarule`
- `users_changelog`
- `users_adminsettings`
- `users_usercapabilitygrant`
- `notifications_notificationtemplate`
- `notifications_notificationlog`

Historical Firebase token tables may appear in older DBML exports, but Firebase push delivery has been removed from the active implementation.

## Simplified ERD Prompt For Figma/Lucidchart

Use this if you want another AI tool to redraw the ERD manually:

```text
Create a clean entity relationship diagram for the AFN Service Management System. Use crow's foot notation, white background, Inter or Arial font, and three table sections: User Management, Service Operations, and Support/Reporting.

Show these main entities and relationships:
User has one TechnicianProfile, one ClientProfile, or one ManagementProfile depending on role. User creates many ServiceRequests as client. ServiceRequest belongs to one ServiceType and has one ServiceLocation. ServiceRequest can contain many ServiceRequestService rows. ServiceRequest creates many ServiceTickets. ServiceTicket belongs to one technician User and one assigned admin/superadmin User. ServiceTicket has many ServiceStatusHistory rows, one InspectionChecklist, many AfterSalesCase rows, one MaintenanceSchedule, many Messages, many Notifications, many InventoryReservations, and many InventoryTransactions. TechnicianSkill links technician User to ServiceType. InventoryItem belongs to InventoryCategory. InventoryReservation links InventoryItem, technician User, and ServiceTicket. InventoryTransaction links InventoryItem, technician User, ServiceTicket, and performed_by User. ServiceTypeInventoryRequirement links ServiceType and InventoryItem. Notification belongs to User and may link to ServiceTicket or ServiceRequest. Message belongs to sender User, optional receiver User, and optional ServiceTicket. ActivityLog belongs to actor User.

Place User Management on the left, Service Operations in the center, Inventory and Notifications on the right, and Reporting/Logs at the bottom. Keep relationship lines orthogonal and avoid crossing lines.
```

## Recommended Chapter III Caption

```text
Figure X. Entity Relationship Diagram of the Proposed AFN Service Management System
```

## Short Explanation For The Paper

```text
The Entity Relationship Diagram presents the database structure of the proposed AFN Service Management System. It shows how users, service requests, service tickets, technician assignments, inspections, after-sales cases, maintenance schedules, inventory records, messages, notifications, reports, and activity logs are connected. The central flow starts when a client creates a service request, which is reviewed and converted into a service ticket assigned to a technician. The ticket then connects to job completion records, checklist proof, inventory usage, after-sales support, maintenance scheduling, notifications, and administrative reporting.
```
