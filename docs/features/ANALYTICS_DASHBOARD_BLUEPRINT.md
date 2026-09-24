# AFN-SERVE Analytics Dashboard Blueprint

## Purpose

This document consolidates the analytics status of the AFN-SERVE system into one place. It explains:

- what analytics are already possible from the current database
- what analytics are only partially possible
- what analytics are not yet reliable
- what fields should be added
- what API endpoints are needed
- what frontend charts and cards should appear
- what forecasting method is realistic for the capstone
- what sample data should be generated for testing

This assessment is based on the current codebase, especially:

- `backend/services/models/core.py`
- `backend/services/models/analytics.py`
- `backend/users/models.py`
- `backend/progress/models.py`
- `backend/history/models.py`
- `backend/users/views/admin_services.py`
- `frontend/src/pages/admin/AdminAnalytics.jsx`
- `frontend/src/pages/admin/CoverageHeatmap.jsx`

---

## 1. Current System Understanding

AFN-SERVE is already capable of supporting a strong capstone-level analytics dashboard because the system tracks:

- service requests
- service tickets
- service types
- request locations with latitude and longitude
- technician assignment
- technician availability and profile data
- ticket progress updates
- service history
- technician performance aggregates
- demand forecasts
- heatmap and coverage-related endpoints

Your analytics scope is not starting from zero. The system already has both:

- transactional data models
- a working analytics pipeline and admin analytics page

That means the best next step is not "add random charts", but to make the dashboard more academically structured, operationally meaningful, and consistent with the actual workflow of the system.

---

## 2. Current Models Relevant To Analytics

### 2.1 `ServiceType`

Current useful fields:

- `id`
- `name`
- `description`
- `estimated_duration`
- `estimated_cost`
- `max_daily_assignments`
- `is_active`

Analytics value:

- most requested services
- completed jobs by service type
- demand forecast by service type
- service duration expectations
- technician capacity planning by service type

---

### 2.2 `ServiceRequest`

Current useful fields:

- `id`
- `client`
- `service_type`
- `description`
- `priority`
- `status`
- `preferred_date`
- `preferred_time_slot`
- `request_source`
- `scheduling_notes`
- `request_date`
- `updated_at`
- `auto_ticket_created`

Analytics value:

- total service requests
- request volume by month
- request volume by source
- request volume by priority
- pending vs approved vs completed request mix
- preferred time-slot demand
- intake trend analysis

Important note:

- `request_source` is very valuable for capstone analytics because it lets you show where demand comes from: client portal, walk-in, phone, or admin-created.

---

### 2.3 `ServiceLocation`

Current useful fields:

- `request`
- `address`
- `city`
- `province`
- `latitude`
- `longitude`

Analytics value:

- service demand by city
- service demand by province
- coverage heatmap
- CALABARZON service density
- technician travel and route context

Important limitation:

- there is no explicit `barangay` field

That means barangay-level analytics are not currently reliable unless barangay is being embedded inconsistently inside `address`.

---

### 2.4 `ServiceTicket`

Current useful fields:

- `id`
- `request`
- `ticket_type`
- `technician`
- `assigned_admin`
- `scheduled_date`
- `scheduled_time`
- `scheduled_time_slot`
- `start_time`
- `end_time`
- `completed_date`
- `status`
- `priority`
- `notes`
- `client_rating`
- `client_feedback`
- `auto_assigned`
- `assigned_at`
- `smart_assignment_score`
- `smart_assignment_summary`
- `reschedule_requested`
- `reschedule_reason`
- `reschedule_requested_at`
- `warranty_status`
- `warranty_period_days`
- `warranty_start_date`
- `warranty_end_date`
- `route_distance`
- `route_duration`
- `completion_proof_images`
- `completion_notes`
- `created_at`
- `updated_at`

Analytics value:

- pending jobs
- ongoing jobs
- completed jobs
- tickets by status
- tickets by priority
- tickets by type
- technician assignment counts
- average response time
- average completion time
- reschedule frequency
- warranty case mix
- route efficiency metrics
- client rating metrics

Important limitation:

- there is no dedicated `arrived_at_site` datetime field

The status `Arrived on Site` exists, but there is no single canonical timestamp field for arrival in `ServiceTicket`.

---

### 2.5 `User`

Current useful fields:

- `id`
- `username`
- `first_name`
- `last_name`
- `role`
- `phone`
- `address`
- `status`
- `created_at`

Analytics value:

- active technicians
- active users by role
- client population
- technician-level workload summaries

---

### 2.6 `TechnicianProfile`

Current useful fields:

- `user`
- `current_latitude`
- `current_longitude`
- `last_location_update`
- `is_available`
- `skill_level`
- `preferred_work_areas`
- `max_daily_assignments`
- `updated_at`

Analytics value:

- available technicians
- live technician availability
- technician map distribution
- technician capacity planning
- technician skill mix

---

### 2.7 `TicketProgress`

Current useful fields:

- `ticket`
- `updated_by`
- `progress_status`
- `comment`
- `updated_at`

Analytics value:

- workflow event timeline
- approximate status transition timestamps
- arrived on site event inference
- work started event inference
- work completed event inference

Important limitation:

- `progress_status` is plain text, not normalized choices
- there is no separate field for `arrived_at_site`
- there is no guaranteed one-record-per-milestone rule

So `TicketProgress` is usable for timeline analytics, but weak for precise academic metrics unless standardized.

---

### 2.8 Completed-job facts

The disconnected `ServiceHistory` model was retired. Completed-job analytics
must derive from `ServiceTicket`, its request/service/location relationships,
and `ServiceStatusHistory`. This keeps one authoritative operational timeline
instead of maintaining a second summary table that can drift.

---

### 2.9 `DemandForecast`

Current useful fields:

- `service_type`
- `forecast_date`
- `forecast_period`
- `predicted_requests`
- `confidence_level`
- `weather_impact`
- `seasonal_trend`
- `historical_average`
- `actual_requests`
- `forecast_accuracy`
- `generated_at`

Analytics value:

- trend-based demand estimates
- forecast vs actual comparison
- service-type-level demand planning
- forecast confidence reporting

Important note:

- this model is useful for storing forecast outputs, but it should not replace raw historical analytics from `ServiceRequest` and `ServiceTicket`.

---

### 2.10 `TechnicianPerformance`

Current useful fields:

- `technician`
- `date`
- `tickets_assigned`
- `tickets_completed`
- `tickets_pending`
- `total_work_hours`
- `avg_response_time_hours`
- `avg_completion_time_hours`
- `customer_satisfaction`
- `rework_rate`
- `distance_traveled_km`
- `fuel_efficiency`

Analytics value:

- completed jobs per technician
- average completion time per technician
- average response time per technician
- technician ranking
- monthly technician activity
- technician efficiency metrics

---

## 3. Current Analytics Already Implemented In The System

The current admin analytics flow already computes a substantial amount of data through `/api/admin/analytics/`.

### Current backend analytics already present

- overview totals
- service breakdown
- top technician
- completion trend
- monthly service trend
- monthly service breakdown
- predictive summary
- service forecasts
- daily forecast
- location demand forecast
- busiest months
- busiest weeks
- top requested service types
- city completion trends
- province completion trends
- seasonal inventory demand
- request source breakdown
- priority distribution
- ticket status breakdown
- scheduling insights

### Current analytics-related endpoints already present

- `/api/admin/analytics/`
- `/api/admin/analytics/ai-summary/`
- `/api/admin/analytics/date-records/`
- `/api/dashboard/stats/`
- `/api/services/technician-performance/performance_breakdown/`
- `/api/services/coverage-heatmap/service_density/`
- `/api/services/coverage-heatmap/technician_coverage/`
- `/api/services/coverage-heatmap/completed_jobs/`

### Current frontend analytics cards and charts already present

Based on `frontend/src/pages/admin/AdminAnalytics.jsx`, the page already contains:

- key metric cards
- analytics insight strip
- monthly request completion trend
- top requested services
- 7-day demand forecast
- service forecast breakdown
- operational focus panel
- operational risk donut
- execution snapshot
- request source mix
- priority distribution
- ticket status breakdown
- scheduling and coverage signals
- busiest months
- busiest weeks
- location demand forecast
- city completion trends
- province completion trends
- seasonal inventory demand
- most active technicians by month
- technician performance monitoring

### Technical debt found in current page

The current analytics implementation is feature-rich, but there are still maintainability concerns:

- the `AdminAnalytics.jsx` page is very large and bundles many sections into one file
- date filtering is implemented in multiple places and should stay behaviorally consistent across widgets
- E2E coverage across the admin workspace is sensitive to route names and exact heading text, so analytics labels and page metadata should stay intentionally stable

Recommended frontend cleanup:

- keep extracting shared helpers and presentational sections into smaller components
- standardize page headings and route-level test hooks for long-lived Playwright coverage
- prefer resilient test selectors such as `data-testid` for core analytics widgets and workspace sections

---

## 3.1 E2E Validation Snapshot

The latest automated visual report gives useful validation context for the analytics dashboard and related admin workspace.

### What the latest run verified

- total automated visual tests executed: 71
- passed: 41
- failed: 30
- admin analytics page test passed
- coverage heatmap page test passed
- reports, operations report, technician tracking, service tickets, inventory, documents, after-sales cases, and settings also passed in the admin workspace suite

### What this means for the analytics dashboard

- the analytics page is already rendering successfully under end-to-end visual coverage
- the current analytics implementation is not the main source of failure in the latest test report
- most reported failures across the larger platform were caused by selector drift, heading text changes, route mismatches, or test helper setup issues rather than broken analytics logic

### Analytics-relevant observations from the report

- the admin analytics page with charts passed, which supports the claim that the page already delivers working KPI cards and chart visualizations
- the coverage heatmap page also passed, which strengthens confidence in the geographic analytics portion of the dashboard
- several admin workspace failures were caused by renamed headings such as `Dispatch & Assignment` and `Service Types & Catalog`, showing that UI wording is evolving faster than strict test expectations
- Suite 7 failures were traced to a Playwright helper issue involving `localStorage` on `about:blank`, which is a test harness problem rather than a product analytics problem

### Practical implication for the capstone

For thesis and demo positioning, the latest E2E report supports saying that:

- the analytics dashboard is already operational in the live application
- current quality risks are concentrated more in automated test robustness than in analytics rendering
- the next quality step is to stabilize route-aware helpers and selectors so the evidence for dashboard reliability becomes easier to reproduce

---

## 4. What Analytics Are Possible Right Now

The following analytics are fully possible now using the current database and codebase.

### Service request analytics

- total service requests
- pending requests
- approved requests
- completed requests
- cancelled requests
- requests by month
- requests by service type
- requests by priority
- requests by source
- requests by preferred time slot

### Service ticket analytics

- total tickets
- pending jobs
- ongoing jobs
- completed jobs
- cancelled jobs
- tickets by status
- tickets by priority
- tickets by ticket type
- rescheduled tickets
- warranty status distribution

### Technician analytics

- completed jobs per technician
- active jobs per technician
- total jobs per technician
- technician availability
- technician performance ranking
- average response time per technician
- average completion time per technician
- technician monthly activity
- technician skill-based reporting if `TechnicianSkill` is joined

### Location analytics

- service demand by city
- service demand by province
- completed jobs by city
- completed jobs by province
- location demand forecast
- heatmap points based on latitude and longitude
- CALABARZON coverage heatmap if the coordinates are within the target region

### Time and workflow analytics

- monthly completed jobs
- daily completion trend
- average response time
- average completion time
- busy months
- busy weeks
- request-to-assignment timing
- work start to completion timing

### Service-type analytics

- most requested services
- completed jobs by service type
- forecasted demand by service type
- service-type demand growth trends

### Forecast analytics

- trend-based demand estimates
- 7-day forecast
- service-type forecast
- peak demand day
- staffing pressure estimate
- forecast confidence display

---

## 5. What Analytics Are Only Partially Possible

These are possible, but the data quality or field design is not ideal yet.

### 5.1 Arrived-at-site analytics

Partially possible through:

- `TicketProgress.progress_status`
- ticket status changes such as `Arrived on Site`

Why partial:

- no dedicated `arrived_at_site` timestamp field exists in `ServiceTicket`
- progress statuses are free text
- event consistency is not guaranteed

### 5.2 Ongoing job analytics

Possible, but depends on a business rule.

Likely ongoing statuses:

- `Navigating`
- `Arrived on Site`
- `In Progress`
- `Awaiting Materials`
- `On Hold`
- possibly `Ready for Service`

Why partial:

- the system should explicitly define which statuses count as "ongoing jobs" in analytics

### 5.3 Client satisfaction analytics

Possible through:

- `ServiceTicket.client_rating`
- `ServiceTicket.client_feedback`

Why partial:

- rating fields exist, but ratings may not be consistently captured for every completed ticket

### 5.4 Route efficiency analytics

Possible through:

- `route_distance`
- `route_duration`
- technician performance distance metrics

Why partial:

- route data is optional and may not exist for all tickets

---

## 6. What Analytics Are Not Reliable Yet

These should not be presented as strong capstone analytics until the missing fields are added.

### 6.1 Barangay-level analytics

Not reliable yet because:

- `ServiceLocation` has `address`, `city`, and `province`
- there is no explicit `barangay` field

### 6.2 Accurate arrival delay analytics

Not reliable yet because:

- no `arrived_at_site` datetime exists on `ServiceTicket`

### 6.3 Exact dispatch-to-arrival travel time

Not reliable yet because:

- assignment time exists
- route duration exists optionally
- actual arrival timestamp is not strongly stored

### 6.4 Full lifecycle milestone analytics

Not reliable yet because:

- there is no canonical field set for:
  - approved_at
  - dispatched_at
  - navigation_started_at
  - arrived_at_site
  - work_started_at separate from `start_time`
  - completed_at separate from `completed_date`

### 6.5 Forecasting by barangay or sub-region

Not reliable yet because:

- location granularity is too coarse

---

## 7. Fields That Should Be Added

If you want the analytics page to become much stronger and more thesis-defensible, these are the best fields to add.

### High-priority fields

#### Add to `ServiceLocation`

- `barangay = models.CharField(max_length=100, blank=True, null=True)`

Why:

- needed for barangay-level heatmaps and local demand analysis

#### Add to `ServiceTicket`

- `arrived_at_site = models.DateTimeField(blank=True, null=True)`
- `navigation_started_at = models.DateTimeField(blank=True, null=True)`
- `work_started_at = models.DateTimeField(blank=True, null=True)` if you want a clearer alias than `start_time`
- `work_completed_at = models.DateTimeField(blank=True, null=True)` if you want a clearer alias than `completed_date`
- `approved_at = models.DateTimeField(blank=True, null=True)`

Why:

- these make workflow analytics precise and easy to explain academically

### Medium-priority fields

#### Add to `TicketProgress`

- normalize `progress_status` into choices
- optionally add `event_type`

Why:

- free text causes weak reporting consistency

#### Keep completed-job facts on the authoritative workflow

Use `ServiceTicket`, `ServiceLocation`, and `ServiceStatusHistory` for province,
city, assignment, arrival, start, and completion facts. Do not recreate the
retired `ServiceHistory` summary table.

### Optional but useful fields

- `completion_verified_by_admin`
- `client_feedback_submitted_at`
- `resolved_within_sla`
- `travel_time_minutes`
- `queue_time_minutes`

---

## 8. Recommended Analytics Cards And Charts

This is the recommended final capstone dashboard structure.

### A. Executive cards

- Total Service Requests
- Completed Jobs
- Pending Jobs
- Ongoing Jobs
- Active Technicians
- Average Completion Time
- Average Response Time
- Forecasted Next 7 Days Demand

### B. Workflow charts

- Tickets by Status
- Request Volume by Month
- Monthly Completed Jobs
- Average Completion Time by Month

### C. Service demand charts

- Most Requested Services
- Completed Jobs by Service Type
- Priority Distribution
- Request Source Mix

### D. Technician charts

- Completed Jobs per Technician
- Most Active Technicians by Month
- Technician Performance Table
- Technician Availability Snapshot

### E. Location analytics

- Service Demand by Province
- Service Demand by City
- CALABARZON Coverage Heatmap
- Completed Jobs Heatmap
- Location Demand Forecast

### F. Operational health analytics

- Reschedule Rate
- Warranty Status Mix
- Ticket Type Mix
- Preferred Time Slot Demand
- Scheduled Time Slot Mix
- SLA Risk Indicators

### G. Forecast analytics

- 7-Day Trend-Based Demand Estimate
- Forecast by Service Type
- Peak Demand Day
- Forecast Confidence
- Forecast vs Actual Comparison

---

## 8.1 Dashboard Curation Rule

The analytics dashboard should be helpful, not noisy.

That means the page should prioritize:

- decision-making metrics
- operational bottlenecks
- service demand patterns
- technician workload and performance
- location-based coverage insights

It should avoid:

- too many cards showing similar numbers
- duplicate charts with the same message
- decorative charts that do not support an admin decision
- overcrowding the first screen with low-priority metrics

### Recommended rule for the main analytics page

Keep the main page focused on:

- 6 to 8 top summary cards only
- 1 main service trend chart
- 1 service demand chart
- 1 technician performance section
- 1 location insight section
- 1 forecast section

Everything else should be treated as secondary analytics and placed lower on the page, inside tabs, or inside drilldown views.

### Best “high-value, low-noise” default set

If the goal is a clean and helpful admin dashboard, the default visible analytics should be:

- Total Service Requests
- Completed Jobs
- Pending Jobs
- Ongoing Jobs
- Active Technicians
- Average Completion Time
- Monthly Request and Completion Trend
- Most Requested Services
- Tickets by Status
- Completed Jobs per Technician
- Service Demand by Province or City
- 7-Day Trend-Based Demand Estimate

### Analytics that should be secondary, not primary

These are useful, but should not dominate the page unless the admin needs them:

- request source mix
- preferred time slot demand
- warranty status mix
- reschedule rate
- busiest weeks
- detailed city and province tables
- seasonal inventory demand
- forecast accuracy comparison

### Practical design rule

For every chart or card on the page, ask:

- does this help the admin make a decision?
- does this add new insight not already shown elsewhere?
- will this still be understandable in 3 to 5 seconds?

If the answer is no, it should be reduced, moved lower, merged with another widget, or removed.

---

## 9. Backend API Endpoint Plan

## 9.1 Endpoints already sufficient for a strong first version

- `GET /api/admin/analytics/`
- `GET /api/admin/analytics/ai-summary/`
- `GET /api/dashboard/stats/`
- `GET /api/services/technician-performance/performance_breakdown/`
- `GET /api/services/coverage-heatmap/service_density/`
- `GET /api/services/coverage-heatmap/completed_jobs/`

These are enough to drive a serious capstone dashboard if the payload stays clean and filterable.

## 9.2 Recommended additional endpoints

### Drilldown endpoint

- `GET /api/admin/analytics/date-records/?date=YYYY-MM-DD`

This already exists and should be kept for chart click-through.

### Filter options endpoint

Recommended:

- `GET /api/admin/analytics/filter-options/`

Possible payload:

- service types
- provinces
- cities
- technicians
- ticket statuses
- request sources
- priorities

### Forecast accuracy endpoint

Recommended:

- `GET /api/admin/analytics/forecast-accuracy/`

Purpose:

- compare predicted demand vs actual completed or requested volume

### Export/report endpoint

Recommended:

- `GET /api/admin/analytics/export/?format=csv`
- `GET /api/admin/analytics/export/?format=pdf`

Purpose:

- capstone demo
- admin reporting

### Heatmap detail endpoint

Recommended:

- `GET /api/admin/analytics/location-detail/?province=...&city=...`

Purpose:

- drill down from map to actual completed jobs or requests

---

## 10. Frontend Components Needed

The current page already uses Recharts and is structurally strong. These are the components that should exist in the final design.

### Core components

- stats card row
- trend line chart
- grouped bar chart
- stacked bar chart
- pie or donut chart
- technician ranking table
- heatmap map component
- forecast summary panel
- filter bar
- empty state cards

### Recommended chart mapping

- line chart: monthly requests, monthly completions, forecast trend
- bar chart: service type demand, technician completions, ticket statuses
- donut chart: request source mix, priority mix, warranty mix
- table: technician performance, city/province completion trends
- heatmap: CALABARZON coverage and service density

### Existing frontend observations

The current page already includes most of the right building blocks. The main improvements are:

- remove hidden duplicate JSX block
- keep chart naming academically consistent
- make filter behavior consistent across all analytics widgets
- optionally add click-through drilldown from charts to `date-records`

---

## 11. Realistic Forecasting Method For The Capstone

## Recommended method

Use **trend-based demand estimates** rather than claiming advanced AI prediction.

### Best fit for your capstone

A weighted historical forecast using:

- recent daily average
- weekday factor
- short-term growth trend
- service type history
- optional location weighting

This is already close to what your backend analytics is doing.

### Why this is realistic

- understandable to panel members
- defendable without overclaiming
- suitable for limited historical data
- implementable using existing request and ticket history
- more honest than saying the system has highly accurate AI forecasting

### Recommended wording for the thesis and UI

Use phrases such as:

- trend-based demand estimates
- historical demand trend forecast
- rule-based demand projection
- weighted service demand forecast

Avoid phrases such as:

- highly accurate AI prediction
- machine learning demand intelligence

unless you truly train and validate a model properly.

### Minimum forecast inputs

- request date
- service type
- city or province
- historical daily or monthly counts

### Good forecast outputs

- predicted demand next 7 days
- top service type likely to increase
- location hotspots likely to need service
- recommended technician capacity

---

## 12. Recommended Sample Data For Testing

To test the analytics dashboard properly, generate at least:

### Service requests

- 150 to 300 service requests
- spread across at least 6 to 12 months
- using multiple request sources
- using multiple priorities
- spread across multiple cities and provinces in CALABARZON

### Service tickets

- 120 to 250 linked tickets
- realistic status variety
- realistic completion times
- mix of completed, in progress, on hold, cancelled
- mix of inspection and installation tickets

### Technicians

- 5 to 12 technicians
- different workloads
- different skill levels
- different availability states

### Location data

- enough latitude and longitude points across:
  - Cavite
  - Laguna
  - Batangas
  - Rizal
  - Quezon

### Forecast validation data

- at least several months of historical requests or completions
- multiple service types
- at least some variation by weekday or month

### Recommended completed-job sample fields

For a strong testing dataset, every completed record should ideally include:

- `ticket_id`
- `service_type`
- `technician_name`
- `ticket_status`
- `priority`
- `province`
- `city`
- `barangay`
- `latitude`
- `longitude`
- `created_at`
- `assigned_at`
- `arrived_at_site`
- `started_at`
- `completed_at`

Current gap:

- `barangay` is not explicitly stored
- `arrived_at_site` is not explicitly stored as a dedicated field

---

## 13. What Data Is Still Needed To Finalize The Dashboard Perfectly

Even though the codebase already reveals a lot, the following data is still needed for a final polished analytics plan:

- sample completed-job dataset from your real or demo records
- confirmation of which statuses count as "ongoing jobs"
- confirmation of whether forecast should be based on requests, completed jobs, or both
- screenshot or mockup of the exact analytics page layout you want
- confirmation of whether `Arrived on Site` should use `TicketProgress` or a new dedicated timestamp field
- confirmation of whether barangay will be added to the database

---

## 14. Final Advisory Summary

### What is already strong

- your system already has enough data for a credible capstone analytics module
- you already have working analytics endpoints
- you already have demand forecasting structures
- you already have map and heatmap support
- you already have technician performance support

### What should be improved next

- add explicit milestone timestamps, especially `arrived_at_site`
- add `barangay`
- normalize progress event tracking
- remove hidden duplicate frontend analytics block
- document business rules for "ongoing jobs"

### Best capstone positioning

Present the analytics dashboard as:

- an operational decision-support dashboard
- supported by historical service records
- enhanced with trend-based demand estimates
- focused on service demand, technician performance, geographic coverage, and workflow efficiency

That framing is realistic, professional, and academically defensible.

---

## 15. Recommended Next Build Order

1. Clean the analytics frontend component and remove dead duplicate JSX.
2. Add missing fields: `barangay`, `arrived_at_site`.
3. Standardize progress event logging.
4. Finalize dashboard business definitions:
   - ongoing jobs
   - completed jobs
   - forecast source of truth
5. Generate realistic seeded historical data.
6. Add export and drilldown endpoints.
7. Capture screenshots for the capstone manuscript and defense.

---

## 16. One-Sentence Conclusion

Your current database already supports a strong analytics dashboard for the capstone, but adding explicit milestone timestamps, barangay-level location data, and consistent workflow event logging will make the dashboard much more accurate, defensible, and presentation-ready.
