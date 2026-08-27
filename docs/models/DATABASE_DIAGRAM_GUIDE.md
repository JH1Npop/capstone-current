# AFN Database Diagram Guide

Use this file for the final database diagram source:

```text
docs/models/AFN_DATABASE_DIAGRAM.dbml
```

## Where To Use It

Use **dbdiagram.io**.

Steps:

1. Open `https://dbdiagram.io`.
2. Create a new diagram.
3. Delete the sample code.
4. Paste the full contents of `docs/models/AFN_DATABASE_DIAGRAM.dbml`.
5. Let dbdiagram.io generate the database diagram.
6. Export it as PNG/PDF for your paper.

## What It Represents

This database diagram reflects the actual Django models in the AFN Service Management System:

- User accounts and role profiles
- Admin settings and capability grants
- Service types, SLA rules, service requests, and locations
- Service tickets, crew assignments, status history, progress, and service history
- Technician skills and location history
- Inspection checklist and proof records
- After-sales cases and maintenance schedules
- Inventory categories, items, reservations, transactions, and service inventory requirements
- Ticket-linked messages
- In-app notifications, templates, and notification delivery logs
- Activity logs and change logs
- Analytics, technician performance, demand forecasts, and service trends

## Recommended Caption

```text
Figure X. Database Diagram of the Proposed AFN Service Management System
```

## Note For Defense

This is a physical/logical database diagram. It is different from the Chen-style ERD and the DFD:

- **Database diagram:** tables, fields, primary keys, foreign keys
- **ERD:** entities and relationships
- **DFD:** how data moves through processes

For the database diagram, the DBML file is the most accurate source because it maps directly to the Django model structure.
