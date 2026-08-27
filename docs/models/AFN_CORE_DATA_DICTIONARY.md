# AFN Core Data Dictionary

This data dictionary is based on the trimmed core database diagram for the AFN Service Management System. Field names match the implemented Django schema, while the active user roles remain clear: **admin/superadmin**, **technician**, and **client**.

Primary keys are internal integer database identifiers used for efficient foreign-key relationships. User-facing alphanumeric reference codes, such as ticket or request numbers, should be treated as separate unique business identifiers when added to the system. Fields marked as `TEXT` that store lists or objects contain serialized JSON data at the application layer because the local SQLite database stores Django `JSONField` values as text.

## Table 1. users_user

The `users_user` table records all active system users, including admin/superadmin, technicians, and clients. It stores login identity, role, contact information, account status, and timestamps.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique user ID |
| username | VARCHAR | 0 | 0 | 0 | Unique username used for login |
| email | VARCHAR | 0 | 0 | 0 | User email address |
| first_name | VARCHAR | 0 | 0 | 0 | User first name |
| last_name | VARCHAR | 0 | 0 | 0 | User last name |
| role | ENUM('superadmin','admin','technician','client') | 0 | 0 | 0 | User role in the system |
| phone | VARCHAR | 0 | 0 | 1 | User contact number |
| address | TEXT | 0 | 0 | 1 | User address |
| status | ENUM('active','inactive') | 0 | 0 | 0 | Account status |
| is_active | BOOLEAN | 0 | 0 | 0 | Login availability flag |
| created_at | DATETIME | 0 | 0 | 1 | Account creation datetime |
| updated_at | DATETIME | 0 | 0 | 1 | Last account update datetime |

## Table 2. services_servicetype

The `services_servicetype` table stores the available services offered by the system. It contains service descriptions, estimated duration, estimated cost, procedure data, and required equipment data.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique service type ID |
| name | VARCHAR | 0 | 0 | 0 | Service type name |
| description | TEXT | 0 | 0 | 1 | Service description |
| estimated_duration | INTEGER | 0 | 0 | 0 | Estimated service duration in minutes |
| estimated_cost | DECIMAL(10,2) | 0 | 0 | 0 | Estimated service cost |
| max_daily_assignments | INTEGER | 0 | 0 | 0 | Maximum daily assignments for this service type |
| procedures | TEXT | 0 | 0 | 0 | Serialized service procedure checklist template |
| required_equipment | TEXT | 0 | 0 | 0 | Serialized required equipment template |

## Table 3. services_servicerequest

The `services_servicerequest` table records service requests submitted by clients. It tracks the selected service, request details, priority, status, preferred schedule, and request source.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique service request ID |
| client_id | INTEGER | 0 | 1 | 0 | Reference to users_user |
| service_type_id | INTEGER | 0 | 1 | 0 | Reference to services_servicetype |
| description | TEXT | 0 | 0 | 0 | Client request description |
| priority | ENUM('Low','Normal','High','Urgent') | 0 | 0 | 0 | Request priority |
| status | ENUM('Pending','Approved','In Progress','Completed','Cancelled') | 0 | 0 | 0 | Request status |
| preferred_date | DATE | 0 | 0 | 1 | Client preferred service date |
| preferred_time_slot | VARCHAR | 0 | 0 | 1 | Preferred service time slot |
| request_source | VARCHAR | 0 | 0 | 0 | Source of request |
| scheduling_notes | TEXT | 0 | 0 | 1 | Scheduling notes |
| request_date | DATETIME | 0 | 0 | 0 | Request submission datetime |
| updated_at | DATETIME | 0 | 0 | 0 | Last request update datetime |
| auto_ticket_created | BOOLEAN | 0 | 0 | 0 | Indicates if a ticket was automatically created |

## Table 4. services_servicerequestservice

The `services_servicerequestservice` table records additional service items attached to a service request. It supports requests that may include more than one service type.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique request service item ID |
| request_id | INTEGER | 0 | 1 | 0 | Reference to services_servicerequest |
| service_type_id | INTEGER | 0 | 1 | 0 | Reference to services_servicetype |
| notes | TEXT | 0 | 0 | 1 | Notes for the service item |
| status | VARCHAR | 0 | 0 | 0 | Service item status |
| sort_order | INTEGER | 0 | 0 | 0 | Display order of service item |
| created_at | DATETIME | 0 | 0 | 0 | Creation datetime |

## Table 5. services_servicelocation

The `services_servicelocation` table stores the location connected to a client service request. It records address details and optional map coordinates.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique location ID |
| request_id | INTEGER | 0 | 1 | 0 | Reference to services_servicerequest |
| address | TEXT | 0 | 0 | 0 | Service address |
| city | VARCHAR | 0 | 0 | 0 | City of service location |
| province | VARCHAR | 0 | 0 | 0 | Province of service location |
| latitude | DECIMAL(9,6) | 0 | 0 | 1 | Latitude coordinate |
| longitude | DECIMAL(9,6) | 0 | 0 | 1 | Longitude coordinate |

## Table 6. services_serviceticket

The `services_serviceticket` table records approved service work created from client requests. It tracks assigned technician, assigned admin/superadmin, schedule, status, completion details, client feedback, and warranty information.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique service ticket ID |
| request_id | INTEGER | 0 | 1 | 0 | Reference to services_servicerequest |
| technician_id | INTEGER | 0 | 1 | 1 | Reference to technician user |
| assigned_admin_id | INTEGER | 0 | 1 | 1 | Reference to admin/superadmin user managing the ticket |
| scheduled_date | DATE | 0 | 0 | 0 | Scheduled service date |
| scheduled_time | TIME | 0 | 0 | 1 | Scheduled service time |
| scheduled_time_slot | VARCHAR | 0 | 0 | 1 | Scheduled time slot |
| start_time | DATETIME | 0 | 0 | 1 | Job start datetime |
| end_time | DATETIME | 0 | 0 | 1 | Job end datetime |
| completed_date | DATETIME | 0 | 0 | 1 | Completion datetime |
| status | ENUM('Not Started','In Progress','Completed','On Hold','Cancelled') | 0 | 0 | 0 | Ticket status |
| priority | ENUM('Low','Normal','High','Urgent') | 0 | 0 | 0 | Ticket priority |
| notes | TEXT | 0 | 0 | 1 | Ticket notes |
| client_rating | INTEGER | 0 | 0 | 1 | Client rating from 1 to 5 |
| client_feedback | TEXT | 0 | 0 | 1 | Client feedback |
| auto_assigned | BOOLEAN | 0 | 0 | 0 | Indicates if technician was auto-assigned |
| assigned_at | DATETIME | 0 | 0 | 1 | Assignment datetime |
| reschedule_requested | BOOLEAN | 0 | 0 | 0 | Indicates if reschedule was requested |
| reschedule_reason | TEXT | 0 | 0 | 1 | Reason for reschedule |
| warranty_status | VARCHAR | 0 | 0 | 0 | Warranty status |
| warranty_period_days | INTEGER | 0 | 0 | 1 | Warranty period in days |
| warranty_start_date | DATE | 0 | 0 | 1 | Warranty start date |
| warranty_end_date | DATE | 0 | 0 | 1 | Warranty end date |
| completion_proof_images | TEXT | 0 | 0 | 0 | Serialized proof image URL list |
| completion_notes | TEXT | 0 | 0 | 1 | Completion notes |
| created_at | DATETIME | 0 | 0 | 1 | Ticket creation datetime |
| updated_at | DATETIME | 0 | 0 | 1 | Last ticket update datetime |

## Table 7. services_ticketcrewassignment

The `services_ticketcrewassignment` table records additional technicians assigned to a service ticket as crew members.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique crew assignment ID |
| ticket_id | INTEGER | 0 | 1 | 0 | Reference to services_serviceticket |
| technician_id | INTEGER | 0 | 1 | 0 | Reference to technician user |
| created_at | DATETIME | 0 | 0 | 0 | Assignment creation datetime |

## Table 8. services_servicestatushistory

The `services_servicestatushistory` table records status changes made to service tickets. It is used as a status timeline and audit trail for ticket movement.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique status history ID |
| ticket_id | INTEGER | 0 | 1 | 0 | Reference to services_serviceticket |
| changed_by_id | INTEGER | 0 | 1 | 1 | Reference to user who changed the status |
| status | VARCHAR | 0 | 0 | 0 | New ticket status |
| notes | TEXT | 0 | 0 | 1 | Status change notes |
| timestamp | DATETIME | 0 | 0 | 0 | Status change datetime |

## Table 9. services_inspectionchecklist

The `services_inspectionchecklist` table records technician checklist results, inspection details, proof media, warranty data, and follow-up indicators for a service ticket.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique checklist ID |
| ticket_id | INTEGER | 0 | 1 | 0 | Reference to services_serviceticket |
| completed_by_id | INTEGER | 0 | 1 | 1 | Reference to technician who completed the checklist |
| submitted_by_id | INTEGER | 0 | 1 | 1 | Reference to user who submitted the checklist |
| is_completed | BOOLEAN | 0 | 0 | 0 | Checklist completion flag |
| site_accessible | BOOLEAN | 0 | 0 | 0 | Site accessibility result |
| electrical_available | BOOLEAN | 0 | 0 | 0 | Electrical availability result |
| electrical_adequate | BOOLEAN | 0 | 0 | 0 | Electrical adequacy result |
| recommendation | VARCHAR | 0 | 0 | 1 | Inspection recommendation |
| checklist_items | TEXT | 0 | 0 | 0 | Serialized checklist item responses |
| required_equipment_snapshot | TEXT | 0 | 0 | 0 | Serialized equipment list used during inspection |
| proof_media | TEXT | 0 | 0 | 0 | Serialized proof images or media |
| maintenance_required | BOOLEAN | 0 | 0 | 0 | Maintenance requirement flag |
| maintenance_profile | VARCHAR | 0 | 0 | 1 | Maintenance profile type |
| maintenance_interval_days | INTEGER | 0 | 0 | 1 | Maintenance interval in days |
| warranty_provided | BOOLEAN | 0 | 0 | 0 | Warranty provided flag |
| warranty_period_days | INTEGER | 0 | 0 | 1 | Warranty period in days |
| follow_up_required | BOOLEAN | 0 | 0 | 0 | Follow-up requirement flag |
| follow_up_case_type | VARCHAR | 0 | 0 | 1 | Follow-up case type |
| follow_up_due_date | DATE | 0 | 0 | 1 | Follow-up due date |
| created_at | DATETIME | 0 | 0 | 0 | Checklist creation datetime |
| completed_at | DATETIME | 0 | 0 | 1 | Checklist completion datetime |
| submitted_at | DATETIME | 0 | 0 | 1 | Checklist submission datetime |

## Table 10. services_aftersalescase

The `services_aftersalescase` table records after-sales concerns, complaints, warranty cases, revisits, and follow-up cases linked to completed service tickets.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique after-sales case ID |
| service_ticket_id | INTEGER | 0 | 1 | 0 | Reference to services_serviceticket |
| client_id | INTEGER | 0 | 1 | 0 | Reference to client user |
| assigned_admin_id | INTEGER | 0 | 1 | 1 | Reference to assigned admin/superadmin user |
| created_by_id | INTEGER | 0 | 1 | 1 | Reference to user who created the case |
| case_type | ENUM('follow_up','maintenance','complaint','warranty','revisit','feedback') | 0 | 0 | 0 | Type of after-sales case |
| status | ENUM('open','in_progress','resolved','closed') | 0 | 0 | 0 | Case status |
| priority | ENUM('low','normal','high','urgent') | 0 | 0 | 0 | Case priority |
| creation_source | VARCHAR | 0 | 0 | 0 | Source of case creation |
| summary | VARCHAR | 0 | 0 | 0 | Short case summary |
| details | TEXT | 0 | 0 | 1 | Case details |
| resolution_notes | TEXT | 0 | 0 | 1 | Resolution notes |
| requires_revisit | BOOLEAN | 0 | 0 | 0 | Revisit requirement flag |
| customer_satisfaction | INTEGER | 0 | 0 | 1 | Customer satisfaction rating |
| due_date | DATE | 0 | 0 | 1 | Case due date |
| resolved_at | DATETIME | 0 | 0 | 1 | Case resolution datetime |
| created_at | DATETIME | 0 | 0 | 0 | Case creation datetime |
| updated_at | DATETIME | 0 | 0 | 0 | Last case update datetime |

## Table 11. services_maintenanceschedule

The `services_maintenanceschedule` table records planned maintenance schedules generated from completed tickets and checklist results.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique maintenance schedule ID |
| ticket_id | INTEGER | 0 | 1 | 0 | Reference to services_serviceticket |
| client_id | INTEGER | 0 | 1 | 0 | Reference to client user |
| service_type_id | INTEGER | 0 | 1 | 0 | Reference to services_servicetype |
| maintenance_profile | VARCHAR | 0 | 0 | 0 | Maintenance profile category |
| interval_days | INTEGER | 0 | 0 | 0 | Maintenance interval in days |
| follow_up_window_days | INTEGER | 0 | 0 | 0 | Follow-up window in days |
| last_service_date | DATE | 0 | 0 | 0 | Last completed service date |
| next_due_date | DATE | 0 | 0 | 0 | Next maintenance due date |
| notify_on_date | DATE | 0 | 0 | 0 | Notification date |
| status | ENUM('scheduled','due_soon','due','completed','dismissed') | 0 | 0 | 0 | Maintenance schedule status |
| maintenance_notes | TEXT | 0 | 0 | 1 | Maintenance notes |
| risk_level | VARCHAR | 0 | 0 | 0 | Maintenance risk level |
| risk_score | FLOAT | 0 | 0 | 0 | Maintenance risk score |
| created_at | DATETIME | 0 | 0 | 0 | Schedule creation datetime |
| updated_at | DATETIME | 0 | 0 | 0 | Last schedule update datetime |

## Table 12. services_technicianskill

The `services_technicianskill` table records which service types each technician can perform and the technician skill level for each service.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique technician skill ID |
| technician_id | INTEGER | 0 | 1 | 0 | Reference to technician user |
| service_type_id | INTEGER | 0 | 1 | 0 | Reference to services_servicetype |
| skill_level | ENUM('beginner','intermediate','expert') | 0 | 0 | 0 | Technician skill level |

## Table 13. inventory_inventorycategory

The `inventory_inventorycategory` table records categories used to classify inventory items and equipment.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique inventory category ID |
| parent_id | INTEGER | 0 | 1 | 1 | Reference to parent inventory category |
| name | VARCHAR | 0 | 0 | 0 | Category name |
| description | TEXT | 0 | 0 | 1 | Category description |

## Table 14. inventory_inventoryitem

The `inventory_inventoryitem` table records equipment, tools, spare parts, and other inventory items used in service operations.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique inventory item ID |
| category_id | INTEGER | 0 | 1 | 0 | Reference to inventory_inventorycategory |
| name | VARCHAR | 0 | 0 | 0 | Inventory item name |
| sku | VARCHAR | 0 | 0 | 0 | Unique stock keeping unit |
| description | TEXT | 0 | 0 | 1 | Item description |
| item_type | VARCHAR | 0 | 0 | 0 | Item type |
| quantity | INTEGER | 0 | 0 | 0 | Total stock quantity |
| minimum_stock | INTEGER | 0 | 0 | 0 | Minimum stock threshold |
| reserved_quantity | INTEGER | 0 | 0 | 0 | Quantity reserved for tickets |
| warehouse_location | VARCHAR | 0 | 0 | 1 | Storage location |
| unit_price | DECIMAL(10,2) | 0 | 0 | 0 | Unit price |
| status | VARCHAR | 0 | 0 | 0 | Item status |
| supplier | VARCHAR | 0 | 0 | 1 | Supplier name |
| created_at | DATETIME | 0 | 0 | 0 | Item creation datetime |
| updated_at | DATETIME | 0 | 0 | 0 | Last item update datetime |

## Table 15. inventory_inventoryreservation

The `inventory_inventoryreservation` table records items reserved for technicians and service tickets before or during job completion.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique inventory reservation ID |
| item_id | INTEGER | 0 | 1 | 0 | Reference to inventory_inventoryitem |
| technician_id | INTEGER | 0 | 1 | 0 | Reference to technician user |
| ticket_id | INTEGER | 0 | 1 | 1 | Reference to services_serviceticket |
| quantity | INTEGER | 0 | 0 | 0 | Reserved quantity |
| required_date | DATE | 0 | 0 | 0 | Date item is required |
| notes | TEXT | 0 | 0 | 1 | Reservation notes |
| status | VARCHAR | 0 | 0 | 0 | Reservation status |
| created_at | DATETIME | 0 | 0 | 0 | Reservation creation datetime |

## Table 16. inventory_inventorytransaction

The `inventory_inventorytransaction` table records inventory movements such as purchase, issue, return, transfer, adjustment, reservation, and cancellation.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique inventory transaction ID |
| item_id | INTEGER | 0 | 1 | 0 | Reference to inventory_inventoryitem |
| technician_id | INTEGER | 0 | 1 | 1 | Reference to technician user |
| ticket_id | INTEGER | 0 | 1 | 1 | Reference to services_serviceticket |
| performed_by_id | INTEGER | 0 | 1 | 1 | Reference to user who performed the transaction |
| transaction_type | ENUM('purchase','issue','return','transfer','adjustment','reservation','cancellation') | 0 | 0 | 0 | Type of inventory movement |
| quantity | INTEGER | 0 | 0 | 0 | Transaction quantity |
| reference_number | VARCHAR | 0 | 0 | 1 | Reference number |
| notes | TEXT | 0 | 0 | 1 | Transaction notes |
| transaction_date | DATETIME | 0 | 0 | 0 | Transaction datetime |

## Table 17. inventory_servicetypeinventoryrequirement

The `inventory_servicetypeinventoryrequirement` table records default inventory items required for each service type.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique service inventory requirement ID |
| service_type_id | INTEGER | 0 | 1 | 0 | Reference to services_servicetype |
| item_id | INTEGER | 0 | 1 | 0 | Reference to inventory_inventoryitem |
| quantity | INTEGER | 0 | 0 | 0 | Required item quantity |
| auto_reserve | BOOLEAN | 0 | 0 | 0 | Indicates if item should be auto-reserved |
| notes | TEXT | 0 | 0 | 1 | Requirement notes |
| created_at | DATETIME | 0 | 0 | 0 | Requirement creation datetime |
| updated_at | DATETIME | 0 | 0 | 0 | Last requirement update datetime |

## Table 18. messages_app_message

The `messages_app_message` table records ticket-linked direct or group messages between clients, technicians, and admin/superadmin users.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique message ID |
| ticket_id | INTEGER | 0 | 1 | 1 | Reference to services_serviceticket |
| sender_id | INTEGER | 0 | 1 | 1 | Reference to sender user |
| receiver_id | INTEGER | 0 | 1 | 1 | Reference to receiver user |
| room_type | ENUM('direct','group') | 0 | 0 | 0 | Message room type |
| group_key | VARCHAR | 0 | 0 | 1 | Group conversation key |
| message_text | TEXT | 0 | 0 | 0 | Message content |
| created_at | DATETIME | 0 | 0 | 0 | Message creation datetime |

## Table 19. notifications_notification

The `notifications_notification` table records notifications sent to users. Notifications may be linked to a service ticket or service request.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique notification ID |
| user_id | INTEGER | 0 | 1 | 0 | Reference to recipient user |
| ticket_id | INTEGER | 0 | 1 | 1 | Reference to services_serviceticket |
| request_id | INTEGER | 0 | 1 | 1 | Reference to services_servicerequest |
| title | VARCHAR | 0 | 0 | 0 | Notification title |
| message | TEXT | 0 | 0 | 0 | Notification message |
| type | VARCHAR | 0 | 0 | 0 | Notification type |
| status | ENUM('unread','read') | 0 | 0 | 0 | Notification read status |
| created_at | DATETIME | 0 | 0 | 0 | Notification creation datetime |
| read_at | DATETIME | 0 | 0 | 1 | Notification read datetime |

## Table 20. users_activitylog

The `users_activitylog` table records admin-facing operational activities such as logins, ticket updates, request changes, inventory changes, communication events, and system actions.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique activity log ID |
| actor_id | INTEGER | 0 | 1 | 1 | Reference to user who performed the action |
| actor_role | VARCHAR | 0 | 0 | 0 | Role of actor at time of action |
| category | VARCHAR | 0 | 0 | 0 | Activity category |
| action | VARCHAR | 0 | 0 | 0 | Activity action |
| target_model | VARCHAR | 0 | 0 | 0 | Affected model name |
| target_id | INTEGER | 0 | 0 | 1 | Affected record ID |
| target_label | VARCHAR | 0 | 0 | 0 | Human-readable target label |
| message | VARCHAR | 0 | 0 | 0 | Activity message |
| metadata | TEXT | 0 | 0 | 0 | Serialized additional activity metadata |
| ip_address | VARCHAR | 0 | 0 | 1 | IP address of actor |
| created_at | DATETIME | 0 | 0 | 0 | Activity datetime |
