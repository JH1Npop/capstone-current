# Business Rules and States

The canonical request and ticket transition tables are `docs/security/WORKFLOW_STATE_MACHINES.md`; enforcement is concentrated in `services/views/service_requests.py`, `services/views/tickets.py`, serializers, and helpers.

- Requests begin pending and may be approved, rejected with meaningful evidence, or client-cancelled. Approval is locked/idempotent and creates/synchronizes the operational ticket once.
- Tickets move through not-started/assignment, navigation/arrival, work, inspection review where applicable, completion, cancellation, and rescheduling. Central transitions require normalized audit evidence; invalid transitions are rejected.
- Assignment requires service skill, availability, daily duration capacity, no concrete-time overlap, location fitness, and score above the dispatch threshold. The selected technician is revalidated under row lock.
- Regular job completion requires completion evidence/photo. Inspection work follows its dedicated checklist/review evidence path. Completion creates history/progress and feeds documents, analytics, after-sales, maintenance, sales eligibility, and client views.
- Inventory distinguishes physical, reserved, and available stock. Movements are append-only; partial reservations are supported; verified usable returns alone restore stock.
- Finalized documents and confirmed Sales Records are immutable. Voids/replacements require reasoned evidence. Purchase Records never represent payment state.
- After-sales cases have controlled assignment, response deadline, resolution reason, reopen reason, and append-only events.
- Public projects require publication state, complete data/photo, and client consent.

Rules duplicated in the frontend are guidance only; backend validation is authoritative.
