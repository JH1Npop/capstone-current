# Connected Capstone Models Blueprint

This blueprint keeps all Chapter III models consistent with the actual AFN Service Management System codebase. Use this as the shared reference before creating diagrams in Mermaid, Draw.io, Lucidchart, Google Docs, or any other tool.

## Main System Story

The system is a role-based service management platform for handling the full service lifecycle:

Client submits a service request -> Admin or superadmin reviews and approves -> A service ticket is created -> Technician is assigned and performs the job -> Technician completes checklist and proof upload -> Client tracks and rates the service -> After-sales cases, maintenance schedules, messages, notifications, reports, analytics, and activity logs support the continuing workflow.

All models should connect back to this same flow.

## Shared Actors

Use the same actors across all diagrams:

- Client
- Technician
- Admin
- Superadmin
- System

Optional supporting actor:

- After-Sales Staff, only if you want to show after-sales as a separate responsibility. In the current codebase, after-sales functions are mainly handled through admin/superadmin capabilities.

## Shared Core Modules

Use these modules consistently:

- User Account and Role Management
- Client Service Request Management
- Service Ticket Management
- Technician Dispatch and Scheduling
- Technician Job Checklist and Proof Submission
- Inventory and Equipment Request Management
- After-Sales Case Management
- Maintenance Scheduling
- Messaging and Notifications
- Reports and Analytics
- Activity Logs and Audit Trail

## Shared Core Data Models

Use these entities in ERD, DFD data stores, and architecture descriptions:

- User
- ServiceRequest
- ServiceTicket
- ServiceStatusHistory
- InspectionChecklist
- InventoryItem
- InventoryReservation
- InventoryTransaction
- AfterSalesCase
- MaintenanceSchedule
- Message
- Notification
- ActivityLog
- ServiceType
- ServiceLocation

## Model Set To Create

The models should be created as a connected set, not as isolated diagrams.

### 1. Software Development Lifecycle Model

Reference style: the Google Doc uses a Scrum-Inspired Agile Development Model.

Use these phases:

- Project Vision
- Release Planning
- Sprint Planning
- Implementation / Sprint Execution
- Daily Scrum
- Sprint Review
- Sprint Retrospective
- Deployment

Connection to system:

- Project Vision identifies the need for centralized service request, technician dispatch, after-sales, and reporting support.
- Release Planning groups the system into admin, client, technician, after-sales, inventory, reports, analytics, and audit modules.
- Sprint Planning selects features such as request submission, ticket approval, technician assignment, checklist completion, and after-sales messaging.
- Implementation builds Django REST APIs and React role-based pages.
- Daily Scrum reviews blockers such as disconnected cards, wrong counts, missing backend links, and unfinished flows.
- Sprint Review validates working modules with admin, client, and technician workflows.
- Sprint Retrospective identifies cleanup candidates and improvements.
- Deployment prepares migrations, frontend build, demo data, and role-based testing.

### 2. Use Case Diagram

The use case diagram should show what each actor can do.

Client:

- Register and log in
- Create service request
- Track request and ticket status
- Request reschedule
- View service history
- Send ticket-linked after-sales message
- Receive notifications
- Submit service rating and feedback

Technician:

- Log in
- View assigned jobs
- View schedule
- Update job status
- Complete checklist
- Upload proof
- Request additional equipment
- View job history
- Send or receive messages

Admin:

- Manage users
- Approve service requests
- Create and assign service tickets
- Monitor dispatch board
- Manage services and inventory
- View reports and analytics
- Handle after-sales cases
- View activity logs
- Send and receive messages

Superadmin:

- Full admin access
- Manage admin users and permissions
- View full activity logs and system reports

### 3. Data Flow Diagram

The DFD should use the same flow as the system:

External entities:

- Client
- Technician
- Admin/Superadmin

Main processes:

- Manage User Access
- Manage Service Requests
- Manage Service Tickets and Dispatch
- Process Technician Job Completion
- Manage Inventory Usage
- Manage After-Sales and Maintenance
- Manage Messages and Notifications
- Generate Reports, Analytics, and Activity Logs

Data stores:

- Users
- Service Requests
- Service Tickets
- Checklists
- Inventory
- After-Sales Cases
- Maintenance Schedules
- Messages
- Notifications
- Activity Logs
- Reports and Analytics

### 4. Entity Relationship Diagram

The ERD should focus on the mainstream database entities, not every legacy or unused table.

Recommended relationships:

- User has many ServiceRequests as client.
- ServiceRequest belongs to ServiceType.
- ServiceRequest has one ServiceLocation.
- ServiceRequest has many ServiceTickets.
- ServiceTicket belongs to ServiceRequest.
- ServiceTicket belongs to User as technician.
- ServiceTicket has many ServiceStatusHistory records.
- ServiceTicket has one InspectionChecklist.
- ServiceTicket has many InventoryReservations.
- InventoryReservation belongs to InventoryItem.
- InventoryItem has many InventoryTransactions.
- ServiceTicket has many AfterSalesCases.
- ServiceTicket has one MaintenanceSchedule.
- User has many Messages as sender.
- Message may belong to ServiceTicket.
- User has many Notifications.
- User has many ActivityLogs as actor.

### 5. Deployment Diagram

Use the Google Doc deployment section as reference, but replace its project details.

Recommended nodes:

- User Devices
  - Client browser
  - Technician browser/mobile browser
  - Admin/superadmin browser
- Frontend Web Application
  - React
  - Vite build/static frontend
- Backend Application Server
  - Django
  - Django REST Framework
  - Authentication and role permissions
- Database Server
  - SQLite/development database or production database, depending on final deployment
- Media/File Storage
  - proof uploads
  - service images
  - generated/exported reports
- External Services
  - email
  - optional push notifications
  - optional map/routing service

### 6. System Workflow Model

This model should show the complete business process:

1. Client creates service request.
2. Admin reviews and approves request.
3. System creates or connects service ticket.
4. Admin assigns technician and schedule.
5. Technician views job.
6. Technician starts work.
7. Technician completes checklist and uploads proof.
8. System marks ticket completed.
9. Client views completed service and submits feedback.
10. System creates after-sales or maintenance records when needed.
11. Admin monitors reports, analytics, notifications, and activity logs.

## Consistency Rules

Use these rules so the models stay connected:

- Use the same actor names in every model.
- Use `ServiceRequest` for client-submitted requests.
- Use `ServiceTicket` for approved/assigned work.
- Use `InspectionChecklist` for technician completion validation.
- Use `AfterSalesCase` for post-service complaints, warranty, revisit, and follow-up concerns.
- Use `MaintenanceSchedule` for future maintenance reminders.
- Use `Message` only for communication, not as a replacement for after-sales cases.
- Use `ActivityLog` for admin/superadmin audit trail.
- Do not center the models around old cleanup candidates such as `progress_ticketprogress` or `history_servicehistory`.
- Forecast and trend tables may be mentioned as analytics enhancement, but they should not be the center of the main system model unless fully used in the final demo.

## Recommended Diagram Order

Create the models in this order:

1. System Workflow Model
2. Use Case Diagram
3. Data Flow Diagram
4. Entity Relationship Diagram
5. Deployment Diagram
6. Software Development Lifecycle Model

This order keeps the models consistent because the workflow defines the story, the use case defines actor actions, the DFD defines data movement, the ERD defines data storage, the deployment diagram defines where it runs, and the SDLC explains how it was developed.

