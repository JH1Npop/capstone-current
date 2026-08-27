# Software Development Lifecycle for the AFN Service Management System

This system follows an iterative Agile/Sprint-based Software Development Lifecycle. The work is organized around the actual service-management flow implemented in the codebase: client service requests, admin dispatching, technician job execution, after-sales support, notifications, audit logs, and operational analytics.

## Project Vision

The project aims to build a role-based service management platform for handling the complete after-sales and field-service process.

The system supports:

- Clients creating and tracking service requests.
- Admin and superadmin users approving requests, dispatching technicians, monitoring dashboards, and auditing activity.
- Technicians managing assigned jobs, schedules, checklists, proof uploads, and completion reports.
- After-sales handling follow-up cases, warranty concerns, maintenance schedules, and ticket-linked messages.
- Management reviewing reports, analytics, activity logs, inventory usage, and service performance.

## Release Planning

The release scope is based on the main workflow found in the system:

1. User account and role management.
2. Client service request creation and tracking.
3. Admin service ticket approval and dispatch.
4. Technician job handling and checklist completion.
5. Inventory reservation and equipment request support.
6. After-sales case and maintenance schedule management.
7. Notification and message communication.
8. Admin reports, analytics, and activity logs.

The core release goal is to make the service request lifecycle work from request creation up to completion, rating, and after-sales follow-up.

## Sprint

Each sprint focuses on one functional part of the platform and improves it through planning, design, implementation, testing, and review.

### Planning

Sprint planning identifies which system feature needs to be built or corrected.

Examples from the codebase:

- Service request workflow from client submission to admin approval.
- Service ticket assignment and technician scheduling.
- Technician checklist, proof upload, and job completion.
- After-sales messages connected to completed service tickets.
- Activity logs for admin and superadmin monitoring.
- Analytics period filtering for admin reports and dashboards.

### Design

The design phase defines the data models, API endpoints, and role-based pages needed for each feature.

Main model areas:

- `User`, technician profile, client profile, and role permissions.
- `ServiceRequest` for client requests.
- `ServiceTicket` for approved and assigned work.
- `ServiceStatusHistory` for ticket movement.
- `InspectionChecklist` for technician completion validation.
- `AfterSalesCase` and `MaintenanceSchedule` for post-service support.
- `InventoryItem`, reservations, and transactions for equipment/materials.
- `Notification`, `Message`, and `ActivityLog` for communication and auditing.

Main user interfaces:

- Admin/superadmin dashboard, service tickets, dispatch board, analytics, reports, activity logs, inventory, services, and user management.
- Client dashboard, service request form, request tracking, request detail, service history, notifications, profile, and after-sales messages.
- Technician dashboard, jobs, schedule, checklist, map/navigation, messages, job history, and profile.

### Implementation

Implementation is done through the Django REST backend and React frontend.

Backend responsibilities:

- Role-based API access.
- Service request and ticket workflow.
- Technician assignment and schedule handling.
- Checklist validation before job completion.
- After-sales case and maintenance schedule generation.
- Inventory reservation and transaction support.
- Notifications, messages, and activity logging.
- Dashboard, analytics, report, and calendar endpoints.

Frontend responsibilities:

- Role-specific dashboards and sidebars.
- Client request submission and tracking screens.
- Admin ticket management, dispatch, analytics, reports, and logs.
- Technician job handling, checklist completion, and proof submission.
- After-sales communication through ticket-linked messages.

### Testing

Testing verifies that the system features are connected to the correct backend data and that the main workflow is usable.

Tested areas include:

- Django system checks.
- Migration consistency checks.
- Admin analytics period behavior.
- Dashboard role data.
- Message permissions and ticket-linked after-sales messaging.
- Activity log creation.
- Frontend production build validation.

Important verified command results:

- Backend system check passed.
- Admin analytics tests passed.
- Frontend build passed.

### Deployment

The deployment phase prepares the system for demonstration and production-like usage.

Deployment preparation includes:

- Running backend checks and migrations.
- Building the React frontend.
- Confirming that Django API endpoints are available.
- Ensuring role-based access works for admin, superadmin, client, and technician users.
- Preparing demo data for service requests, tickets, technicians, inventory, after-sales cases, messages, notifications, and analytics.

## Review and Iteration

After each sprint, the system is reviewed for missing connections, unused modules, and inaccurate dashboard data.

Recent review findings from the codebase:

- Admin/superadmin flow is the strongest and most complete.
- Client and technician flows are usable and connected to the main service lifecycle.
- Activity logs are now connected to real system actions.
- Analytics periods now affect the relevant period-based data.
- Report cards now follow the filtered report rows.
- Some legacy or low-use tables such as older progress/history modules are cleanup candidates.
- Forecast and trend tables are available but should be presented as future enhancement unless fully used in the demo.

## Capstone Summary

The SDLC used for this project is suitable for a capstone because it shows a complete, iterative development process. The system was planned, designed, implemented, tested, and reviewed around a real service-management workflow rather than isolated pages.

The final system demonstrates:

- End-to-end service request management.
- Role-based dashboards and permissions.
- Technician dispatching and job completion validation.
- After-sales and maintenance continuity.
- Inventory and notification support.
- Admin reporting, analytics, and audit logs.

