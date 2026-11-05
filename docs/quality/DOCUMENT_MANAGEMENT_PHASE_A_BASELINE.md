# Dynamic Document Management — Phase A Baseline

**Captured:** 2026-11-02 Asia/Singapore  
**Scope:** Compatibility and regression baseline only  
**Database migration:** None  
**Development/staging/production data changed:** No

## Purpose

This checkpoint freezes the behavior that must remain operational while AFN
adds database-backed document definitions, template versions, generation
provenance, and archives. It does not implement template upload or change the
existing renderer.

The detailed source audit remains `DOCUMENTS_CURRENT_STATUS.md`.

## Protected business authority

Dynamic templates will be presentation inputs only. These records and services
remain authoritative:

- `TechnicalDataSheet`
- `QuotationRecord`
- `InstallationContract`
- `SolarCommissioningChecklist`
- `TurnoverAcceptance`
- `FieldServiceReport`
- `GeneratedDocument`
- `SolarEstimate`
- `SolarProjectProfile`
- quotation/deposit services and `ticket_deposit_gate()`
- ticket assignment, inspection, scheduling, and dispatch validation
- Sales Record preparation and payment allocation

No generic document JSON record may replace their validation or lifecycle.

## Current six stable document codes

| Stable code | Baseline template filename | Core record binding |
|---|---|---|
| `technical_data_sheet` | `technical_data_sheet.docx` | `TechnicalDataSheet` |
| `quotation_proposal` | `quotation_proposal.docx` | `QuotationRecord` |
| `installation_contract` | `solar_installation_contract.docx` | `InstallationContract` |
| `commissioning_checklist` | `pv_solar_commissioning_checklist.docx` | `SolarCommissioningChecklist` |
| `turnover_acceptance` | `turnover_acceptance_form.docx` | `TurnoverAcceptance` |
| `field_service_report` | `field_service_report.docx` | `FieldServiceReport` |

Existing aliases remain compatibility inputs; they do not create new core
document types.

## Source template fingerprint

These hashes identify the exact baseline files present at this checkpoint.
They are not secrets.

| File | Bytes | SHA-256 |
|---|---:|---|
| `field_service_report.docx` | 1,787 | `e4ba22eb4a0b69525618acd2bf4fcc2265802b83ba23871e5116c8c8b84df6c6` |
| `pv_solar_commissioning_checklist.docx` | 1,790 | `616c636ebb0109c5e02d35c679e098376b6d1e69f1ba1171bca2bc519343a5c8` |
| `quotation_proposal.docx` | 2,033 | `4a09f5893561ca914a9787d7fa26e57a641ae435ce1e94a6000b33f8dba28d88` |
| `solar_installation_contract.docx` | 1,796 | `290f186899a8fc7d888e2b4edd032637b994dd2a97b6be3dff9bd5ce984eec80` |
| `technical_data_sheet.docx` | 2,356 | `01a8f269c5045577a6268edc4e2b15ba7a7832d32565e87928a277763d39dc71` |
| `turnover_acceptance_form.docx` | 2,113 | `bb661c5c7c4dff8882a424a6869d7a6f2fc9c4daa8f0aac0f34f1fb25110e74d` |

The developer-supplied override
`backend/document_templates/originals/field_service_report.docx` is 91,221
bytes with SHA-256
`d881f2b0cc77d7a8b94ba131fba2434c5236dd9f7128183c31e276755972e3ea`.
The current resolver prefers this override for Field Service Reports.

## Existing workflow regression boundary

### Quotation, client decision, deposit, and dispatch

The current protected sequence is:

1. Office creates/updates `QuotationRecord` through
   `/api/services/quotations/`.
2. A sent quotation is accepted or declined through
   `/api/services/quotations/{id}/respond/`; the client must own it and can
   respond once.
3. The quotation snapshots the service deposit policy and amount.
4. Authorized document managers record external payments through
   `/api/services/quotations/{id}/deposit-payments/` and void mistakes with a
   reason through `void-deposit-payment`.
5. `ticket_deposit_gate()` and assignment/dispatch actions continue to reject
   missing acceptance, unpaid deposits, and partial deposits.
6. A later Sales Record adopts the accepted quotation and associates its
   deposit payments so the balance is not charged twice.

Primary regression coverage already exists in:

- `backend/services/tests/test_business_flow_controls.py`
  - `QuotationAcceptanceTests`
  - `PreServiceDepositTests.test_dispatch_waits_for_the_full_required_deposit`
  - deposit permission, voiding, secondary-service, and Sales Record tests
- `backend/services/tests/test_quotation_revision.py`
- `backend/services/tests/test_end_to_end_journeys.py`
- `backend/services/tests/test_scheduling_warranty_and_assignment.py`

Template infrastructure must not write quotation totals, deposit status,
payments, ticket readiness, or dispatch state.

### Document compatibility

`backend/services/tests/test_document_generation_baseline.py` adds the missing
focused baseline. It generates every current core type into a temporary
directory, verifies each output is a valid DOCX ZIP with no unresolved template
tokens, and proves generation does not change the accepted quotation, deposit
gate, ticket, or `GeneratedDocument` rows. It also freezes the stable core codes
and legacy aliases.

## Current responsibility map

| Responsibility | Current owner |
|---|---|
| Domain validation and workflow state | Canonical models, serializers, viewsets, deposit/dispatch services |
| Prefill aggregation | `ServiceTicketViewSet.document_prefill()` |
| Latest editable print snapshot | `ServiceTicketViewSet.document_draft()` and `GeneratedDocument` |
| Browser data entry and paper preview | `AdminDocuments.jsx` and its support/builders |
| DOCX data mapping | `backend/services/document_generation.py` context builders |
| DOCX presentation | Files under `backend/document_templates/` and `originals/` |
| DOCX download | `ServiceTicketViewSet.generate_document()` and selected admin history/ticket actions |

## Presentation-only legacy candidates

The following are candidates for later retirement only after the dynamic path
is accepted and rollback-ready:

- JSX paper-layout functions in `AdminDocuments.jsx`
- hardcoded baseline-template construction in `build_template_definitions()`
- filesystem override selection in `resolve_template_path()`
- custom regex/XML rendering in `render_text()` and `render_docx_template()`

They are **not unused today** and must remain during Phases B–E. The editable
forms, canonical saves, document statuses, ticket search, business mappings,
and workflow actions are not presentation-only and must be preserved.

## Phase A exit criteria

- [x] Existing six types and source boundaries reverified.
- [x] Baseline template files fingerprinted.
- [x] Quotation/deposit/dispatch regression boundary recorded.
- [x] Six-type generation compatibility test added.
- [x] No renderer, model, API, UI, migration, or stored data changed.
- [x] Focused tests executed successfully: 20/20 passed on the isolated
  in-memory test database, including six-type generation, quotation decisions
  and revisions, deposit/dispatch gates, Sales Record deposit transfer,
  turnover finalization, and completed-job document metadata.
- [x] Phase B separately approved and implemented after this checkpoint.
- [x] The six exact runtime baseline sources were later registered as valid,
  inactive Standard v1 versions through the dry-run-first
  `import_legacy_document_templates` command. The configured-storage import is
  checksum-idempotent and records the named administrator; it does not activate
  any version.

Phase B may introduce template infrastructure and migrations, but migrations
must run only against isolated test databases until the user explicitly
authorizes development or deployed-database migration.
