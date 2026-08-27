# Document Autofill Audit

## Overall Verdict

**NOT READY**

The system is partially wired for preview autofill in `AdminDocuments.jsx`, but it is not ready for full automatic document autofill through real exported DOCX output.

The strongest proof points are:

- Only one actual DOCX template exists: `backend/document_templates/field_service_report.docx`
- Backend DOCX export currently supports only `field_service_report`
- The backend rejects the other 5 document types in `generate_document()`
- Even the existing Field Service Report DOCX only maps header fields, not the main service table

## Readiness Per Template

- Quotation Proposal: **35%**
- Solar Installation Contract: **40%**
- TDS / Technical Data Sheet: **45%**
- PV Solar Site Commissioning Checklist: **40%**
- Turnover / Acceptance Form: **45%**
- Field Service Report: **55%**

## Key Findings

### 1. DOCX export is broken for 5 of 6 templates

- Only `field_service_report.docx` exists in `backend/document_templates`
- `generate_document()` only handles `field_service_report`
- Quotation, Contract, TDS, Commissioning, and Turnover currently have preview builders, not real backend DOCX generation

### 2. Field Service Report DOCX is only partially mapped

Actual placeholders found in the DOCX:

- `client_name`
- `client_address`
- `client_contact_number`
- `technician_name`
- `service_date`

Notes:

- `ticket_number` is built in backend context but is not present in the DOCX placeholders
- The main FSR table fields like Brand/Model, TR/HP, Serial #, Indoor temp, Outdoor temp, Ampere, Others, and Recommendation are blank cells in the DOCX, not templated placeholders

### 3. `document-prefill` is useful but incomplete

`document-prefill` returns:

- `technical_data_sheet`
- `installation_contract`
- `turnover_acceptance`
- `solar_commissioning`
- `field_service_reports`

But it does not return:

- `quotation_record`
- `solar_project_profile`

Quotation is fetched separately by the frontend through `/services/quotations/`.

### 4. Technical Data Sheet has duplicate backend definitions

There are duplicate `TechnicalDataSheet` model and serializer definitions in the backend. This creates real audit risk because the effective imported model/serializer may not match the fields the frontend expects.

### 5. Some older document forms are out of sync

- `SolarCommissioningChecklistForm.jsx` uses fields like `items`, `weather_condition`, and `solar_irradiance`, which do not match the current backend model shape
- `FieldServiceReportForm.jsx` only fetches the first report and does not support selecting among multiple reports, even though backend now returns `field_service_reports` as an array

## Master Mapping Table

| Template | Section | Label | Placeholder | Frontend Field | Backend Model | Backend Field | Serializer | Save API | document-prefill Path | Ticket Relationship Path | Status | Test Result | Fix Needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Quotation Proposal | Header | Quotation No, Date, Attention, Subject, Location | None found | `quotationNumber`, `quotationDate`, `attention`, `subject`, `location` | `QuotationRecord` + draft | Mostly not stored | `QuotationRecordSerializer` | `/services/quotations/` + `/document-draft/` | None | `ServiceTicket -> request/client/location` + quotation fetch | C/E/I | Preview exists; no DOCX chain | Add real DOCX template and persist missing header fields |
| Quotation Proposal | Pricing | Price / Total Price, Terms of Payment | None found | `priceRows`, `paymentTerms` | `QuotationRecord` | `total_amount`, `payment_terms` | Yes | `/services/quotations/` | None | `ServiceTicket -> quotation` | B/I | Save exists; DOCX missing | Add DOCX mapping |
| Quotation Proposal | BOM | Description, Unit, Qty, BOM rows | None found | `bomRows` | `QuotationRecord` or `project_details` | `bill_of_materials` | Yes | `/services/quotations/` | None | `ServiceTicket -> quotation / project_details` | B/I | Dynamic rows in preview only | Add loop placeholders |
| Quotation Proposal | Clauses | Validity, Delivery, Force Majeure, Cancellation, Inclusion, Exclusion, Prepared By | None found | Local draft fields | Draft only/defaults | Not persisted in quotation model | No dedicated fields | `/document-draft/` | None | Local/default data | C/G/I | Editable in preview only | Persist or keep static intentionally |
| Solar Installation Contract | Parties | Client Name, Client Address, Property Address | None found | `clientName`, `clientAddress`, `propertyAddress` | `InstallationContract` + ticket context | Partial | `InstallationContractSerializer` | `/services/installation-contracts/` + `/document-draft/` | `installation_contract` | `ServiceTicket -> request/client/location` | B/I | Preview autofill exists; no DOCX | Add DOCX template/export |
| Solar Installation Contract | Scope & Schedule | Scope of Work, System Description, Start Date, Estimated Completion Time | None found | `scopeNotes`, `systemDescription`, `startDate`, `estimatedCompletionTime` | `InstallationContract` | `scope_of_work`, `start_date`, `estimated_completion_days` | Yes | `/services/installation-contracts/` | `installation_contract` | `ServiceTicket -> installation_contract` | B/I | Save exists, DOCX absent | Add DOCX export path |
| Solar Installation Contract | Financial | Total Amount, Upfront, Completion, Final, Final Inspection Days, Currency, Payment Method | None found | Contract form fields | `InstallationContract` + `QuotationRecord` + defaults | Partial | Partial | `/services/installation-contracts/` | `installation_contract` | `ServiceTicket -> installation_contract / quotation` | B/C/I | Mixed sources only | Persist missing fields |
| Solar Installation Contract | Legal & Signers | Warranty, Termination, Governing Law, Mediation, Company Signer, Client Signer, Contract Date, Appendix A | None found | Local form fields | Partial + defaults | Mostly not persisted | Partial | `/document-draft/` | Partial | Ticket/default/local | C/G/H/I | Preview only | Decide persisted vs static vs manual |
| TDS | Identity | Last/First/Middle, Landline, Mobile, Email, Address | None found | `lastName`, `firstName`, `middleName`, `contactLandline`, `mobileNumber`, `emailAddress`, `completeAddress` | Ticket/client context + TDS | Mostly not stored in final effective simple model | Ambiguous | `/services/technical-data-sheets/` + `/document-draft/` | `technical_data_sheet` partial + ticket/client | `ServiceTicket -> request/client/location` | A/B/D | Preview autofill mostly from ticket | Remove duplicate TDS definitions |
| TDS | Premise/Power | Premise type/category, ownership, private/government, electric source, AC phase, install location, rooftop type | None found | Matching TDS fields | `TechnicalDataSheet` | Present but conflicting across duplicate models | Ambiguous | `/services/technical-data-sheets/` | `technical_data_sheet` | `ServiceTicket -> technical_data_sheet` | B/D | Save path exists, risky model mismatch | Consolidate model/serializer |
| TDS | Consumption | Monthly bill, hours/day, brownouts, battery preference | None found | Matching TDS fields | `TechnicalDataSheet` | Partial | Yes but ambiguous | `/services/technical-data-sheets/` | `technical_data_sheet` | `ServiceTicket -> technical_data_sheet` | B/D | Preview okay if saved | Normalize backend schema |
| TDS | Complex Rows | Load schedule, generator details, attachments, purpose checkboxes | None found | `loadRows`, purpose rows, attachment flags | `TechnicalDataSheet` | JSON fields in one model, different in duplicate | Ambiguous | `/services/technical-data-sheets/` | `technical_data_sheet` partial | `ServiceTicket -> technical_data_sheet` | B/D/I | UI richer than proven backend export | Unify JSON schema |
| TDS | Confirmation | Client confirmation name/signature/date | None found | `clientConfirmationName`, `clientSignature`, `confirmationDate` | Partial | Name/date only in richer model | Ambiguous | `/services/technical-data-sheets/` + draft | Partial | Ticket + saved TDS | B/H/I | Manual signature acceptable | Keep signature manual, normalize name/date |
| Commissioning Checklist | Meta | Site Name, Inverter Type, System Designation, Inverter SN, Commissioned Date, Irradiance, Ambient Temperature | None found | `commissioningForm.*` | `SolarCommissioningChecklist` | Yes | `SolarCommissioningChecklistSerializer` | `/services/solar-commissioning-checklists/` | `solar_commissioning` | `ServiceTicket -> solar_commissioning_checklist` | B/I | Preview aligned; DOCX absent | Add DOCX template/export |
| Commissioning Checklist | Checklist Rows | Rows 1-54, check status, remarks | None found | `checklist_items_json` | `SolarCommissioningChecklist` | `checklist_items_json` | Yes | `/services/solar-commissioning-checklists/` | `solar_commissioning.checklist_items_json` | Saved checklist | B/I | Stored in backend; no DOCX | Add row loop placeholders |
| Commissioning Checklist | Readings | Inverter display and field measured readings | None found | `readings_json` | `SolarCommissioningChecklist` | `readings_json` | Yes | Same | `solar_commissioning.readings_json` | Saved checklist | B/I | Backend supports it; no DOCX | Add placeholder mapping |
| Turnover / Acceptance | Core | Project installation, location, completion date, turnover date, client name/contact, warranty start | None found | `turnoverForm.*` | `TurnoverAcceptance` + ticket context | `turnover_date`, `accepted_by_client_name`, `accepted_by_client_contact`, `warranty_start_date` | Yes | `/services/turnover-acceptances/` + finalize | `turnover_acceptance` | `ServiceTicket -> turnover_acceptance / request / client / location` | B/I | Preview autofill works; DOCX absent | Add DOCX template/export |
| Turnover / Acceptance | Components & Performance | System capacity, panel count, inverter count, mounting, energy production, net metering | None found | `componentsRows`, `performanceRows` | `project_details` + commissioning | No dedicated turnover fields | N/A | `/document-draft/` mostly | Derived in builder | `ServiceTicket -> project_details / solar_commissioning` | B/C/I | Derived in preview only | Persist canonical project profile |
| Turnover / Acceptance | Commissioning Carry-over | Commissioning results, voltage/current values, safety, energization | None found | `commissioningRows` | Derived from `SolarCommissioningChecklist` | Not turnover model fields | N/A | Draft only | Derived from `solar_commissioning` | `ServiceTicket -> solar_commissioning_checklist` | B/E/I | Preview only | Add real export mapping |
| Turnover / Acceptance | Documents & Signatures | Plans, diagrams, manuals, guidelines, certificates, signatures | None found | `documentsRows`, signer fields | Mostly local draft | Not persisted | No | `/document-draft/` | None | Local state | C/H/I | Editable preview only | Persist if needed, keep physical signatures manual |
| Field Service Report | Header | Client, Address, Contact Number, Technician, Date | `{{ client_name }}`, etc. | Built from ticket | Direct generator context | Ticket/request/client/location | Not via prefill for export | `/generate-document/` | N/A | `ServiceTicket -> request/client/location/technician` | A | Real DOCX placeholders exist | Works |
| Field Service Report | Table | Brand/Model, TR/HP, Serial #, Indoor temp, Outdoor temp, Ampere, Others, Recommendation, In/Out reading | No placeholders in DOCX | `form.rows`, FSR fields | `FieldServiceReport` + `InstalledEquipment` | Partial | `FieldServiceReportSerializer` | `/services/field-service-reports/` | `field_service_reports[]` | `ServiceTicket -> field_service_reports` | E/F | Saved and previewed, DOCX blank | Add DOCX table placeholders |
| Field Service Report | Signatures | Signature of client, Signature of Technician | Blank lines only | Manual/local | Partial bool/date only | `client_acknowledged`, `client_signature_date` | Yes partial | `/services/field-service-reports/` | Partial | Saved report | H/I | Manual by design | Keep manual unless digital signature added |

## Missing Fields Summary

These cannot currently auto-fill all the way to exported DOCX:

- All labels in **Quotation Proposal**
- All labels in **Solar Installation Contract**
- All labels in **TDS / Technical Data Sheet**
- All labels in **PV Solar Site Commissioning Checklist**
- All labels in **Turnover / Acceptance Form**
- In **Field Service Report**, everything except:
  - Client
  - Address
  - Contact Number
  - Technician
  - Date

## Broken Chain Summary

### UI input missing

Not the main blocker. Most admin preview inputs exist.

### Backend model field missing

Many quotation, contract, and turnover clause fields are only local draft fields.

### Serializer missing or inconsistent

Duplicate `TechnicalDataSheetSerializer` definitions create ambiguity.

### Save API missing

Real save APIs exist for TDS, commissioning, turnover, quotation, contract, and field service report.

### document-prefill missing

- `quotation_record` is missing
- `solar_project_profile` is missing

### AdminDocuments mapping missing

- Some data is derived only in the builder from `project_details`
- Field Service Report multi-report selection is missing

### DOCX placeholder missing or mismatched

- 5 templates have no real DOCX template/export path
- FSR table fields have no placeholders
- `ticket_number` is built but not used in the DOCX

### Should remain manual

- Physical signatures unless digital signature support is intentionally added

## Automatic Autofill Blockers

1. No backend DOCX export implementation for 5 of 6 templates
2. Only one real DOCX template file exists
3. FSR DOCX placeholder coverage is incomplete
4. Duplicate `TechnicalDataSheet` model and serializer definitions
5. Outdated technician/admin forms do not fully match current saved model shape
6. Quotation and project-profile data are not normalized into `document-prefill`

## Recommended Fixes

### Phase 1: quick fixes

- Add missing placeholder mappings for FSR table fields
- Add `ticket_number` placeholder to FSR DOCX
- Return `quotation_record` and `solar_project_profile` in `document-prefill`
- Add latest-report selection logic for `field_service_reports`

### Phase 2: backend cleanup

- Remove duplicate `TechnicalDataSheet` model/serializer definitions
- Normalize one canonical TDS schema
- Align outdated technician/admin document forms to current model fields

### Phase 3: real document generation

- Add actual DOCX templates for Quotation, Contract, TDS, Commissioning, and Turnover
- Implement backend `generate_document()` branches for all 6 document types
- Add loop support for BOM rows, checklist rows, and turnover rows

### Phase 4: export validation

- Verify every placeholder maps from saved backend data
- Verify no `{{ ... }}` or `[Client Name]` style guide text remains in exported files

## Manual Test Proof

### Quotation Proposal

1. Save quotation record
2. Verify `/services/quotations/?ticket_id={id}`
3. Verify admin preview
4. Attempt DOCX export

Expected now: preview may fill; DOCX export fails

### Solar Installation Contract

1. Save contract
2. Verify `/services/installation-contracts/?ticket={id}`
3. Verify preview
4. Attempt DOCX export

Expected now: preview may fill; DOCX export fails

### TDS / Technical Data Sheet

1. Save TDS
2. Verify `/service-tickets/{id}/document-prefill/` contains `technical_data_sheet`
3. Verify preview
4. Attempt DOCX export

Expected now: preview may fill; DOCX export fails

### PV Solar Site Commissioning Checklist

1. Save checklist
2. Verify `solar_commissioning` in `document-prefill`
3. Verify preview
4. Attempt DOCX export

Expected now: preview may fill; DOCX export fails

### Turnover / Acceptance Form

1. Save/finalize turnover
2. Verify `turnover_acceptance` in `document-prefill`
3. Verify preview
4. Attempt DOCX export

Expected now: preview may fill; DOCX export fails

### Field Service Report

1. Save report
2. Verify `field_service_reports` array in `document-prefill`
3. Generate DOCX

Expected now:

- Header fields fill
- Service table fields remain blank in DOCX

## Final Note

The system is currently much closer to a **preview-driven autofill workflow** than a completed **automatic DOCX document generation workflow**.
