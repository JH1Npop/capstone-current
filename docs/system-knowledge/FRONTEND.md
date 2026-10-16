# Frontend

`frontend/src/App.jsx` declares all routes, lazy-loads pages, and wraps protected destinations in role/capability checks. `AuthContext.jsx` owns token/user bootstrap and session actions; `NotificationContext.jsx` owns unread state, polling, and mutations. `Layout.jsx`, `Sidebar.jsx`, and `Topbar.jsx` form the authenticated shell. `rbac.js` mirrors backend capability names for UX gating; it is not the security boundary.

API modules separate consumers by domain (`api/admin.js`, `client.js`, `communications.js`, `core.js`, `services.js`, `site.js`, `technician.js`) over the configured Axios client. Pages generally hold local loading/error/filter/modal state and refresh from API responses after mutations. Maps use Leaflet and shared tile/region utilities; charts use Recharts; PWA registration/offline behavior lives in `pwa.js`, `public/sw.js`, and hooks.

Canonical route coverage is 8 public/auth, 26 admin, 10 technician, and 10 client pages. Redirect-only supervisor and old directory aliases exist. Exact route-to-capability mapping is maintained in `docs/security/ROUTE_API_CAPABILITY_MATRIX.md`; functional consumers are covered across `e2e/01` through `09` specs. A rendered button is not proof of successful behavior; backend permissions, validation, and recorded E2E evidence remain decisive.
