# Database Documentation Overview

Prepared for: AFN Service Management capstone documentation  
Updated: May 17, 2026

## Purpose

This file reorganizes the database into presentation-friendly sections so the schema looks intentional and easy to explain in documentation.

For the actual visual schema, use:

`docs/architecture/DB_DIAGRAM.dbml`

## The Best Way To Present The Database

Do not present the database as one long raw table list.

For documentation, present it in five business domains:

1. User and Access Management
2. Service Operations
3. Inventory Management
4. Communication and Notifications
5. Reporting and Historical Records

That makes the project look designed around workflows instead of looking like a random collection of tables.

## 1. User And Access Management

These tables define who uses the system and what each role can do.

| Table | Purpose |
| --- | --- |
| `users_user` | Main account table for all roles |
| `users_technicianprofile` | Technician-only fields such as availability and GPS |
| `users_clientprofile` | Client business and billing details |
| `users_managementprofile` | Management scope for admins |
| `users_usercapabilitygrant` | Fine-grained access extensions |
| `users_adminsettings` | Global system settings |
| `users_changelog` | Audit trail of important changes |

Documentation note:
Explain that the system uses one main `User` table, then separates role-specific data into profile tables for cleaner design.

## 2. Service Operations

These tables represent the main business workflow from request to completed job.

| Table | Purpose |
| --- | --- |
| `services_servicetype` | Catalog of services offered |
| `services_servicerequest` | Client-submitted service request |
| `services_servicelocation` | Location details for the request |
| `services_serviceticket` | Main dispatch and execution record |
| `services_technicianskill` | Matching technician skills to service types |
| `services_ticketcrewassignment` | Additional crew members per ticket |
| `services_servicestatushistory` | Timeline of ticket status changes |
| `services_inspectionchecklist` | Inspection and completion handoff data |
| `services_aftersalescase` | Complaint, revisit, warranty, and follow-up records |
| `services_maintenanceschedule` | Preventive maintenance planning |
| `services_technicianlocationhistory` | Technician tracking history |

Documentation note:
This is the heart of the system. If you need one "main workflow" slide or figure, build it from these tables.

## 3. Inventory Management

These tables support stock control and service-material coordination.

| Table | Purpose |
| --- | --- |
| `inventory_inventorycategory` | Groups inventory items |
| `inventory_inventoryitem` | Main inventory item record |
| `inventory_inventorytransaction` | Movement history of stock |
| `inventory_inventoryreservation` | Reserved stock for scheduled jobs |
| `inventory_servicetypeinventoryrequirement` | Default inventory needed per service type |

Documentation note:
This section helps show that the project is not only ticketing, but also operations and resource planning.

## 4. Communication And Notifications

These tables support user alerts and ticket-linked communication.

| Table | Purpose |
| --- | --- |
| `notifications_notification` | In-app notifications |
| `notifications_notificationtemplate` | Reusable notification templates |
| `notifications_notificationlog` | Delivery attempt tracking |
| `messages_app_message` | Ticket-based messaging between users |

Documentation note:
Firebase push delivery has been removed from the active implementation. Current communication centers on in-app notification records, SMTP email, and ticket/support messaging.
If your panel asks about collaboration or user communication, this is the set to show.

## 5. Reporting And Historical Records

These tables support progress tracking, completed-service history, and analytics.

| Table | Purpose |
| --- | --- |
| `progress_ticketprogress` | Simple progress updates |
| `history_servicehistory` | Completed service history |
| `services_serviceanalytics` | Aggregated service metrics |
| `services_technicianperformance` | Technician performance snapshots |
| `services_demandforecast` | Demand forecasting records |
| `services_servicetrend` | Trend analysis records |

Documentation note:
These are excellent to mention as "decision-support" or "future-ready analytics" tables.

## Primary Workflow To Show In Your Capstone

If you only show one database flow in your paper or defense, show this:

```text
users_user
   -> services_servicerequest
   -> services_servicelocation
   -> services_serviceticket
   -> services_ticketcrewassignment
   -> services_servicestatushistory
   -> services_inspectionchecklist
   -> services_aftersalescase / services_maintenanceschedule
```

This reads clearly as:

- a client submits a request
- the request gets a location
- the request becomes a service ticket
- technicians and crew are assigned
- status changes are tracked
- work is inspected and completed
- follow-up or maintenance can continue after service

## Tables To Highlight In Screenshots Or Diagram Exports

If you want the cleanest-looking documentation visuals, highlight these tables first:

- `users_user`
- `users_technicianprofile`
- `users_clientprofile`
- `services_servicetype`
- `services_servicerequest`
- `services_servicelocation`
- `services_serviceticket`
- `services_ticketcrewassignment`
- `services_servicestatushistory`
- `inventory_inventoryitem`
- `inventory_inventoryreservation`
- `notifications_notification`

That gives you a strong operational story without overwhelming the reader.

## Tables You Usually Should Not Emphasize In The Main Diagram

These are valid, but they make documentation look noisy if you put them front and center:

- `django_migrations`
- `django_session`
- `auth_permission`
- `auth_group`
- `auth_group_permissions`
- `users_user_groups`
- `users_user_user_permissions`
- `sqlite_sequence`

You can mention them as framework tables, but do not make them part of the main capstone database figure.

## Suggested Caption For Your Database Figure

You can use this wording in your documentation:

> Figure X shows the logical database design of the AFN Service Management system. The schema is organized into user management, service operations, inventory, communication, and reporting domains. This structure supports the full service lifecycle from request intake to technician dispatch, job completion, inventory usage, customer follow-up, and analytics.

## Bottom Line

Your database is not messy because it is broken.

It looks messy when shown as a raw technical dump.

For capstone documentation, the fix is to present it as a structured business schema:

- who uses the system
- how service work flows
- how inventory supports operations
- how communication is recorded
- how history and analytics are stored

That is the version that will read well in documentation and during presentation.
