# Change Impact Model

| Change area | Inspect first | Likely regression surface |
| --- | --- | --- |
| Identity/auth/MFA | `users/models.py`, serializers, `views/auth.py`, permissions, AuthContext | all routes/APIs, email, sessions/tokens, Django admin |
| Roles/capabilities | `users/rbac.py`, permissions, `frontend/src/rbac.js`, App/sidebar | route/API parity, object visibility, tests |
| Requests/tickets | service models, serializers, request/ticket views/helpers | dispatch, inventory, evidence, history, notifications, analytics |
| Scheduling/dispatch | `auto_dispatch.py`, ticket actions, calendar/dashboard | technician capacity, overlap, routes, reservations |
| Inventory | inventory models/automation/views | stock math, ticket equipment, returns, dashboards |
| Documents/sales | document/sales models, serializers/views, templates | immutable records, client history, exports/media |
| Messaging/notifications | models/views/consumers/context | privacy, realtime delivery, badges/deep links |
| Analytics/reports | analytics service/views/commands/models | formulas, date zones, filters, forecast gates |
| Deployment/settings | settings, health, env examples, Render/scripts | startup safety, DB/media/cache/email, CORS/HTTPS |

For every change: identify model fields and migrations; endpoint and serializer contracts; permissions and ownership; frontend API consumer/routes; side effects/signals; scheduler/provider dependencies; and relevant unit/API/E2E tests. Run checks proportionate to risk, preserve the dirty worktree, and update the living handoff. PostgreSQL-specific behavior needs PostgreSQL evidence; a passing SQLite test is not equivalent.
