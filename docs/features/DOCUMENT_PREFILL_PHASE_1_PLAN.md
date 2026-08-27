# Document Prefill Phase 1 Plan

## Goal

Build a read-only document-prefill flow so an admin can:

1. Select a `ServiceTicket`
2. Choose a document template
3. Auto-fill as many fields as possible from existing AFN-SERVE data

This phase must only use data that already exists in the system.

## Scope

Phase 1 includes:

1. A read-only backend endpoint for document prefill
2. Frontend integration in the admin document page
3. Missing-field reporting for manual follow-up

Phase 1 does not include:

1. New document models
2. New project profile models
3. New quotation models
4. Document saving/finalization
5. DOCX/PDF generation changes beyond existing behavior

## Phase 1 Decision

Implement this first:

`GET /api/services/service-tickets/{ticket_id}/document-prefill/`

This endpoint should aggregate existing reusable data from:

1. `ServiceTicket`
2. `ServiceRequest`
3. `ServiceLocation`
4. `Client/User`
5. `Technician/User`
6. `InspectionChecklist`
7. `SolarCommissioningChecklist`
8. Ticket completion data
9. Inventory reservations
10. Warranty fields
11. After-sales records
12. Maintenance schedule

## Expected Response Shape

```json
{
  "ticket": {},
  "client": {},
  "service_request": {},
  "service_location": {},
  "technician": {},
  "inspection": {},
  "solar_commissioning": {},
  "completion": {},
  "inventory": [],
  "warranty": {},
  "after_sales": [],
  "maintenance": {},
  "document_defaults": {},
  "missing_fields": {}
}
```

## Existing Data That Can Be Reused Now

These fields are already good candidates for auto-fill:

1. Client name
2. Client address
3. Client phone
4. Client email
5. Ticket number
6. Service type / service summary
7. Service location
8. Technician name
9. Scheduled date
10. Completion date
11. Warranty info
12. Solar commissioning checklist data
13. Inspection notes and proof media
14. Completion proof images and notes
15. Inventory reservation data
16. After-sales records
17. Maintenance schedule

## Templates That Benefit Immediately

### 1. Field Service Report

Can auto-fill now:

1. Client
2. Address
3. Contact number
4. Technician
5. Date

Still manual for now:

1. Equipment table rows
2. Readings
3. Recommendations per row
4. Signatures

### 2. Solar Installation Contract

Can auto-fill now:

1. Client name
2. Client address
3. Property/service location
4. Service type / system description
5. Start date
6. Basic warranty reference
7. Contract date

Still manual for now:

1. Contract amount
2. Payment schedule
3. Completion time
4. Mediation body
5. Final legal/commercial details

### 3. TDS / Technical Data Sheet

Can auto-fill now:

1. Client first/last name
2. Mobile number
3. Email address
4. Site address
5. Site coordinates

Still manual for now:

1. Premise/electrical answers
2. Load schedule
3. Generator details
4. Solar preference answers
5. Attachments

### 4. PV Solar Site Commissioning Checklist

Can auto-fill now:

1. Site name
2. Inverter type
3. System designation
4. Inverter serial number
5. Commissioned date
6. Checklist items
7. Check status
8. Remarks
9. Irradiance
10. Ambient temperature
11. Inverter display readings
12. Field measured readings

This is the strongest existing document module.

### 5. Turnover / Acceptance Form

Can auto-fill now:

1. Client name
2. Contact number
3. Location
4. Completion/turnover date fallback
5. Warranty basics
6. Commissioning-derived rows

Still manual for now:

1. System capacity
2. Panel/inverter counts
3. Mounting structure
4. Expected energy production
5. Documentation provided tracking
6. Signatures

### 6. Quotation Proposal

Can auto-fill now:

1. Quotation date fallback
2. Client name
3. Subject
4. Location
5. Service/project description

Still manual for now:

1. Amounts
2. BOM rows
3. Unit prices
4. Brands
5. Warranty rows
6. Commercial terms if they must be project-specific

## Backend Implementation Checklist

### Endpoint

1. Add a custom read-only action on `ServiceTicketViewSet`
2. Route:
   `GET /api/services/service-tickets/{ticket_id}/document-prefill/`
3. Restrict access using the same admin/supervisor visibility rules already used for ticket access

### Data Assembly

Build the response by traversing:

1. `ServiceTicket -> ServiceRequest -> Client`
2. `ServiceTicket -> ServiceRequest -> ServiceLocation`
3. `ServiceTicket -> technician`
4. `ServiceTicket -> inspection`
5. `ServiceTicket -> solar_commissioning_checklist`
6. `ServiceTicket -> inventory_reservations`
7. `ServiceTicket -> after_sales_cases`
8. `ServiceTicket -> maintenance_schedule`

### document_defaults

Return stable template defaults such as:

1. Company name
2. Company address
3. Company contact details
4. Default signer name/title
5. Default legal text snippets if needed

These should be defaults only, not final document data.

### missing_fields

Return a grouped list of fields that cannot be filled from existing backend data.

Suggested format:

```json
{
  "quotation_proposal": ["total_amount", "bom_rows", "unit_price"],
  "installation_contract": ["payment_schedule", "estimated_completion_time"],
  "technical_data_sheet": ["rooftop_type", "battery_preference"],
  "turnover_acceptance": ["panel_count", "inverter_count", "expected_daily_energy"]
}
```

## Frontend Implementation Checklist

### API Layer

In `frontend/src/api/services.js`:

1. Add `fetchDocumentPrefill(ticketId)`
2. Call the new backend endpoint
3. Normalize null-safe sections for frontend use

### Admin Documents Integration

In `frontend/src/pages/admin/AdminDocuments.jsx`:

1. Load prefill data when a ticket is selected
2. Use one backend response as the main autofill source
3. Populate all template forms from the response
4. Keep fields editable after autofill
5. Show `missing_fields` hints in the editor panel

### Autofill Strategy

Use the endpoint as the primary source for:

1. Field Service Report header
2. Contract client/project basics
3. TDS client/site basics
4. Turnover client/location/warranty/commissioning basics
5. Commissioning checklist saved data
6. Quotation header basics

## What Not To Build Yet

Do not add yet:

1. `GeneratedDocument`
2. `ProjectDocumentProfile`
3. `QuotationRecord`
4. Separate models for every template
5. Save/finalize document APIs

## Phase 2 After This Works

Add:

1. `GeneratedDocument`

Use it for:

1. `document_type`
2. `ticket`
3. `status`
4. `data_json`
5. `tables_json`
6. generated file paths

## Phase 3 After That

Add:

1. `ProjectDocumentProfile` or `SolarProjectProfile`

Store shared reusable project/document data such as:

1. System capacity
2. Number of solar panels
3. Number of inverters
4. Panel brand
5. Inverter brand
6. Battery brand
7. Mounting structure
8. Panel location
9. Inverter location
10. Expected energy production
11. Net metering status
12. Project amount
13. Payment terms

## Phase 4 Optional

Add:

1. `QuotationRecord`

Only if AFN needs:

1. Real quotation tracking
2. Pricing history
3. BOM persistence
4. Approval/finalization workflow

## Recommended Build Order

1. Implement read-only document-prefill endpoint
2. Connect `AdminDocuments.jsx` to it
3. Verify autofill per template
4. Add `GeneratedDocument`
5. Add `ProjectDocumentProfile`
6. Add `QuotationRecord` only if needed

## Final Recommendation

Do not rush six document models at once.

The clean path is:

1. `ServiceTicket`
2. read-only `document-prefill` endpoint
3. `GeneratedDocument`
4. `ProjectDocumentProfile`

This gives AFN a stable one-click autofill base first, then a reusable document data layer second.
