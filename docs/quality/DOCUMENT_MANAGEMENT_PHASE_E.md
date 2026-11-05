# Dynamic Document Management — Phase E Custom Documents

**Completed locally:** 2026-11-02  
**Migration:** `services.0067_dynamic_custom_documents`  
**Applied to development/staging/production:** Local development only (2026-11-02); staging/production no  
**Protected core workflows changed:** No

## Delivered

- Added administrator registration of inactive custom document definitions in the existing template manager.
- Added ticket-, client-, and project-backed source modes with a fixed allowlist of safe system placeholders.
- Added ordered manual field definitions for text, multiline text, number, date, boolean, and dropdown values.
- Added typed required/default/option/range/length validation and rejection of unknown or system-reserved field keys.
- Added definition-level capability restrictions, active state, display order, description, and stable generated codes.
- Reused the Phase B design/version lifecycle for custom templates: upload, diagnostics, default design, activation, retirement, and rollback.
- Added custom document instances tied to exactly one resolved business source, a selected template version, typed manual values, creator, and lifecycle status.
- Added DOCX generation from the same active validated version used by the instance, with immutable output provenance, source snapshot, checksum, actor, and private download.
- Added private supporting attachments with opaque storage paths, hashes, metadata, authorized download, 15 MB limits, and content-signature checks for PDF, DOCX, PNG, JPEG, WebP, and UTF-8 text.
- Added a responsive **Custom documents** workspace inside Admin Documents. It loads active definitions dynamically, renders registered fields, selects an active design, saves the instance, generates/downloads DOCX, lists archived outputs, and manages supporting attachments.
- Preserved the six core editors, canonical models, quotation/deposit/dispatch/turnover controls, and legacy fallback.

## API

| Method and route | Purpose |
| --- | --- |
| `GET/POST /api/services/document-definitions/` | List accessible definitions or register an inactive custom definition |
| `GET/PATCH /api/services/document-definitions/{id}/` | Inspect or configure a definition; protected core definitions are immutable |
| `GET/POST /api/services/document-field-definitions/` | List or register typed manual fields |
| `GET/PATCH /api/services/document-field-definitions/{id}/` | Update a custom field without deleting its history |
| `GET/POST /api/services/document-instances/` | List or create source-bound custom document instances |
| `GET/PATCH /api/services/document-instances/{id}/` | Update manual values or selected active version |
| `POST /api/services/document-instances/{id}/generate/` | Generate, archive, and download a DOCX |
| `GET/POST /api/services/document-attachments/` | List or upload private supporting files |
| `GET /api/services/document-attachments/{id}/download/` | Authorized attachment download |
| `GET /api/services/document-outputs/?instance={id}` | Instance output history |

The existing template, version, activation, rollback, test-render, output, and download routes also support custom definitions while enforcing definition access.

## Safety boundaries

- A registered definition starts inactive and cannot be enabled until it has an enabled default design with an active validated version.
- Custom templates can reference only registered safe source placeholders and active manual-field keys. They cannot traverse arbitrary model fields or invoke expressions.
- A custom document records information and generates a file; it cannot accept quotations, verify deposits, dispatch work, complete tickets, finalize turnover, or mutate other protected workflows.
- Custom generation has no legacy-template fallback. If its active validated template is unavailable, generation stops with a conflict instead of substituting a core layout.
- Files stay behind permission-checked endpoints; no storage URL is returned.
- PDF conversion remains optional and absent. The workspace describes and downloads DOCX and does not present the HTML editor as a Word/PDF preview.
- Definition, field, template, instance, output, and attachment deletion was intentionally not added. Historical provenance remains protected.

## Capabilities

- `documents.definitions.manage`
- `documents.attachments.manage`
- Existing `documents.view`, `documents.manage`, and template upload/manage/publish/rollback capabilities
- Optional `DocumentDefinition.access_capabilities` further restricts a custom definition to users holding at least one configured capability.

Backend checks remain authoritative even when a frontend action is hidden.

## Validation evidence

- `..\venv\Scripts\python.exe manage.py test services.tests.test_custom_documents services.tests.test_document_template_infrastructure services.tests.test_dynamic_document_generation --verbosity 1` — passed 16/16, including definition-level capability isolation across related instances and attachments.
- `..\venv\Scripts\python.exe manage.py check` — passed with no issues.
- `..\venv\Scripts\python.exe manage.py makemigrations --check --dry-run` — no changes detected.
- `npm.cmd run build` — passed with 2,547 transformed modules.
- Focused Admin Documents Chromium journey — passed 1/1 against the isolated E2E database and verified registration plus the existing quotation save/reload path.
- Migration `0067` originally ran only in disposable test/E2E databases. After
  explicit approval, it was applied to local development on 2026-11-02 following
  a validated SQLite online backup. Staging and production remain untouched.

## Remaining release work

- Run a deployment-shaped configured-storage test for custom template upload, generation, attachment upload, and private downloads.
- Add browser automation for the full custom upload/activate/instance/generate/attachment journey; backend coverage currently proves those state transitions.
- Decide retention and authorized deletion/archive policies before exposing deletion.
- Add an available malware scanner before treating arbitrary office/customer attachments as production-ready.
- Consider accurate PDF/image preview only when the hosting environment supports isolated conversion; it is not a blocker for DOCX generation.

