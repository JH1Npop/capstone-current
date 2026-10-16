# Architecture

```text
Browser/PWA -> React Router + Auth/Notification contexts -> Axios API clients
            -> Django URL routers -> DRF views/viewsets -> serializers/services
            -> shared relational DB (SQLite dev/test; PostgreSQL staging/prod)
            -> notifications/audit/history/inventory/document side effects
Browser <-> Channels WebSockets <-> in-memory local layer or Redis production
Django -> Cloudinary, email provider, ORS, Gemini (optional/configured)
```

**CONFIRMED:** `frontend/src/main.jsx` mounts the SPA; `frontend/src/App.jsx` lazy-loads pages and enforces role/capability navigation. `backend/manage.py`, `afn_service_management/wsgi.py`, and `asgi.py` are backend entry points. ASGI combines Django HTTP with token/session-authenticated Channels routes from `messages_app/routing.py` and `inventory/routing.py`. `api/urls.py` composes all domain APIs; DRF viewsets own orchestration, serializers validate payloads, and Django models own persistence.

The architecture is layered but not strictly isolated: `services` is the central domain and imports users, inventory, notifications, and messaging concerns. Signals and helper functions create cross-module side effects. Changes to ticket/request state are therefore high-impact. Deployment can serve split static frontend/backend (Render) or Django's built frontend fallback; Docker Compose is development-shaped, not a hardened production frontend.
