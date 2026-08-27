# AFN-SERVE Full System Analysis and Client Requirement Mapping

## 1. Executive Summary

AFN-SERVE is a Django REST/Channels and React/Vite service-management system. Core request, ticket, technician, inventory, documents, notifications, maintenance, warranty, analytics, maps, and role management already exist.

The main client-request gaps are not a full rebuild. Most revisions should extend existing architecture: serialized inventory units, supplier purchase tracking, payment history, AC maintenance rules, public survey links, service colors, SMS fallback, and clearer team/multi-visit scheduling.

This report is based on read-only inspection of the current codebase. No implementation code is included.

## 2. Current System Architecture

Frontend:

- Framework: React + Vite.
- Entry/routing: `frontend/src/App.jsx`.
- API wrappers: `frontend/src/api/*`.
- RBAC helpers: `frontend/src/rbac.js`.
- Auth context: `frontend/src/context/AuthContext.jsx`.
- Main page groups: `frontend/src/pages/admin`, `frontend/src/pages/technician`, `frontend/src/pages/client`, `frontend/src/pages/follow_up`.
- Shared components: `frontend/src/components/shared`, `frontend/src/components/ui`, `frontend/src/components/layout`, `frontend/src/components/documents`, `frontend/src/components/maps`.

Backend:

- Framework: Django + Django REST Framework + Channels.
- Project config: `backend/afn_service_management`.
- Main apps: `users`, `services`, `inventory`, `notifications`, `messages_app`, `progress`, `history`, `api`.
- API root: `backend/api/urls.py`.
- Main service APIs: `backend/services/urls.py`.
- Auth/user APIs: `backend/users/urls.py`.
- Inventory APIs: `backend/inventory/urls.py`.

Database:

- Local development currently uses SQLite through `backend/db.sqlite3`.
- Production is PostgreSQL-ready through `DATABASE_URL` in `backend/afn_service_management/settings.py`.
- Aiven PostgreSQL is supported through a standard PostgreSQL URL with `sslmode=require`.

Storage:

- Local filesystem media by default.
- Cloudinary media storage is enabled when Cloudinary environment variables are present.
- DOCX templates live in `backend/document_templates/`.

Realtime/background:

- Channels is configured.
- Default channel layer is in-memory unless Redis env vars are provided.
- Messaging and inventory include WebSocket-related files.
- Scheduled/automation scripts exist under `automation/` and backend management commands.

## 3. Current User Roles

Implemented roles:

```text
superadmin
admin
technician
client
```

Deprecated/redirected concepts:

- Supervisor and follow-up roles are not active roles anymore.
- Supervisor/follow-up routes redirect into the admin workspace.

Permission enforcement:

- Frontend: `ProtectedRoute` in `frontend/src/App.jsx`, plus capability checks in `frontend/src/rbac.js`.
- Backend: `backend/users/permissions.py`, `backend/users/rbac.py`, and object/queryset scoping in service/user/message views.

Superadmin:

- Full capability access.
- Can manage staff capabilities.
- Can access admin dashboard, tickets, dispatch, tracking, users, services, inventory, documents, analytics, reports, settings, activity logs, after-sales, public site editor, support, and profile.

Admin:

- Admin workspace role with capability-based access.
- Can view/manage areas depending on granted capability codes.
- Cannot manage staff capabilities unless superadmin.

Technician:

- Can access technician dashboard, jobs, schedule, navigation, checklist, messages, history, and profile if capabilities are present.
- Data scope is assigned jobs, either lead technician or crew member.

Client:

- Can access dashboard, service requests, solar estimates, request tracking, service history, support, notifications, and profile.
- Data scope is owned requests, tickets, notifications, support cases, and messages.

## 4. Current Service Workflows

Actual workflow from code:

```text
Client/Admin creates ServiceRequest
ServiceRequest stays Pending
Admin approves, rejects, or cancels
Approval creates/ensures ServiceTicket
Optional inspection ticket/status
Admin assigns technician/crew or auto-dispatch runs
Technician starts navigation
Technician arrival validation records GPS/distance
Technician starts work
Technician submits checklist/inspection/proof media
Technician may request parts
Inventory reservations/transactions update stock
Technician completes work with proof photos/notes
Warranty, maintenance, and after-sales sync runs
Client can submit feedback
History, reports, analytics, documents reflect the ticket
```

Main models:

- `ServiceRequest`
- `ServiceTicket`
- `ServiceLocation`
- `ServiceRequestService`
- `TicketCrewAssignment`
- `InspectionChecklist`
- `ServiceStatusHistory`
- `InventoryReservation`
- `InventoryTransaction`
- `MaintenanceSchedule`
- `AfterSalesCase`
- `InstalledEquipment`

Main endpoints:

- `/api/services/service-requests/`
- `/api/services/service-requests/{id}/approve/`
- `/api/services/service-requests/{id}/reject/`
- `/api/services/service-requests/{id}/cancel/`
- `/api/services/service-tickets/`
- `/api/services/service-tickets/{id}/assign/`
- `/api/services/service-tickets/{id}/auto_assign/`
- `/api/services/service-tickets/{id}/update_status/`
- `/api/services/service-tickets/{id}/start_work/`
- `/api/services/service-tickets/{id}/complete_work/`
- `/api/services/service-tickets/{id}/request_parts/`
- `/api/technician/jobs/{id}/start-navigation/`
- `/api/technician/jobs/{id}/arrive/`
- `/api/checklist/`

Ticket statuses:

```text
Not Started
For Inspection
Inspection Completed
Ready for Service
Awaiting Materials
Navigating
Arrived on Site
In Progress
Completed
Turned Over / Accepted
On Hold
Cancelled
```

Request statuses:

```text
Pending
Approved
In Progress
Completed
Cancelled
```

## 5. Database Architecture

Users:

- `User`: single auth model with role, phone, landline, address, email verification, status, profile image.
- `TechnicianProfile`: technician GPS, availability, skill level, work areas, daily capacity.
- `ClientProfile`: client type, company info, billing address, preferred contact method, credit limit, account balance.
- `ManagementProfile`: admin scope.
- `UserCapabilityGrant`: direct capability grants.
- `AdminSettings`: global settings, overtime dispatch, business hours, maintenance reminders, landing-page settings, location validation, warranty defaults.
- `ActivityLog`: admin-facing activity.
- `ChangeLog`: field-level change audit.

Services:

- `ServiceType`: service catalog, duration, estimated cost, max assignments, procedures, required equipment, active flag, inspection requirement.
- `ServiceRequest`: client request with service, status, priority, preferred date/time, source, notes.
- `ServiceRequestService`: multiple service types per request.
- `ServiceLocation`: address, city, province, lat/lng.
- `SolarEstimate`: client solar calculator estimate and conversion to request.
- `ServiceTicket`: assigned operational work, technician/admin, schedule, times, status, warranty, route, completion proof, project details.
- `TicketCrewAssignment`: extra technicians on a ticket.

Technician/location:

- `TechnicianSkill`: technician to service type with skill level.
- `ArrivalValidationLog`: navigation/arrival/job actions with GPS validation result.
- `TechnicianLocationHistory`: technician GPS history snapshots.
- `ServiceStatusHistory`: status transition history.

Documents/forms:

- `InspectionChecklist`
- `SolarCommissioningChecklist`
- `TechnicalDataSheet`
- `TurnoverAcceptance`
- `GeneratedDocument`
- `QuotationRecord`
- `InstallationContract`
- `SolarProjectProfile`
- `FieldServiceReport`

After-sales/equipment:

- `AfterSalesCase`
- `MaintenanceSchedule`
- `InstalledEquipment`

Inventory:

- `InventoryCategory`
- `InventoryItem`
- `InventoryTransaction`
- `InventoryReservation`
- `ServiceTypeInventoryRequirement`

Communication:

- `Notification`
- `NotificationTemplate`
- `NotificationLog`
- `Message`
- `CustomerSupportCase`

Analytics:

- `ServiceAnalytics`
- `TechnicianPerformance`
- `DemandForecast`
- `ServiceTrend`

## 6. Inventory Architecture

Current inventory is product-level/quantity-based.

Already implemented:

- Item category hierarchy.
- `InventoryItem.name`.
- Unique `InventoryItem.sku`.
- Quantity.
- Reserved quantity.
- Available quantity property.
- Minimum stock.
- Low stock threshold.
- Low stock detection.
- Low stock notifications.
- Unit price and total value.
- Warehouse location.
- Supplier as text.
- Supplier contact as text.
- Purchase date.
- Warranty expiry.
- Inventory transactions.
- Inventory reservations.
- Service type default inventory requirements.

Partially implemented:

- Supplier tracking: text fields exist, but no normalized supplier or purchase records.
- Purchase history: transactions can represent purchase receipts, but no supplier invoice/purchase order model exists.
- Installed job connection: transactions and reservations can link to service tickets, but installed equipment is not linked to inventory item/unit.

Missing:

- Physical serialized unit model.
- Unit of measurement field.
- Size field.
- Capacity field on inventory product.
- Supplier purchase history model.
- Purchase order/receipt model.
- Serial number per stock unit.
- Traceability from installed item to exact inventory unit/supplier.

Recommended direction:

- Keep `InventoryItem` as product/SKU master.
- Add child model such as `InventoryUnit` or `SerializedInventoryUnit`.
- Add normalized `Supplier` and `InventoryPurchase`/`PurchaseLine`.
- Link `InstalledEquipment` to serialized unit where applicable.

## 7. Equipment / Serial Number Architecture

Existing installed equipment model:

```text
InstalledEquipment
- ticket
- client
- brand_model
- equipment_type
- serial_number
- capacity
- location
- warranty_start
- warranty_end
```

Existing serial-related fields:

- `InstalledEquipment.serial_number`
- `FieldServiceReport.serial_number`
- `SolarCommissioningChecklist.inverter_serial_number`

Current limitation:

- A product with one SKU and many physical units cannot be represented properly.
- Serial numbers are stored after installation/reporting, not as inventory-controlled units.
- Installed equipment cannot be traced back to supplier/purchase.

Example unsupported today:

```text
Product: 5kW Solar Inverter
SKU: INV-005
Units: SN001, SN002, SN003
```

This requires a new inventory-unit layer.

## 8. AC Architecture

Current configured service type:

```text
AC Service & Installation
```

Existing support:

- Generic service request/ticket flow.
- Generic inspection checklist.
- Maintenance schedule can apply after completion if selected during checklist.
- Field service report contains AC-like readings: indoor/outdoor temp, amperes, voltage, brand/model, serial number.

Missing or partial:

- AC installation and AC maintenance are not separated in the active service catalog.
- AC unit records are not separately modeled.
- First maintenance free rule does not exist.
- Subsequent maintenance paid rule does not exist.
- Maintenance payment status does not exist.
- On-call AC maintenance can be represented as a request, but there is no explicit on-call maintenance workflow.
- AC-specific survey form is not confirmed from code.

## 9. Solar Architecture

Solar has the strongest dedicated implementation.

Existing:

- `SolarEstimate`
- `SolarCalculator`
- `SolarProjectProfile`
- `SolarCommissioningChecklist`
- `TechnicalDataSheet`
- `InstallationContract`
- `QuotationRecord`
- `TurnoverAcceptance`
- solar DOCX templates
- service types such as Solar Panel Installation, Solar Panel Maintenance, Solar Inverter Repair

Current model:

- Solar is represented as a service/project workflow with profile/document fields.
- It is not modeled as a product package containing individual components.
- Battery is present as fields such as `battery_preference` and `battery_brand`, not as a separate optional product/package line.

Required for solar package + optional battery:

- Add package/product concept or quote/BOM line types.
- Link package components to inventory items/serialized units.
- Treat battery as optional add-on line item.

## 10. FDAS / LED Wall Architecture

FDAS:

- `Fire Alarm Inspection` exists as a service type in local data.
- Dedicated FDAS model/form was not confirmed.
- Existing generic ticket/checklist/document workflow can handle it operationally.

LED Wall:

- No active LED Wall service type was confirmed in local service catalog.
- No dedicated LED Wall form/model/workflow was found.

Required:

- Add service type(s).
- Add service-specific procedures/checklists.
- Add inventory/equipment requirements.
- Add documents/forms only if client needs specific outputs.

## 11. Survey / Form Architecture

Existing forms:

- `InspectionChecklist`
- `TechnicalDataSheet`
- `SolarCommissioningChecklist`
- `TurnoverAcceptance`
- `QuotationRecord`
- `InstallationContract`
- `FieldServiceReport`
- `GeneratedDocument`

Who fills them:

- Mostly technicians/admins inside authenticated workflows.
- Client remote/public form submission was not confirmed from code.

Photos:

- `InspectionChecklist.proof_media`
- `ServiceTicket.completion_proof_images`
- message image attachments
- uploaded media through checklist/document flows

Missing:

- Public signed form links.
- Service-specific survey template system.
- Dedicated AC installation survey.
- Dedicated solar site survey beyond current TDS/inspection data.

## 12. Technician Workflow

Technician pages:

- `/technician/dashboard`
- `/technician/my-jobs`
- `/technician/schedule`
- `/technician/map-navigation`
- `/technician/checklist`
- `/technician/inspection-checklist`
- `/technician/messages`
- `/technician/job-history`
- `/technician/profile`

Actions:

- View assigned jobs.
- View schedule.
- Start navigation.
- Mark arrival.
- Update job status.
- Submit checklist.
- Submit inspection checklist.
- Upload photos/proof.
- Request additional equipment.
- Complete work.
- Message staff/clients.

Multiple technicians:

- Supported per ticket by `TicketCrewAssignment`.
- No reusable `Team` model exists.
- A technician can be assigned to multiple tickets.
- A technician belonging to multiple formal teams is not modeled.

Time:

- Ticket work start/end exists.
- Full employee attendance does not exist.

## 13. Scheduling

Existing:

- `ServiceRequest.preferred_date`
- `ServiceRequest.preferred_time_slot`
- `ServiceTicket.scheduled_date`
- `ServiceTicket.scheduled_time`
- `ServiceTicket.scheduled_time_slot`
- Admin calendar endpoint.
- Technician schedule endpoint.
- Client reschedule request.
- Admin reschedule action.
- Auto-dispatch capacity checks.

Partial:

- Multi-day work can be approximated through duration/capacity, but not explicitly modeled as visit days.
- Follow-up due dates exist through maintenance and after-sales cases.

Missing:

- Explicit multi-visit schedule model.
- Project schedule with day 1/day 2/day 6 visits.
- Formal team scheduling.
- Conflict model beyond capacity checks.

## 14. Attendance / Time Tracking

Current time tracking represents service-ticket work, not HR attendance.

Exists:

- `ServiceTicket.start_time`
- `ServiceTicket.end_time`
- `ServiceTicket.completed_date`
- `ArrivalValidationLog`
- `TechnicianLocationHistory`

Partial:

- Overtime dispatch capacity exists in `AdminSettings.allow_overtime_dispatch` and `overtime_daily_capacity_minutes`.

Missing:

- Employee attendance.
- Daily clock in/out.
- Breaks.
- Payroll overtime.
- Per-day attendance records.

## 15. Payments / Credit

Partial support exists.

Existing:

- `ClientProfile.credit_limit`
- `ClientProfile.account_balance`
- `QuotationRecord.total_amount`
- `QuotationRecord.downpayment_amount`
- `QuotationRecord.balance_amount`
- `QuotationRecord.payment_terms`
- `InstallationContract.total_contract_amount`
- `InstallationContract.payment_terms_upfront`
- `InstallationContract.payment_terms_completion`
- `InstallationContract.payment_terms_final`
- `AdminSettings.external_payment_notice`

Missing:

- Payment ledger.
- Payment status.
- Payment method.
- Receipt.
- Payment date.
- Partial payment history.
- Maintenance payment records.
- Link between payments and request/ticket/project lifecycle.

Adding credit/balance tracking is medium-to-high complexity because existing fields are summary fields, not transactional accounting.

## 16. Refund / Replacement

Search findings:

- Warranty cases exist.
- Inventory transaction type includes `return`.
- No formal customer refund workflow was confirmed.
- No replacement-only policy was confirmed.

Client rule:

```text
No refunds. Replacement only.
```

Recommended enforcement point:

- Payment/warranty/after-sales backend service layer.
- UI should hide refund options, but backend must enforce the rule.
- Replacement should become a formal after-sales/warranty action.

## 17. Notifications

Existing:

- In-app notifications through `Notification`.
- Email through Django email settings and helper utilities.
- Notification templates and logs.
- Ticket/request/maintenance/warranty/activity events create notifications.
- Repeated failed login creates admin security notifications.

Email:

- Sent by `send_mail`.
- Default local backend is console email unless SMTP env is configured.

SMS:

- SMS settings/options were removed/disabled in migrations.
- `inventory/sms_utils.py` exists, but active provider integration was not confirmed.

Recommended SMS integration point:

- `notifications.notification_utils`.
- Add channel decision logic: email if email exists, SMS if no email and phone exists, in-app always where possible.

## 18. Documents

Existing templates:

- `field_service_report.docx`
- `quotation_proposal.docx`
- `solar_installation_contract.docx`
- `technical_data_sheet.docx`
- `pv_solar_commissioning_checklist.docx`
- `turnover_acceptance_form.docx`

Existing document models:

- `GeneratedDocument`
- `QuotationRecord`
- `InstallationContract`
- `TechnicalDataSheet`
- `SolarCommissioningChecklist`
- `TurnoverAcceptance`
- `FieldServiceReport`

Existing logic:

- `backend/services/document_generation.py`
- document draft/finalize/generate endpoints in `ServiceTicketViewSet`.

Missing:

- Public document/form links.
- Client remote fill without login.
- Reopen/revise workflow is not clearly confirmed.

## 19. Completed / Installed Jobs

Completed/history features:

- Admin job history.
- Technician job history.
- Client service history.
- Service reports.
- Coverage heatmap completed jobs.
- `ServiceHistory`.

Installed equipment:

- Model exists, but local DB currently had zero installed equipment records during inspection.

Serial number visibility:

- Data fields exist in `InstalledEquipment`, `FieldServiceReport`, and `SolarCommissioningChecklist`.
- UI visibility is partial and should be added/standardized in installed/completed job detail pages.

Recommended serial source:

- Short term: use `InstalledEquipment.serial_number`.
- Long term: use serialized inventory unit linked to installed equipment.

## 20. Analytics

Existing analytics:

- Admin analytics dashboard.
- Dashboard KPIs.
- Service breakdowns.
- Request status breakdowns.
- Technician performance.
- SLA queue.
- Reports.
- Coverage heatmap.
- Demand forecast.
- Service trends.
- Inventory statistics.

Data sources:

- `ServiceRequest`
- `ServiceTicket`
- `ServiceAnalytics`
- `TechnicianPerformance`
- `DemandForecast`
- `ServiceTrend`
- `InventoryItem`
- `MaintenanceSchedule`
- `AfterSalesCase`
- `ServiceLocation`

Future changes affecting analytics:

- AC maintenance categories.
- Serialized inventory units.
- Supplier purchases.
- Payments/credit.
- Attendance/overtime.
- Service color/category.
- Team workload.

## 21. Forecasting

Existing:

- `DemandForecast`
- `DemandForecastViewSet`
- `ServiceTrend`
- forecasting/dashboard endpoints.

Current forecasting is operational trend projection based on service/request history and generated forecast records. It should not be described as accurate prediction.

Fields include:

- forecast date
- forecast period
- predicted requests
- confidence level
- weather impact
- seasonal trend
- historical average
- actual requests
- forecast accuracy

## 22. Maps / Location

Stored service location:

- `ServiceLocation.address`
- `ServiceLocation.city`
- `ServiceLocation.province`
- `ServiceLocation.latitude`
- `ServiceLocation.longitude`

Technician current location:

- `TechnicianProfile.current_latitude`
- `TechnicianProfile.current_longitude`
- `TechnicianProfile.last_location_update`

History:

- `TechnicianLocationHistory`

Arrival validation:

- `ArrivalValidationLog`
- `AdminSettings.location_validation_enabled`
- `AdminSettings.arrival_radius_meters`

Route calculation:

- OpenRouteService helpers.
- `ServiceTicket.route_geometry`
- `ServiceTicket.route_distance`
- `ServiceTicket.route_duration`

Frontend:

- Admin tracking page.
- Technician navigation page.
- Coverage heatmap.
- Map tile component.

Important distinction:

- Stored service location exists.
- Device location updates exist.
- Route calculation exists.
- Continuous real-time GPS tracking is partial and depends on submitted location updates.

## 23. Client Requirement Comparison

| Requirement | Already Exists? | Partially Exists? | Missing? | Current Implementation | Files/Models | Required Change | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Color per service | No | No | Yes | No service color field | `ServiceType` | Add color field and UI usage | Low |
| SMS notification if client has no email | No | Yes | Yes | phone exists; SMS disabled/not integrated | `User`, `Notification`, `notification_utils` | Add SMS provider and fallback channel | Medium |
| AC maintenance after 6 months/agreement | No | Yes | Yes | maintenance intervals exist but not AC-specific agreement rule | `MaintenanceSchedule`, `InspectionChecklist` | Add AC policy/agreement interval | Medium |
| First AC maintenance free | No | No | Yes | no maintenance billing cycle | payment models missing | Add maintenance cycle/payment rule | Medium |
| Subsequent maintenance paid | No | No | Yes | no payment ledger | payment models missing | Add billing/payment records | High |
| Serial visible in installed jobs | No | Yes | Yes | serial stored in `InstalledEquipment` but visibility incomplete | `InstalledEquipment` | Render/populate consistently | Medium |
| Serial visible in completed jobs | No | Yes | Yes | FSR/installed equipment serial exists | `FieldServiceReport`, `InstalledEquipment` | Render in completed history/details | Medium |
| Inventory supplier tracking | No | Yes | Yes | supplier text field only | `InventoryItem` | Add Supplier/Purchase models | Medium |
| Inventory size | No | No | Yes | no field | `InventoryItem` | Add size field | Low |
| Unit of measurement | No | No | Yes | no field | `InventoryItem` | Add UOM field/model | Low |
| Quantity | Yes | No | No | stock quantity and reserved quantity | `InventoryItem` | Reuse | Low |
| Low-stock indicator | Yes | No | No | `is_low_stock`, low-stock API/notifications | `InventoryItem` | Reuse | Low |
| Same item with different serial numbers | No | No | Yes | no physical unit model | inventory app | Add serialized unit model | High |
| Capacity | No | Yes | Yes | installed equipment has capacity; inventory does not | `InstalledEquipment` | Add product/unit capacity | Medium |
| SKU | Yes | No | No | unique SKU | `InventoryItem.sku` | Reuse | Low |
| No fixed overtime limit | No | Yes | Yes | overtime capacity setting exists | `AdminSettings` | Make configurable/unlimited policy | Medium |
| Around 4 hours usual overtime | No | Yes | Yes | default overtime capacity currently total capacity style | `AdminSettings` | Adjust policy/settings | Low |
| Credit/balance tracking | No | Yes | Yes | summary credit/balance fields | `ClientProfile` | Add ledger/payment model | High |
| Time In / Time Out | No | Yes | Yes | ticket start/end exists | `ServiceTicket` | Add attendance if HR time needed | Medium |
| No refunds | No | No | Yes | no formal rule | payment/after-sales missing | Enforce replacement-only policy | Medium |
| Replacement only | No | Yes | Yes | warranty cases exist | `AfterSalesCase` | Add replacement workflow | Medium |
| Maintenance mostly on-call | No | Yes | Yes | scheduled maintenance and cases exist | `MaintenanceSchedule`, `AfterSalesCase` | Add on-call maintenance request type | Medium |
| AC installation vs AC maintenance structure | No | Yes | Yes | generic AC Service & Installation | `ServiceType` | Split service categories/types | Medium |
| Solar package | No | Yes | Yes | solar estimate/profile exists | `SolarEstimate`, `SolarProjectProfile` | Add package/BOM model | High |
| Battery may be separate | No | Yes | Yes | battery fields exist | TDS/profile fields | Model as optional product/package line | Medium |
| FDAS service | No | Yes | Yes | Fire Alarm Inspection exists | `ServiceType` | Add FDAS workflow/forms if needed | Medium |
| Teams may be divided | No | Yes | Yes | per-ticket crew exists | `TicketCrewAssignment` | Add Team model if stable teams needed | Medium |
| Follow-up schedules | No | Yes | Yes | maintenance and after-sales due dates | `MaintenanceSchedule`, `AfterSalesCase` | Add general visit schedule if needed | Medium |
| Digital form links | No | No | Yes | auth-only forms | forms/documents | Add signed public form links | High |
| Survey forms | No | Yes | Yes | generic inspection/TDS | `InspectionChecklist`, `TechnicalDataSheet` | Add survey template system | Medium |
| Solar site survey | No | Yes | Yes | TDS/inspection can cover some fields | TDS/inspection | Dedicated solar survey template | Medium |
| AC installation survey | No | Yes | Yes | generic inspection only | `InspectionChecklist` | Dedicated AC survey | Medium |
| Survey photos | No | Yes | Yes | proof media exists | `InspectionChecklist.proof_media` | Standardize attachments by survey | Low |
| Finished-project photos | Yes | No | No | completion proof images | `ServiceTicket.completion_proof_images` | Reuse | Low |
| Technician input details | Yes | Yes | No | checklist, FSR, notes, status | checklist/FSR/ticket | Improve service-specific fields | Low |
| LED Wall service | No | No | Yes | not confirmed in service type list | `ServiceType` | Add service/forms/equipment | Medium |

## 24. Conflicts / Gaps

Inventory conflict:

- Existing model is quantity-based.
- Client wants serialized unit tracking.
- Safest approach is adding a child unit model, not replacing `InventoryItem`.

Payment conflict:

- Existing quotation/client fields are summary fields.
- Client wants credit/balance/payment behavior.
- Requires proper ledger model.

Maintenance conflict:

- Existing system supports scheduled maintenance.
- Client says maintenance is mostly on-call.
- Need both scheduled reminders and on-call service requests.

Team conflict:

- Existing crew assignment is per ticket.
- Client may need divided/permanent teams.
- Add a Team model only if teams are stable organizational units.

Survey link conflict:

- Current forms assume authenticated app users.
- Public digital form links need token/security/expiry design.

## 25. Database Migration Risks

High-risk changes:

- Serialized inventory units.
- Supplier/purchase models.
- Payment ledger.
- Public form tokens.
- Team model.
- Multi-visit schedule model.
- AC maintenance cycle fields.

Data preservation strategy:

- Add nullable fields/models first.
- Backfill from existing `InventoryItem`, `InstalledEquipment`, `QuotationRecord`, and `ClientProfile`.
- Avoid changing existing statuses without a mapping migration.
- Preserve `ServiceTicket`, `ServiceRequest`, and existing document records.

## 26. Existing Features to Reuse

Reuse and extend:

- Authentication and token login.
- Role/capability system.
- Existing service request and ticket lifecycle.
- Existing dispatch and auto-dispatch logic.
- Existing technician workflows.
- Existing document generation.
- Existing notification infrastructure.
- Existing inventory transactions/reservations.
- Existing maintenance/warranty sync.
- Existing activity/change logs.
- Existing maps/location/arrival validation.
- Existing analytics/reporting shells.

Do not rebuild these unless a specific client requirement truly contradicts them.

## 27. Recommended Implementation Plan

### Phase 1 - Critical Business Rules

- Define no-refund/replacement-only policy.
- Define AC installation vs AC maintenance.
- Define first-free AC maintenance rule.
- Define service categories and colors.
- Define whether teams are permanent or per-ticket only.

### Phase 2 - Database Changes

- Add service color/category fields.
- Add serialized inventory unit model.
- Add supplier and purchase tracking models.
- Add payment ledger.
- Add maintenance cycle/payment fields.
- Add survey/form link token model.
- Add team/visit schedule models if confirmed.

### Phase 3 - Backend/API Changes

- Expose serialized units.
- Link installed equipment to inventory units.
- Add supplier purchase APIs.
- Add payment APIs.
- Add AC maintenance lifecycle APIs.
- Add survey link submission APIs.
- Add replacement workflow APIs.

### Phase 4 - Frontend/UI Changes

- Add service colors.
- Show serial numbers in installed/completed jobs.
- Add supplier/purchase inventory screens.
- Add payment/credit screens.
- Add AC maintenance UI.
- Add survey link management.
- Add team/visit scheduling if required.

### Phase 5 - Notifications

- Add SMS provider.
- Add email/SMS fallback rules.
- Add notification channel status/logging.

### Phase 6 - Forms/Documents

- Add solar site survey.
- Add AC installation survey.
- Add form-link access.
- Add survey photos.
- Extend generated documents as needed.

### Phase 7 - Analytics

- Add service category filters.
- Add AC maintenance metrics.
- Add payment/credit metrics.
- Add serialized inventory usage metrics.
- Add team/attendance/overtime metrics if implemented.

### Phase 8 - Testing

- Migration tests.
- Permission tests.
- Workflow tests.
- Inventory serial tests.
- Payment ledger tests.
- SMS fallback tests.
- Public survey security tests.
- End-to-end client/admin/technician scenarios.

## 28. Questions That MUST Be Asked to the Client

1. Should AC installation and AC maintenance be separate service types?
2. What exactly qualifies as the first free AC maintenance?
3. Is the free maintenance per installed AC unit, per client, per contract, or per ticket?
4. Should on-call maintenance create a normal service request or an after-sales case?
5. What payment methods must be recorded?
6. Do they need official receipts uploaded/generated?
7. Does replacement-only apply to warranty items, payments, inventory, or all disputes?
8. Should serial numbers be required before completing a job?
9. Should serial numbers be tracked before installation as stock units?
10. Should suppliers be managed as formal records with purchase history?
11. Are teams permanent groups or just per-job crews?
12. Should technicians belong to multiple teams?
13. Should survey links work without login?
14. Should survey links expire?
15. What exact fields are needed for solar site survey?
16. What exact fields are needed for AC installation survey?
17. What FDAS documents/forms are required?
18. What LED Wall documents/forms are required?
19. Should battery be a package add-on, separate item, or separate service?
20. What SMS provider will be used?

## 29. Files / Models That Will Be Affected

Likely backend files:

- `backend/services/models/core.py`
- `backend/services/models/after_sales.py`
- `backend/services/models/documents.py`
- `backend/services/serializers.py`
- `backend/services/views/*`
- `backend/inventory/models.py`
- `backend/inventory/serializers.py`
- `backend/inventory/views.py`
- `backend/users/models.py`
- `backend/users/serializers.py`
- `backend/notifications/models.py`
- `backend/notifications/notification_utils.py`
- `backend/messages_app/models.py`

Likely frontend files:

- `frontend/src/pages/admin/AdminInventory.jsx`
- `frontend/src/pages/admin/AdminServiceTickets.jsx`
- `frontend/src/pages/admin/AdminJobHistory.jsx`
- `frontend/src/pages/admin/AdminDocuments.jsx`
- `frontend/src/pages/admin/AdminServices.jsx`
- `frontend/src/pages/admin/AdminAnalytics.jsx`
- `frontend/src/pages/client/ClientServiceHistory.jsx`
- `frontend/src/pages/client/ClientRequestDetail.jsx`
- `frontend/src/pages/technician/TechnicianJobs.jsx`
- `frontend/src/pages/technician/TechnicianChecklist.jsx`
- `frontend/src/api/admin.js`
- `frontend/src/api/client.js`
- `frontend/src/api/services.js`
- `frontend/src/api/technician.js`

Likely documentation files:

- `docs/models/AFN_DATABASE_DIAGRAM.dbml`
- `docs/models/AFN_CORE_DATA_DICTIONARY.md`
- deployment and requirements docs as new integrations are added.

## 30. Final Priority List

1. Serialized inventory units and installed-equipment traceability.
2. Payment/credit ledger.
3. AC installation vs AC maintenance structure.
4. AC maintenance business rules.
5. Serial visibility in installed/completed jobs.
6. Supplier and purchase tracking.
7. Service color/category.
8. Public survey links and service-specific survey forms.
9. SMS fallback.
10. Team and multi-visit scheduling.
11. Analytics updates after the data model changes.

## 31. Complete AFN Client-Revision Plan

This plan converts the codebase analysis into a client-revision checklist. Extra client notes can be added under the relevant headings later.

### Already Implemented

- Role-based login for `superadmin`, `admin`, `technician`, and `client`.
- Service request creation, approval, rejection, cancellation, and ticket creation.
- Admin ticket management, dispatch, technician assignment, and status tracking.
- Technician job flow with navigation, arrival validation, job start, checklist, proof media, parts request, and completion.
- Client service history and request visibility.
- Inventory item quantity, SKU, stock level, reserved quantity, low-stock threshold, unit price, and transaction/reservation support.
- Installed equipment model with serial number, capacity, warranty dates, and client/ticket relationship.
- Solar-related estimate, commissioning, technical data, quotation, contract, and turnover document support.
- Maintenance schedules and after-sales cases.
- Notifications through in-app/email-oriented models and logs.
- Analytics, reports, technician performance, demand forecast, service trends, maps, route/location features, and activity/change logs.
- PostgreSQL deployment readiness through `DATABASE_URL`, including support for Aiven-style PostgreSQL connection strings.

### Needs Modification

- Split or categorize AC installation and AC maintenance instead of treating them only as one combined service.
- Make AC maintenance rules explicit: first maintenance free, later maintenance paid, and on-call maintenance behavior.
- Show client contact details, especially phone number, in pending request detail views and admin ticket/request views.
- Show equipment serial numbers clearly in installed jobs, completed jobs, and client/admin job history.
- Improve inventory from quantity-only tracking to quantity plus per-unit serial tracking.
- Replace plain supplier text fields with formal supplier and purchase tracking.
- Improve payment handling from summary fields to a real payment/credit ledger.
- Make service color/category available for dashboard/calendar/service views.
- Clarify technician teams versus per-ticket crew assignment.
- Expand maintenance/follow-up scheduling beyond the current generic maintenance schedule.
- Decide whether overtime should be unlimited, configurable, or follow a default four-hour guideline.

### New Feature

- Serialized inventory units under each inventory item, such as one SKU with multiple physical units and serial numbers.
- Supplier records, supplier contacts, purchase records, and purchase item history.
- Payment ledger with payment status, method, amount, date, receipt/reference, balance, and credit tracking.
- Public secure survey/form links for clients or field surveys.
- Service-specific survey forms for solar, AC, FDAS, and LED Wall if required.
- Formal replacement-only workflow and no-refund policy enforcement.
- SMS fallback when the client has no email address or email delivery is not possible.
- AC maintenance entitlement tracking, including first free maintenance and paid succeeding maintenance.
- Optional team model if the client wants stable technician teams.
- Multi-visit scheduling if jobs can span several dates or return visits.
- LED Wall service workflow if confirmed by the client.
- FDAS-specific workflow/forms beyond the current fire alarm service entry.

### Needs Client Clarification

- Whether AC installation and AC maintenance must be separate service types, categories, or sub-services.
- Exact rule for first free AC maintenance: per unit, per customer, per installation, per contract, or per ticket.
- What happens after the free AC maintenance: fixed fee, quotation first, or normal paid service request.
- Whether on-call maintenance should create a service request, after-sales case, or maintenance schedule entry.
- Whether refunds are fully prohibited, and what exceptions, if any, exist.
- Whether replacement-only applies to warranty disputes, defective inventory, payments, or all completed services.
- Whether every installed item must have a serial number before a technician can complete the job.
- Whether serial numbers must be tracked while still in inventory or only after installation.
- Whether suppliers need full profiles, purchase orders, delivery records, or only basic supplier history.
- Whether technician teams are permanent groups or selected per job.
- Whether public survey links should work without login, expire, and allow photo uploads.
- Exact solar survey fields, AC survey fields, FDAS form fields, and LED Wall form fields.
- Whether battery should be a separate inventory item, package add-on, or separate service.
- SMS provider preference and phone-number format requirements.
- Whether payment receipts need to be generated, uploaded, printed, or only recorded.

### Database Changes

- Add `color`, `category`, and possibly `service_family` fields to `ServiceType`.
- Add `InventoryUnit` or equivalent child model for serialized physical stock units.
- Add `Supplier` model and optionally `PurchaseOrder` / `PurchaseItem` models.
- Add `Payment`, `PaymentLedger`, or `ClientAccountTransaction` model.
- Add AC maintenance entitlement fields or a dedicated `MaintenanceEntitlement` model.
- Add public form token/link model for secure survey links.
- Add service-specific survey response models or a flexible survey template/response model.
- Add `Team` and team membership models if permanent teams are required.
- Add `ServiceVisit` model if multi-day or repeat visits need proper tracking.
- Add replacement/warranty resolution fields if replacement-only must be enforced formally.
- Update DBML and data dictionary after model decisions are finalized.

### UI Changes

- Add client phone/contact information to pending request detail modals/pages.
- Add service colors to admin service lists, dashboards, calendars, and ticket/service badges.
- Add serial number display in installed jobs, completed jobs, job history, and client history.
- Add serialized inventory unit management inside inventory item details.
- Add supplier and purchase history screens or panels in inventory.
- Add payment ledger, balance, receipt/reference, and credit visibility for admin/client workflows.
- Add AC maintenance status, free-maintenance eligibility, and paid-maintenance indicators.
- Add survey link generation/copying in admin document/request/ticket workflows.
- Add public survey/form screens if links are allowed without login.
- Add team selection or crew grouping UI if teams are confirmed.
- Add multi-visit schedule UI if jobs can have multiple visits.
- Add SMS/contact fallback indicators where notifications are sent.

### Backend/API Changes

- Add serializers/viewsets/endpoints for serialized inventory units.
- Update completion workflows to connect installed equipment to inventory units where applicable.
- Add supplier and purchase APIs.
- Add payment ledger APIs and balance calculations.
- Add AC maintenance entitlement and billing-rule APIs.
- Add public survey token generation, validation, submission, and expiry handling.
- Add service-specific survey/document APIs if fixed forms are chosen.
- Add SMS fallback integration in notification utilities.
- Add replacement-only and no-refund business-rule checks.
- Add team and multi-visit APIs if those features are confirmed.
- Update permissions so public links are secure while admin/client/technician data remains protected.
- Update analytics endpoints after inventory, payment, AC maintenance, and team models change.

### Priority / Order of Implementation

1. Confirm client rules: AC maintenance, refunds/replacement, serial tracking, suppliers, payments, teams, public forms, and SMS.
2. Add small low-risk UI fixes first, especially client phone/contact visibility in pending request details.
3. Add service color/category fields and display them in the admin UI.
4. Add serialized inventory units and connect them to installed equipment/completed jobs.
5. Add supplier and purchase tracking.
6. Add payment ledger and client balance/credit behavior.
7. Add AC install/maintenance split and maintenance entitlement rules.
8. Add public survey links and service-specific forms.
9. Add SMS fallback.
10. Add teams and multi-visit scheduling if confirmed.
11. Update analytics, reports, DBML, and documentation.
12. Run full workflow tests before deployment.

### Questions to Ask During the Client Revision

1. Which services are final for launch: Solar, AC, CCTV, FDAS, LED Wall, Smoke Service, General Services, or more?
2. Should each service have a color, icon, category, and default duration?
3. Should AC installation and AC maintenance be separate options in the client request form?
4. What is the exact AC free-maintenance rule?
5. How should paid succeeding AC maintenance be priced and approved?
6. Should the system block completion if serial numbers are missing?
7. Should inventory serial numbers be entered at purchase time or installation time?
8. What supplier details are required?
9. Do they need purchase orders, invoices, delivery dates, warranty dates, or supplier contacts?
10. What payment statuses are required: unpaid, partial, paid, overdue, cancelled?
11. What payment methods are accepted?
12. Are receipts required?
13. Is refund fully disallowed?
14. What replacement cases are allowed?
15. Should public survey links require login?
16. Should public survey links expire?
17. What photos are required for surveys and completed jobs?
18. What exact fields are required for Solar, AC, FDAS, and LED Wall surveys?
19. Are technician teams permanent, temporary, or unnecessary?
20. Can one job have multiple scheduled visits?
21. Should SMS be sent only if no email exists, or always alongside email?
22. Which SMS provider will they use?
23. Should the system be deployed with Aiven PostgreSQL now, or after revisions are finished?
24. What data from the current local database should be migrated to production?

## 32. Revised Practical Scope After Client Feedback

This section narrows the revision scope based on the latest decision: do not add payment/refund work yet, do not build a supplier/purchase subsystem yet, and keep service customization controlled by management.

### Scope Direction

- Adjust the current AFN-SERVE system instead of rebuilding large modules.
- Keep the service catalog controlled by management/admin users.
- Clients should only choose active services created by management.
- Clients can describe special needs in the request description, but they should not create official service types.
- Defer payment, credit, balance, refund, and replacement policy features until the business rules are final.
- Defer supplier/purchase-history expansion. Keep the current inventory supplier text fields for now unless the client asks for full purchasing records later.

### Keep / Reuse Existing System

- Reuse the current `ServiceType` model and Admin Services page.
- Reuse current service request and ticket workflow.
- Reuse current technician assignment, crew assignment, and dispatch flow.
- Reuse current inventory items, stock movement, reservations, and low-stock logic.
- Reuse current checklist, proof photo, maintenance, warranty, after-sales, document, analytics, and map/location features.
- Reuse current roles and capability system.

### Features To Implement Now

1. Management-customizable services.
2. Service colors.
3. Low-stock column/clearer low-stock display.
4. Client contact visibility in request/ticket details.
5. AC installation vs AC maintenance service cleanup.
6. AC maintenance reminder/business-rule fields only if the client confirms the exact free-maintenance rule.
7. Serial number visibility in installed and completed jobs.
8. Inventory item specs using the current inventory structure.
9. Optional serialized unit tracking only if serial numbers must be tracked before installation.
10. FDAS as a management-created service/category.
11. Follow-up scheduling improvements using current tickets/after-sales where possible.
12. Digital form links only if public/client forms are still required.
13. SMS fallback only after provider/channel decision.

### Features To Defer

- Payment ledger.
- Credit/balance monitoring.
- Refund policy enforcement.
- Replacement-only workflow.
- Supplier model.
- Purchase order model.
- Purchase item history.
- Delivery/invoice tracking.
- Full accounting/payment reports.

### Management-Customizable Services

Current system already supports admin-managed services through:

- Backend model: `backend/services/models/core.py` -> `ServiceType`
- Backend API: `backend/services/urls.py` -> `/api/services/service-types/`
- Frontend page: `frontend/src/pages/admin/AdminServices.jsx`
- Frontend route: `/admin/services`

Recommended adjustment:

- Add service customization fields to `ServiceType`:
  - `color`
  - `category`
  - optional `icon`
  - optional `display_order`
- Keep `name`, `description`, `estimated_duration`, `estimated_cost`, `procedures`, `required_equipment`, `is_active`, and `requires_site_inspection`.
- Client request forms should load only `is_active=True` services.
- Admin can deactivate services instead of deleting when a service already has requests/tickets.
- Reports and analytics should continue grouping by `ServiceType`.

This satisfies the service flexibility requirement without letting client-created labels pollute analytics and technician skills.

### Inventory Adjustment Without Supplier Expansion

Do not add supplier/purchase records yet.

Keep:

- `InventoryItem.supplier`
- `InventoryItem.supplier_contact`
- `InventoryItem.purchase_date`
- `InventoryItem.warranty_expiry`

Add only practical item-spec fields if needed:

- `unit_of_measurement`
- `size`
- `capacity`
- `brand`
- `model`

Recommended UI changes:

- Show `Low Stock` as a visible inventory table column.
- Show `Available`, `Reserved`, and `Total Quantity`.
- Add optional item specification fields in the add/edit inventory modal.
- Keep stock movement as-is.

### Serial Number Scope

Minimum useful change:

- Make serial numbers visible in installed jobs and completed jobs using existing `InstalledEquipment.serial_number` and `FieldServiceReport.serial_number`.

Only add serialized inventory units if AFN needs to track serial numbers before installation.

Decision:

- If serial is only needed after install: extend installed equipment UI/API.
- If serial is needed while still in stock: add `InventoryUnit`.

### AC Scope

Recommended simple change:

- Keep category: `Air Conditioning`.
- Management creates:
  - `Air Conditioning Installation`
  - `Air Conditioning Maintenance`

Do not hardcode maintenance billing/payment yet.

For now, support:

- maintenance interval notes
- next maintenance reminder
- first maintenance free note/status if confirmed
- on-call maintenance request through normal service request flow

Payment-related maintenance charging can be deferred.

### Updated Priority

1. Management-only service customization.
2. Service color/category fields.
3. Low-stock column and inventory display cleanup.
4. Client phone/contact display everywhere needed.
5. Serial number visibility in installed/completed jobs.
6. AC service cleanup: separate install/maintenance under AC category.
7. Inventory item specs using current inventory item model.
8. FDAS service/category setup through management services.
9. Follow-up schedule improvements using current maintenance/after-sales flow.
10. Digital form links, only if still required.
11. SMS fallback, only after provider decision.
12. Serialized inventory units, only if serial tracking before installation is required.

### Updated Client Questions

1. Should management create the final list of services before launch, or should admins add services anytime?
2. What service categories should appear first: Solar, Air Conditioning, CCTV, FDAS, Smoke Service, General?
3. What colors should each service/category use?
4. Should AC installation and AC maintenance be separate service types under one Air Conditioning category?
5. For AC, should the system only remind about first free maintenance, or block/track whether it was used?
6. Should serial numbers be recorded only after installation, or while items are still in inventory?
7. Which inventory specs matter now: size, UOM, capacity, brand, model?
8. Should supplier stay as simple text for now?
9. Should FDAS be renamed from Fire Alarm Inspection or added as a broader category?
10. Are public digital form links still required for this revision?
11. Is SMS required now, or can it be deferred until deployment?
