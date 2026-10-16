# Backend

The backend is a Django/DRF modular monolith. `api/urls.py` mounts seven domain URL modules plus explicit health, public landing, geocode, tracking, dashboard, calendar, and technician compatibility routes. Forty-seven router registrations expose CRUD and custom `@action` endpoints.

Request processing is: Django middleware (security/CORS/auth/request ID/logging) -> URL/router -> DRF authentication/throttling/permission -> view/viewset -> serializer validation -> ORM transaction/row locks where required -> side effects -> serialized response. Core implementations are in `services/views/`, `services/serializers/`, `users/views/`, and the other app `views.py` files.

Important service layers include `services/auto_dispatch.py`, `sla.py`, `maintenance.py`, `document_generation.py`, `job_progress.py`, `solar_calculator.py`, `ors_utils.py`, `inventory/automation.py`, `notifications/notification_utils.py`, and `users/analytics_service.py`. Signals in users/services/inventory create related records or notifications; callers must account for those indirect effects. Errors use DRF responses plus project exception handling (`afn_service_management/exceptions.py`), while atomic operations rely on Django transactions.
