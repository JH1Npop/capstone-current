# Error Handling

DRF serializer errors return structured 400 responses; unauthenticated/unauthorized access returns 401/403, and ownership-hiding querysets may yield 404. Conflict/state/stock/idempotency decisions return explicit non-success responses from domain actions. `afn_service_management/exceptions.py` standardizes API handling; request-ID logging captures server errors without exposing secrets.

Critical multi-record workflows use atomic transactions and row locks, so validation or database exceptions roll back grouped writes. Duplicate request keys and unique constraints prevent repeated creation. Frontend pages use loading/error/empty states and typically refresh only after successful mutation; notification state retains its last known snapshot during transient failures. Some network actions are manually retryable; there is no global offline mutation queue.

External routing, analytics explanation, and settings can degrade to bounded/local behavior where explicitly implemented. Email delivery, Cloudinary, Redis, and PostgreSQL are production dependencies and cause readiness or operation failure rather than fabricated success. Concurrency differences between SQLite and PostgreSQL remain an environment-specific risk.
