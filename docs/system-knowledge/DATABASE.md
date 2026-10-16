# Database

**CONFIRMED:** 51 active Django model classes span users, services, inventory, messaging, notifications, and progress. The exact 676 fields and 102 relationships are generated in `docs/models/ERD_CURRENT.md`; the physical contract is `docs/architecture/DB_DIAGRAM_CAPSTONE.dbml`. Migrations, not those diagrams, remain the schema authority.

Major aggregates:

- Identity/access: `User`, three role profiles, `UserCapabilityGrant`, settings/assets, `ActivityLog`, `ChangeLog` (`users/models.py`).
- Service lifecycle: `ServiceType`, `ServiceRequest`, request-service join, location, estimate, ticket, crew assignment (`services/models/core.py`).
- Evidence/documents: inspection/commissioning/turnover/data-sheet/contract/project/FSR/generated documents and quotation (`services/models/documents.py`).
- Operations: technician skill/location/arrival, SLA, status history, after-sales/event, maintenance, installed equipment, analytics/forecast/trend, sales record/lines.
- Stock: category, item, transaction ledger, reservation, service requirement, two-stage equipment return (`inventory/models.py`).
- Communication: support case/message, notification, ticket progress.

Lifecycle consistency uses serializer validation, model/database constraints, `transaction.atomic`, `select_for_update`, append-only ledgers/history, and immutable finalized records. Deletion is restricted for operationally referenced catalog data. Local, E2E, staging, and production data are intentionally different; migrations synchronize structure only. PostgreSQL-only race behavior is not proven by SQLite and belongs in the guarded staging gate.
