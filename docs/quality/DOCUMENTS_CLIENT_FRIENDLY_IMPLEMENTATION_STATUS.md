# AFN Client-Friendly Documents Implementation Status

Status: Implemented locally; local development migrations applied; browser UAT pending  
Date: 2026-11-03 (Asia/Singapore)

## 1. Current-state findings

AFN already had the important foundations: six protected core document definitions, reusable design/version records, activation and rollback, custom document definitions, immutable archived outputs, private storage, a legacy DOCX fallback, and canonical ticket/quotation/turnover workflows. This implementation reuses those records and rendering paths.

The missing user-facing path was ordinary PDF support and a simple separation between importing a source file, configuring fields, and filling a published template. The implementation adds that path without introducing a second template registry or changing the business authority of quotations, deposits, dispatch, completion, or turnover.

## 2. Architecture changes

### Data model

- `DocumentTemplateVersion.file_format` records `docx` or `pdf`.
- `DocumentTemplateVersion.readiness_status` reports Saved, Ready to fill, Ready with AFN data, or Needs attention independently from publication.
- `DocumentTemplateField` stores version-specific manual or system fields, type, default/options, required state, approved AFN source key, page, display order, and normalized PDF placement.
- Existing `DocumentDefinition`, `DocumentTemplate`, `DocumentTemplateVersion`, `DocumentInstance`, `DocumentOutput`, and `DocumentAttachment` remain the single registry, draft, archive, and attachment system.
- Administrators may delete an unreferenced design directly, even when it is enabled or currently marked default. Another design becomes default automatically when available. Active designs and designs used by instances or generated history remain protected.

### Import and validation

- DOCX and PDF sources can be dragged onto or selected in the Template library.
- Saving a valid source and configuring its fields are separate actions.
- Sources are preserved unchanged and can be downloaded.
- PDF validation checks signature, EOF, readability, page count, encryption, JavaScript, launch actions, embedded files, and rich media.
- DOCX retains the existing bounded ZIP/XML and placeholder validation.

### Field configuration and rendering

- A lazy-loaded PDF.js editor displays the real multi-page PDF and lets an administrator place, move, and resize fields.
- Manual and approved system fields are supported. Field types are text, multiline, date, number, currency, checkbox, dropdown, and text-based signature.
- PDF generation renders onto an overlay with ReportLab and merges it over the untouched source through pypdf.
- DOCX continues to use the existing placeholder renderer and Word-authored layout.
- Preview uses the same backend renderer as generation. PDF is shown inline; DOCX preview is downloaded because the browser cannot accurately render Word files.
- Generated files are archived through the existing `DocumentOutput` provenance and private-download path.

### API additions and changes

- `GET/POST /api/services/document-template-fields/`
- `GET/PATCH/DELETE /api/services/document-template-fields/{id}/`
- `GET /api/services/document-template-versions/{id}/download/`
- `POST /api/services/document-instances/{id}/preview/`
- Existing instance generation now selects DOCX or PDF from the active version.
- Existing ticket document generation uses an active core PDF design when configured. A PDF requiring manual data returns a validation response and must be completed through Fill template; it does not produce a server error.

Permissions continue to use the existing document-view, document-manage, template-upload, and template-publish capability boundaries. Field create/update/delete activity is audited.

## 3. Files changed for this revision

Backend:

- `backend/requirements.txt` — pypdf and ReportLab runtime dependencies.
- `backend/services/models/documents.py` — version format/readiness and template-field model.
- `backend/services/migrations/0068_document_template_format_and_readiness.py` — additive version metadata.
- `backend/services/migrations/0069_document_template_fields.py` — additive field definitions.
- `backend/services/document_templates.py` — DOCX/PDF validation and upload metadata.
- `backend/services/pdf_document_generation.py` — PDF value resolution, overlay, merge, and archive support.
- `backend/services/dynamic_document_generation.py` — format-aware preview/generation and core PDF replacement.
- `backend/services/serializers/document_templates.py` — field, draft, format, and source validation.
- `backend/services/views/document_templates.py` — source download, field CRUD, preview, generation, readiness, and audit actions.
- `backend/services/views/tickets.py` — format-aware download and safe validation response.
- `backend/services/urls.py` — field API registration.
- Document infrastructure, custom-document, and dynamic-generation tests — actual DOCX/PDF and workflow regressions.

Frontend:

- `frontend/package.json` and `frontend/package-lock.json` — PDF.js and audited Vite dependency updates.
- `frontend/src/api/services.js` — format-aware source, field, preview, and generation calls.
- `frontend/src/components/admin/DocumentTemplateManager.jsx` — drag/drop import, progress, readiness, source download, and field-setup entry.
- `frontend/src/components/admin/PdfTemplateFieldEditor.jsx` — real PDF placement editor.
- `frontend/src/components/admin/CustomDocumentWorkspace.jsx` — reusable Fill template flow, reset, preview, generation, archive, and attachments.
- `frontend/src/pages/admin/AdminDocuments.jsx` — Template library and Fill template entry points.

## 4. User workflow

### Administrator: import and publish

1. Open Admin Documents and select **Template library**.
2. Use the popup's mini sidebar to select the document type and an existing design, or select **Add new design**. **New document type** is separate and is only for documents that are not already listed.
3. The new-design form opens alone in the main panel. Drag a DOCX or PDF into it, give the design a name/description, and save it.
4. The template is saved immediately as a draft. Download Source remains available even if no fields are configured.
5. For PDF, select **Set up fields**, click the document to place a field, choose its type and whether an employee fills it or AFN supplies it, then save each field.
6. Activate the validated version when it is ready. Previous versions remain available for history and rollback.

### Employee: fill and generate

1. Select a ticket in Documents and choose **Fill template**.
2. Select the document and active design.
3. Enter manual values. AFN-mapped values are read-only and resolved from the selected ticket/context.
4. Save the draft, reset to template defaults if needed, and preview.
5. Generate DOCX or PDF. The completed file downloads and is also preserved in Generated files; the source template is unchanged.

## 5. Supported formats and limits

### Fully implemented

- Import, preserve, download, version, activate, and roll back valid DOCX and PDF sources.
- Word placeholders, split-run placeholders, headers, footers, tables, images/styles preservation, and supported repeating rows/paragraphs.
- PDF background preservation and multi-page coordinate overlays.
- Manual/system text, multiline, date, number, currency, checkbox, dropdown, and text-based signature fields.
- DOCX output from DOCX versions and PDF output from PDF versions.
- Accurate PDF preview and rendered DOCX preview download.
- Core design replacement without changing canonical business data; custom document types without hardcoded React pages.

### Partially implemented

- Existing AcroForm fields are detected only as source metadata; they are not automatically imported as AFN field definitions.
- DOCX manual fill depends on supported Word placeholders/custom field definitions; arbitrary visual click placement inside Word is not available.
- Signature fields render text. Drawn/image signatures and cryptographic signing are not implemented.
- The new workflow has automated API/render/build coverage but has not yet completed a real non-technical browser UAT session.

### Unsupported or deferred

- Scanned-image OCR, automatic field detection, automatic semantic mapping, complex PDF widgets/scripts, embedded files, encrypted PDFs, and rich media.
- Pixel-identical browser preview for DOCX and server-side DOCX-to-PDF conversion.
- Malware scanning remains an operational decision; structural/type validation is present.
- Legacy fallback removal is deliberately deferred until real AFN templates are visually accepted and rollback/UAT is complete.

## 6. Testing results

Executed successfully:

- Focused dynamic generation: `manage.py test services.tests.test_dynamic_document_generation --keepdb` — 9/9 passed.
- Combined Documents and protected-workflow gate — 58/58 passed across template infrastructure, dynamic/custom generation, placeholder catalog, legacy baseline, private storage, quotation/deposit/dispatch, quotation revision, turnover, and project handover.
- `manage.py check` — no issues.
- `manage.py makemigrations --check --dry-run` — no changes detected.
- `python -m pip check` — no broken requirements.
- `npm.cmd run build` — passed with Vite 8.3.5 and 2,550 transformed modules.
- `npm.cmd audit --package-lock-only --audit-level=low` — zero vulnerabilities.
- `git diff --check` — passed; only existing line-ending conversion warnings were printed.

The initial PowerShell `npm run build` invocation was blocked by the machine's script execution policy. Re-running the same build through `npm.cmd` passed. A focused test initially used `key` instead of the serializer's `field_key`; the test payload was corrected and the rerun passed. These superseded failures did not indicate application regressions.

## 7. Deployment requirements

- Local development: migrations `services.0068_document_template_format_and_readiness` and `services.0069_document_template_fields` were applied on 2026-11-03 after a transaction-consistent backup passed SQLite integrity and foreign-key checks. Staging and production remain untouched and require their own approved backup/migration procedure.
- Install backend requirements, including `pypdf==6.1.1` and `reportlab==4.4.4`.
- Install the locked frontend dependencies, including `pdfjs-dist` and Vite 8.3.5.
- Keep configured private document storage able to store and read raw DOCX/PDF files.
- No new environment variable or paid/external conversion service is required.
- Run staging upload/download/generation checks with real configured storage before production release.

## 8. Final acceptance checklist

| Scenario | Status | Evidence / remaining gate |
| --- | --- | --- |
| A — Import existing company document | Implemented | Valid DOCX/PDF saves as an unchanged versioned source; original download and structural render tests pass. Real company-file visual UAT remains. |
| B — Save first, configure later | Implemented | Readiness is separate from validation/publication; saved PDF activation waits for fields, but saving/downloading does not. |
| C — Manually fill | Implemented | Draft values, same-renderer preview, generation, archive, reset, and unchanged source are covered. |
| D — Automatically fill AFN data | Implemented | Approved source registry and actual PDF extraction prove mapped client data; canonical records remain unchanged. |
| E — Replace core design | Implemented | Active core PDF/DOCX versions replace presentation output; quotation/deposit/dispatch protected tests pass. |
| F — Add a custom document type | Implemented | Existing dynamic definition/template/instance path is reused; no document-specific React page is required. |
| G — Replace again and roll back | Implemented | Existing immutable version activation/rollback and exact output provenance remain in place and covered. |
| H — Non-technical usability | Partially accepted | UI workflow is implemented and production-build clean; a real user browser session with representative AFN DOCX/PDF files is still required before release acceptance. |

No legacy document layout, workflow, or fallback was deleted in this revision.
