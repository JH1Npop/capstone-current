# System Knowledge Index

Evidence date: 2026-10-08. This directory is a navigation layer over the current source and the repository's specialist contracts. `CONFIRMED` means directly supported by source, migrations, tests, or recorded safe validation; it does not mean production behavior was re-executed during this read-only investigation.

Start with [SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md), then use:

- Architecture and startup: [ARCHITECTURE.md](ARCHITECTURE.md), [TECH-STACK.md](TECH-STACK.md), [DEPLOYMENT.md](DEPLOYMENT.md)
- Code ownership: [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md), [MODULES.md](MODULES.md), [DEPENDENCIES.md](DEPENDENCIES.md)
- Interfaces: [FRONTEND.md](FRONTEND.md), [BACKEND.md](BACKEND.md), [API-MAP.md](API-MAP.md)
- Data and behavior: [DATABASE.md](DATABASE.md), [DATA-FLOWS.md](DATA-FLOWS.md), [WORKFLOWS.md](WORKFLOWS.md), [BUSINESS-RULES.md](BUSINESS-RULES.md)
- Operations and assurance: [AUTOMATIONS.md](AUTOMATIONS.md), [ANALYTICS.md](ANALYTICS.md), [SECURITY.md](SECURITY.md), [ERROR-HANDLING.md](ERROR-HANDLING.md), [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md)
- Access and future change: [USER-ROLES.md](USER-ROLES.md), [CHANGE-IMPACT-MODEL.md](CHANGE-IMPACT-MODEL.md)

Coverage: 8 backend domain apps, 51 active model classes, 47 DRF router registrations, 54 canonical UI destinations (8 public/auth, 26 admin, 10 technician, 10 client), 13 service management commands, and 12 cross-layer workflow families. Route declarations include aliases and redirects and therefore exceed the 54 canonical destinations. Detailed field/cardinality evidence remains in `docs/models/ERD_CURRENT.md`, `docs/models/ERD_CURRENT_CONNECTIONS.md`, and `docs/architecture/DB_DIAGRAM_CAPSTONE.dbml`.

Primary evidence: `frontend/src/App.jsx`, `frontend/src/api/`, `frontend/src/rbac.js`, `backend/*/urls.py`, `backend/*/models.py`, `backend/services/models/`, `backend/*/views.py`, `backend/services/views/`, `backend/afn_service_management/settings.py`, migrations, tests, and `docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md`.
