# AFN Core Data Dictionary Format Guide

Use this exact format for every table in your Chapter III data dictionary.

```text
Table X. table_name

The table_name table records/stores [what the table is for]. It tracks/stores [main purpose],
[important related data], and [timestamps/status if applicable].

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| field_id | INTEGER | 1 | 0 | 0 | Unique field ID |
| related_id | INTEGER | 0 | 1 | 0 | Reference to related_table |
| status | ENUM('value1','value2') | 0 | 0 | 0 | Record status |
| created_at | DATETIME | 0 | 0 | 0 | Creation datetime |
| updated_at | DATETIME | 0 | 0 | 1 | Last update datetime |
```

## Example Using Your System

```text
Table 6. services_serviceticket

The services_serviceticket table records approved service work created from client service
requests. It tracks the assigned technician, admin/superadmin manager, schedule, ticket
status, completion details, client feedback, warranty details, and relevant timestamps.

| FieldName | DataType | PK | FK | Null | Description |
|---|---|---:|---:|---:|---|
| id | INTEGER | 1 | 0 | 0 | Unique service ticket ID |
| request_id | INTEGER | 0 | 1 | 0 | Reference to services_servicerequest |
| technician_id | INTEGER | 0 | 1 | 1 | Reference to technician user |
| assigned_admin_id | INTEGER | 0 | 1 | 1 | Reference to admin/superadmin user managing the ticket |
| scheduled_date | DATE | 0 | 0 | 0 | Scheduled service date |
| scheduled_time | TIME | 0 | 0 | 1 | Scheduled service time |
| status | ENUM('Not Started','In Progress','Completed','On Hold','Cancelled') | 0 | 0 | 0 | Ticket status |
| priority | ENUM('Low','Normal','High','Urgent') | 0 | 0 | 0 | Ticket priority |
| client_rating | INTEGER | 0 | 0 | 1 | Client rating from 1 to 5 |
| completion_notes | TEXT | 0 | 0 | 1 | Completion notes |
| created_at | DATETIME | 0 | 0 | 1 | Ticket creation datetime |
| updated_at | DATETIME | 0 | 0 | 1 | Last ticket update datetime |
```

## Formatting Rules To Follow

- Use the title format: `Table X. table_name`
- Put one short paragraph below the title.
- Use the table columns exactly as: `FieldName`, `DataType`, `PK`, `FK`, `Null`, `Description`.
- Use `1` for yes and `0` for no in `PK`, `FK`, and `Null`.
- Use documentation-friendly field names where needed:
  - `assigned_admin_id` for the admin/superadmin managing a service ticket
  - `assigned_to_id` for the admin/superadmin assigned to an after-sales case
  - `ticket_id` instead of `service_ticket_id`
- Do not mention a separate supervisor role, because your active roles are only admin/superadmin, technician, and client.

## Full Dictionary File

The full dictionary already follows this format here:

```text
docs/models/AFN_CORE_DATA_DICTIONARY.md
```
