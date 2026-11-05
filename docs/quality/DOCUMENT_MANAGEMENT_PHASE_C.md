# Dynamic Document Management — Phase C Generation and Archive

**Completed locally:** 2026-11-02  
**Migration:** `services.0066_document_output_archive`  
**Applied to development/staging/production:** Local development only (2026-11-02); staging/production no  
**Documents UI changed:** No

## Delivered

- Active validated template selection for all six core document codes.
- Optional explicit template-design selection while retaining the active
  default design when none is supplied.
- Legacy source-template fallback when no active dynamic version exists.
- A storage-backed renderer that preserves all untouched DOCX ZIP parts and
  supports approved scalar/loop syntax, headers/footers, and placeholders Word
  split across text runs.
- `DocumentOutput` archive records containing the exact template version,
  immutable source snapshot, output file, checksum, size, actor, timestamp,
  renderer source, and generation status/error.
- Configured-storage output files under opaque paths rather than temporary local
  path-only generation.
- Authorized output history and download endpoints with no public file URL.
- Version test-render endpoint producing the actual DOCX without creating a
  historical business output.
- Generation/download activity events.
- Canonical quotation-number mapping repair: generated quotations now use
  `QuotationRecord.quotation_number` rather than an unrelated ticket-ID fallback.

## Runtime behavior

`POST /api/services/service-tickets/{ticket}/generate-document/` keeps its
existing contract and now:

1. Builds data from the existing canonical context builders.
2. Selects the active validated version for the chosen/default design.
3. Uses the legacy source-controlled template only when no active version exists.
4. Renders DOCX without modifying canonical business records.
5. Stores the output and provenance through Django's configured storage.
6. Streams that exact archived file to the authorized caller.

An optional `template_id` chooses another enabled design only when that design
has an active validated version for the same core document code.

## API additions

| Method and route | Purpose |
|---|---|
| `POST /api/services/document-template-versions/{id}/test-render/` | Render an actual DOCX against an authorized ticket without archiving it |
| `GET /api/services/document-outputs/?ticket={id}` | List archived output metadata/provenance |
| `GET /api/services/document-outputs/{id}/download/` | Authorized download of the exact historical file |

## Compatibility and workflow protection

- Existing editable forms, canonical saves, statuses, finalization, quotation
  acceptance, deposits, dispatch gates, turnover, and completed history remain
  separate from template rendering.
- Templates receive approved display context only; they cannot write canonical
  values or trigger workflow transitions.
- Six-type active-template coverage and legacy fallback both pass.
- Accepted quotation values and the deposit gate remain unchanged by generation.
- Historical output remains bound to the exact template version even after a
  later activation or rollback.

## Validation evidence

- Phase C/B/baseline/deposit gate: 17/17 passed.
- Required workflow checkpoint covering quotation decisions/revisions,
  deposit/dispatch, turnover finalization, and completed history: 19/19 passed.
- Django check passed.
- Migration drift check reported no changes.
- Migrations `0065` and `0066` originally ran only in disposable test databases;
  after explicit approval, both were applied to local development on 2026-11-02
  following a validated SQLite online backup. Staging and production remain untouched.

## Deliberately deferred

- React Manage Templates UI and archive presentation (Phase D)
- Replacing the hardcoded browser paper preview (Phase D)
- PDF conversion/preview; unavailable hosting support must not block DOCX
- Custom document definitions/fields/attachments (Phase E)
- Legacy renderer/layout removal (Phase F, only after acceptance)

The current browser preview remains clearly the legacy editor preview until
Phase D connects the actual rendered-template experience.
