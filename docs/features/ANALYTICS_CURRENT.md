# AFN Analytics — Current Implementation

Last verified: **2026-09-20**
Status: **Implemented and connected to live database data**

## 1. Purpose

The Analytics & Forecasting page is an operational decision view for authorized
administrators. It summarizes service demand, ticket delivery, technician
workload, geographic demand, current risks, and whether the stored history is
ready for honest forecasting.

It does not replace Reports. Analytics provides interactive summaries and
patterns; Reports remains the location for detailed records, formal tables,
exports, and audit-oriented review.

## 2. Current Architecture

| Layer | Current implementation | Source |
| --- | --- | --- |
| Frontend route | `/admin/analytics` | `frontend/src/App.jsx` |
| Frontend page | Responsive, glance-first operations dashboard | `frontend/src/pages/admin/AdminAnalytics.jsx` |
| Frontend API helper | Builds query parameters, supports cancellation, and normalizes errors | `frontend/src/api/admin.js` |
| Backend route | `GET /api/admin/analytics/` | `backend/api/urls.py` |
| Backend view | Authenticated, capability-protected read-only viewset action | `backend/users/views/admin_services.py` |
| Analytics services | Validate filters and calculate Overview plus selected specialized responses | `backend/users/analytics_service.py`, `backend/users/analytics_workspaces.py` |
| Authorization | Admin or superadmin account with `analytics.view` | `backend/users/permissions.py`, `backend/users/rbac.py` |
| Visualization | Recharts | `frontend/package.json` |
| Business timezone | `Asia/Manila` for date boundaries and buckets | `backend/users/analytics_service.py` |

The page performs one cancellable request for the selected workspace whenever
its filters change. It does not preload other workspaces, combine independent
dashboard requests, or use mock, random, or fabricated values.

## 3. Analytics Workspaces

| Workspace | Decision support supplied |
| --- | --- |
| Overview | Five cohort KPIs, comparisons, cross-domain attention, demand, status, workload, location, and readiness |
| Technicians | Lead workload, qualified category rankings, daily estimated capacity, skill/checklist/arrival coverage, and separate crew participation |
| Sales | Confirmed Sales Records, currency-separated totals, quotation conversion, line composition, breakdowns, and data-quality warnings |
| Inventory | Stock/value snapshot, movement comparisons, reservations, ticket-link coverage, returns, and deterministic shortage risk |
| After-Sales & Maintenance | Case comparisons plus current maintenance due and risk summaries; revisits are not labeled rework |
| Forecasting | Genuine-history readiness, monthly demand, service/location evidence, a stored six-month seasonal-trend outlook only after holdout validation, actual-versus-predicted evidence, and 7/30-day ticket-linked item demand when every service and inventory gate passes |

The tabs are keyboard accessible. Only the selected workspace payload is
returned and rendered; switching tabs hides stale workspace content behind a
loading state until the matching response arrives.

Workspace tabs wrap into multiple rows on narrow screens, so every workspace
name remains visible without horizontal scrolling. Overview and specialized
categorical comparisons use HTML-labeled proportional bars: service, status,
technician, location, item, category, source, and risk labels wrap naturally
and are never shortened with ellipses or constrained to fixed-width chart axes.

## 4. Page Structure

### Operations intelligence header

Four summaries are derived from the already returned chart data and do not
create extra API requests:

| Summary | Calculation |
| --- | --- |
| Top service | Highest `service_demand.requests` value |
| Busiest period | Highest `requests_vs_completions.requests` value |
| Highest workload | Highest `technician_workload.assigned_jobs` value |
| Top location | Highest `locations.requests` value |

The header also shows the API generation time and a manual Refresh action.

### Analysis filters

The default filter bar stays compact. It shows:

- 30-day and 90-day presets
- the active date range
- primary service type
- ticket status
- a More filters control

More filters progressively reveals the less frequently used controls:

- custom start and end dates
- grouping: day, week, month, quarter, or year
- lead technician
- ticket priority
- city
- province
- assigned, unassigned, or both
- clear all filters

Comparison choices are previous equal period, previous calendar month, previous
calendar quarter, matching dates in the previous year, a custom earlier date or
equal-length range, and no comparison.
The compact controls change by workspace; Sales, Inventory, After-Sales, and
Maintenance expose only their relevant canonical filters. Forecasting evaluates
all genuine history rather than presenting a selected-range prediction.

The default view covers the latest 30 calendar days and groups by day.

### Performance pulse

Exactly five primary KPIs are displayed. The first four include a real
comparison against the immediately preceding range with the same number of
calendar days and the same dimension filters:

| KPI | Current definition |
| --- | --- |
| Total tickets | Tickets created during the selected range after all filters |
| Completed | Tickets in that created-ticket cohort whose current canonical status is `Completed` |
| Completion rate | `completed_tickets / total_tickets × 100`; cancelled tickets remain in the denominator |
| Average completion | Mean `completed_date - start_time` for completed cohort tickets with both timestamps and a non-negative duration |
| Current overdue | Current unresolved tickets whose live SLA evaluation is overdue; historical start/end dates do not limit this value |

Average completion displays the number of valid observations. When no valid
duration exists, the page shows an em dash instead of inventing a value.

### Charts and operational panels

| Section | What it shows | Important semantics |
| --- | --- | --- |
| Requests vs completions | Zero-filled time series of incoming requests and completed tickets | Requests use `request_date`; completions use `completed_date` |
| Current attention | Overdue, unassigned, low-stock, next-seven-day jobs, and open after-sales counts | A live snapshot; not all values follow the historical date range |
| Primary service demand | Current and previous request counts per primary service | Add-on service items are excluded |
| Ticket statuses | Current and previous status distributions for equal-length ticket cohorts | Statuses with no records in either period are omitted |
| Technician workload | Current assigned/completed lead jobs, previous assigned jobs, and a separate scheduled-hours list | Crew membership is excluded; hours are not plotted on the job-count axis |
| Demand by location | Current and previous request counts for up to ten city/province pairs | City and province casing differences are normalized |
| Forecast readiness | Progress toward the minimum genuine history requirements | Predictions remain hidden until requirements are satisfied and a model is validated |

## 5. Filter-to-API Contract

| Frontend control | Query parameter | Backend behavior |
| --- | --- | --- |
| Start date | `start_date=YYYY-MM-DD` | Inclusive start at midnight in Asia/Manila |
| End date | `end_date=YYYY-MM-DD` | Inclusive business date; implemented as an exclusive next-midnight boundary |
| Group by | `group_by=day\|week\|month\|quarter\|year` | Changes time-series bucket size |
| Service | `service_type_id=<positive integer>` | Filters by primary `ServiceRequest.service_type` |
| Technician | `technician_id=<positive integer>` | Filters by the ticket's lead technician |
| Status | `status=<canonical ticket status>` | Uses `ServiceTicket.STATUS_CHOICES` |
| Priority | `priority=<canonical priority>` | Uses `ServiceTicket.PRIORITY_CHOICES` |
| City | `city=<text>` | Case-insensitive exact match |
| Province | `province=<text>` | Case-insensitive exact match |
| Assignment | `assignment_state=assigned\|unassigned` | Tests whether the lead technician is present |
| Workspace | `workspace=overview\|technicians\|sales\|inventory\|after_sales\|forecasting` | Returns only the selected workspace contract |
| Comparison | `comparison=previous_period\|previous_month\|previous_quarter\|previous_year\|custom\|none` | Selects a non-overlapping prior range or disables prior values |
| Custom comparison | `comparison_start_date`, `comparison_end_date` | Requires an earlier range with the same inclusive duration as the current period |
| Sales | `sales_status`, `client_type`, `currency` | Validates SalesRecord status, client type, and currency |
| Inventory | `category_id`, `transaction_type`, `item_id`, `stock_status` | Validates canonical inventory relations and choices |
| After-sales | `case_type`, `case_status`, `case_priority`, `creation_source`, `requires_revisit` | Validates case choices and revisit boolean |
| Maintenance | `maintenance_status`, `risk_level`, `maintenance_service_type_id` | Validates maintenance choices and service relation |
| Legacy/default period | `days=1..1095` | Used when an explicit start date is absent; default is 30 |

Invalid dates, unsupported choices, invalid IDs, reversed ranges, and ranges
longer than 1,095 days are rejected with HTTP 400 validation responses.

Ticket dimensions also affect request-based metrics when the selected dimension
requires a linked ticket, such as technician, ticket status, or assignment
state. The request query is made distinct so a request is not counted twice
because of multiple related tickets.

## 6. Unified API Response

The page consumes this response shape:

```text
{
  generated_at,
  period: {
    start_date,
    end_date,
    group_by,
    timezone
  },
  metric_definitions: {
    total_tickets,
    completed_tickets,
    completion_rate,
    average_completion_hours,
    current_overdue
  },
  kpis: {
    total_tickets,
    completed_tickets,
    completion_rate,
    average_completion_hours,
    average_completion_observations,
    current_overdue
  },
  comparison: {
    period: {
      start_date,
      end_date
    },
    kpis: {
      total_tickets: { current, previous, delta, delta_percent },
      completed_tickets: { current, previous, delta, delta_percent },
      completion_rate: { current, previous, delta_points },
      average_completion_hours: {
        current, previous, delta_hours, delta_percent, observations
      }
    }
  },
  charts: {
    requests_vs_completions: [
      { period, label, requests, completions }
    ],
    service_demand: [
      { service_type_id, service_type, requests, previous_requests }
    ],
    ticket_statuses: [
      { status, label, count, previous_count }
    ],
    technician_workload: [
      {
        technician_id, technician, assigned_jobs, completed_jobs,
        previous_assigned_jobs, previous_completed_jobs, scheduled_hours
      }
    ],
    locations: [
      { city, province, requests, previous_requests }
    ]
  },
  attention: {
    unassigned_tickets,
    overdue_tickets,
    low_stock_items,
    upcoming_scheduled_jobs,
    open_after_sales_cases
  },
  forecast: {
    available,
    request_count,
    required_request_count,
    history_months,
    required_history_months,
    active_months,
    missing_months,
    earliest_request_date,
    latest_request_date,
    reason,
    method,
    predictions
  },
  filter_options: {
    service_types,
    technicians,
    statuses,
    priorities,
    cities,
    provinces
  },
  semantics: {
    service_demand,
    technician_workload,
    current_attention
  }
}
```

The backend also retains transitional compatibility aliases for the shared
system assistant. The current Analytics page does not use those aliases to
render duplicate widgets.

All responses include `workspace`, `generated_at`, `period`, and a deterministic
`comparison` contract. Each KPI comparison exposes `current`, `previous`,
`absolute_change`, `percentage_change`, `comparison_available`, and
`change_unit`. Specialized responses then return only their domain payload and
filter options rather than returning every workspace at once.

The Forecasting workspace additionally returns `demand_forecast` with
`monthly`, `daily`, `next_7_days`, `next_30_days`, `by_service`,
`validation_points`, `service_models`, `location_outlook`, and `model_status`.
`item_demand_readiness.predictions` contains separate 7-day and 30-day item
rows only when both model and inventory-evidence gates pass.

## 7. Data Sources

| Output | Authoritative models and fields |
| --- | --- |
| Ticket cohort and statuses | `ServiceTicket.created_at`, `status`, `priority`, `technician` |
| Completion count and trend | `ServiceTicket.status`, `completed_date` |
| Completion duration | `ServiceTicket.start_time`, `completed_date` |
| Request trend and service demand | `ServiceRequest.request_date`, `service_type`, `priority` |
| Location demand | `ServiceRequest.location` → `ServiceLocation.city`, `province` |
| Technician workload | `ServiceTicket.technician`, `assigned_at`, `scheduled_date`, `completed_date` |
| Scheduled hours | `ServiceRequest.service_type.estimated_duration` for non-cancelled scheduled tickets |
| SLA overdue | Live `evaluate_service_ticket_sla()` result for unresolved tickets |
| Low stock | `InventoryItem.quantity`, `reserved_quantity`, `minimum_stock`, `low_stock_threshold` |
| Open after-sales | `AfterSalesCase.status` in `open` or `in_progress` |
| Forecast readiness | Genuine `ServiceRequest.request_date` history; service/location from `ServiceRequest.service_type` and `ServiceRequest.location`; item-consumption evidence from ticket-linked `InventoryTransaction` issue rows; mapping coverage from `ServiceTypeInventoryRequirement` |
| Confirmed sales | `SalesRecord.status`, `sale_date`, `currency_code`, `agreed_total`; composition from `SalesRecordLine.line_total` |
| Technician evidence | Lead `ServiceTicket.technician`; separate `TicketCrewAssignment`; `InspectionChecklist`; `ArrivalValidationLog`; `TechnicianSkill` |
| Inventory | `InventoryItem`, `InventoryTransaction`, `InventoryReservation`, `ServiceTypeInventoryRequirement`, `EquipmentReturnRequest` |
| After-sales and maintenance | `AfterSalesCase.created_at`, `resolved_at`, `requires_revisit`; `MaintenanceSchedule.next_maintenance_date`, `status`, `risk_level` |

Requests whose description starts with `[Historical Seed]` are excluded from
forecast-readiness history so test or demonstration seeds cannot make the system
claim forecasting maturity.

## 8. Comparison Contract

For an inclusive current range of `N` business dates, `previous_period` uses
the immediately preceding `N` dates. The prior end is the day before the current
start, so ranges never overlap. `previous_month` and `previous_quarter` use the
complete calendar period before current start. `previous_year` maps the current
range to prior-year dates with leap-day clipping and rejects ranges longer than
366 days.

`custom` accepts any earlier non-overlapping comparison date or range with the
same inclusive duration. Setting current start/end to one date and comparison
start/end to another date provides exact date-to-date comparison. Equal duration
is enforced because comparing raw totals across different period lengths would
be misleading.

Counts and money use percentage change. Rates use percentage-point change. If
the previous value is zero, percentage change is `null`; infinity is never
shown. With `comparison=none`, previous values and comparison dates are `null`
and `comparison_available` is false.

## 9. Forecasting Behavior

The current development database remains below the evidence gates, so its page
correctly shows readiness rather than future quantities. The implementation can
publish a forecast automatically after genuine history passes every gate.

The system-wide readiness gate requires at least 100 genuine service requests,
six months of history, and no more than one empty month. A service model then
requires at least 24 genuine requests and 12 months of that service's history.
Descriptions beginning with `[Historical Seed]` are excluded throughout.

The implemented model is a monthly seasonal baseline blended with a damped
linear projection over the latest 12 months. Each service is backtested against
three to six unseen complete months. It stores actual and predicted holdout
values, MAE, WAPE, bias, seasonal-naive baseline WAPE, and the 90th-percentile
absolute error.

A service forecast is published only when the holdout contains at least ten
actual requests, WAPE is at most 60%, and the model is no more than five
percentage points worse than its seasonal-naive baseline. Published runs expire
from the API after seven days unless refreshed. A passing run provides a
six-month outlook plus derived 7-day and 30-day operational totals. These are
estimates, not guaranteed requests or sales.

While a model is unavailable, the workspace still shows useful descriptive
evidence: zero-filled monthly demand, continuity gaps, service mix, peak month,
historical service-location density, and genuine ticket-linked item usage.

Projected item demand requires at least 50 ticket-linked issue transactions,
60% linkage across all issue transactions, six active months of linked usage,
and a configured service-item mapping. Once both the inventory evidence and a
service model pass, the system multiplies the validated 7/30-day service outlook
by average genuine issued quantity per linked ticket, limited to configured
mappings. It shows expected quantity, planning quantity, available stock, and
projected shortage. These quantities are not described as items sold.

The validated 30-day service outlook is also allocated across city/province
pairs using each location's share of genuine requests from the latest 365 days.
This is explicitly labeled a historical-share allocation, not a separately
trained geographic model.

Analytics GET requests remain read-only. Forecast generation and completed-month
reconciliation run through an explicit command:

```powershell
python manage.py generate_demand_forecasts --dry-run
python manage.py generate_demand_forecasts
```

The analytics-only Windows automation scripts run this command after the daily
aggregate and technician-performance jobs.

## 10. Loading, Empty, Error, and Refresh Behavior

- Initial loading shows five KPI skeleton cards.
- Empty charts show a clear no-records message.
- Request failures show an alert and Retry action.
- Invalid local date order is shown before another API request is made.
- In-flight requests are cancelled when filters change or the component unmounts.
- Manual refresh repeats the current filtered request.
- A lightweight “Updating…” indicator appears while existing results refresh.

## 11. Permissions and Privacy

- The frontend route allows admin and superadmin roles only when the account has
  the `analytics.view` capability.
- The backend independently enforces authentication and the same Analytics
  capability.
- The response contains aggregate operational values and filter labels. It does
  not expose credentials, environment secrets, raw client descriptions, or
  private tokens.
- `GET /api/admin/analytics/` is read-only and does not generate or save forecast
  rows.

### Analytics Assistant alignment

The admin Analytics Assistant loads both the Overview and Forecasting workspace
contracts. Local answers and the optional Gemini explanation endpoint use the
same readiness rules:

- historical service-location density is described as recorded evidence, not a
  future prediction;
- inventory consumption includes only issue transactions linked to service
  tickets and excludes historical seed requests;
- future quantities and accuracy are reported as unavailable while no current
  validated and backtested model exists;
- when a publishable run exists, the Assistant reports its 7/30-day outlook and
  stored holdout WAPE without describing the validation score as statistical
  confidence;
- question controls remain disabled until all assistant data requests finish,
  preventing a premature answer from an incomplete snapshot;
- assistant message text preserves line breaks and wraps long words or identifiers
  instead of hiding overflow; and
- an optional Gemini response marked with any incomplete finish reason, including
  `MAX_TOKENS`, is rejected and replaced with the complete local explanation.

## 12. Analytics Versus Reports

### Analytics contains

- KPI summaries
- interactive filtering
- time trends
- categorical comparisons
- workload and location patterns
- live attention signals
- forecast readiness

### Reports contains

- detailed operational records
- formal summaries
- printable or exportable tables
- reconciliation and audit-oriented information

The Analytics page deliberately avoids duplicating record-level report tables
or export workflows.

## 13. Current Limitations

- The current development database does not meet the genuine-history gate, so
  it correctly displays readiness rather than predictions.
- Per-service models require 12 months and sufficient holdout demand even after
  the system-wide 100-request/six-month threshold is met.
- The current model captures calendar-month seasonality and recent linear trend;
  it does not use weather, pricing, promotions, or external economic variables.
- Projected item demand is also unavailable until ticket-linked inventory issue
  history and service-item mappings meet their evidence thresholds; unlinked
  issues are shown as a coverage gap and never attributed to a service.
- Workload represents lead-technician assignments only, not crew participation.
- Scheduled hours are estimates based on configured primary-service duration,
  not measured utilization or attendance hours.
- Current overdue is a live SLA value and therefore does not follow the selected
  historical date range.
- Low-stock and open after-sales counts are global live signals; service,
  technician, status, priority, and location filters do not apply to them.
- Location analytics currently use city and province. No dedicated barangay
  dimension is exposed by this endpoint.
- Completion rate describes the current state of the ticket-created cohort. It
  is not a period-completion throughput ratio.
- The Analytics JavaScript bundle is relatively large because Recharts is loaded
  with the route; route-level chart splitting remains a future optimization.
- A combined technician Performance Index is intentionally absent because
  missing ratings and actual-work evidence would make it misleading. Separate
  category rankings enforce their stated sample thresholds.
- Quotation monetary analytics remain unavailable because quotation monetary
  fields are text; accepted/rejected count conversion remains usable.
- Mixed currencies are never summed. Combined amount and average are unavailable
  while the currency-separated rows remain visible.
- Maintenance has no direct technician relationship, so no maintenance-by-tech
  claim is made.

## 14. Current Validation Evidence

The current implementation has the following recorded checks:

- focused forecasting, Analytics workspace, Assistant, and scheduler suite:
  **30 passed**, including final cross-month 7/30-day proration coverage
- Django system check: **passed**
- migration drift check: **no changes detected**
- production frontend build: **passed, 2,519 modules transformed**
- focused authenticated Chromium Analytics journey: **1 passed**
- the focused browser journey opens the Analytics Assistant, waits for its
  Forecasting data, and verifies that forecast accuracy/confidence are reported
  unavailable rather than as zero or an invented percentage
- assistant message bubbles have no hidden overflow and are checked for horizontal
  content overflow in the focused browser journey
- focused browser journey switched through all six workspaces and returned to Overview
- mobile main-content horizontal overflow: **none detected**
- Analytics contains no deliberate `truncate` utility; long categorical labels
  and all six workspace tabs are asserted visible in the focused browser journey
- Analytics query budget test: **at most 20 database queries**
- specialized ceilings: **Technicians 20, Sales 25, Inventory 32, After-Sales 40, Forecasting 12**
- read-only development-data forecast dry run: **0 of 9 active services
  published**, correctly withheld because only 20 genuine requests over about
  4.4 months are currently available
- full Django suite: **424 passed, 3 skipped, 2 pre-existing inventory completion failures**

The broader Django baseline has two unrelated, pre-existing inventory completion
test failures. They are documented in
`docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md` and are not caused by the
Analytics implementation.

## 15. Source Map

- `frontend/src/pages/admin/AdminAnalytics.jsx`
- `frontend/src/api/admin.js`
- `frontend/src/App.jsx`
- `frontend/src/rbac.js`
- `backend/api/urls.py`
- `backend/users/analytics_service.py`
- `backend/users/analytics_workspaces.py`
- `backend/users/forecasting_service.py`
- `backend/users/views/admin_services.py`
- `backend/users/permissions.py`
- `backend/users/rbac.py`
- `backend/users/tests.py`
- `backend/services/tests/test_analytics_workspace.py`
- `backend/services/tests/test_demand_forecasting.py`
- `backend/services/management/commands/generate_demand_forecasts.py`
- `backend/services/test_reporting_capabilities.py`
- `e2e/03-admin-workspace.spec.js`

---

**CURRENT ANALYTICS DOCUMENTATION COMPLETE — THIS FILE DESCRIBES THE IMPLEMENTED SYSTEM, NOT A FUTURE MOCKUP.**
