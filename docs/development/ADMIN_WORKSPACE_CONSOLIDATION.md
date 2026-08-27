# Admin Workspace Consolidation

## Purpose

After-sales and supervisor workflows are no longer separate management workspaces. Their operational capabilities now live inside the `admin` and `superadmin` dashboard/workspace.

This keeps management ownership simple:

- `superadmin` owns platform control, access, and all management capabilities.
- `admin` runs operations from the admin workspace when granted the needed capabilities.
- `technician` keeps the field-work workspace.
- `client` keeps the customer workspace.

## What Moved Into Admin

### After-Sales

After-sales case work is now accessed from:

```text
/admin/after-sales-cases
```

The admin dashboard also shows after-sales summary metrics:

- total cases
- open cases
- overdue cases
- resolved this week
- recent cases

Old compatibility routes redirect:

```text
/follow-up/dashboard -> /admin/dashboard#after-sales
/follow-up/cases     -> /admin/after-sales-cases
```

### Supervisor / Team Management

Supervisor-style operations are now accessed through admin routes:

```text
/admin/dashboard
/admin/service-tickets
/admin/dispatch-board
/admin/technician-tracking
/admin/user-management
```

Old compatibility routes redirect:

```text
/supervisor/dashboard            -> /admin/dashboard
/supervisor/service-tickets      -> /admin/service-tickets
/supervisor/dispatch-board       -> /admin/dispatch-board
/supervisor/technician-tracking  -> /admin/technician-tracking
/supervisor/user-access          -> /admin/user-management
```

## Frontend Source Of Truth

Primary files:

```text
frontend/src/App.jsx
frontend/src/components/layout/Sidebar.jsx
frontend/src/components/layout/Topbar.jsx
frontend/src/pages/admin/AdminDashboard.jsx
frontend/src/pages/follow_up/FollowUpCases.jsx
```

Removed old workspace pages:

```text
frontend/src/pages/follow_up/FollowUpDashboard.jsx
frontend/src/pages/shared/SharedOperationsDashboard.jsx
frontend/src/pages/supervisor/DispatchBoard.jsx
frontend/src/pages/supervisor/SupervisorDashboard.jsx
frontend/src/pages/supervisor/SupervisorTracking.jsx
frontend/src/rbac_updated.js
```

`FollowUpCases.jsx` remains because it is reused as the admin-owned after-sales case queue.

## Backend Source Of Truth

Primary files:

```text
backend/services/views_dashboard.py
backend/services/views_follow_up.py
backend/users/permissions.py
backend/users/views/auth.py
backend/users/serializers.py
```

Important behavior:

- `DashboardView` returns the admin dashboard for admin/superadmin management requests.
- `role=supervisor`, `role=follow_up`, and `role=aftersales` dashboard requests no longer create separate management dashboards for non-admin roles.
- After-sales case APIs remain available to admin/superadmin through the existing service endpoint.
- User and request management permissions now prefer admin workspace ownership.

## Capability Direction

Keep the capability concepts, but assign management-facing capabilities to admin/superadmin accounts instead of creating separate supervisor or follow-up workspaces.

Examples:

- after-sales case view/manage capability belongs inside the admin workspace.
- dispatch, ticket queue, and technician tracking belong inside admin operations.
- user capability management remains a superadmin-level control.

## Verification

The consolidation was checked with:

```bash
npm run build
python manage.py check
```

Both completed successfully. The larger Django test run for `users services` timed out in the tool window and should be rerun locally when updating test expectations.

## Follow-Up Cleanup

Remaining cleanup tasks:

1. Consider a database migration or admin script to convert old `follow_up` and `supervisor` users into `admin` users with appropriate capabilities, if existing production data contains those roles.
2. Keep database fields such as `ServiceTicket.supervisor` only if they still serve assignment/audit history; otherwise plan a separate schema cleanup.
