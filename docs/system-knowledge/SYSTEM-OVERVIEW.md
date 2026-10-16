# System Overview

**CONFIRMED.** AFN Serve is a role-based solar/service operations portal. Clients register, verify email, estimate solar needs, submit and track service requests, view service/purchase history, and contact support. Administrators manage approvals, service catalog, dispatch, schedules, inventory, documents, after-sales cases, analytics, reports, users, public content, and audit activity. Technicians receive work, navigate, report arrival, complete evidence/checklists, communicate, return equipment, and view schedules/history.

The system is a modular monolith: a React single-page application calls a Django REST API; Django apps share one relational database and transaction boundary. Channels adds messaging/inventory WebSockets. External services are optional or environment-dependent: PostgreSQL, Redis, Cloudinary, OpenRouteService, Brevo/SMTP, Gemini, OSM tiles, and PSGC address data. See `frontend/src/App.jsx`, `backend/api/urls.py`, `backend/afn_service_management/asgi.py`, and `backend/afn_service_management/settings.py`.

Success means verified users can move a request through approval, ticket scheduling/assignment, field execution, completion, documents/inventory reconciliation, history, analytics, and after-sales without crossing ownership/capability boundaries. No in-system payment processing exists; Sales/Purchase Records are operational delivery records (`backend/services/models/sales.py`).

The strongest current evidence is local automated validation recorded in `docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md`. Full production readiness is **UNVERIFIED** until the external-provider, disposable PostgreSQL concurrency/restore, scheduler, monitoring, security, and UAT gates listed in [KNOWN-LIMITATIONS.md](KNOWN-LIMITATIONS.md) are completed.
