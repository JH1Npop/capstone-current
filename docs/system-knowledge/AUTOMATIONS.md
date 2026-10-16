# Automations and Integrations

There is no embedded task queue. Thirteen commands in `backend/services/management/commands/` implement auto-assignment, SLA checks, daily analytics, demand forecasts, technician performance, location purge, availability reconciliation, maintenance alerts, request-ticket synchronization, grouped operational runs, and controlled seed/inspection utilities. `automation/run_operational_automations.ps1` and Task Scheduler documentation invoke them externally. Production must schedule frequent (30-minute) and daily modes; otherwise they do not run.

Signals in `users/signals.py`, `services/signals.py`, and `inventory/signals.py` perform event-adjacent updates. Channels provides WebSocket delivery; Redis is required for multiprocess production. Email uses Django backends (Brevo HTTPS or SMTP). Cloudinary stores durable uploads. ORS supports routing; OSM supplies tiles; Gemini can explain analytics with local fallback; PSGC supplies registration address hierarchy.

Retries are provider/command-specific, not a unified durable retry system. Failures are logged and generally leave database transactions rolled back where atomic; external side effects can require operator retry. Scheduler overlap prevention and provider monitoring are deployment responsibilities.
