# AFN-SERVE Database Naming Guide

Use this guide when reading the database manually, reviewing API output, or explaining the schema during deployment/demo.

## Important Rule

Do not rename physical database columns right before deployment unless there is a strong reason. Column renames require migrations and can break old data, API clients, frontend code, and documentation if done too quickly.

The safer approach is:

- Keep stable physical columns.
- Add clearer API aliases for humans.
- Document what each technical name means.

## User Role Columns

All role-specific accounts live in `users_user`.

| Column | Human meaning |
| --- | --- |
| `user_id` | Internal user primary key |
| `role` | User type: `superadmin`, `admin`, `technician`, or `client` |
| `technician_id` | A `users_user.user_id` whose role is `technician` |
| `client_id` | A `users_user.user_id` whose role is `client` |
| `assigned_admin_id` | A `users_user.user_id` whose role is `admin` or `superadmin` |

## Service Ticket Naming

`services_serviceticket` is the operational job table.

| Technical name | Human label | Notes |
| --- | --- | --- |
| `service_ticket_id` | Ticket ID | Primary key of a service job |
| `request_id` | Source request | Links back to the client request |
| `technician_id` | Assigned technician | Worker assigned to perform the job |
| `assigned_admin_id` | Admin owner | Admin/superadmin responsible for managing the ticket |

Avoid using `supervisor_id` in new docs. The active system uses `assigned_admin_id`.

## After-Sales Case Naming

`services_aftersalescase` uses `assigned_to_id` in the physical database. This means the admin/superadmin assigned to handle the after-sales case.

| Technical name | Human label | Safer API alias |
| --- | --- | --- |
| `assigned_to_id` | After-sales admin owner | `assigned_admin_id`, `admin_owner_id` |
| `assigned_to_name` | After-sales admin name | `assigned_admin_name`, `admin_owner_name` |

Keep `assigned_to_id` physically for now because renaming it would require a migration. Use the aliases in API/manual explanations to reduce confusion.

## Display Codes

The API now exposes human-readable codes for easier manual review:

| API field | Example | Meaning |
| --- | --- | --- |
| `ticket_code` | `TKT-12` | Service ticket display code |
| `request_code` | `REQ-8` | Service request display code |
| `case_code` | `ASC-5` | After-sales case display code |

These are display labels only. The real primary keys remain numeric IDs.

## Legacy Terms To Avoid

| Avoid | Use instead |
| --- | --- |
| `supervisor` | `admin owner` or `assigned admin` |
| `follow-up user role` | `after-sales capability` |
| `assigned_to` without context | `after-sales assigned admin` |
| `ticket id` when speaking to users | `ticket code` |
| `request id` when speaking to users | `request code` |
