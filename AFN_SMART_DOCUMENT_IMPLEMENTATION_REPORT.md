# AFN Smart Document Template System

> **Note added 2026-11-06:** this is the 2026-11-04 checkpoint. The later client-friendly work (plain `[Field Name]` fields, checklist, one-click **Use this design**, blank/PDF suggestions, built-in design download, document-type delete) is in `docs/quality/AFN_SMART_DOCUMENT_IMPLEMENTATION_REPORT.md` and the staff guide `docs/quality/DOCUMENT_TEMPLATE_STAFF_GUIDE.md`. Since this checkpoint, `backend/document_templates/field_service_report.docx` gained a `Service Type: {{ service_type }}` line, so its Word visual check below no longer covers the current file.

## Phase 0–7 implementation checkpoint

**Date:** 2026-11-04 Asia/Singapore  
**Status:** Phases 0–6 and the non-destructive Phase 7 cleanup are complete. Local Microsoft Word pagination/visual UAT passed for all six protected repository baselines, and a configured Cloudinary probe passed authenticated raw upload, byte-exact private read-back, signed-HTTPS access, and deletion. Stakeholder approval of the organization's final replacement designs is still a release decision, so legacy generation, the six protected workflow editors, and historical versions remain intentionally retained.

## What was implemented

Admin Documents now exposes **Replace design** as the normal template-replacement entry point. Its six-step wizard guides an authorized administrator through document/design selection, DOCX or PDF upload, validation review, configuration review, a real ticket-scoped test download, and deliberate activation. Earlier valid versions remain available as rollback choices. The existing **Template library** remains available for advanced design, custom-document, field, and history administration.

The wizard reuses the existing definitions, designs, immutable versions, validation, private source downloads, activation, rollback, permissions, and output-generation infrastructure. It does not create a second template registry or bypass backend authorization. Activation is unavailable until the exact candidate version has passed validation, is configured, and has been test-rendered during the current wizard session.

Configured PDF versions now use the same safe test-render checkpoint as DOCX. The server resolves approved/manual field values, renders a temporary PDF from the selected ticket, and returns it without creating an archived `DocumentOutput`. DOCX behavior is unchanged. The advanced template manager now offers format-correct test controls and rollback readiness for both configured DOCX and PDF versions.

Phase 3 adds a lightweight field suggestion layer with no paid API or server-side model. An extensible alias registry matches nearby PDF text such as “Customer” or “Total Amount” only against the selected document's approved AFN fields. Exact and similar matches show confidence and a plain-language explanation. The mapper never applies or persists a suggestion automatically: staff must choose **Yes, use this field**, may change the source afterward, and must save the field through the existing version-specific API. Weak unrelated text produces no suggestion.

The wizard also compares DOCX placeholders or confirmed PDF system mappings with a conservative required-component registry for each core document. Missing items are shown as a review warning, and staff must explicitly confirm that they reviewed the connections before proceeding. DOCX placeholders are labeled as exact approved connections rather than probabilistic guesses.

Phase 4 improves the existing mapper without changing its fixed-layout contract. PDF pages now have 75%–175% bounded zoom, Fit Page, a field selector for the current page, live field movement/size feedback, fine directional controls, and narrow/wide/short/tall adjustments. Pure placement helpers clamp and normalize coordinates so fields cannot leave the page or accumulate floating-point noise before the existing serializer validates them.

DOCX configuration now reports which Word XML areas were checked (body, headers, and footers where present), identifies detected repeating sections, and gives a plain-language authoring boundary. The uploaded Word file remains the authoritative visual source and the generated test DOCX remains the accurate acceptance path. No browser-side HTML conversion or fake Word pagination was introduced.

Phase 5 unifies the filling entry point without replacing the six protected editors. **Fill template** now opens the selected document definition and active design. A core definition shows its schema-backed field/repeating-section summary, clearly separates **Edit document data** from **Final generated layout**, and routes staff to its existing interactive editor. A custom definition continues to use the dynamic field form, instance draft, preview, output history, and attachment workflow.

Every core editor now exposes **Generate active design** beside its existing business actions. It calls the existing ticket document-generation endpoint, which selects the published active default design or the safe legacy fallback and downloads the result from saved business data. It does not silently invoke quotation sending, contract signing, checklist finalization, turnover, deposit, or other workflow transitions. Staff are told to save editor changes before generation.

Phase 6 closes the incomplete-template publication gap found by the acceptance suite. Core activation now requires document-specific scalar connections for DOCX and PDF, plus balanced required repeating regions for DOCX. The backend enforces the rule even if a caller bypasses the wizard. Fixed PDFs are not falsely required to provide expanding table mappings; visually authored fixed tables remain part of the generated-file review. Previously published historical versions remain eligible for rollback so the new policy does not strand an established design.

Generation failure coverage now proves that a failed attempt creates a failed provenance row without a file, leaves the active version unchanged, and allows a clean retry. The full protected suite covers all six core generators, quotation acceptance/deposit/dispatch controls, turnover effects, permissions, history/download access, legacy fallback, replacement, rollback, long text, repeating rows, and custom documents.

Phase 7 begins with non-destructive consolidation. `DocumentTemplateVersionSerializer` now returns `activation_missing_components` from the backend publication policy. The wizard and advanced Template Library no longer carry a second activation registry; both disable publication and name the same missing AFN connections before an avoidable 409 response. Previously activated historical versions remain rollback-compatible. Version-list queries prefetch mapped fields so this status does not create a per-version database query. The shared action/status panel was also extracted from `AdminDocuments.jsx` into `DocumentActionCard.jsx`; workflow decisions and callbacks remain owned by the page.

The existing Field Service Report editor now has a reusable, versioned document-data schema underneath its current paper layout.

The schema defines:

- document identity and schema version;
- data ownership between the technician-authored canonical `FieldServiceReport` and the presentation-only `GeneratedDocument.data_json` draft;
- client, site, technician, service, ticket, date, capacity, and reference fields;
- the repeating equipment-readings collection;
- all eight existing table columns, labels, types, source hints, and widths;
- minimum/default row behavior; and
- existing save, print, and generation action references.

The existing editor remains visible and unchanged in purpose. Its equipment table headers, cells, and accessible labels are now rendered from the schema. Its state updates, row add/remove operations, draft loading, and draft serialization use the reusable schema adapter.

New saves include backward-compatible metadata:

```json
{
  "_documentSchema": {
    "code": "field_service_report",
    "version": 1
  }
}
```

Older unversioned drafts still load. Unknown presentation fields are retained so the adapter does not discard earlier or future printable values.

The second incremental schema now covers the Solar Commissioning Checklist without changing its Django model or API. It defines the canonical scalar fields, draft/completed/finalized states, two six-value reading groups, fixed checklist table, actions, and all 54 existing commissioning items. The admin paper retains its visual layout while its checklist headers, choices, state updates, hydration, and API serialization use the schema.

The technician form now shares the same 54-item definition and canonical adapter. Its older `items`, `check_type`, `solar_irradiance`, `weather_condition`, and `remarks` shape is accepted on load and projected safely to `checklist_items_json`, `check_status`, `irradiance`, and `readings_json`. Saves send only fields supported by `SolarCommissioningChecklist`; weather and general remarks remain inside the existing structured readings JSON. Finalized records are disabled in the technician UI and remain server-immutable.

The remaining four core editors now have the same bounded schema layer:

- **Technical Data Sheet** defines its scalar fields, seven-row load schedule, fixed solar-purpose checklist, draft/submitted/reviewed states, legacy hydration, printable version stamp, and canonical `TechnicalDataSheet` projection. Reviewed-record authority is unchanged.
- **Installation Contract** defines its legal/presentation fields, canonical scope/date/payment projection, currency normalization, draft/finalized/signed states, and versioned printable draft. Signed-record immutability remains a backend rule.
- **Quotation / Proposal** defines all presentation fields plus brand, price, BOM, and warranty repeating tables. It projects only the official total, payment terms, BOM, client, ticket, and Sent state to `QuotationRecord`; acceptance, deposit calculation, revision, and dispatch protection stay server-controlled.
- **Turnover Acceptance** defines the component, performance, commissioning, and document tables plus draft/finalized/accepted states. It projects only turnover date, client confirmation, warranty start, ticket, and existing ID to `TurnoverAcceptance`; finalization still owns ticket completion, warranty creation, and notifications.

All five printable-draft documents now save `_documentSchema` metadata. Solar Commissioning continues to serialize directly to its explicit canonical model fields and therefore does not store presentation metadata in that model.

## Existing code reused

- The hardcoded Field Service Report paper in `AdminDocuments.jsx` remains the interactive compatibility editor.
- Existing `GeneratedDocument.data_json` remains the printable-draft store.
- Canonical `FieldServiceReport` remains authoritative for technician readings, client acknowledgment, and locking.
- Existing ticket prefill and installed-equipment adapters remain in use.
- Existing legacy and dynamic DOCX/PDF generation paths are unchanged.
- Existing document-template definitions, versions, output history, private storage, permissions, and APIs are unchanged.
- The new guided workflow calls the existing upload, download, PDF-field, test-render, activate, and rollback APIs.
- Existing `SolarCommissioningChecklist`, serializer, viewset, completion action, generation context, and one-to-one ticket relationship remain authoritative.

No parallel model, endpoint, template registry, storage layer, or business workflow was introduced.

## Files changed for this checkpoint

- `frontend/src/documents/fieldServiceReportSchema.js` — new FSR schema and reusable state/draft adapter.
- `frontend/src/pages/admin/adminDocumentsSupport.js` — old FSR factories now delegate to the schema adapter.
- `frontend/src/pages/admin/adminDocumentsBuilders.js` — saved FSR drafts hydrate through the adapter.
- `frontend/src/pages/admin/AdminDocuments.jsx` — FSR repeating cells and state operations use the schema.
- `frontend/tests/fieldServiceReportSchema.test.js` — schema, backward compatibility, row operations, and versioning tests.
- `frontend/src/documents/solarCommissioningItems.js` — single preserved 54-item commissioning catalog.
- `frontend/src/documents/solarCommissioningSchema.js` — typed canonical schema, legacy adapters, state helpers, and API serializer.
- `frontend/src/components/documents/SolarCommissioningChecklistForm.jsx` — technician form now uses the canonical schema/API shape and finalized lock.
- `frontend/tests/solarCommissioningSchema.test.js` — schema, 54-item, legacy mapping, nested reading, and API-whitelist coverage.
- `frontend/src/documents/documentSchemaHelpers.js` — shared immutable field, row, collection, and version-stamp helpers.
- `frontend/src/documents/technicalDataSheetSchema.js` — TDS ownership, fields, collections, compatibility adapter, and canonical projection.
- `frontend/src/documents/installationContractSchema.js` — contract ownership, fields, money normalization, compatibility adapter, and canonical projection.
- `frontend/src/documents/quotationSchema.js` — quotation ownership, four collections, compatibility adapter, and protected commercial projection.
- `frontend/src/documents/turnoverAcceptanceSchema.js` — turnover ownership, four collections, compatibility adapter, and finalization-input projection.
- `frontend/tests/remainingDocumentSchemas.test.js` — all-four schema, compatibility, row, versioning, and canonical-projection coverage.
- `frontend/src/documents/templateReplacementWizard.js` — replacement-step and readiness policy helpers.
- `frontend/src/components/admin/DocumentReplacementWizard.jsx` — six-step guided replacement, test, activation, and rollback UI.
- `frontend/src/components/admin/DocumentTemplateManager.jsx` — format-aware PDF/DOCX test and rollback controls in the retained advanced manager.
- `frontend/src/api/services.js` — format-aware test-render download naming and MIME handling.
- `frontend/tests/templateReplacementWizard.test.js` — wizard-step, validation, readiness, and activation-gate coverage.
- `frontend/src/documents/documentFieldSuggestions.js` — extensible aliases, confidence scoring, nearby-label selection, and required-component detection.
- `frontend/tests/documentFieldSuggestions.test.js` — exact/alias, weak-match, proximity, and missing-component coverage.
- `frontend/src/components/admin/PdfTemplateFieldEditor.jsx` — local PDF text extraction, explainable suggestions, explicit acceptance, and missing-content review.
- `frontend/src/documents/pdfFieldPlacement.js` — bounded zoom plus normalized page-safe movement and resizing.
- `frontend/tests/pdfFieldPlacement.test.js` — zoom, boundary movement, minimum size, and overflow coverage.
- `frontend/src/components/admin/DocumentReplacementWizard.jsx` — validated Word-part/repeating-section summary and honest DOCX configuration guidance.
- `frontend/src/documents/coreDocumentWorkspace.js` — one registry over the six existing schemas for core/custom routing and editor summaries.
- `frontend/tests/coreDocumentWorkspace.test.js` — all-six routing, custom separation, repeating-section, and protected-action coverage.
- `frontend/src/components/admin/CustomDocumentWorkspace.jsx` — unified filling entry point; core documents route to protected editors while custom documents retain dynamic filling.
- `frontend/src/pages/admin/AdminDocuments.jsx` — active-definition routing and explicit active-design generation from saved business data.
- `backend/services/document_templates.py` — mandatory core activation registry, DOCX loop manifest, and format-aware missing-component checks.
- `backend/services/views/document_templates.py` — transactional server-side activation block with historical rollback compatibility.
- `backend/services/serializers/document_templates.py` — exposes server-calculated activation blockers on every version response.
- `frontend/src/documents/templateReplacementWizard.js` — shared response-driven publication and historical rollback helpers.
- `frontend/src/components/admin/DocumentTemplateManager.jsx` — advanced history now explains and disables blocked activation using the server result.
- `frontend/src/components/admin/DocumentActionCard.jsx` — extracted action/status presentation boundary for the retained core editors.
- `frontend/src/documents/documentFieldSuggestions.js` — deterministic suggestions and broad review warnings without duplicating publication policy.
- `backend/services/tests/test_document_template_infrastructure.py` — incomplete-template/current-active preservation regression.
- `backend/services/tests/test_dynamic_document_generation.py` — all-six required-template fixtures and failure/retry recovery regression.
- `backend/services/dynamic_document_generation.py` — temporary configured-PDF test rendering through the existing field resolver/renderer.
- `backend/services/views/document_templates.py` — format-aware DOCX/PDF test-render response.
- `backend/services/tests/test_dynamic_document_generation.py` — configured-PDF test-render and no-archive regression.
- `backend/services/tests/test_document_generation_baseline.py` — repeating-row projection and canonical acknowledgment-lock regression.
- `e2e/03-admin-workspace.spec.js` — real FSR add-row, save, schema-version, reload, and row-restoration coverage.
- `docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md` — living architecture, validation, risk, manifest, and change record.
- `AFN_SMART_DOCUMENT_IMPLEMENTATION_REPORT.md` — this checkpoint report.

The worktree already contained extensive user and prior-agent changes in several of these files. They were preserved and not reset, cleaned, or rewritten.

## Migrations

None.

Phase 1 adds frontend schema contracts and backward-compatible adapters only. It does not change Django models or database tables. Commissioning does not persist schema metadata because its canonical model has an explicit field set; schema version 1 is a frontend compatibility contract.

## Validation actually executed

### Pre-change baseline

- Focused legacy/dynamic/template backend suite: **22/22 passed**.
- Vite 8.3.5 production build: **passed, 2,550 modules**.
- Five-run legacy FSR render using read-only ticket 630 and temporary output:
  - minimum: **13.47 ms**
  - median: **14.06 ms**
  - maximum: **16.69 ms**
  - output: **91,145 bytes**

The performance probe did not create a document record or retain an output file.

### Post-change validation

- `node --test tests/fieldServiceReportSchema.test.js`: **3/3 passed**.
- Focused FSR backend baseline: **3/3 passed**.
- Combined legacy/dynamic/template backend suite: **23/23 passed**.
- Focused Chromium Documents journey `3.9b`: **1/1 passed** on isolated E2E SQLite.
- Vite 8.3.5 production build: **passed, 2,551 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.

### Solar Commissioning incremental checkpoint

- `node --test tests/fieldServiceReportSchema.test.js tests/solarCommissioningSchema.test.js`: **6/6 passed**.
- Focused commissioning/legacy generation baseline: **4/4 passed**.
- Protected document/business workflow gate: **22/22 passed**.
- Focused Chromium Documents journey `3.9b`: **1/1 passed** on isolated E2E SQLite, including a 54-item canonical save, first-item status, and reload.
- Vite 8.3.5 production build: **passed, 2,553 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.
- Scoped `git diff --check`: **passed**.

### All-six Phase 1 completion checkpoint

- `node --test tests/fieldServiceReportSchema.test.js tests/solarCommissioningSchema.test.js tests/remainingDocumentSchemas.test.js`: **11/11 passed**.
- Protected document/business workflow suite: **59/59 passed** on Django's isolated test database.
- Chromium Admin Documents scenario `3.9`: **1/1 passed**, including the current mini-sidebar custom-type/design setup and quotation schema-version save/reload.
- Chromium Admin Documents scenario `3.9b`: **1/1 passed**, including TDS, contract, turnover, and FSR schema-version save/reload plus canonical Solar Commissioning save/reload.
- Vite 8.3.5 production build: **passed, 2,558 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.
- Scoped `git diff --check`: **passed**.

### Phase 2 guided replacement checkpoint

- `node --test tests/fieldServiceReportSchema.test.js tests/solarCommissioningSchema.test.js tests/remainingDocumentSchemas.test.js tests/templateReplacementWizard.test.js`: **15/15 passed**.
- Protected document/business workflow suite: **60/60 passed** on Django's isolated test database, including activation, rollback, PDF test rendering, quotation/deposit/dispatch protections, turnover, and job-history contracts.
- Focused dynamic-generation suite: **10/10 passed**, including configured PDF test rendering with no archived output.
- Chromium Admin Documents scenario `3.9c`: **1/1 passed** on isolated E2E SQLite, covering guided selection, DOCX upload/validation, actual ticket-backed test download, and activation.
- Vite 8.3.5 production build: **passed, 2,560 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.
- Scoped `git diff --check`: **passed** (line-ending warnings only).

The browser run emitted expected Vite WebSocket proxy-abort messages during managed server reload/teardown; the asserted HTTP workflow passed. No development, staging, or production database was migrated or mutated.

### Phase 3 deterministic suggestions checkpoint

- Combined schema/wizard/suggestion unit suite: **19/19 passed**.
- Protected document/business workflow suite: **60/60 passed** on Django's isolated test database.
- Chromium Admin Documents scenario `3.9c`: **1/1 passed**, including explicit field-review confirmation before test and activation.
- Vite 8.3.5 production build: **passed, 2,561 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.

Matching runs only in the lazy-loaded PDF editor using text already extracted by PDF.js. It adds no backend request, external AI call, background worker, or new dependency. The PDF editor chunk increased from roughly 403.2 KB to 405.9 KB uncompressed; the PDF.js worker remains roughly 1.05 MB.

### Phase 4 visual configuration checkpoint

- Combined schema/wizard/suggestion/placement unit suite: **22/22 passed** after coordinate normalization corrected the initial strict floating-point assertion.
- Chromium Admin Documents scenario `3.9c`: **1/1 passed**, including the new DOCX parts, repeating-section, and configuration-boundary summary.
- Vite 8.3.5 production build: **passed, 2,562 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.

The lazy PDF editor chunk is roughly 409.0 KB uncompressed, about 3.1 KB above Phase 3; its existing PDF.js worker remains roughly 1.05 MB. Zoom rerenders only the current page and performs no extra network request.

### Phase 5 unified filling checkpoint

- Combined schema/wizard/suggestion/placement/workspace Node suite: **25/25 passed**.
- Chromium Admin Documents scenario `3.9`: **1/1 passed** on isolated E2E SQLite, covering selected core-definition routing, the data/layout distinction, preserved Quotation editor state, a real active-design POST/download, and the existing draft save/reload journey.
- Vite 8.3.5 production build: **passed, 2,563 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.

The final E2E run generated its document only inside the ignored isolated E2E database/storage path. Expected Vite WebSocket proxy-abort messages occurred during managed reload/teardown; the asserted HTTP generation and download succeeded. No development, staging, or production database, template activation, or business record changed.

### Phase 6 automated acceptance checkpoint

- Combined schema/wizard/suggestion/placement/workspace Node suite: **26/26 passed**.
- Protected document/business workflow suite: **70/70 passed** on Django's isolated test database.
- Focused infrastructure/dynamic generation gate after mandatory activation: **22/22 passed**.
- Chromium Admin Documents scenarios `3.9`, `3.9b`, and `3.9c`: **3/3 passed across the final successful runs**, covering unified filling/generation, all-six save/reload, guided replacement/test/activation, repeating rows, and workflow records.
- Vite 8.3.5 production build: **passed, 2,563 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.
- Synthetic DOCX renderer probe with 100 repeating rows and 10,000 characters, five runs: **8.97 ms median, 15.47 ms maximum, 0.38 MiB traced peak, 1,024-byte compressed output**.

The first combined browser run passed `3.9` and `3.9b` but correctly found `3.9c` disabled because the repository Quotation baseline uses `attention` as its client-name connection. The activation registry was corrected to treat that approved canonical alias as satisfying the client requirement; the focused `3.9c` rerun then passed with a real upload, test render, activation response, and active-state confirmation. This supersedes the initial failed browser result without hiding it.

Automated checks verify DOCX package integrity, 5,000-character retention, repeating-row expansion, and all-six generation. A human must still open representative AFN files in the company's actual Word/PDF software and exercise private Cloudinary upload/download on the target hosting environment before production release. No local automation can honestly certify application-specific visual pagination or external storage delivery.

The browser runs used the ignored isolated E2E SQLite database. Expected Vite WebSocket proxy-abort messages appeared during managed reload/teardown; asserted HTTP workflows passed. No development, staging, or production database was migrated or mutated.

The first backend invocation used a backend-relative `venv` path and exited before running tests; the corrected `..\venv\Scripts\python.exe` command passed. Expected Vite WebSocket proxy-abort messages occurred during managed browser reload/teardown, while the tested HTTP workflow passed.

The expected Vite WebSocket proxy-abort messages appeared while the E2E runner reloaded and stopped its managed servers; the tested HTTP workflow completed successfully.

### Phase 7 safe cleanup checkpoint

- Focused template infrastructure/dynamic generation suite: **23/23 passed**.
- Combined frontend document contract suite: **26/26 passed** after correcting a test fixture that initially reused the active version ID for the historical rollback candidate; the initial run was **25/26** and is superseded.
- Complete protected document/business workflow suite: **70/70 passed** on isolated Django test data.
- Chromium Admin Documents `3.9c`: **1/1 passed**, covering real guided upload, test download, activation, and refreshed server blocker state.
- Chromium Admin Documents `3.9`: **1/1 passed**, covering the extracted action panel, real active-design generation/download, draft save, and reload.
- Vite 8.3.5 production build: **passed, 2,564 modules**.
- `manage.py check`: **passed**.
- `manage.py makemigrations --check --dry-run`: **passed, no changes detected**.

The browser runs used isolated E2E SQLite and their temporary records only. Expected Vite WebSocket proxy-abort messages occurred during managed reload/teardown; asserted HTTP behavior passed. No development, staging, or production database, template activation, storage object, migration, or dependency changed.

### Phase 7 release UAT completion

The six repository baseline DOCX templates were rendered with representative ticket/client values, long content, and 35-row repeating collections where applicable, then opened and exported by the installed desktop Microsoft Word engine. The generated files were inspected through Word-rendered page images and parsed PDF text:

| Protected document | Pages | Acceptance evidence |
| --- | ---: | --- |
| Field Service Report | 2 | Branded first page and signature content retained; the source-authored second page contains the technician signature area with otherwise intentional whitespace. |
| Turnover Acceptance | 6 | Repeating rows, warranty/signature content, and final confirmation retained on later pages. |
| Solar Commissioning Checklist | 6 | Repeating readings flowed across pages; row 35 remained in exported text. |
| Technical Data Sheet | 7 | Repeating load rows and final client confirmation/signature retained. |
| Installation Contract | 21 | A deliberately long scope flowed across pages and later legal/signature fields remained visible. |
| Quotation / Proposal | 14 | Repeating quotation rows flowed across pages; row 35 and the final prepared-by/title/company-signer section remained present. |

All exported pages were US Letter size, final pages contained expected document content, and no unresolved template token remained. This certifies the current repository baselines and renderer behavior on the local Word engine; it does not pre-approve a future arbitrary client-authored design.

The configured Django storage backend was then exercised without a database write. A uniquely named temporary DOCX was stored below the protected document root. Both AFN's adapter and Cloudinary resource metadata reported `authenticated` delivery and `raw` resource type. The private read returned 2,356 bytes with the same SHA-256 digest as the source, the generated access URL used HTTPS, and the temporary object was deleted successfully. An earlier attempt encountered a transient Cloudinary read timeout and produced no acceptance result; the final bounded retry above passed and supersedes it.

All local DOCX/PDF/image scratch artifacts were removed after inspection. The Cloudinary probes changed no template record, active design, document output, staging/production database, migration, dependency, commit, push, or deployment.

### Post-completion full implementation verification

The complete Documents acceptance boundary was rerun on 2026-11-04 after the Phase 7 sign-off:

- **75/75 backend tests passed** across the 62-test document/business lifecycle gate and 13-test storage, private-delivery, placeholder-catalog, and legacy-import gate.
- The backend tests create their own DOCX and PDF uploads in memory and cover validation, unsafe-file rejection, publication, atomic rollback, test rendering, all-six generation, output provenance, custom definitions/instances, attachments, permissions, protected workflow effects, and renderer failure/retry.
- **26/26 frontend document contracts passed** across all six schemas, replacement readiness, deterministic suggestions, PDF placement, and core/custom routing.
- Chromium scenarios **3.9, 3.9b, and 3.9c passed 3/3 in 2.6 minutes**. The isolated browser flow saved/reloaded all six document stages, generated a real DOCX, uploaded a fresh Quotation template version, validated it, downloaded a ticket-backed test DOCX, and activated the new version.
- The Vite 8.3.5 production build passed with **2,564 transformed modules**.
- `manage.py check` passed and `makemigrations --check --dry-run` reported no changes.

All mutable browser records and uploaded browser-test files were confined to the ignored E2E database/storage. Django unit tests used their disposable test database and temporary storage. Development, staging, production, configured Cloudinary, and active real designs were not changed by this rerun. Expected Vite notification WebSocket proxy-abort messages appeared during browser navigation/managed teardown and did not affect the asserted HTTP workflows.

### Seventh document created through the dynamic system

Local development now contains **Preventive Maintenance Report** as an active ticket-backed custom document. It was registered through the public Smart Documents APIs and generic custom-document records rather than a new model, migration, core binding, or hardcoded editor. Its AFN Standard DOCX combines canonical ticket/client/service/technician placeholders with ten typed maintenance fields, then uses the existing validation, test render, activation, Fill template, preview, generation, provenance, private archive, and authorized-download paths.

The sample generated for ticket 630 is a valid 38,609-byte US-Letter DOCX with six tables, expected maintenance content, zero unresolved placeholders, and an archived private-download SHA-256 matching its `DocumentOutput`. The authenticated definition list returns seven active document types and includes `preventive-maintenance-report`. The document is intentionally evidence-only: it does not complete tickets or modify maintenance schedules, warranty, inventory, quotation, payment, or dispatch state.

## Data ownership decision

For the Field Service Report:

- `FieldServiceReport` is authoritative for operational readings, technician submission, client acknowledgment, and immutability.
- `GeneratedDocument.data_json` is authoritative only for the editable office/print presentation.
- The schema adapter projects presentation data without updating the canonical report.
- Backend generation may use the printable rows while retaining canonical before/after readings.
- Acknowledged canonical reports remain locked even when a printable draft is editable.

This preserves the existing business boundary and avoids creating a second operational Field Service Report.

## Known limitations

- All six core documents now have reusable data schemas, but their full papers are still document-specific React editors rather than one generic schema renderer.
- Schema-driven state and repeating sections coexist with the retained paper layouts until later acceptance gates authorize a renderer change.
- Uploaded DOCX/PDF files still do not redesign the on-screen FSR editor.
- Suggestions currently use nearby individual PDF text runs; heavily fragmented, scanned, rotated, or image-only labels may require manual source selection.
- Confirmed mappings remain version-specific. Cross-version reuse is not attempted because coordinates and wording can change between designs.
- DOCX configuration remains placeholder-based; the wizard detects and explains the approved placeholders but does not visually map arbitrary Word coordinates.
- PDF configuration continues to use the existing manual visual mapper. PDF repeating tables cannot expand arbitrarily.
- PDF field placement is easier to control, but still overlays fixed coordinates; it does not reflow text or paginate added rows.
- DOCX still uses placeholders/repeating markers and test downloads.
- PDF retains fixed-position scalar overlays and cannot expand arbitrary tables.
- No accurate inline DOCX preview or Word-like browser pagination was added.
- The canonical/printable split remains intentional: presentation schemas cannot override workflow authority or protected financial/state transitions.
- The commissioning technician form previously used obsolete API field names; the adapter now preserves those inputs for compatibility, but there is still no separate UI action for the backend `complete` endpoint.

## Remaining phases

### Phase 1 — Complete

All six core document data schemas, compatibility adapters, state helpers, canonical projections, versioned printable drafts, and focused regression gates are in place. This completes schema extraction only; it does not create a generic renderer or guided replacement wizard.

### Phase 2 — Complete

Guided template replacement now uses the existing upload, validation, source download, PDF configuration, test-render, activation, rollback, and history APIs. The advanced manager remains available for non-routine administration.

### Phase 3 — Complete

Explainable alias-based PDF suggestions, confidence, explicit acceptance, required-component warnings, and existing version-specific mapping persistence are implemented. DOCX placeholders are exact validated connections rather than inferred mappings.

### Phase 4 — Complete

The PDF mapper now provides bounded zoom, field navigation, live precision movement, and resizing. DOCX feasibility is documented and reflected in the UI: exact layout editing and Word pagination are not safely available in the current browser stack, so source validation plus actual generated-DOCX testing remains the supported approach.

### Phase 5 — Complete

The unified filling entry classifies core and custom definitions. Core definitions route to their schema-backed protected editors and generate the published design from saved data; custom definitions keep their dynamic `DocumentInstance` form. Existing business actions remain in place and are not invoked by generation.

### Phase 6 — Complete

The all-six workflow, template, permissions, rollback, long-content, repeating-table, history, output, and failure-recovery suites pass. Microsoft Word pagination/visual review of the six current repository baselines and configured private-Cloudinary upload/read/delete UAT also pass.

### Phase 7 — Non-destructive cleanup complete

The duplicated frontend activation registry was removed in favor of server-calculated version blockers, the advanced and guided interfaces now share response-driven eligibility helpers, and the action/status presentation was extracted from `AdminDocuments.jsx`. The release UAT above removes the technical Word/private-storage gate. Legacy generation, protected workflow editors, and historical versions remain by design until AFN approves and activates its final replacement designs; deleting them is not a requirement of the plan and would remove rollback/business compatibility.

## Current AFN staff workflow

### Fill and save the Field Service Report

1. Open **Documents**.
2. Select a service ticket.
3. Open **Field Service Report**.
4. Edit the existing paper fields.
5. Use **Add row** for additional equipment readings.
6. Select **Save draft**.
7. Reopening the ticket restores the saved rows, including older drafts created before schema versioning.

### Fill and save the Solar Commissioning Checklist

1. Open **Documents** and select a service ticket, or open the solar job's commissioning tab as its assigned technician.
2. Open **PV Solar Site Commissioning Checklist**.
3. Complete the fixed commissioning checks and readings.
4. Select **Save checklist**.
5. Reopening the record restores all 54 items and readings. A finalized checklist remains read-only.

### Replace the generated design

1. Open **Documents**, select a representative service ticket, then choose **Replace design**.
2. Select one of the six core documents and the design to replace.
3. Drop a macro-free DOCX or PDF and review the validation result.
4. Review detected DOCX placeholders, or place/map fields on a PDF.
5. Generate and inspect the actual ticket-backed test file.
6. Activate only when the downloaded result is correct. Use **Advanced Template Library** for custom documents, additional designs, and detailed history.

### Fill and generate a document

1. Select a ticket, choose the document stage, then open **Fill template**.
2. For a protected core document, review the active design and choose **Open interactive editor**.
3. Edit and save through that document's existing actions.
4. Choose **Generate active design** to download the published DOCX/PDF using saved data.
5. For a registered custom document, complete its dynamic fields directly in **Fill template**, then save, preview, or generate there.

### Roll back today

1. Open **Replace design** and select the document/design.
2. Continue to **Activate**.
3. Under rollback choices, select an earlier valid version and confirm **Roll back**. The same action remains available in **Template library** version history.

Previously generated outputs remain attached to their original template versions.

## Checkpoint decision

The implementation work in Phases 0–7 is complete and regression-gated. The representative local Word/PDF and configured private-Cloudinary technical UAT now pass. Production release still requires AFN to upload, inspect, and deliberately approve its actual final replacement designs and to follow the normal backup/migration/deployment process. The retained document-specific editors, protected actions, history, and legacy fallback are intentional compatibility and recovery paths, not unfinished plan items.

