# Module Inventory

| Module | Owns | Depends on / affects |
| --- | --- | --- |
| `users` | identity, profiles, auth/MFA, capability grants, settings, audit | all authenticated modules; email and public site |
| `services` | request-to-ticket lifecycle, dispatch, field evidence, documents, after-sales, analytics, sales | users, inventory, notifications, messages, progress, external routing/media |
| `inventory` | catalog, balances, reservations, movements, returns | service types/tickets, technicians, realtime updates |
| `messages_app` | direct/staff messages and customer support cases | users, tickets, notifications, Channels |
| `notifications` | user-owned alerts and read state | mutations across services/inventory/messages |
| `progress` | persisted ticket progress | tickets and technician UI |
| `api` | public/health/geocode/tracking facade and route composition | all apps plus ORS/landing settings |
| `history` | migration-only compatibility shell | no active runtime model |

Frontend modules mirror user workspaces rather than backend app boundaries. Shared components connect tickets, timelines, calendars, inspections, quotations, returns, and support across roles. This creates intentional UI reuse but means changing a shared dialog or API serializer can regress several workspaces.
