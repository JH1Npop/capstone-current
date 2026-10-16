# End-to-End Workflows

Twelve significant workflow families were traced through routes, viewsets/models, frontend consumers, tests, and current contracts:

1. Account registration -> email verification -> token login -> optional admin MFA -> role landing (`Register.jsx`, `users/views/auth.py`).
2. Password reset and pending email change through the configured email backend.
3. Client solar calculation -> saved estimate -> optional project/profile promotion.
4. Client/admin walk-in service request -> validation/idempotency -> approval/rejection/cancel -> ticket creation.
5. Dispatch -> ranked/manual technician and crew assignment -> equipment reservation -> calendar/schedule updates.
6. Technician navigation -> GPS/arrival validation -> work start -> checklist/evidence -> completion/review.
7. Stock receive/correct/reserve/issue -> ticket use -> technician return declaration -> warehouse verification.
8. Document prefill/draft/generation/finalization across quotation, contract, commissioning, turnover, data sheet, and FSR.
9. Completed delivery -> Sales Record preparation/confirmation -> client Purchase Record visibility.
10. Completed/turned-over equipment -> maintenance schedule/warranty -> after-sales case -> resolve/reopen timeline.
11. Direct messaging/client support -> participant-scoped messages -> notifications/WebSockets -> read state.
12. Operational records -> dashboards/reports/analytics/forecasts -> administrator decisions.

The common execution shape is UI action -> domain API module -> authenticated request -> router/permission -> serializer/business transaction -> database plus audit/notification/history side effects -> response -> local refresh/context update. Failures keep the prior UI state, surface server messages where handled, and rely on atomic rollback for grouped database mutations. Exact recovery differs by flow; no generic retry queue exists.
