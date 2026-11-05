# Dynamic Document Management — Phase D Frontend Integration

**Completed locally:** 2026-11-02  
**Schema change in this phase:** None  
**Schema migration in this phase:** None; prerequisite Phase B/C schema is now applied to local development only

## Delivered

- Added a capability-gated **Manage templates** action to the existing Admin Documents workspace.
- Added a responsive, keyboard-dismissible template manager for the six core document definitions.
- Preserved the existing ticket search, editable forms, workflow actions, paper controls, print behavior, and legacy fallback.
- Added multiple design selection and design creation.
- Added safe design default switching and non-destructive retirement/re-enabling.
- Added DOCX version upload with backend validation results and change notes.
- Added version history, validation/publication badges, activation, and rollback controls.
- Added ticket-backed test rendering that downloads the actual rendered DOCX without creating an output-history record.
- Added generated-output history per selected ticket/document type with authorized private downloads and renderer provenance.
- Extended the existing generation client to accept an explicit template design ID when required by later workflows.
- Labeled the existing browser rendering as **Editor preview**. It is not presented as a visual reproduction of an uploaded Word file.

## Authorization

The manager trigger is visible only when the current administrator has at least one template capability. Individual controls remain separately gated:

- `documents.templates.upload`
- `documents.templates.manage`
- `documents.templates.publish`
- `documents.templates.rollback`

The backend remains authoritative for every operation.

## Preview contract

The editor preview remains the stable editable HTML representation used by the current document workflow. Uploaded layouts are checked through **Test DOCX**, which renders the selected version with the currently selected ticket and downloads the result.

PDF conversion is intentionally not a Phase D dependency. No screen claims the HTML editor is an exact DOCX preview, and a missing PDF conversion service cannot block upload, validation, activation, generation, archive history, or rollback.

## Compatibility and safety

- Uploading a version never activates it automatically.
- Invalid versions cannot be activated.
- If a document type has no enabled default design with an active version, generation keeps using the existing legacy renderer.
- Existing quotation, deposit, dispatch, completion, and turnover authority remains outside templates.
- Generated files remain private and are downloaded through authorized API endpoints.
- Design deletion was not introduced; retirement is reversible.
- Default switching clears the prior default atomically before saving the selected design.

## Validation evidence

- Frontend production build passed after the Phase D integration.
- Focused template infrastructure plus dynamic generation suite passed 11/11. This includes the new default-design switching regression.
- Focused Admin Documents Chromium journey passed 1/1 against the isolated E2E database. It verified the Editor preview label, capability-gated manager, populated core definition/design catalog, modal close behavior, and the existing quotation draft save/reload flow.
- The first focused backend command used a nonexistent `settings_test` module and exited before tests or database creation. It was superseded by the normal repository test command.
- An intermediate focused backend run exposed DRF treating the conditional one-default constraint as unconditional during PATCH. The serializer now performs explicit name validation and transactional default switching; the final 11/11 rerun passed.
- No development, staging, or production migration or persistent business-data write occurred.

## Deferred

- Accurate in-browser DOCX/PDF visual conversion.
- Custom document definitions and custom field-mapping UI (planned after the six core workflows are proven).
- Replacing or deleting the existing hardcoded editor layouts.
- Full browser automation of file upload, activation, rollback, and archived download; backend API coverage currently proves these state transitions and file protections.
