Act as a senior full-stack software architect, QA engineer, security reviewer, and codebase auditor. Your first objective is to completely understand this system end to end—every module, route, model, API, page, role, workflow, dependency, and configuration—before making any changes.

This is an AFN Solar Power Engineering Services management system. Its main roles are:

* Superadmin
* Admin
* Technician
* Client

The system may include:

* Django and Django REST Framework backend
* React + Vite frontend
* Mobile/PWA-related functionality
* SQLite during development and PostgreSQL for production
* Authentication and role-based access control
* Service requests and ticketing
* Technician assignment and dispatching
* Calendar and scheduling
* Technician location history and maps
* OpenRouteService or another routing provider
* Inventory management
* Inspection and completion checklists
* SLA monitoring
* After-sales cases
* Maintenance schedules
* Messaging
* Notifications
* Analytics and forecasting
* Reports
* User and client management
* Activity logs

Do not assume that these descriptions perfectly match the code. Treat the actual repository as the source of truth and report any differences.

## Important operating rules

1. Do not edit, delete, rename, format, migrate, install, or generate anything during the discovery and audit stages.
2. Do not immediately fix the first problem you find.
3. Inspect the entire repository before reaching conclusions.
4. Read all relevant source and configuration files, but ignore generated or dependency folders such as:

   * node_modules
   * .git
   * dist
   * build
   * coverage
   * **pycache**
   * .venv or venv
   * compiled assets
5. Never reveal secret values from `.env`, credentials, tokens, private keys, database passwords, or API keys. Only report whether expected variables exist, are missing, duplicated, incorrectly named, or insecurely exposed.
6. Preserve all existing user changes and inspect the Git worktree before proposing edits.
7. Do not use destructive Git commands.
8. Clearly distinguish:

   * Confirmed issue
   * Likely issue
   * Improvement
   * Intentional behavior
   * Unable to verify
9. Cite exact file paths and relevant symbols, functions, classes, routes, or components for every finding.
10. Do not claim that something works unless you have traced or tested it.
11. If a command fails, investigate the cause instead of ignoring it.
12. Avoid changing database records or calling real external services during testing.

## Phase 1 — Repository discovery

Start by examining the project structure and Git state.

Identify:

* Root-level applications and services
* Frontend, backend, mobile, scraper, worker, or supporting projects
* Programming languages and frameworks
* Package managers
* Entry points
* Environment templates
* Build and development scripts
* Docker configuration
* CI/CD workflows
* Test frameworks
* Database and migration structure
* Documentation
* Generated files that should not be audited directly
* Untracked, modified, staged, or ignored files
* Suspicious temporary files, logs, duplicate projects, or abandoned code

Create a concise repository map showing each major directory, its purpose, and how it connects to the rest of the system.

## Phase 2 — Build a complete system inventory

Create an inventory of the following:

### Backend

* Django apps or backend modules
* Models and relationships
* Serializers or schemas
* Views, viewsets, controllers, and services
* URL patterns and API endpoints
* Authentication and authorization classes
* Permissions
* Middleware
* Signals
* Background jobs and scheduled tasks
* Notification services
* Analytics or forecasting code
* External API integrations
* Management commands
* Tests
* Database migrations

For every endpoint, record:

* HTTP method
* URL
* Backend handler
* Required authentication
* Allowed roles
* Request fields
* Response structure
* Main frontend consumer
* Whether it appears active, unused, duplicated, or broken

### Frontend

* Application entry points
* Route definitions
* Layouts and navigation
* Pages
* Components
* Context providers and state management
* API clients and service modules
* Authentication flow
* Role redirects and route guards
* Forms and validation
* Tables, filters, pagination, and search
* Maps and location features
* Charts and analytics
* Notifications and messaging
* Error, loading, and empty states
* Tests

For every page, record:

* Route
* Intended role
* Main components
* APIs used
* Important user actions
* Loading and error handling
* Current implementation status

### Database

Create a database relationship map containing:

* Every table or model
* Primary keys
* Foreign keys
* One-to-one, one-to-many, and many-to-many relationships
* Nullable fields
* Unique constraints
* Status and role values
* Cascade behavior
* Indexes
* Derived or calculated values
* Possible orphaned records
* Model/migration/schema mismatches

Do not generate a new migration during this stage.

## Phase 3 — Trace all end-to-end workflows

Trace each important workflow from the user interface through the API and database, then back to the displayed result.

At minimum, verify:

1. Registration, login, logout, token/session refresh, and current-user loading
2. Role-based redirection for all four roles
3. Client creation of a service request
4. Automatic generation of the related ticket
5. Admin viewing unassigned tickets
6. Technician assignment
7. Skill, location, schedule, and daily-hour validation
8. Technician accepting or rejecting a job
9. Ticket status changes and status-history creation
10. Calendar display of assigned and unassigned jobs
11. Technician availability while on a job
12. Location recording and location-history retrieval
13. Map markers, route preview, and heatmap filters
14. Checklist availability only after assignment
15. Inventory reservation, usage, stock deduction, and low-stock alerts
16. Ticket completion
17. After-sales case creation and job-history access
18. Maintenance schedule creation
19. Messaging between the correct participants
20. Email, SMS, and in-app notifications
21. Analytics period filters and chart data
22. Predictive service and inventory demand
23. Report generation and filtering
24. Activity-log creation and visibility
25. User-management operations
26. Client, technician, and service CRUD operations

For each workflow, document:

* Starting role and page
* UI action
* Frontend function
* API request
* Backend route and handler
* Permission check
* Database reads and writes
* Side effects
* Returned response
* UI update
* Failure cases
* Final status: Working, Partially working, Broken, Unused, or Unable to verify

## Phase 4 — Frontend/backend contract audit

Compare the frontend and backend directly.

Check for:

* Frontend URLs that do not exist in the backend
* Backend endpoints unused by the frontend
* Duplicate endpoint families
* Incorrect HTTP methods
* Request-field mismatches
* Response-field mismatches
* Naming mismatches such as `text` versus `message_text`
* Incorrect identifier types
* Missing pagination handling
* Incorrect query parameters
* Broken filters
* Incorrect enum or status values
* Date and timezone inconsistencies
* Null and undefined handling
* File-upload mismatches
* Authentication headers not being attached
* Token refresh loops
* Redirect loops
* Race conditions while loading the current user
* React dependency-array problems
* Infinite render or maximum-update-depth risks
* Invalid hook usage
* Hardcoded mock data where database data is expected

Create a contract mismatch table with frontend location, backend location, expected behavior, actual behavior, severity, and recommended fix.

## Phase 5 — Authorization and security audit

Build a permissions matrix for every role and major resource.

Verify both frontend restrictions and backend enforcement. Hiding a button is not sufficient authorization.

Check for:

* Broken object-level authorization
* Clients accessing another client’s records
* Technicians accessing jobs not assigned to them
* Admin and superadmin permission inconsistencies
* After-sales job history incorrectly denied to admin or superadmin
* Unauthorized status updates
* Privilege escalation through request payloads
* Insecure direct-object references
* Missing input validation
* Unsafe file uploads
* Exposed secrets
* Debug configuration used in production
* Unsafe CORS or allowed-host settings
* Missing CSRF protection where applicable
* SQL injection risks
* Cross-site scripting risks
* Rate-limiting gaps
* Sensitive information in logs
* Weak password or authentication behavior
* Missing audit records for important actions

Do not perform destructive, intrusive, or exploitative security testing.

## Phase 6 — Data and business-rule validation

Verify that the code consistently enforces the intended business rules, including:

* Maximum eight scheduled work hours per technician per day
* No overlapping assignments
* A technician marked “On Job” is unavailable
* Only qualified technicians can be assigned
* Assigned and unassigned tickets are correctly separated
* Assignment logs identify the technician and assigning admin
* SLA deadlines and breaches are calculated correctly
* Ticket statuses follow a valid transition sequence
* Checklists are visible only when the job is assigned
* Inventory cannot silently become negative
* Completed jobs correctly trigger related processes
* After-sales records remain linked to job history
* Analytics respond to the selected date period
* Services displayed in the frontend come from the database
* Time handling consistently uses Asia/Manila when that is the configured business timezone

Report where each rule is enforced. Flag rules enforced only by the frontend.

## Phase 7 — Code-quality and maintainability audit

Check for:

* Dead and unreachable code
* Duplicate models, routes, serializers, components, or utilities
* Circular imports
* Oversized modules
* Business logic placed in UI components
* Repeated API logic
* Inconsistent naming
* Missing type definitions
* Excessive use of `any`
* Unhandled promises
* Silent exception handling
* Debug statements
* Hardcoded URLs, IDs, roles, or credentials
* N+1 database queries
* Missing database indexes
* Inefficient repeated requests
* Memory leaks
* Stale dependencies
* Missing cleanup for timers, subscriptions, or map objects
* Accessibility issues
* Poor mobile responsiveness
* Incomplete loading, error, and empty states

Do not propose large rewrites when a focused correction is sufficient.

## Phase 8 — Safe verification

After understanding the system, run the safest applicable checks using the project’s existing commands:

* Backend framework validation
* Migration consistency check without creating migrations
* Backend tests
* Frontend linting
* Type checking
* Frontend tests
* Production builds
* Dependency validation
* Existing end-to-end tests

Before running servers, inspect scripts and confirm ports and required services. Do not connect to or modify a production database.

If the repository lacks tests, state this clearly. Do not treat successful compilation as proof that workflows work.

## Phase 9 — Final deliverables

Do not edit the code yet. First present a complete audit containing:

### 1. Executive summary

Explain what the system does, its architecture, overall condition, and the most serious risks.

### 2. System map

Show how the frontend, backend, database, external services, and user roles interact.

### 3. Module inventory

List every major module and classify it as:

* Complete
* Partial
* Broken
* Unused
* Duplicate
* Unable to verify

### 4. Route and endpoint inventory

List frontend routes and backend APIs, including roles and consumers.

### 5. Role-permission matrix

Show what each role can view, create, update, delete, assign, approve, or manage.

### 6. Workflow results

Provide the status and trace for every end-to-end workflow.

### 7. Findings table

For every finding, include:

* ID
* Severity: Critical, High, Medium, Low, or Informational
* Confidence
* Category
* Description
* User impact
* Evidence
* Exact files or symbols involved
* Recommended fix
* Estimated effort
* Dependencies on other fixes

### 8. Test and command results

List every command run, whether it passed, and the important output. Do not dump irrelevant logs.

### 9. Prioritized remediation plan

Group work into:

* Immediate blockers
* Security and data-integrity fixes
* Broken workflows
* Contract and integration fixes
* User-interface fixes
* Performance improvements
* Cleanup and maintainability
* Missing tests

Order fixes based on dependencies and risk, not merely file order.

### 10. Open questions

Ask only questions that cannot be answered by inspecting the repository.

### 11. Proposed implementation batches

Divide the fixes into small, reviewable batches. For each batch, state:

* Scope
* Files likely affected
* Expected behavior
* Tests required
* Risk
* Rollback approach

Stop after presenting the audit and plan. Wait for my approval before modifying any files.

## Standard of evidence

Your audit must be based on actual code inspection and command results. Avoid generic recommendations. A useful finding should look like:

“Confirmed: the frontend sends `text` from `[frontend file and function]`, but the backend expects `message_text` in `[serializer/view file and symbol]`. This causes message creation to return a validation error.”

An unacceptable finding would be:

“The messaging feature might have frontend/backend problems.”

Be thorough, systematic, and skeptical. The goal is to understand every reachable part of the system, expose hidden inconsistencies, and produce a reliable map that another developer could use to maintain the entire application.
# AFN Current ERD — Complete Text Edition

This is the complete readable ERD derived from `AFN_ERD.dbml`.

- Entities: **51**
- Attributes: **676**
- Relationships: **102**

## Entity and Attribute Catalog

`pk` marks a primary key, `ref` marks a foreign key, `unique` marks a unique value, and `not null` marks a required value.

### Analytics

#### 1. SERVICE ANALYTICS

Database table: `services_serviceanalytics`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_analytics_id` | `bigint` | `pk, increment` |
| `date` | `date` | `not null` |
| `service_type_id` | `bigint` | `ref: > services_servicetype.service_type_id` |
| `total_requests` | `integer` | `not null` |
| `completed_requests` | `integer` | `not null` |
| `pending_requests` | `integer` | `not null` |
| `cancelled_requests` | `integer` | `not null` |
| `avg_response_time_hours` | `double` | `not null` |
| `avg_completion_time_hours` | `double` | `not null` |
| `technician_utilization_rate` | `double` | `not null` |
| `service_area_coverage` | `double` | `not null` |
| `popular_locations` | `text` | `not null` |
| `satisfaction_score` | `double` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 2. TECHNICIAN PERFORMANCE

Database table: `services_technicianperformance`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_performance_id` | `bigint` | `pk, increment` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `date` | `date` | `not null` |
| `tickets_assigned` | `integer` | `not null` |
| `tickets_completed` | `integer` | `not null` |
| `tickets_pending` | `integer` | `not null` |
| `total_work_hours` | `double` | `not null` |
| `avg_response_time_hours` | `double` | `not null` |
| `avg_completion_time_hours` | `double` | `not null` |
| `customer_satisfaction` | `double` | `not null` |
| `rework_rate` | `double` | `not null` |
| `distance_traveled_km` | `double` | `not null` |
| `fuel_efficiency` | `double` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 3. DEMAND FORECAST

Database table: `services_demandforecast`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `demand_forecast_id` | `bigint` | `pk, increment` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `forecast_date` | `date` | `not null` |
| `forecast_period` | `varchar(20)` | `not null` |
| `predicted_requests` | `integer` | `not null` |
| `confidence_level` | `double` | `not null` |
| `weather_impact` | `double` | `not null` |
| `seasonal_trend` | `double` | `not null` |
| `historical_average` | `integer` | `not null` |
| `actual_requests` | `integer` | `nullable` |
| `forecast_accuracy` | `double` | `nullable` |
| `generated_at` | `timestamp` | `not null` |

#### 4. SERVICE TREND

Database table: `services_servicetrend`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_trend_id` | `bigint` | `pk, increment` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `trend_type` | `varchar(20)` | `not null` |
| `period_start` | `date` | `not null` |
| `period_end` | `date` | `not null` |
| `average_requests` | `double` | `not null` |
| `peak_day` | `varchar(20)` | `not null` |
| `peak_hour` | `integer` | `nullable` |
| `growth_rate` | `double` | `not null` |
| `trend_direction` | `varchar(20)` | `not null` |
| `standard_deviation` | `double` | `not null` |
| `confidence_interval` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |

### After-Sales and Communication

#### 5. AFTER-SALES CASE

Database table: `services_aftersalescase`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `after_sales_case_id` | `bigint` | `pk, increment` |
| `service_ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `assigned_to_id` | `bigint` | `ref: > users_user.user_id` |
| `created_by_id` | `bigint` | `ref: > users_user.user_id` |
| `case_type` | `varchar(20)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `priority` | `varchar(20)` | `not null` |
| `creation_source` | `varchar(30)` | `not null` |
| `summary` | `varchar(255)` | `not null` |
| `details` | `text` | `nullable` |
| `resolution_notes` | `text` | `nullable` |
| `requires_revisit` | `boolean` | `not null` |
| `customer_satisfaction` | `smallint` | `nullable` |
| `due_date` | `date` | `nullable` |
| `resolved_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 6. AFTER-SALES CASE EVENT

Database table: `services_aftersalescaseevent`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `after_sales_case_event_id` | `bigint` | `pk, increment` |
| `case_id` | `bigint` | `not null, ref: > services_aftersalescase.after_sales_case_id` |
| `actor_id` | `bigint` | `ref: > users_user.user_id` |
| `event_type` | `varchar(30)` | `not null` |
| `from_status` | `varchar(20)` | `not null` |
| `to_status` | `varchar(20)` | `not null` |
| `notes` | `text` | `not null` |
| `metadata` | `jsonb` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 7. MAINTENANCE SCHEDULE

Database table: `services_maintenanceschedule`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `maintenance_schedule_id` | `bigint` | `pk, increment` |
| `service_ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `maintenance_profile` | `varchar(30)` | `not null` |
| `interval_days` | `integer` | `not null` |
| `follow_up_window_days` | `integer` | `not null` |
| `last_service_date` | `date` | `not null` |
| `next_due_date` | `date` | `not null` |
| `notify_on_date` | `date` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `maintenance_notes` | `text` | `nullable` |
| `due_soon_notified_at` | `timestamp` | `nullable` |
| `three_day_notified_at` | `timestamp` | `nullable` |
| `due_notified_at` | `timestamp` | `nullable` |
| `client_notified_at` | `timestamp` | `nullable` |
| `client_three_day_notified_at` | `timestamp` | `nullable` |
| `risk_level` | `varchar(20)` | `not null` |
| `risk_score` | `double` | `not null` |
| `prediction_notes` | `text` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 8. CUSTOMER SUPPORT CASE

Database table: `messages_app_customersupportcase`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `customer_support_case_id` | `bigint` | `pk, increment` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `group_key` | `varchar(80)` | `not null, unique` |
| `subject` | `varchar(160)` | `not null` |
| `category` | `varchar(30)` | `not null` |
| `priority` | `varchar(20)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `resolved_at` | `timestamp` | `nullable` |

#### 9. MESSAGE

Database table: `messages_app_message`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `message_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `sender_id` | `bigint` | `ref: > users_user.user_id` |
| `receiver_id` | `bigint` | `ref: > users_user.user_id` |
| `room_type` | `varchar(20)` | `not null` |
| `group_key` | `varchar(50)` | `nullable` |
| `message_text` | `text` | `not null` |
| `image` | `varchar(100)` | `nullable` |
| `is_deleted` | `boolean` | `not null` |
| `edited_at` | `timestamp` | `nullable` |
| `deleted_at` | `timestamp` | `nullable` |
| `updated_at` | `timestamp` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 10. NOTIFICATION

Database table: `notifications_notification`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `notification_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `request_id` | `bigint` | `ref: > services_servicerequest.service_request_id` |
| `message` | `text` | `not null` |
| `title` | `varchar(255)` | `not null` |
| `type` | `varchar(50)` | `not null` |
| `status` | `varchar(50)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `read_at` | `timestamp` | `nullable` |
| `send_email` | `boolean` | `not null` |
| `email_sent` | `boolean` | `not null` |

### Identity, Access, Configuration and Audit

#### 11. USER

Database table: `users_user`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `password` | `varchar(128)` | `not null` |
| `last_login` | `timestamp` | `nullable` |
| `is_superuser` | `boolean` | `not null` |
| `username` | `varchar(150)` | `not null, unique` |
| `first_name` | `varchar(150)` | `not null` |
| `last_name` | `varchar(150)` | `not null` |
| `email` | `varchar(254)` | `not null` |
| `is_staff` | `boolean` | `not null` |
| `is_active` | `boolean` | `not null` |
| `date_joined` | `timestamp` | `not null` |
| `user_id` | `bigint` | `pk, increment` |
| `role` | `varchar(20)` | `not null` |
| `middle_name` | `varchar(150)` | `not null` |
| `phone` | `varchar(20)` | `nullable` |
| `landline` | `varchar(50)` | `nullable` |
| `address` | `text` | `nullable` |
| `profile_image` | `varchar(100)` | `nullable` |
| `status` | `varchar(10)` | `not null` |
| `email_verified` | `boolean` | `not null` |
| `email_verification_sent_at` | `timestamp` | `nullable` |
| `pending_email` | `varchar(254)` | `nullable` |
| `pending_email_verification_sent_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `nullable` |
| `updated_at` | `timestamp` | `nullable` |

#### 12. CLIENT PROFILE

Database table: `users_clientprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `client_profile_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, unique, ref: - users_user.user_id` |
| `client_type` | `varchar(20)` | `not null` |
| `company_name` | `varchar(255)` | `nullable` |
| `company_registration` | `varchar(100)` | `nullable` |
| `billing_address` | `text` | `nullable` |
| `preferred_contact_method` | `varchar(20)` | `not null` |
| `credit_limit` | `decimal(10,2)` | `not null` |
| `account_balance` | `decimal(10,2)` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 13. TECHNICIAN PROFILE

Database table: `users_technicianprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_profile_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, unique, ref: - users_user.user_id` |
| `current_latitude` | `decimal(9,6)` | `nullable` |
| `current_longitude` | `decimal(9,6)` | `nullable` |
| `last_location_update` | `timestamp` | `nullable` |
| `is_available` | `boolean` | `not null` |
| `skill_level` | `varchar(20)` | `not null` |
| `preferred_work_areas` | `text` | `not null` |
| `max_daily_assignments` | `smallint` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 14. MANAGEMENT PROFILE

Database table: `users_managementprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `management_profile_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, unique, ref: - users_user.user_id` |
| `admin_scope` | `varchar(50)` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 15. USER CAPABILITY GRANT

Database table: `users_usercapabilitygrant`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `user_capability_grant_id` | `bigint` | `pk, increment` |
| `user_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `capability_code` | `varchar(100)` | `not null` |
| `granted_by_id` | `bigint` | `ref: > users_user.user_id` |
| `granted_at` | `timestamp` | `not null` |

#### 16. ADMIN SETTINGS

Database table: `users_adminsettings`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `admin_settings_id` | `bigint` | `pk, increment` |
| `system_name` | `varchar(255)` | `not null` |
| `support_email` | `varchar(254)` | `not null` |
| `enable_notifications` | `boolean` | `not null` |
| `enable_in_app_notifications` | `boolean` | `not null` |
| `enable_email_notifications` | `boolean` | `not null` |
| `auto_dispatch_enabled` | `boolean` | `not null` |
| `allow_overtime_dispatch` | `boolean` | `not null` |
| `overtime_daily_capacity_minutes` | `smallint` | `not null` |
| `default_time_zone` | `varchar(100)` | `not null` |
| `max_technician_assignments` | `smallint` | `not null` |
| `business_days` | `jsonb` | `not null` |
| `business_open_time` | `time` | `not null` |
| `business_close_time` | `time` | `not null` |
| `holiday_dates` | `jsonb` | `not null` |
| `maintenance_reminder_days` | `smallint` | `not null` |
| `company_name` | `varchar(255)` | `not null` |
| `company_address` | `text` | `not null` |
| `document_footer` | `text` | `not null` |
| `currency_code` | `varchar(3)` | `not null` |
| `quotation_validity_days` | `smallint` | `not null` |
| `default_warranty_days` | `integer` | `not null` |
| `external_payment_notice` | `varchar(255)` | `not null` |
| `landing_page_content` | `jsonb` | `not null` |
| `solar_calculator_settings` | `jsonb` | `not null` |
| `landing_page_promotions` | `jsonb` | `not null` |
| `landing_page_projects` | `jsonb` | `not null` |
| `location_validation_enabled` | `boolean` | `not null` |
| `arrival_radius_meters` | `smallint` | `not null` |
| `location_validation_disabled_reason` | `text` | `not null` |
| `location_validation_updated_at` | `timestamp` | `nullable` |
| `location_validation_updated_by_id` | `bigint` | `ref: > users_user.user_id` |
| `updated_at` | `timestamp` | `not null` |
| `updated_by_id` | `bigint` | `ref: > users_user.user_id` |

#### 17. LANDING PAGE ASSET

Database table: `users_landingpageasset`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `landing_page_asset_id` | `bigint` | `pk, increment` |
| `file` | `varchar(100)` | `not null` |
| `original_name` | `varchar(255)` | `not null` |
| `content_type` | `varchar(100)` | `not null` |
| `uploaded_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |

#### 18. ACTIVITY LOG

Database table: `users_activitylog`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `activity_log_id` | `bigint` | `pk, increment` |
| `actor_id` | `bigint` | `ref: > users_user.user_id` |
| `actor_role` | `varchar(20)` | `not null` |
| `actor_display_name` | `varchar(150)` | `not null` |
| `category` | `varchar(30)` | `not null` |
| `action` | `varchar(30)` | `not null` |
| `target_app_label` | `varchar(100)` | `not null` |
| `target_model` | `varchar(100)` | `not null` |
| `target_id` | `integer` | `nullable` |
| `target_label` | `varchar(255)` | `not null` |
| `message` | `varchar(255)` | `not null` |
| `metadata` | `text` | `not null` |
| `ip_address` | `varchar(39)` | `nullable` |
| `user_agent` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 19. CHANGE LOG

Database table: `users_changelog`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `change_log_id` | `bigint` | `pk, increment` |
| `content_type_id` | `integer` | `not null, note: 'References framework table django_content_type.id outside this application diagram'` |
| `object_id` | `integer` | `not null` |
| `action` | `varchar(20)` | `not null` |
| `field_name` | `varchar(100)` | `not null` |
| `old_value` | `text` | `nullable` |
| `new_value` | `text` | `nullable` |
| `changed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `changed_at` | `timestamp` | `not null` |
| `summary` | `varchar(255)` | `not null` |

### Service Intake, Dispatch and Progress

#### 20. SERVICE TYPE

Database table: `services_servicetype`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_type_id` | `bigint` | `pk, increment` |
| `name` | `varchar(255)` | `not null` |
| `description` | `text` | `nullable` |
| `category` | `varchar(100)` | `not null` |
| `color` | `varchar(20)` | `not null` |
| `icon` | `varchar(50)` | `not null` |
| `display_order` | `integer` | `not null` |
| `estimated_duration` | `integer` | `not null` |
| `estimated_cost` | `decimal(10,2)` | `not null` |
| `max_daily_assignments` | `integer` | `not null` |
| `procedures` | `text` | `not null` |
| `required_equipment` | `text` | `not null` |
| `is_active` | `boolean` | `not null` |
| `requires_site_inspection` | `boolean` | `not null` |

#### 21. SLA RULE

Database table: `services_slarule`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sla_rule_id` | `bigint` | `pk, increment` |
| `key` | `varchar(40)` | `not null, unique` |
| `warning_minutes` | `integer` | `not null` |
| `overdue_minutes` | `integer` | `not null` |
| `is_active` | `boolean` | `not null` |
| `notes` | `text` | `nullable` |
| `updated_at` | `timestamp` | `not null` |

#### 22. SERVICE REQUEST

Database table: `services_servicerequest`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_request_id` | `bigint` | `pk, increment` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `description` | `text` | `not null` |
| `priority` | `varchar(50)` | `not null` |
| `status` | `varchar(50)` | `not null` |
| `preferred_date` | `date` | `nullable` |
| `preferred_time_slot` | `varchar(20)` | `nullable` |
| `request_source` | `varchar(30)` | `not null` |
| `scheduling_notes` | `text` | `nullable` |
| `request_date` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `idempotency_key` | `varchar(128)` | `nullable` |
| `auto_ticket_created` | `boolean` | `not null` |

#### 23. SERVICE REQUEST SERVICE

Database table: `services_servicerequestservice`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_request_service_id` | `bigint` | `pk, increment` |
| `request_id` | `bigint` | `not null, ref: > services_servicerequest.service_request_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `notes` | `text` | `nullable` |
| `status` | `varchar(50)` | `not null` |
| `sort_order` | `integer` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 24. SERVICE LOCATION

Database table: `services_servicelocation`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_location_id` | `bigint` | `pk, increment` |
| `request_id` | `bigint` | `not null, unique, ref: - services_servicerequest.service_request_id` |
| `address` | `text` | `not null` |
| `city` | `varchar(100)` | `not null` |
| `province` | `varchar(100)` | `not null` |
| `latitude` | `decimal(9,6)` | `nullable` |
| `longitude` | `decimal(9,6)` | `nullable` |

#### 25. SOLAR ESTIMATE

Database table: `services_solarestimate`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `solar_estimate_id` | `bigint` | `pk, increment` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_request_id` | `bigint` | `unique, ref: - services_servicerequest.service_request_id` |
| `calculation_mode` | `varchar(20)` | `not null` |
| `monthly_consumption` | `decimal(10,2)` | `nullable` |
| `appliances` | `jsonb` | `not null` |
| `peak_sun_hours` | `decimal(4,2)` | `not null` |
| `system_loss_percent` | `decimal(5,2)` | `not null` |
| `panel_wattage` | `integer` | `not null` |
| `electricity_rate` | `decimal(8,2)` | `not null` |
| `desired_offset_percent` | `decimal(5,2)` | `not null` |
| `available_roof_area` | `decimal(10,2)` | `nullable` |
| `selected_promotion` | `jsonb` | `not null` |
| `result_snapshot` | `jsonb` | `not null` |
| `calculation_version` | `varchar(20)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `submitted_at` | `timestamp` | `nullable` |
| `converted_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 26. SERVICE TICKET

Database table: `services_serviceticket`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_ticket_id` | `bigint` | `pk, increment` |
| `request_id` | `bigint` | `not null, ref: > services_servicerequest.service_request_id` |
| `ticket_type` | `varchar(20)` | `not null` |
| `technician_id` | `bigint` | `ref: > users_user.user_id` |
| `assigned_admin_id` | `bigint` | `ref: > users_user.user_id` |
| `scheduled_date` | `date` | `not null` |
| `scheduled_time` | `time` | `nullable` |
| `scheduled_time_slot` | `varchar(20)` | `nullable` |
| `start_time` | `timestamp` | `nullable` |
| `end_time` | `timestamp` | `nullable` |
| `completed_date` | `timestamp` | `nullable` |
| `status` | `varchar(50)` | `not null` |
| `priority` | `varchar(50)` | `not null` |
| `notes` | `text` | `nullable` |
| `client_rating` | `integer` | `nullable` |
| `client_feedback` | `text` | `nullable` |
| `auto_assigned` | `boolean` | `not null` |
| `assigned_at` | `timestamp` | `nullable` |
| `smart_assignment_score` | `double` | `nullable` |
| `smart_assignment_summary` | `varchar(255)` | `nullable` |
| `project_details` | `text` | `not null` |
| `reschedule_requested` | `boolean` | `not null` |
| `reschedule_reason` | `text` | `nullable` |
| `reschedule_requested_at` | `timestamp` | `nullable` |
| `warranty_status` | `varchar(20)` | `not null` |
| `warranty_period_days` | `integer` | `nullable` |
| `warranty_start_date` | `date` | `nullable` |
| `warranty_end_date` | `date` | `nullable` |
| `warranty_notes` | `text` | `nullable` |
| `route_geometry` | `text` | `nullable` |
| `route_distance` | `double` | `nullable` |
| `route_duration` | `double` | `nullable` |
| `completion_proof_images` | `text` | `not null` |
| `completion_notes` | `text` | `nullable` |
| `created_at` | `timestamp` | `nullable` |
| `updated_at` | `timestamp` | `nullable` |

#### 27. TICKET CREW ASSIGNMENT

Database table: `services_ticketcrewassignment`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `ticket_crew_assignment_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |

#### 28. SERVICE STATUS HISTORY

Database table: `services_servicestatushistory`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_status_history_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `status` | `varchar(50)` | `not null` |
| `changed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `notes` | `text` | `nullable` |
| `timestamp` | `timestamp` | `not null` |

#### 29. TICKET PROGRESS

Database table: `progress_ticketprogress`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `ticket_progress_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `updated_by_id` | `bigint` | `ref: > users_user.user_id` |
| `progress_status` | `varchar(100)` | `not null` |
| `comment` | `text` | `nullable` |
| `updated_at` | `timestamp` | `not null` |

#### 30. TECHNICIAN SKILL

Database table: `services_technicianskill`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_skill_id` | `bigint` | `pk, increment` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `skill_level` | `varchar(50)` | `not null` |

#### 31. TECHNICIAN LOCATION HISTORY

Database table: `services_technicianlocationhistory`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `technician_location_history_id` | `bigint` | `pk, increment` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `latitude` | `decimal(9,6)` | `not null` |
| `longitude` | `decimal(9,6)` | `not null` |
| `timestamp` | `timestamp` | `not null` |
| `accuracy` | `double` | `not null` |

#### 32. ARRIVAL VALIDATION LOG

Database table: `services_arrivalvalidationlog`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `arrival_validation_log_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `technician_id` | `bigint` | `ref: > users_user.user_id` |
| `performed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `action` | `varchar(30)` | `not null` |
| `technician_latitude` | `decimal(9,6)` | `nullable` |
| `technician_longitude` | `decimal(9,6)` | `nullable` |
| `service_latitude` | `decimal(9,6)` | `nullable` |
| `service_longitude` | `decimal(9,6)` | `nullable` |
| `distance_meters` | `double` | `nullable` |
| `validation_result` | `varchar(20)` | `not null` |
| `validation_enabled` | `boolean` | `not null` |
| `radius_meters` | `smallint` | `not null` |
| `remarks` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |

### Field Evidence and Documents

#### 33. INSPECTION CHECKLIST

Database table: `services_inspectionchecklist`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inspection_checklist_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `created_at` | `timestamp` | `not null` |
| `completed_at` | `timestamp` | `nullable` |
| `completed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `submitted_by_id` | `bigint` | `ref: > users_user.user_id` |
| `submitted_at` | `timestamp` | `nullable` |
| `is_completed` | `boolean` | `not null` |
| `site_accessible` | `boolean` | `not null` |
| `site_accessible_notes` | `text` | `nullable` |
| `electrical_available` | `boolean` | `not null` |
| `electrical_adequate` | `boolean` | `not null` |
| `electrical_notes` | `text` | `nullable` |
| `roof_condition` | `varchar(100)` | `nullable` |
| `structural_assessment` | `text` | `nullable` |
| `safety_equipment_present` | `boolean` | `not null` |
| `safety_hazards` | `text` | `nullable` |
| `recommendation` | `varchar(100)` | `nullable` |
| `additional_notes` | `text` | `nullable` |
| `maintenance_required` | `boolean` | `not null` |
| `maintenance_profile` | `varchar(30)` | `nullable` |
| `maintenance_interval_days` | `integer` | `nullable` |
| `maintenance_notes` | `text` | `nullable` |
| `service_type_label` | `varchar(255)` | `nullable` |
| `procedure_source` | `varchar(30)` | `nullable` |
| `checklist_items` | `text` | `not null` |
| `required_equipment_snapshot` | `text` | `not null` |
| `proof_media` | `text` | `not null` |
| `warranty_provided` | `boolean` | `not null` |
| `warranty_period_days` | `integer` | `nullable` |
| `warranty_notes` | `text` | `nullable` |
| `follow_up_required` | `boolean` | `not null` |
| `follow_up_case_type` | `varchar(20)` | `nullable` |
| `follow_up_due_date` | `date` | `nullable` |
| `follow_up_summary` | `varchar(255)` | `nullable` |
| `follow_up_details` | `text` | `nullable` |

#### 34. GENERATED DOCUMENT

Database table: `services_generateddocument`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `generated_document_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `document_type` | `varchar(64)` | `not null` |
| `title` | `varchar(255)` | `not null` |
| `status` | `varchar(32)` | `not null` |
| `data_json` | `text` | `not null` |
| `source_snapshot_json` | `text` | `not null` |
| `generated_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 35. TECHNICAL DATA SHEET

Database table: `services_technicaldatasheet`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `tds_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `status` | `varchar(20)` | `not null` |
| `premise_type` | `varchar(100)` | `nullable` |
| `premise_category` | `varchar(100)` | `nullable` |
| `ownership_type` | `varchar(100)` | `nullable` |
| `private_or_government_type` | `varchar(100)` | `nullable` |
| `primary_electric_supply` | `varchar(100)` | `nullable` |
| `ac_phase_power_supply` | `varchar(100)` | `nullable` |
| `solar_panel_installation_location` | `varchar(100)` | `nullable` |
| `rooftop_type` | `varchar(100)` | `nullable` |
| `average_monthly_electric_bill` | `varchar(100)` | `nullable` |
| `electricity_required_hours_per_day` | `varchar(100)` | `nullable` |
| `brownout_frequency` | `varchar(100)` | `nullable` |
| `battery_preference` | `varchar(100)` | `nullable` |
| `purpose_of_going_solar` | `text` | `not null` |
| `load_schedule_json` | `text` | `not null` |
| `generator_details_json` | `text` | `not null` |
| `attachments_json` | `text` | `not null` |
| `client_confirmation_date` | `date` | `nullable` |
| `client_confirmed_name` | `varchar(255)` | `nullable` |
| `prepared_by_id` | `bigint` | `ref: > users_user.user_id` |
| `reviewed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `submitted_at` | `timestamp` | `nullable` |
| `reviewed_at` | `timestamp` | `nullable` |

#### 36. SOLAR COMMISSIONING CHECKLIST

Database table: `services_solarcommissioningchecklist`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `solar_commissioning_checklist_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `site_name` | `varchar(255)` | `not null` |
| `inverter_type` | `varchar(255)` | `not null` |
| `system_designation` | `varchar(255)` | `not null` |
| `inverter_serial_number` | `varchar(255)` | `not null` |
| `commissioned_date` | `date` | `nullable` |
| `irradiance` | `varchar(100)` | `not null` |
| `ambient_temperature` | `varchar(100)` | `not null` |
| `readings_json` | `text` | `not null` |
| `checklist_items_json` | `text` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `completed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 37. TURNOVER ACCEPTANCE

Database table: `services_turnoveracceptance`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `turnover_acceptance_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `generated_document_id` | `bigint` | `ref: > services_generateddocument.generated_document_id` |
| `turnover_date` | `date` | `nullable` |
| `accepted_by_client_name` | `varchar(255)` | `not null` |
| `accepted_by_client_contact` | `varchar(255)` | `not null` |
| `warranty_start_date` | `date` | `nullable` |
| `status` | `varchar(20)` | `not null` |
| `finalized_by_id` | `bigint` | `ref: > users_user.user_id` |
| `finalized_at` | `timestamp` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 38. QUOTATION RECORD

Database table: `services_quotationrecord`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `quotation_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `quotation_number` | `varchar(100)` | `nullable` |
| `total_amount` | `varchar(255)` | `nullable` |
| `downpayment_amount` | `varchar(255)` | `nullable` |
| `balance_amount` | `varchar(255)` | `nullable` |
| `payment_terms` | `text` | `nullable` |
| `warranty_terms` | `text` | `nullable` |
| `validity_days` | `integer` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `bill_of_materials` | `text` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 39. INSTALLATION CONTRACT

Database table: `services_installationcontract`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `contract_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, unique, ref: - services_serviceticket.service_ticket_id` |
| `scope_of_work` | `text` | `nullable` |
| `start_date` | `date` | `nullable` |
| `estimated_completion_days` | `integer` | `nullable` |
| `total_contract_amount` | `decimal(12,2)` | `nullable` |
| `payment_terms_upfront` | `decimal(12,2)` | `nullable` |
| `payment_terms_completion` | `decimal(12,2)` | `nullable` |
| `payment_terms_final` | `decimal(12,2)` | `nullable` |
| `warranty_period` | `varchar(100)` | `nullable` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 40. SOLAR PROJECT PROFILE

Database table: `services_solarprojectprofile`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `project_profile_id` | `bigint` | `pk, increment` |
| `location_id` | `bigint` | `not null, unique, ref: - services_servicelocation.service_location_id` |
| `original_ticket_id` | `bigint` | `unique, ref: - services_serviceticket.service_ticket_id` |
| `system_capacity` | `varchar(100)` | `nullable` |
| `panel_brand` | `varchar(100)` | `nullable` |
| `number_of_panels` | `integer` | `nullable` |
| `inverter_brand` | `varchar(100)` | `nullable` |
| `number_of_inverters` | `integer` | `nullable` |
| `battery_brand` | `varchar(100)` | `nullable` |
| `mounting_structure` | `varchar(100)` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 41. FIELD SERVICE REPORT

Database table: `services_fieldservicereport`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `fsr_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `indoor_temp` | `varchar(50)` | `nullable` |
| `outdoor_temp` | `varchar(50)` | `nullable` |
| `ampere_reading` | `varchar(50)` | `nullable` |
| `voltage_reading` | `varchar(50)` | `nullable` |
| `before_service_readings` | `text` | `nullable` |
| `after_service_readings` | `text` | `nullable` |
| `brand_model` | `varchar(100)` | `nullable` |
| `serial_number` | `varchar(100)` | `nullable` |
| `recommendation` | `text` | `nullable` |
| `client_acknowledged` | `boolean` | `not null` |
| `client_signature_date` | `date` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 42. INSTALLED EQUIPMENT

Database table: `services_installedequipment`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `installed_equipment_id` | `bigint` | `pk, increment` |
| `ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `brand_model` | `varchar(255)` | `not null` |
| `equipment_type` | `varchar(100)` | `not null` |
| `serial_number` | `varchar(255)` | `nullable` |
| `capacity` | `varchar(100)` | `nullable` |
| `location` | `varchar(255)` | `nullable` |
| `warranty_start` | `date` | `nullable` |
| `warranty_end` | `date` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

### Inventory, Returns and Sales

#### 43. INVENTORY CATEGORY

Database table: `inventory_inventorycategory`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_category_id` | `bigint` | `pk, increment` |
| `name` | `varchar(100)` | `not null` |
| `description` | `text` | `nullable` |
| `parent_id` | `bigint` | `ref: > inventory_inventorycategory.inventory_category_id` |

#### 44. INVENTORY ITEM

Database table: `inventory_inventoryitem`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_item_id` | `bigint` | `pk, increment` |
| `name` | `varchar(200)` | `not null` |
| `sku` | `varchar(50)` | `not null, unique` |
| `description` | `text` | `nullable` |
| `category_id` | `bigint` | `not null, ref: > inventory_inventorycategory.inventory_category_id` |
| `item_type` | `varchar(20)` | `not null` |
| `brand` | `varchar(100)` | `not null` |
| `model` | `varchar(100)` | `not null` |
| `size` | `varchar(100)` | `not null` |
| `unit_of_measurement` | `varchar(50)` | `not null` |
| `capacity` | `varchar(100)` | `not null` |
| `quantity` | `integer` | `not null` |
| `minimum_stock` | `integer` | `not null` |
| `reserved_quantity` | `integer` | `not null` |
| `warehouse_location` | `varchar(100)` | `nullable` |
| `unit_price` | `decimal(10,2)` | `not null` |
| `total_value` | `decimal(12,2)` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `supplier` | `varchar(200)` | `nullable` |
| `supplier_contact` | `text` | `nullable` |
| `purchase_date` | `date` | `nullable` |
| `warranty_expiry` | `date` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |
| `low_stock_threshold` | `integer` | `not null` |
| `notes` | `text` | `nullable` |
| `last_notification_sent` | `timestamp` | `nullable` |

#### 45. SERVICE TYPE INVENTORY REQUIREMENT

Database table: `inventory_servicetypeinventoryrequirement`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `service_type_inventory_requirement_id` | `bigint` | `pk, increment` |
| `service_type_id` | `bigint` | `not null, ref: > services_servicetype.service_type_id` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `quantity` | `integer` | `not null` |
| `auto_reserve` | `boolean` | `not null` |
| `notes` | `text` | `nullable` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 46. INVENTORY RESERVATION

Database table: `inventory_inventoryreservation`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_reservation_id` | `bigint` | `pk, increment` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `quantity` | `integer` | `not null` |
| `required_date` | `date` | `not null` |
| `service_ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `notes` | `text` | `nullable` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |

#### 47. INVENTORY TRANSACTION

Database table: `inventory_inventorytransaction`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `inventory_transaction_id` | `bigint` | `pk, increment` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `transaction_type` | `varchar(20)` | `not null` |
| `quantity` | `integer` | `not null` |
| `technician_id` | `bigint` | `ref: > users_user.user_id` |
| `service_ticket_id` | `bigint` | `ref: > services_serviceticket.service_ticket_id` |
| `reference_number` | `varchar(50)` | `nullable` |
| `notes` | `text` | `nullable` |
| `transaction_date` | `timestamp` | `not null` |
| `performed_by_id` | `bigint` | `ref: > users_user.user_id` |

#### 48. EQUIPMENT RETURN REQUEST

Database table: `inventory_equipmentreturnrequest`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `equipment_return_request_id` | `bigint` | `pk, increment` |
| `service_ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `technician_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `submitted_by_id` | `bigint` | `ref: > users_user.user_id` |
| `condition` | `varchar(20)` | `not null` |
| `notes` | `text` | `not null` |
| `status` | `varchar(20)` | `not null` |
| `created_at` | `timestamp` | `not null` |
| `reviewed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `reviewed_at` | `timestamp` | `nullable` |
| `reviewed_condition` | `varchar(20)` | `not null` |
| `review_notes` | `text` | `not null` |

#### 49. EQUIPMENT RETURN REQUEST ITEM

Database table: `inventory_equipmentreturnrequestitem`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `equipment_return_request_item_id` | `bigint` | `pk, increment` |
| `return_request_id` | `bigint` | `not null, ref: > inventory_equipmentreturnrequest.equipment_return_request_id` |
| `item_id` | `bigint` | `not null, ref: > inventory_inventoryitem.inventory_item_id` |
| `quantity` | `integer` | `not null` |

#### 50. SALES RECORD

Database table: `services_salesrecord`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sales_record_id` | `bigint` | `pk, increment` |
| `record_number` | `varchar(32)` | `not null, unique` |
| `ticket_id` | `bigint` | `not null, ref: > services_serviceticket.service_ticket_id` |
| `client_id` | `bigint` | `not null, ref: > users_user.user_id` |
| `quotation_id` | `bigint` | `ref: > services_quotationrecord.quotation_id` |
| `status` | `varchar(20)` | `not null` |
| `sale_date` | `date` | `nullable` |
| `currency_code` | `varchar(3)` | `not null` |
| `agreed_total` | `decimal(14,2)` | `nullable` |
| `notes` | `text` | `not null` |
| `source_snapshot` | `jsonb` | `not null` |
| `created_by_id` | `bigint` | `ref: > users_user.user_id` |
| `confirmed_by_id` | `bigint` | `ref: > users_user.user_id` |
| `confirmed_at` | `timestamp` | `nullable` |
| `voided_by_id` | `bigint` | `ref: > users_user.user_id` |
| `voided_at` | `timestamp` | `nullable` |
| `void_reason` | `text` | `not null` |
| `replaces_id` | `bigint` | `unique, ref: - services_salesrecord.sales_record_id` |
| `created_at` | `timestamp` | `not null` |
| `updated_at` | `timestamp` | `not null` |

#### 51. SALES RECORD LINE

Database table: `services_salesrecordline`

| Attribute | Data type | Database constraints |
| --- | --- | --- |
| `sales_record_line_id` | `bigint` | `pk, increment` |
| `sales_record_id` | `bigint` | `not null, ref: > services_salesrecord.sales_record_id` |
| `line_type` | `varchar(20)` | `not null` |
| `service_type_id` | `bigint` | `ref: > services_servicetype.service_type_id` |
| `inventory_item_id` | `bigint` | `ref: > inventory_inventoryitem.inventory_item_id` |
| `installed_equipment_id` | `bigint` | `ref: > services_installedequipment.installed_equipment_id` |
| `name` | `varchar(255)` | `not null` |
| `sku` | `varchar(80)` | `not null` |
| `quantity` | `decimal(12,3)` | `not null` |
| `unit` | `varchar(50)` | `not null` |
| `unit_price` | `decimal(14,2)` | `nullable` |
| `line_total` | `decimal(14,2)` | `nullable` |
| `source_snapshot` | `jsonb` | `not null` |
| `sort_order` | `integer` | `not null` |

## Relationship Map

Each relationship follows this format:

`(SOURCE ENTITY) ---- source cardinality ---- VERB ---- target cardinality ---- (TARGET ENTITY)`

`N` means many, `1` means exactly one, and `0..1` means optional one. The field mapping identifies the exact foreign-key and referenced fields.

Total relationships: **102**

### Analytics

1. (DEMAND FORECAST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
2. (SERVICE ANALYTICS) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
3. (SERVICE TREND) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
4. (TECHNICIAN PERFORMANCE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]

### After-Sales and Communication

5. (AFTER-SALES CASE) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`assigned_to_id` -> `user_id`]
6. (AFTER-SALES CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
7. (AFTER-SALES CASE) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
8. (AFTER-SALES CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
9. (AFTER-SALES CASE EVENT) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
10. (AFTER-SALES CASE EVENT) ---- N ---- FOR CASE ---- 1 ---- (AFTER-SALES CASE)  [`case_id` -> `after_sales_case_id`]
11. (CUSTOMER SUPPORT CASE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
12. (CUSTOMER SUPPORT CASE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
13. (MAINTENANCE SCHEDULE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
14. (MAINTENANCE SCHEDULE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
15. (MAINTENANCE SCHEDULE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
16. (MESSAGE) ---- N ---- RECEIVED BY ---- 1 ---- (USER)  [`receiver_id` -> `user_id`]
17. (MESSAGE) ---- N ---- SENT BY ---- 1 ---- (USER)  [`sender_id` -> `user_id`]
18. (MESSAGE) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
19. (NOTIFICATION) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
20. (NOTIFICATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
21. (NOTIFICATION) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Identity, Access, Configuration and Audit

22. (ACTIVITY LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`actor_id` -> `user_id`]
23. (ADMIN SETTINGS) ---- N ---- LOCATION SETTINGS UPDATED BY ---- 1 ---- (USER)  [`location_validation_updated_by_id` -> `user_id`]
24. (ADMIN SETTINGS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]
25. (CHANGE LOG) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
26. (CLIENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
27. (LANDING PAGE ASSET) ---- N ---- UPLOADED BY ---- 1 ---- (USER)  [`uploaded_by_id` -> `user_id`]
28. (MANAGEMENT PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
29. (TECHNICIAN PROFILE) ---- 1 ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]
30. (USER CAPABILITY GRANT) ---- N ---- GRANTED BY ---- 1 ---- (USER)  [`granted_by_id` -> `user_id`]
31. (USER CAPABILITY GRANT) ---- N ---- BELONGS TO ---- 1 ---- (USER)  [`user_id` -> `user_id`]

### Service Intake, Dispatch and Progress

32. (ARRIVAL VALIDATION LOG) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
33. (ARRIVAL VALIDATION LOG) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
34. (ARRIVAL VALIDATION LOG) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
35. (SERVICE LOCATION) ---- 1 ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
36. (SERVICE REQUEST) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
37. (SERVICE REQUEST) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
38. (SERVICE REQUEST SERVICE) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
39. (SERVICE REQUEST SERVICE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
40. (SERVICE STATUS HISTORY) ---- N ---- CHANGED BY ---- 1 ---- (USER)  [`changed_by_id` -> `user_id`]
41. (SERVICE STATUS HISTORY) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
42. (SERVICE TICKET) ---- N ---- MANAGED BY ---- 1 ---- (USER)  [`assigned_admin_id` -> `user_id`]
43. (SERVICE TICKET) ---- N ---- FOR REQUEST ---- 1 ---- (SERVICE REQUEST)  [`request_id` -> `service_request_id`]
44. (SERVICE TICKET) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
45. (SOLAR ESTIMATE) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
46. (SOLAR ESTIMATE) ---- 0..1 ---- FROM REQUEST ---- 1 ---- (SERVICE REQUEST)  [`service_request_id` -> `service_request_id`]
47. (TECHNICIAN LOCATION HISTORY) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
48. (TECHNICIAN SKILL) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
49. (TECHNICIAN SKILL) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
50. (TICKET CREW ASSIGNMENT) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
51. (TICKET CREW ASSIGNMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
52. (TICKET PROGRESS) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
53. (TICKET PROGRESS) ---- N ---- UPDATED BY ---- 1 ---- (USER)  [`updated_by_id` -> `user_id`]

### Field Evidence and Documents

54. (FIELD SERVICE REPORT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
55. (GENERATED DOCUMENT) ---- N ---- GENERATED BY ---- 1 ---- (USER)  [`generated_by_id` -> `user_id`]
56. (GENERATED DOCUMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
57. (INSPECTION CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
58. (INSPECTION CHECKLIST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
59. (INSPECTION CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
60. (INSTALLATION CONTRACT) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
61. (INSTALLED EQUIPMENT) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
62. (INSTALLED EQUIPMENT) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
63. (QUOTATION RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
64. (QUOTATION RECORD) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
65. (SOLAR COMMISSIONING CHECKLIST) ---- N ---- COMPLETED BY ---- 1 ---- (USER)  [`completed_by_id` -> `user_id`]
66. (SOLAR COMMISSIONING CHECKLIST) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
67. (SOLAR PROJECT PROFILE) ---- 1 ---- AT LOCATION ---- 1 ---- (SERVICE LOCATION)  [`location_id` -> `service_location_id`]
68. (SOLAR PROJECT PROFILE) ---- 0..1 ---- ORIGINATES FROM ---- 1 ---- (SERVICE TICKET)  [`original_ticket_id` -> `service_ticket_id`]
69. (TECHNICAL DATA SHEET) ---- N ---- PREPARED BY ---- 1 ---- (USER)  [`prepared_by_id` -> `user_id`]
70. (TECHNICAL DATA SHEET) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
71. (TECHNICAL DATA SHEET) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
72. (TURNOVER ACCEPTANCE) ---- N ---- FINALIZED BY ---- 1 ---- (USER)  [`finalized_by_id` -> `user_id`]
73. (TURNOVER ACCEPTANCE) ---- N ---- USES DOCUMENT ---- 1 ---- (GENERATED DOCUMENT)  [`generated_document_id` -> `generated_document_id`]
74. (TURNOVER ACCEPTANCE) ---- 1 ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]

### Inventory, Returns and Sales

75. (EQUIPMENT RETURN REQUEST) ---- N ---- REVIEWED BY ---- 1 ---- (USER)  [`reviewed_by_id` -> `user_id`]
76. (EQUIPMENT RETURN REQUEST) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
77. (EQUIPMENT RETURN REQUEST) ---- N ---- SUBMITTED BY ---- 1 ---- (USER)  [`submitted_by_id` -> `user_id`]
78. (EQUIPMENT RETURN REQUEST) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
79. (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
80. (EQUIPMENT RETURN REQUEST ITEM) ---- N ---- CONTAINS ---- 1 ---- (EQUIPMENT RETURN REQUEST)  [`return_request_id` -> `equipment_return_request_id`]
81. (INVENTORY CATEGORY) ---- N ---- HAS PARENT ---- 1 ---- (INVENTORY CATEGORY)  [`parent_id` -> `inventory_category_id`]
82. (INVENTORY ITEM) ---- N ---- IN CATEGORY ---- 1 ---- (INVENTORY CATEGORY)  [`category_id` -> `inventory_category_id`]
83. (INVENTORY RESERVATION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
84. (INVENTORY RESERVATION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
85. (INVENTORY RESERVATION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
86. (INVENTORY TRANSACTION) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
87. (INVENTORY TRANSACTION) ---- N ---- PERFORMED BY ---- 1 ---- (USER)  [`performed_by_id` -> `user_id`]
88. (INVENTORY TRANSACTION) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`service_ticket_id` -> `service_ticket_id`]
89. (INVENTORY TRANSACTION) ---- N ---- ASSIGNED TO ---- 1 ---- (USER)  [`technician_id` -> `user_id`]
90. (SALES RECORD) ---- N ---- OWNED BY ---- 1 ---- (USER)  [`client_id` -> `user_id`]
91. (SALES RECORD) ---- N ---- CONFIRMED BY ---- 1 ---- (USER)  [`confirmed_by_id` -> `user_id`]
92. (SALES RECORD) ---- N ---- CREATED BY ---- 1 ---- (USER)  [`created_by_id` -> `user_id`]
93. (SALES RECORD) ---- N ---- BASED ON ---- 1 ---- (QUOTATION RECORD)  [`quotation_id` -> `quotation_id`]
94. (SALES RECORD) ---- 0..1 ---- REPLACES ---- 1 ---- (SALES RECORD)  [`replaces_id` -> `sales_record_id`]
95. (SALES RECORD) ---- N ---- FOR TICKET ---- 1 ---- (SERVICE TICKET)  [`ticket_id` -> `service_ticket_id`]
96. (SALES RECORD) ---- N ---- VOIDED BY ---- 1 ---- (USER)  [`voided_by_id` -> `user_id`]
97. (SALES RECORD LINE) ---- N ---- USES EQUIPMENT ---- 1 ---- (INSTALLED EQUIPMENT)  [`installed_equipment_id` -> `installed_equipment_id`]
98. (SALES RECORD LINE) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`inventory_item_id` -> `inventory_item_id`]
99. (SALES RECORD LINE) ---- N ---- CONTAINS ---- 1 ---- (SALES RECORD)  [`sales_record_id` -> `sales_record_id`]
100. (SALES RECORD LINE) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
101. (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES ITEM ---- 1 ---- (INVENTORY ITEM)  [`item_id` -> `inventory_item_id`]
102. (SERVICE TYPE INVENTORY REQUIREMENT) ---- N ---- USES SERVICE ---- 1 ---- (SERVICE TYPE)  [`service_type_id` -> `service_type_id`]
