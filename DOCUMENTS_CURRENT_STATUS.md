# AFN Documents Module — Current System Audit

> **Authoritative current-state refresh — 2026-11-03:** The section immediately
> below reflects the implementation and local development data as they exist
> after Dynamic Documents Phases B–E. The original investigation is retained
> later in this file as historical design context and is superseded wherever it
> describes template infrastructure as missing.

## Current implementation snapshot — 2026-11-03

### Executive conclusion

The Documents module is now a hybrid system. The six protected AFN business
documents retain their canonical Django records and structured React editors,
while a second layer provides versioned DOCX templates, controlled publication,
dynamic rendering, private generated-output archives, custom document
definitions, typed fields, and supporting attachments.

The implementation is not a visual template builder. Uploading a DOCX does not
change the React **Editor preview**. Uploaded templates affect generated DOCX
files after a valid version is activated. Core generation falls back to the
repository templates when no active version exists.

### Feature classification

| Area | Classification | Verified current behavior |
|---|---|---|
| Six core document editors | Fully implemented | Ticket-backed structured editors with save, reload, status, paper sizing, zoom, and browser print |
| Ticket document prefill | Fully implemented | Aggregates ticket, client, service, inspection, technician, quotation, project, equipment, warranty, and workflow data |
| DOCX template upload | Fully implemented | Macro-free DOCX upload with bounded archive and placeholder validation |
| Template versioning | Fully implemented | Immutable versions, validation reports, checksums, change notes, and publication state |
| Activation and rollback | Fully implemented | Capability-gated transactional activation and restoration of earlier valid versions |
| Multiple designs | Fully implemented | Named designs, default selection, retirement/reactivation, and guarded deletion |
| Core dynamic DOCX generation | Fully implemented | Active design rendering with exact template provenance and legacy fallback |
| Custom documents | Fully implemented | Definitions, typed fields, source-bound instances, DOCX generation, archives, and attachments |
| Private storage/downloads | Fully implemented | Authenticated Cloudinary raw resources and permission-controlled download endpoints |
| Uploaded-template preview | Partially implemented | Real ticket data can be test-rendered, but the result is downloaded as DOCX rather than shown inline |
| HTML editor/template synchronization | Partially implemented | Both paths work, but the HTML editor is not a preview of the uploaded DOCX layout |
| PDF support | Partially implemented | The output model permits a PDF label and browser print can create a PDF; no server PDF renderer exists |
| Arbitrary Word fidelity | Partially implemented | Body, tables, headers, footers, styles, logos, split runs, and supported repeating sections are covered; advanced Word constructs are not guaranteed |
| Visual drag-and-drop builder | Missing | No template canvas, field positioning, or image-layout editor |
| Image templates | Missing | PNG/JPG files cannot be used as document templates |
| Inline DOCX/PDF viewer | Missing | No page thumbnails, page navigation, or embedded office/PDF preview |
| Server-generated PDF | Missing | No LibreOffice, Word service, or equivalent conversion pipeline |
| Malware scanning and retention automation | Missing | Structural validation exists, but antivirus and lifecycle cleanup services do not |

### Frontend surfaces

The main administrator workspace is
`frontend/src/pages/admin/AdminDocuments.jsx`, routed at
`/admin/documents`. Access is controlled through the document capabilities in
`frontend/src/rbac.js`.

It exposes six protected core document types:

1. Field Service Report
2. Turnover Acceptance
3. Commissioning Checklist
4. Technical Data Sheet
5. Installation Contract
6. Quotation Proposal

The page contains ticket search, document-specific status and missing-field
feedback, editable React previews, A4/Letter/Long Bond paper choices, zoom and
fit controls, reset, browser print, and canonical save/workflow actions. Its
preview functions include `FieldServiceReport`,
`SolarCommissioningChecklistPreview`, `QuotationProposalPreview`,
`TurnoverAcceptancePreview`, `TechnicalDataSheetPreview`, and
`InstallationContractPreview`.

Supporting modules are:

- `frontend/src/pages/admin/adminDocumentsSupport.js`
- `frontend/src/pages/admin/adminDocumentsBuilders.js`
- `frontend/src/components/documents/TechnicalDataSheetForm.jsx`
- `frontend/src/components/documents/SolarCommissioningChecklistForm.jsx`
- `frontend/src/components/documents/FieldServiceReportForm.jsx`

`frontend/src/components/admin/DocumentTemplateManager.jsx` implements the
administrative template UI: definition/design selection, default and retired
state, DOCX upload, diagnostics, version history, activation, rollback,
approved-placeholder catalog, ticket-backed Test DOCX, output history, custom
definition registration, and custom-field management. Upload uses an ordinary
file input, not a visual drag-and-drop authoring surface.

`frontend/src/components/admin/CustomDocumentWorkspace.jsx` implements the
custom-document UI: definition/design selection, dynamic typed fields,
instance save, DOCX generation, output download, and attachment management.
Custom documents are deliberately prevented from mutating quotation, deposit,
dispatch, payment, completion, or turnover workflow state.

Other consumers include Admin Service Tickets, Admin Job History, technician
inspection/checklist pages, quotation and turnover modals, and Client Job
Decisions. The client decision page operates on structured quotation/turnover
records; it is not an official-document library or DOCX viewer.

### Backend models and relationships

The main definitions are in `backend/services/models/documents.py`.

Canonical business models:

- `TechnicalDataSheet`: one-to-one ticket record; draft/submitted/reviewed.
- `SolarCommissioningChecklist`: one-to-one ticket record;
  draft/completed/finalized.
- `TurnoverAcceptance`: one-to-one ticket record;
  draft/finalized/accepted with actor and timestamp history.
- `QuotationRecord`: one-to-one ticket/client record;
  draft/sent/accepted/rejected with BOM, totals, deposit snapshot, and terms.
- `InstallationContract`: one-to-one ticket record; draft/finalized/signed.
- `FieldServiceReport`: multiple reports per ticket with readings, performed
  work, recommendations, and client acknowledgement.

Dynamic document models:

- `DocumentDefinition`: stable core/custom document identity and data source.
- `DocumentTemplate`: named design under a definition, including default and
  enabled state.
- `DocumentTemplateVersion`: immutable upload, checksum, placeholder manifest,
  validation report, and draft/active/retired publication state.
- `DocumentFieldDefinition`: typed custom field configuration.
- `DocumentInstance`: prepared custom data bound to a ticket, client, or
  project.
- `GeneratedDocument`: latest editable JSON snapshot for a core ticket/type;
  it is not the generated binary archive.
- `DocumentOutput`: immutable generated file, exact template version, source
  snapshot, checksum, renderer source, actor, and status.
- `DocumentAttachment`: private supporting file for a custom instance.

### APIs and permissions

Router endpoints in `backend/services/urls.py` include:

- `/api/services/document-definitions/`
- `/api/services/document-field-definitions/`
- `/api/services/document-templates/`
- `/api/services/document-template-versions/`
- `/api/services/document-instances/`
- `/api/services/document-attachments/`
- `/api/services/document-outputs/`

Ticket actions include:

- `GET /api/services/service-tickets/{id}/document-prefill/`
- `GET|POST /api/services/service-tickets/{id}/document-draft/`
- `POST /api/services/service-tickets/{id}/update-project-details/`
- `POST /api/services/service-tickets/{id}/generate-document/`

The template, instance, attachment, and output viewsets are implemented in
`backend/services/views/document_templates.py`. Ticket prefill, draft, and core
generation actions are in `backend/services/views/tickets.py`.

Capabilities distinguish document viewing and management from template upload,
template administration, publication, rollback, definition administration,
and attachment administration. Related querysets are also filtered by a
definition's access-capability contract.

### Template validation and rendering

`backend/services/document_templates.py` validates DOCX archives before a
version can be activated. It enforces upload, entry-count, total-uncompressed,
and individual-part limits; required Word parts; safe archive paths; no
encryption, VBA, embedded packages/OLE, or external relationships; approved
placeholders; balanced supported loops; and split-run placeholder repair.

Unknown or invalid placeholders produce an invalid diagnostic draft that cannot
be activated. The renderer does not execute arbitrary Jinja or Word macros.
Repeating table rows and paragraphs use dedicated marker-only constructs such
as `{{#rows}}` and `{{/rows}}`.

`backend/services/dynamic_document_generation.py` resolves the selected or
default active design, creates the canonical/custom context, replaces scalar
tokens, expands supported repeats, preserves unaffected archive parts, and
archives a `DocumentOutput`. Core types use the legacy repository templates
from `backend/services/document_generation.py` when no active dynamic version
exists. Custom definitions require an active template and have no legacy
fallback.

### Formats and previews

Template input is DOCX only. Generated and test-rendered output is currently
DOCX only. Custom-instance attachments accept PDF, DOCX, PNG, JPG/JPEG, WebP,
and UTF-8 TXT subject to type and size validation.

There are three distinct presentation paths:

1. The structured React **Editor preview**, which is editable and printable.
2. **Test DOCX**, which renders a real uploaded template with ticket data and
   downloads it without creating the normal archived output.
3. Archived generated DOCX downloads from `DocumentOutput`.

There is no inline uploaded-template preview and no server-generated PDF.

### Storage and security

`backend/afn_service_management/storage.py` routes template files, generated
outputs, and attachments to authenticated Cloudinary raw resources. Downloads
are provided through authorized endpoints and short-lived server-generated
access. Serializers do not expose permanent provider URLs.

The system validates file structure and signatures but does not include an
antivirus scanner. Automated output/attachment retention and cleanup are also
not implemented.

### Current local development state

A read-only database inspection on 2026-11-03 found:

- 7 definitions: six protected core definitions and one custom definition.
- 8 template designs.
- 6 template versions.
- 0 active versions.
- 0 document instances.
- 0 generated outputs.
- 0 attachments.

The six core baseline versions are valid drafts. Because none is active, local
core DOCX generation currently uses the safe legacy fallback. The custom
definition named `iman` is inactive. This is configuration state, not missing
application functionality.

### Workflow assessment

- **Technical Data Sheet — Fully implemented:** canonical save, submission,
  review state, reload, and locking behavior.
- **Quotation — Fully implemented:** draft/send, client accept/decline,
  revision protections, canonical financial values, deposit integration, and
  dispatch restrictions. A visual template cannot change these rules.
- **Commissioning — Fully implemented:** canonical save/status progression and
  finalized immutability.
- **Turnover — Fully implemented:** finalization after completion, equipment
  registration/warranty effects, and client confirmation.
- **Field Service Report — Fully implemented with a structural limitation:**
  multiple canonical reports are supported, while the editable
  `GeneratedDocument` snapshot remains one latest snapshot per ticket/type.
- **Installation Contract — Partially implemented as an end-user flow:** the
  canonical model and statuses exist, but the administrator editor does not
  provide a complete guided digital-signing lifecycle.
- **Custom documents — Fully implemented as independent documents:** they can
  be configured, populated, generated, archived, and supplemented with
  attachments, but do not acquire arbitrary business workflow automation.

### Known limitations and next-revision boundaries

Do not rebuild the template registry, validation, activation/rollback,
rendering, output archive, custom-definition, custom-field, or attachment
infrastructure. Those capabilities already exist.

The highest-value remaining work is the authoring and preview experience:

- clarify upload → validation → activation → generation in the UI;
- add a direct core-document design selection/generation experience where
  appropriate;
- decide between downloadable Test DOCX, an external Office viewer, or a
  server-side PDF preview pipeline;
- add a visual canvas only if image-like field placement is truly required;
- perform real Microsoft Word visual approval for all six core templates;
- complete an activation/replacement/rollback/archive UAT using approved files;
- run the PostgreSQL publication-concurrency gate in staging;
- decide malware-scanning and retention policies before production release;
- retain the legacy fallback until the dynamic path has passed those gates.

---

## Historical pre-implementation investigation

The material below records the original baseline and proposed integration
design. It is retained for traceability but is no longer authoritative where it
classifies the now-implemented dynamic-template features as missing.

**Audit date:** 2026-11-02  
**Scope:** Existing source code and repository artifacts only  
**Mode:** Investigation only; no application code, schema, migration, dependency, route, or runtime data was changed

> **Phase update (2026-11-02):** This report records the pre-implementation
> state. Phase B backend infrastructure is now implemented locally and documented
> in `docs/quality/DOCUMENT_MANAGEMENT_PHASE_B.md`. Migration `services.0065`
> is now applied to local development only; the legacy renderer/UI remain active
> as the guarded compatibility path.
>
> **Phase C update (2026-11-02):** Active-template DOCX generation, legacy
> fallback, exact template/source provenance, configured-storage archives,
> authorized downloads, and actual DOCX test rendering are implemented locally
> under migration `services.0066`. The React workspace and PDF preview remain
> unchanged pending Phase D.
>
> **Phase D update (2026-11-02):** The Admin Documents workspace now has a
> capability-gated responsive manager for designs, DOCX upload/validation,
> versions, activation, rollback, defaults/retirement, Test DOCX rendering, and
> ticket output history/downloads. The existing HTML paper is labeled Editor
> preview and is intentionally not described as an exact uploaded-layout
> preview. PDF conversion, custom definitions/field mapping, and removal of the
> legacy editor remain deferred. See
> `docs/quality/DOCUMENT_MANAGEMENT_PHASE_D.md`.
>
> **Phase E update (2026-11-02):** Custom document registration, typed manual
> fields, safe ticket/client/project placeholder catalogs, template selection,
> source-bound instances, private DOCX generation/archive, supporting
> attachments, definition-level access restrictions, and a dynamic Custom
> documents workspace are implemented locally under migration `services.0067`.
> The feature is deliberately independent from protected quotation, deposit,
> dispatch, completion, payment, and turnover workflows. Migrations
> `services.0065` through `0067` are now applied to local development only;
> staging and production remain untouched. Deployment-shaped storage,
> malware-scanning, retention, and complete browser-flow verification remain
> release work. See `docs/quality/DOCUMENT_MANAGEMENT_PHASE_E.md`.
>
> **Phase F readiness update (2026-11-02):** The local acceptance gate passes
> 48/48 backend checks, 2/2 Admin Documents browser journeys, the 2,547-module
> build, and schema/system checks. Representative rendering preserves tables,
> headers, footers, styles, and embedded image bytes. Compatibility cleanup is
> intentionally not executed. All six repository baselines are now registered
> locally as validated inactive v1 versions in configured Cloudinary raw-file
> storage and pass storage read-back plus in-memory rendering with zero
> unresolved tokens. They remain unactivated because actual Word visual review,
> approved replacement-version rollback, archived-output authorization/storage
> UAT, and staging acceptance are incomplete. Active JSX
> editors/builders/forms plus the legacy context/fallback renderer retain runtime
> consumers. See `docs/quality/DOCUMENT_MANAGEMENT_PHASE_F_READINESS.md`.
>
> **Security/authoring checkpoint (2026-11-03):** Template versions, generated
> outputs, and attachments now use authenticated Cloudinary raw resources with
> short-lived server-generated reads. All six local inactive baselines were
> migrated from legacy public delivery, verified byte-exact and renderable, and
> their former public URLs return 404. Definitions now expose a complete typed
> placeholder catalog in the shared manager. Marker-only Word rows/paragraphs
> support repeating sections, and publication is serialized per design with a
> PostgreSQL-only race regression awaiting staging execution. These improvements
> close concrete security and authoring gaps but do not satisfy Phase F visual,
> rollback, archive/attachment UAT, retention/malware, or stakeholder gates.

## Executive summary

AFN currently has a substantial **job-document workspace**, not a document-template management system.

The administrator Documents page supports six job-document workflows:

1. Technical Data Sheet
2. Quotation / Proposal
3. Installation Contract
4. Solar Commissioning Checklist
5. Project Turnover and Acceptance
6. Field Service Report

For those six types, the system can collect ticket data, edit printable fields, save working snapshots, persist several canonical business records, lock important finalized states, show a browser preview, and print from the browser. A separate backend path can render and download DOCX files from six server-side `.docx` files.

Those two paths are not one WYSIWYG system:

- The live Documents preview is hardcoded React/HTML/CSS in `frontend/src/pages/admin/AdminDocuments.jsx`.
- DOCX generation is a custom ZIP/XML substitution engine in `backend/services/document_generation.py`.
- Replacing a DOCX file does **not** change the browser preview.
- There is no database model, API, or UI for uploading, validating, activating, versioning, previewing, or rolling back templates.
- `GeneratedDocument` stores JSON snapshots and status; it does not store a template version or a generated file.

The safest extension is therefore versioned, inactive-by-default template upload for authorized office administrators, with strict DOCX validation, a server-owned placeholder catalog, test rendering, explicit activation, atomic rollback, durable private storage, and a generated-output audit trail. An uploaded file must never overwrite the active template in place.

## Status legend

| Classification | Meaning |
|---|---|
| **Fully Implemented** | The inspected code provides the feature end to end for its stated scope. |
| **Partially Implemented** | A usable path exists, but important workflow, fidelity, storage, or integration pieces are absent. |
| **Missing** | No implementation was found. |
| **Potentially Broken** | Code exists, but a concrete implementation characteristic can cause incorrect, fragile, or environment-dependent behavior. |

## 1. Current UI

### 1.1 Routes, access, and navigation

| Feature | Status | Evidence and behavior |
|---|---|---|
| Administrator Documents route | **Fully Implemented** | `frontend/src/App.jsx` mounts `AdminDocuments` at `/admin/documents` for `admin` and `superadmin`, guarded by `DOCUMENTS_VIEW_CAPABILITIES`. |
| View/manage separation | **Fully Implemented** | The page distinguishes document viewing from `documents.manage`; view-only users can inspect/print, while mutations are capability-gated. Backend permission classes are in `backend/services/permissions.py` and capability definitions/descriptions are in `backend/users/rbac.py`. |
| Client template-management route | **Missing** | No client or public template-management page was found. Client document interactions are job decisions, not template administration. |

### 1.2 Main Documents workspace

Primary files:

- `frontend/src/pages/admin/AdminDocuments.jsx`
- `frontend/src/pages/admin/adminDocumentsSupport.js`
- `frontend/src/pages/admin/adminDocumentsBuilders.js`

`AdminDocuments.jsx` is a very large page component that owns searching, loading, state hydration, canonical-record saves, draft saves, printable rendering, paper controls, and action states.

| UI feature | Status | Evidence and behavior |
|---|---|---|
| Ticket search and selection | **Fully Implemented** | Search supports ticket ID, client, and service text. Selection loads the document-prefill aggregate and related records. |
| Ticket context summary | **Fully Implemented** | Selected ticket identity, service, client, status, and a link back to the ticket workspace are shown. |
| Six document-type tabs | **Fully Implemented** | `TEMPLATE_OPTIONS` in `adminDocumentsSupport.js` defines the six supported types. The page presents them in job order: TDS, quotation, contract, commissioning, turnover, FSR. |
| Per-document state labels | **Fully Implemented** | The page derives labels such as Not started, Draft, Submitted, Reviewed, Waiting for client, Accepted/Declined, Signed/Finalized, and saved-report counts where corresponding records exist. |
| Two-column editor and preview | **Fully Implemented** | Editable controls/actions are on the left and a paper-like live HTML preview is on the right. Responsive behavior exists, but the monolithic page remains costly to maintain. |
| Paper controls | **Fully Implemented** | A4, Letter, and Long Bond sizes; zoom out, fit, zoom in; reset; and print are implemented. Paper definitions are in `adminDocumentsSupport.js`. |
| Browser print | **Fully Implemented** | The print path clones rendered HTML, converts form controls to static values, opens a print window, and invokes `window.print()`. |
| True DOCX preview | **Missing** | The visible preview is React HTML, not the backend template rendered to Word/PDF. |
| Uploaded-template editor/preview | **Missing** | No upload control, template list, version history, placeholder mapping screen, activation control, or DOCX/PDF preview exists. |

### 1.3 Preview components

The printable layouts are source-controlled JSX functions in `AdminDocuments.jsx`:

- `Header`
- `Footer`
- `FieldServiceReport`
- `SolarCommissioningChecklistPreview`
- `QuotationProposalPreview`
- `TurnoverAcceptancePreview`
- `TechnicalDataSheetPreview`
- `InstallationContractPreview`
- `DocumentPreview`

**Classification: Partially Implemented.** These provide editable, useful on-screen forms and browser printing, but they duplicate layout responsibility that also exists in the DOCX files. They cannot prove how an imported Word template will paginate, style, or render.

### 1.4 Existing forms, modals, and duplicate surfaces

Document-related editing is not confined to the Documents page:

- `frontend/src/components/shared/QuotationProposalForm.jsx`
- `frontend/src/components/shared/TurnoverAcceptanceForm.jsx`
- `frontend/src/components/shared/FieldServiceReportForm.jsx`
- `frontend/src/components/shared/SolarCommissioningChecklistForm.jsx`
- `frontend/src/components/shared/TechnicalDataSheetForm.jsx`
- `frontend/src/components/shared/InspectionReviewModal.jsx`
- `frontend/src/pages/admin/AdminServiceTickets.jsx`
- `frontend/src/pages/technician/TechnicianChecklist.jsx`
- `frontend/src/pages/technician/TechnicianInspectionChecklist.jsx`

**Classification: Partially Implemented.** The separate surfaces support the real field and approval workflows, but they duplicate presentation and some mapping logic. Changes to a document field or status can require coordinated edits in several places.

## 2. Supported document types

### 2.1 The six generated-document types

`GeneratedDocument.DOCUMENT_TYPES` in `backend/services/models/documents.py` and the frontend option list agree on six values.

| Type | Canonical business record | Browser workspace | DOCX template | Overall status |
|---|---|---|---|---|
| Technical Data Sheet | `TechnicalDataSheet` (one per ticket) | Editable, save, ticket-spec sync, status display | `technical_data_sheet.docx` | **Fully Implemented** for core record/snapshot; **Partially Implemented** as managed template |
| Quotation / Proposal | `QuotationRecord` (one per ticket) | Draft snapshot, send, inventory/BOM, deposit display | `quotation_proposal.docx` | **Fully Implemented** for commercial workflow; **Partially Implemented** for template lifecycle |
| Installation Contract | `InstallationContract` (one per ticket) | Editable and saveable | `installation_contract.docx` | **Partially Implemented**; final/sign transitions are not presented as a complete Documents-page workflow |
| Commissioning Checklist | `SolarCommissioningChecklist` (one per ticket) | Editable canonical checklist | `commissioning_checklist.docx` | **Fully Implemented** for record capture; **Partially Implemented** for template lifecycle |
| Turnover and Acceptance | `TurnoverAcceptance` (one per ticket) | Draft, finalization, equipment registration | `turnover_acceptance.docx` | **Fully Implemented** for handover workflow; **Partially Implemented** for template lifecycle |
| Field Service Report | `FieldServiceReport` (many per ticket) plus one shared generated snapshot per type | Printable draft and report selection | `field_service_report.docx` | **Partially Implemented**; multiple canonical reports exist, but only one `GeneratedDocument` snapshot can exist per ticket/type |

### 2.2 Other requested or related document concepts

| Type | Status | Finding |
|---|---|---|
| Completion certificate | **Missing** | No completion-certificate model, generated-document choice, template, endpoint, or UI was found. |
| Solar estimate | **Partially Implemented** | `SolarEstimate` in `backend/services/models/core.py` is a client calculator/versioned estimate record and can be converted/promoted into service/project data. It is not one of the six generated-document types and has no DOCX template/export path. |
| Warranty certificate | **Missing** as a standalone document | Warranty data is embedded in inspection, quotation, contract, turnover, installed-equipment, and service records. No standalone certificate workflow exists. |
| Inspection report | **Partially Implemented** | `InspectionChecklist` is a canonical operational record and feeds prefill. It is not a separate generated-document type. |
| Sales record/invoice/receipt | **Partially Implemented** | Sales and payment records exist in the Sales Records module and depend on accepted commercial data, but no inspected template-managed DOCX type exists for them. |

## 3. Template management and DOCX rendering

### 3.1 Current template source

| Capability | Status | Current implementation |
|---|---|---|
| Six baseline DOCX templates | **Fully Implemented** | Stored in `backend/document_templates/`; `ensure_template_files()` can generate minimalist baseline DOCX files from hardcoded WordprocessingML. |
| Developer-provided overrides | **Partially Implemented** | `resolve_template_path()` prefers an exact filename in `backend/document_templates/originals/`. Only an original Field Service Report override was found. Replacement is a filesystem/developer operation. |
| Database-driven templates | **Missing** | No template or template-version model exists. |
| Uploaded templates | **Missing** | No upload endpoint, serializer, form, or storage record exists. |
| Versioning, activation, rollback | **Missing** | No version number, active version, prior-version restore, checksum, or activation transaction exists. |
| Placeholder catalog/API | **Missing** | Placeholder names exist implicitly in generator contexts and DOCX text. There is no authoritative typed catalog exposed to users or validators. |
| Template audit trail | **Missing** | No uploaded-by, activated-by, approval note, validation result, or historical association is persisted. |

### 3.2 Renderer behavior

`backend/services/document_generation.py` provides:

- `build_template_definitions()`
- `ensure_template_files()`
- `resolve_template_path()`
- `build_common_context()` and six type-specific context builders
- `render_text()`
- `render_docx_template()`
- `generate_document()`

The engine opens a DOCX as a ZIP and performs regular-expression substitution in:

- `word/document.xml`
- `word/headerN.xml`
- `word/footerN.xml`

It supports scalar `{{ key }}` placeholders and custom loop markers represented as XML comments, such as `<!-- {{#rows}} --> ... <!-- {{/rows}} -->`.

| Renderer feature | Status | Finding |
|---|---|---|
| Scalar substitution | **Fully Implemented** for templates matching its exact syntax | Values are XML-escaped and dot paths are resolved. |
| Repeating rows | **Partially Implemented** | Custom XML-comment loops work in controlled templates, but are not a standard Word authoring feature and may be changed or stripped by Word. |
| Headers and footers | **Fully Implemented** for contiguous placeholders | Matching header/footer XML parts are processed. |
| Text boxes, drawings, footnotes, endnotes, comments, custom XML | **Missing** | These parts are not processed. |
| Placeholders split across Word runs | **Potentially Broken** | Word commonly splits visible text across `<w:r>`/`<w:t>` nodes. The regex expects a contiguous token in raw XML, so a visually intact placeholder can fail silently. |
| Arbitrary imported DOCX compatibility | **Potentially Broken** | There is no normalization, linting, or validation for run splitting, invalid loop structure, external relationships, embedded objects, or unsupported parts. |
| Original FSR repeating equipment rows | **Partially Implemented** | The inspected original FSR override contains scalar placeholders but not the `service_rows` loop marker; it therefore cannot reliably express all multiple report/equipment rows through the loop engine. |
| Use of `python-docx` | **Missing in this path** | `python-docx` is installed, but the generation module does not import or use it. |

### 3.3 Template placeholders currently available

The actual server context supplies the following main groups. These are implementation details, not a validated public contract.

| Document | Main scalar/loop groups |
|---|---|
| Field Service Report | Ticket/client/contact/location, technician, service date; `service_rows` with brand/model, TR/HP, serial, temperatures, ampere, readings, notes, recommendation |
| Commissioning | Site, inverter/system identifiers, commissioning date, irradiance, temperature; `checklist_rows`, `reading_rows` |
| Quotation | Ticket/client/project/commercial/legal fields; `brand_rows`, `price_rows`, bill-of-material rows, warranty rows |
| Contract | Client/property/scope/system, dates/duration, amounts/payment terms, warranty/legal/signers, linked quotation fields |
| Technical Data Sheet | Identity/contact/site/power fields; load, generator, purpose, and attachment rows; confirmation fields |
| Turnover | Project/client/date/system fields; component, performance, commissioning, and document rows; warranty/signature/confirmation fields |

## 4. Document generation and data mapping

### 4.1 Browser workflow

`AdminDocuments.jsx` uses the helpers in `adminDocumentsBuilders.js` to turn prefill data into form state:

- `buildTicketContextFromPrefill()`
- `buildFormFromTicket()`
- `buildTdsFormFromTicket()`
- `buildCommissioningFormFromTicket()`
- `buildQuotationFormFromTicket()`
- `buildTurnoverFormFromTicket()`
- `buildInstallationContractFormFromTicket()`
- the corresponding `hydrate*Form()` helpers

**Classification: Fully Implemented for the six current screens.** The workspace can load a ticket, hydrate saved state, edit it, and save the supported canonical record and/or printable snapshot.

### 4.2 Backend prefill

`ServiceTicketViewSet.document_prefill()` in `backend/services/views/tickets.py` aggregates:

- ticket, request, service type, and project details
- client and service location
- assigned technician/crew context
- inspection and proof metadata
- commissioning checklist
- solar project profile
- quotation and deposit data
- turnover acceptance
- technical data sheet
- installation contract
- completion data
- inventory reservations and installed equipment
- warranty, after-sales, and maintenance data
- field service reports
- defaults and missing-field indicators

**Classification: Fully Implemented for broad aggregation; Potentially Broken for error visibility.** Several optional related-record reads use broad exception handling. A programming or data error can be presented as “record absent,” which makes diagnosis harder.

### 4.3 Saved printable snapshots

`ServiceTicketViewSet.document_draft()` saves or retrieves one `GeneratedDocument` per ticket/document type. The database constraint is unique on `(ticket, document_type)`.

**Classification: Fully Implemented for one current snapshot per type.** It uses a transaction and row locking, rejects edits to a finalized snapshot with HTTP 409, and validates `data_json`/`source_snapshot_json` as objects.

Limitations:

- It is not a version history.
- It does not retain each save.
- It has no template-version foreign key.
- It has no output file.
- The uniqueness model is awkward for multiple field service reports on one ticket.

### 4.4 DOCX generation and download

`ServiceTicketViewSet.generate_document()` validates the optional report ID, calls `generate_document()`, and returns a `FileResponse`.

`frontend/src/api/services.js` exposes `downloadTicketDocument()`.

Entry points found:

- `frontend/src/pages/admin/AdminServiceTickets.jsx`: Field Service Report download
- `frontend/src/pages/admin/AdminJobHistory.jsx`: generated-document and field-service-report downloads

The main `AdminDocuments.jsx` does not use `downloadTicketDocument()`; its primary output is browser print.

**Classification: Partially Implemented.** Six DOCX types can be rendered by the backend, but access to downloads is fragmented and the Documents workspace does not preview or directly represent the selected DOCX template.

### 4.5 Generated file persistence

The renderer writes timestamped files below `MEDIA_ROOT/generated_documents` and streams them back. `GeneratedDocument` does not reference the file.

**Classification: Potentially Broken in hosted production.** The generator uses local `Path(settings.MEDIA_ROOT)` operations instead of Django's configured storage backend. If media normally uses Cloudinary/object storage and the application filesystem is ephemeral, there is no durable generated-document archive. Immediate streaming may work for that request, but historical retrieval, retention, cleanup, checksum verification, and disaster recovery are not defined.

## 5. Backend models and relationships

Primary model file: `backend/services/models/documents.py`.

| Model | Relationship and purpose | Status |
|---|---|---|
| `TechnicalDataSheet` | One-to-one `ServiceTicket`; structured load/generator/purpose/attachment data; draft/submitted/reviewed | **Fully Implemented** |
| `InspectionChecklist` | One-to-one ticket; field inspection, template snapshots, proof media, warranty/follow-up/maintenance findings | **Fully Implemented**, though not a generated-document type |
| `SolarCommissioningChecklist` | One-to-one ticket; system/readings/checklist JSON; draft/completed/finalized | **Fully Implemented** |
| `TurnoverAcceptance` | One-to-one ticket; optional link to `GeneratedDocument`; draft/finalized/accepted and client confirmation | **Fully Implemented** |
| `GeneratedDocument` | Many-to-one ticket but unique per type; type/status/title/snapshot JSON/generated-by | **Partially Implemented** because its name implies a file/version that it does not store |
| `QuotationRecord` | One-to-one ticket and client; amounts, BOM, deposit snapshot, terms, response status | **Fully Implemented** |
| `InstallationContract` | One-to-one ticket; scope, dates/duration, amount, payment/warranty terms, signature status | **Fully Implemented** at model/API level; **Partially Implemented** as a complete UI lifecycle |
| `SolarProjectProfile` | One-to-one `ServiceLocation`; optional originating ticket; reusable solar system profile | **Fully Implemented** and feeds documents |
| `FieldServiceReport` | Many-to-one ticket; readings, equipment, recommendations, acknowledgement | **Fully Implemented** as canonical records; snapshot history remains limited |
| `SolarEstimate` | Client-owned, optional service request; versioned inputs/results | **Fully Implemented** as calculator data, **Missing** as a generated document |

No `DocumentTemplate`, `DocumentTemplateVersion`, placeholder definition, rendered-file, or template-activation model exists.

## 6. Serializers, views, endpoints, and permissions

### 6.1 Serializers

- `backend/services/serializers/commercial_records.py`
  - `TechnicalDataSheetSerializer`
  - `QuotationRecordSerializer`
  - `GeneratedDocumentSerializer`
- `backend/services/serializers/field_operations.py`
  - commissioning and turnover serializers
- `backend/services/serializers/project_records.py`
  - `InstallationContractSerializer`
  - `FieldServiceReportSerializer`
  - `InstalledEquipmentSerializer`
  - `SolarProjectProfileSerializer`

Important enforced behavior includes JSON shape/type validation, quotation BOM limits, commercial amount/validity checks, client consistency, and immutable reviewed/accepted/signed/finalized records.

**Classification: Fully Implemented for current canonical records.** There is no upload serializer or DOCX security validation.

### 6.2 API routes

The router in `backend/services/urls.py` exposes:

- `/api/services/service-tickets/{id}/document-prefill/`
- `/api/services/service-tickets/{id}/document-draft/`
- `/api/services/service-tickets/{id}/generate-document/`
- `/api/services/service-tickets/{id}/update-project-details/`
- `/api/services/technical-data-sheets/`
- `/api/services/quotations/`
- `/api/services/installation-contracts/`
- `/api/services/solar-commissioning-checklists/`
- `/api/services/turnover-acceptances/`
- `/api/services/field-service-reports/`
- `/api/services/installed-equipment/`
- `/api/services/solar-project-profiles/`
- `/api/services/solar-estimates/`

Custom actions include TDS submit/review, quotation response/deposit actions, turnover finalize/client-confirm, and project-profile promotion.

**Classification: Fully Implemented for current workflows; Missing for template management.** No `/document-templates/`, upload, validate, preview, activate, versions, or rollback route exists.

### 6.3 Authorization

`ServiceTicketViewSet.get_permissions()` applies:

- `CanViewDocuments` to prefill and draft reads
- `CanManageDocuments` to draft writes, generation, and project-detail updates

Related viewsets scope records through visible tickets and role/capability rules. Clients can read/respond to their own eligible quotation and confirm their own finalized turnover. Technicians can access assigned/crew field records. Office mutations require document-management capability.

**Classification: Fully Implemented for current endpoints.** A future global template action should not automatically be granted to ordinary client accounts. A separate `documents.templates.manage` capability is safer than reusing broad document editing permission.

### 6.4 Project-detail mutation risk

`update_project_details()` shallow-merges an arbitrary dictionary into `ticket.project_details`.

**Classification: Potentially Broken as a long-term document schema.** It is manager-only, but there is no per-field allowlist or nested schema. Typos, stale keys, and collisions can persist silently. Template mapping should not make this unstructured dictionary an unrestricted variable namespace.

## 7. Existing data available to documents

| Domain | Available fields/examples | Status |
|---|---|---|
| Client | Full name, phone/contact, email, customer identity | **Fully Implemented** |
| Location | Address, coordinates/site context, property/project profile | **Fully Implemented** |
| Ticket/request | Ticket ID, request/service, dates, status, concern/description, project details | **Fully Implemented** |
| Technician | Lead technician, crew context, preparer/completer identities | **Fully Implemented** |
| Service | Service type/name, checklist/equipment snapshots, scope context | **Fully Implemented** |
| Inspection | Site/electrical/structural/safety findings, proofs, recommendation, warranty/follow-up/maintenance flags | **Fully Implemented** |
| Solar engineering | Capacity, panels, inverter, battery, mounting, loads, generator, readings | **Fully Implemented** where entered |
| Inventory/equipment | Reservations, BOM matching, installed equipment, serial/capacity/warranty fields | **Fully Implemented** |
| Commercial | Quotation number, BOM, totals, terms, warranty, validity, deposit requirement/payments/balance | **Fully Implemented** |
| Contract | Scope, dates, duration, contract amount, payment/warranty terms, status | **Fully Implemented** |
| Completion/handover | Commissioning rows, turnover rows, signatures, client confirmation, completed-job data | **Fully Implemented** |
| After-sales | Field service reports, maintenance schedule, after-sales/follow-up context | **Partially Implemented** in generated outputs; available through prefill/history but not every field is mapped into every template |

Missing-field indicators are returned to the UI, but there is no typed documentation showing every placeholder's source, required status, formatting rule, privacy classification, or applicable document type.

## 8. Editing and customization available today

| Customization | Status | Detail |
|---|---|---|
| Per-ticket document content | **Fully Implemented** | Authorized users can edit the six current forms and save the supported records/snapshots. |
| Paper size and preview zoom | **Fully Implemented** | UI-only print controls. |
| Company/business defaults | **Partially Implemented** | Some settings/defaults feed documents, while other company, signer, legal, and contact content remains hardcoded or manually editable per document. |
| Template layout, logo placement, fonts, tables | **Missing for administrators** | Requires source/file deployment by a developer. |
| Placeholder selection/mapping | **Missing** | No UI or persisted mapping. |
| Replacing an active template | **Missing for administrators** | Files can only be manually placed under the server template directory. |
| Version history and rollback | **Missing** | No record exists. |

A concrete consistency risk exists in hardcoded/default company contact values: different document-building paths contain independently maintained defaults. A template system should resolve business identity from one canonical settings source.

## 9. Dependencies on other AFN modules

### 9.1 Service tickets and requests

**Dependency: Direct and critical — Fully Implemented.** Every canonical generated document is ticket-centered. Prefill, visibility, status, client, service, location, assignment, and project data originate from the ticket/request graph. Deleting or changing field contracts here affects all documents.

### 9.2 Dispatch and technician assignment

**Dependency: Indirect but operationally important — Partially Implemented.** Assigned technician/crew data populates documents. Quotation acceptance and deposit readiness also influence whether service can be dispatched. The Documents module does not perform scheduling itself.

### 9.3 Technician field workflows

**Dependency: Direct — Fully Implemented.** Technician inspection, commissioning, and field service forms create canonical data later displayed in Documents and history. `TechnicianInspectionChecklist.jsx` embeds `TechnicalDataSheetForm`; `TechnicianChecklist.jsx` embeds commissioning and FSR flows.

### 9.4 Inventory and installed equipment

**Dependency: Direct — Fully Implemented.** Quotation BOM rows can match inventory; reservations and installed equipment feed prefill, turnover, warranties, and FSRs. Turnover can register installed equipment.

### 9.5 Quotations, deposits, and Sales Records

**Dependency: Direct and critical — Fully Implemented.** Accepted quotation and deposit snapshots feed downstream sales records and scheduling gates. `InspectionReviewModal.jsx` also reads and can record quotation acceptance. Template changes must not alter the canonical financial calculations.

### 9.6 Client portal

**Dependency: Direct for decisions — Fully Implemented.** `frontend/src/components/client/ClientJobDecisions.jsx` fetches the client's quotation and turnover. It permits accept/decline with a decline reason and handover confirmation. It shows structured data, not a generated DOCX preview.

### 9.7 Completed-job history and reports

**Dependency: Direct — Fully Implemented for metadata/download entry points.** `backend/services/views/reports.py` and `backend/services/views/technician.py` include `generated_documents` and field service report metadata. `AdminJobHistory.jsx` downloads supported documents; technician history exposes metadata but is not the main official download surface.

### 9.8 Solar estimates and project profiles

**Dependency: Indirect — Partially Implemented.** Estimates can become service requests or solar project profiles; profiles then prefill documents. The estimate itself has no template-managed output.

### 9.9 Notifications

**Dependency: Workflow-level — Partially Implemented.** Ticket progress and commercial/turnover actions produce user-visible state and some notifications, but template upload, activation, render failure, and version rollback have no notification or audit events because those features do not exist.

## 10. State management and refresh behavior

### 10.1 Frontend

The Documents page uses local React state rather than a global document store. It tracks:

- ticket query/results and selected ticket
- prefill and related canonical records
- active document type
- separate form state per document
- selected paper size and zoom
- loading, saving, and message states
- draft hydration and lock states

An editor request-sequence guard prevents a slower earlier request from overwriting a newer ticket/type selection.

**Classification: Fully Implemented for current single-page use.** Refresh is explicit through selection/loading and post-save state updates. There is no real-time collaborative editing, autosave, optimistic version check, cross-tab conflict detection, or unsaved-change navigation guard documented in the inspected path.

### 10.2 Backend consistency

Draft writes use transactions and ticket/document row locking. Canonical serializers enforce key immutable states.

**Classification: Fully Implemented for current record invariants; Partially Implemented for version concurrency.** There is no revision/ETag field for mutable drafts, so two office users can overwrite the current snapshot on a last-write-wins basis.

## 11. Existing issues and limitations

### High priority

1. **Two independent renderers — Partially Implemented.** Browser preview and DOCX output can diverge in wording, fields, layout, pagination, and styling.
2. **No managed template lifecycle — Missing.** Upload, security checks, versions, activation, rollback, audit metadata, and inactive test rendering do not exist.
3. **Imported Word placeholder fragility — Potentially Broken.** Run splitting and unsupported Word parts can cause unresolved placeholders without a reliable user-facing validation result.
4. **Generated output is not durably modeled — Potentially Broken.** Local filesystem output bypasses configured storage and is not linked to `GeneratedDocument`.
5. **No output/template provenance — Missing.** It is impossible to prove which template version created a downloaded file.
6. **Global-template authorization is undefined — Missing.** Existing document-management permission is broader than a safe template-publishing permission.

### Medium priority

1. **Monolithic UI — Partially Implemented.** `AdminDocuments.jsx` combines six editors, layouts, persistence, printing, and orchestration, increasing regression risk.
2. **Duplicated forms/mappers — Partially Implemented.** Shared/technician/admin forms and backend context builders can drift.
3. **Multiple FSR mismatch — Partially Implemented.** Canonical reports are many-per-ticket, while printable snapshots are one-per-ticket/type.
4. **Fragmented output actions — Partially Implemented.** Browser printing is in Documents; DOCX download is primarily in Tickets/Job History.
5. **Broad prefill exception handling — Potentially Broken.** Unexpected failures can look like absent optional records.
6. **Unstructured `project_details` namespace — Potentially Broken.** It can accumulate undocumented keys and should not become an unrestricted placeholder source.
7. **Contract lifecycle UI — Partially Implemented.** The model supports draft/finalized/signed, but the Documents page does not expose a complete guided final/sign flow comparable to quotation/turnover.
8. **Commissioning transitions — Potentially Broken as workflow governance.** Generic record updates and UI status selection may bypass the clarity of a dedicated audited finalization command.
9. **No saved-draft history — Missing.** Only the latest snapshot remains.
10. **No cleanup/retention policy — Missing.** Timestamped local generated files have no formal lifecycle.

### Lower priority / maintenance concerns

1. Some legacy audit documents are stale relative to the current six-type generator and should not be treated as current architecture.
2. `tables_json` and similar duplicated payload shapes create dead or ambiguous fields around the canonical `data_json` snapshot.
3. Hardcoded contact/legal/signer defaults are maintained in more than one path and can disagree.
4. No automated test was found that opens each produced DOCX and verifies unresolved placeholders, relationship safety, or expected rendered XML.
5. Current browser E2E coverage proves draft save/reload for quotation and all six stage forms, but not DOCX template fidelity or template administration.

## 12. Security assessment for imported DOCX

Accepting Word files introduces risks beyond ordinary file upload:

- ZIP path traversal and decompression bombs
- misleading extensions/MIME types
- macro-enabled files (`.docm`)
- embedded OLE/package objects
- external relationships and remote image/data links
- malformed XML and oversized XML parts
- unsupported fields/content controls
- placeholder injection or arbitrary expression evaluation
- cross-tenant/global template replacement by the wrong role
- sensitive sample-ticket data retained in preview/output storage

**Current status: Missing.** The repository has no template-upload threat controls because upload is not implemented.

## 13. Safest integration approach

### 13.1 Ownership and permission boundary

Treat “client uploads a template” as an authorized **AFN business administrator** action, not an end-customer portal action. A template is global operational configuration and can affect documents for many clients.

Add a narrow capability such as `documents.templates.manage`. Keep viewing/downloading, editing job documents, and publishing global templates separate.

### 13.2 Data model

Introduce a versioned model rather than a mutable filename, for example:

`DocumentTemplate`

- `document_type`
- display name and description
- current active version reference
- enabled/retired state

`DocumentTemplateVersion`

- template foreign key and monotonically increasing version
- private `FileField` using Django's configured durable storage
- original filename, MIME, size, SHA-256 checksum
- uploaded by/at, validation status/report, notes
- extracted placeholder manifest
- draft/validated/active/retired status
- activated by/at

Use an atomic activation transaction and a database constraint ensuring at most one active version per document type. Never overwrite the active file. Rollback means activating a prior validated version.

Extend `GeneratedDocument` or add a rendered-output model with:

- exact template-version foreign key
- exact immutable source snapshot
- generated file in private durable storage
- output checksum, size, generated by/at
- generation status/error summary

### 13.3 Placeholder contract

Create a server-owned catalog per document type. Each placeholder should declare:

- stable key
- label and description
- value type and formatting
- source record/field
- scalar versus repeating scope
- required/optional status
- privacy classification
- sample value

Do not execute arbitrary expressions from templates. Reject unknown placeholders and malformed/nested loop syntax. Normalize or deliberately reconstruct placeholders split across Word runs. If reliable run repair is not achievable, use a constrained authoring convention such as Word content controls/bookmarks with stable tags.

### 13.4 Upload and validation pipeline

1. Upload as an inactive version.
2. Verify extension, MIME, ZIP signature, maximum compressed/uncompressed size, file count, and safe archive paths.
3. Reject macros, OLE/embedded packages, executable content, and unsafe external relationships.
4. Parse all supported document/header/footer parts.
5. Extract and validate placeholders/loops against the catalog.
6. Show missing required fields, unknown keys, unsupported parts, and warnings.
7. Test-render with synthetic data and optionally a permission-scoped selected ticket snapshot.
8. Open the rendered DOCX structurally and verify that no template tokens remain unexpectedly.
9. Convert the rendered result in an isolated office-conversion service to PDF/images for fidelity preview.
10. Require explicit activation confirmation; preserve the previous active version for rollback.

Virus/malware scanning should be added before activation when an available scanning service exists. Conversion must run outside the main web process with strict CPU, memory, time, and network limits.

### 13.5 Preview strategy

Do not label the current React paper as the uploaded-template preview. In the first safe release:

- keep the existing browser editor as the data-entry preview;
- add a separate “Rendered template preview” generated from the actual uploaded DOCX;
- label the difference clearly;
- use PDF/image rendering for visual fidelity and retain DOCX download for final use.

A later redesign may drive both HTML and DOCX from one field schema, but that is a larger project and should not block safe versioned uploads.

### 13.6 Rollout sequence

1. Define/freeze the placeholder catalog and add renderer regression fixtures for all six current templates.
2. Add template/version and rendered-output models plus private durable storage.
3. Add upload/validation APIs with no activation ability initially.
4. Add administrator UI for inactive upload, diagnostics, and test render.
5. Add atomic activate/rollback with audit events and the dedicated capability.
6. Link every generated output to the exact template version and source snapshot.
7. Add retention, deletion protection, monitoring, and backup/restore coverage.
8. Only then consider richer mapping tools or additional document types such as completion certificates and estimate proposals.

## 14. Test requirements before release

At minimum, add:

- model tests for one-active-version constraints and rollback
- permission tests for view/upload/validate/activate/rollback boundaries
- malicious ZIP/path traversal/decompression-limit tests
- macro, OLE, and external-relationship rejection tests
- placeholder extraction tests, including split Word runs
- unknown/missing/duplicate/malformed loop tests
- render tests for all six templates and all supported XML parts
- unresolved-placeholder and XML-integrity checks on produced DOCX files
- durable-storage tests independent of local `MEDIA_ROOT`
- concurrency tests for simultaneous activation and generation
- provenance tests tying output to template version and snapshot
- browser tests for upload diagnostics, preview, activation, and rollback
- visual comparison checks on converted preview pages

## 15. Feature classification matrix

| Feature | Classification |
|---|---|
| Six-type administrator document workspace | **Fully Implemented** |
| Ticket search, prefill, edit, save, browser print | **Fully Implemented** |
| Canonical TDS, quotation, commissioning, turnover records | **Fully Implemented** |
| Canonical contract and FSR records | **Fully Implemented** at API/model level; **Partially Implemented** in consolidated lifecycle/history |
| Immutable reviewed/accepted/signed/finalized states | **Fully Implemented** for defined serializer states |
| Printable JSON snapshots | **Fully Implemented** as latest state only |
| Snapshot version history | **Missing** |
| Six backend DOCX render targets | **Fully Implemented** for controlled templates |
| Arbitrary imported DOCX support | **Potentially Broken** |
| DOCX download directly from Documents workspace | **Missing** |
| WYSIWYG DOCX preview | **Missing** |
| Template upload/replace | **Missing** |
| Placeholder detection and validation UI | **Missing** |
| Field mapping UI | **Missing** |
| Template versions, activation, rollback | **Missing** |
| Durable generated-file archive and provenance | **Missing / Potentially Broken** |
| Completion certificate | **Missing** |
| Solar estimate document export | **Missing** |
| Client quotation decision and turnover confirmation | **Fully Implemented** |
| Completed-job document metadata/download integration | **Fully Implemented** for current paths |
| Template-specific audit/notifications | **Missing** |

## 16. Files that would require change for template management

No changes were made during this audit. A future implementation would likely touch:

### Backend

- `backend/services/models/documents.py` — template/version/output provenance models
- `backend/services/migrations/` — new schema migration
- `backend/services/serializers/` — metadata, upload validation, activation/rollback serializers
- `backend/services/views/tickets.py` and/or a new template view module — render integration and template APIs
- `backend/services/urls.py` — template/version routes
- `backend/services/document_generation.py` — version-aware storage-backed resolution, safer parser, diagnostics
- `backend/services/permissions.py` — dedicated template-management permission class
- `backend/users/rbac.py` — dedicated capability and role defaults
- `backend/afn_service_management/settings*.py` — storage/limits/scanner/converter contracts if required
- focused service/user/security tests

### Frontend

- `frontend/src/pages/admin/AdminDocuments.jsx` — entry point and actual rendered-template preview/download
- preferably new focused template-management components instead of adding more logic to the monolith
- `frontend/src/api/services.js` — versions/upload/validate/preview/activate/rollback calls
- capability constants/navigation where a dedicated permission is exposed
- E2E coverage for the complete safe publishing flow

### Operational documentation

- deployment storage and conversion/scanning requirements
- placeholder-authoring guide
- template recovery/rollback runbook
- retention and privacy contract
- `docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md`

## Final assessment

AFN's document **data workflows** are considerably more mature than its document **template infrastructure**. The current six types already have enough canonical data and snapshot support to make versioned template rendering feasible. The major risk is treating a raw uploaded DOCX as a drop-in replacement for the hardcoded browser preview or the tightly controlled XML templates. It is not.

The safest path preserves the current workflows and business records, introduces an isolated versioned template layer, validates every upload before activation, renders previews from the actual template, and records exact template/output provenance. That delivers administrator-controlled replacement without sacrificing the existing quotation, dispatch, inventory, technician, client-decision, and completed-job contracts.
