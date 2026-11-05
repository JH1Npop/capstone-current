# Dynamic Document Management — Phase B Backend Infrastructure

**Completed locally:** 2026-11-02  
**Migration:** `services.0065_document_template_infrastructure`  
**Applied to development/staging/production:** Local development only (2026-11-02); staging/production no  
**Legacy document renderer changed:** No

## Delivered

- `DocumentDefinition` registry with protected stable core codes.
- Multiple `DocumentTemplate` designs per definition and one-default constraint.
- Immutable `DocumentTemplateVersion` upload records with sequential versions,
  SHA-256, size, MIME, placeholder manifest, validation report, publication
  state, uploader/activator, timestamps, and notes.
- One-active-version database constraint per design.
- Data migration seeding the six core definitions and their inactive Standard
  designs. It intentionally does not copy files into configured storage during
  migration.
- Bounded DOCX archive validation covering extension/MIME, archive structure,
  path traversal, entry/part/expanded-size limits, encryption, macros, embedded
  OLE/packages, external relationships, unsupported expressions, approved
  placeholders, split Word runs, and balanced repeating-section markers.
- Narrow capabilities for upload, design management, publishing, and rollback.
- Transactional upload version numbering, activation, and rollback.
- Activity-log events for upload, activation, and rollback.
- Backend APIs and focused regression tests.

## API

| Method and route | Purpose |
|---|---|
| `GET /api/services/document-definitions/` | Active definitions and approved placeholder catalogs |
| `GET/POST /api/services/document-templates/` | List/create template designs |
| `GET/PATCH /api/services/document-templates/{id}/` | Inspect/configure a design |
| `GET/POST /api/services/document-template-versions/` | List/upload immutable versions |
| `GET /api/services/document-template-versions/{id}/` | Version diagnostics and metadata; no file URL is exposed |
| `POST /api/services/document-template-versions/{id}/activate/` | Atomically publish a validated version |
| `POST /api/services/document-template-versions/{id}/rollback/` | Atomically restore an earlier validated version |

Uploaded files use Django's configured default storage under opaque UUID paths.
The API does not expose public storage URLs. Authorized download and generation
endpoints belong to Phase C.

## Capabilities

- `documents.templates.upload`
- `documents.templates.manage`
- `documents.templates.publish`
- `documents.templates.rollback`

These are backend-enforced and remain distinct from ordinary client access.
Superadmins receive the registered capabilities through the existing RBAC map;
delegated administrators can be scoped through the existing capability editor.

## Publication rules

1. Upload creates a new immutable draft version.
2. Structurally unsafe files are rejected and no version is created.
3. Safe files with unknown/unsupported placeholders are retained with
   `validation_status=invalid` so diagnostics can be reviewed.
4. Invalid versions cannot activate.
5. Activation retires the previous active version in one transaction.
6. Rollback activates an earlier validated version without deleting newer
   history.

Templates still have no authority over quotation totals, deposit payments,
dispatch readiness, canonical status changes, or finalized records.

## Validation evidence

- Focused Phase B + legacy generation + deposit/dispatch gate: 12/12 passed.
- Django system check: passed.
- Migration drift check: no changes detected.
- The migration originally applied only to Django's disposable test database;
  after explicit approval it was applied to local development on 2026-11-02
  following a validated SQLite online backup. Staging and production remain untouched.

## Phase C update

Active-template generation, output provenance/archive, private API downloads,
and actual DOCX test rendering are now implemented locally; see
`DOCUMENT_MANAGEMENT_PHASE_C.md`. The React management/preview integration
remains deferred to Phase D.

## Originally deferred to Phase C/D

- Selecting active versions in the document generator
- Durable generated-output archive and provenance
- Authorized template/output downloads
- Actual template test render/preview
- Documents-page Manage Templates UI
- PDF conversion
- Custom definitions/fields/instances/attachments

The legacy renderer and hardcoded browser preview remain the production-safe
fallback until the dynamic generation path is independently verified.
