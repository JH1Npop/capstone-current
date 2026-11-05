# Dynamic Document Management — Phase F Readiness Gate

**Evaluated locally:** 2026-11-03  
**Phase F cleanup status:** Guarded; compatibility removal not yet executed  
**Schema change:** None

## Outcome

The local acceptance gate for Phases A–E passes. This is sufficient to continue evaluating Phase F, but it is not sufficient to remove the compatibility renderer or editable JSX document layouts.

The master implementation contract permits Phase F removal only after migration acceptance and rollback readiness. Local schema and isolated workflow acceptance pass. The six protected repository baselines are now registered as validated inactive v1 versions in local development through configured Cloudinary authenticated raw-file storage, and all six were read back and test-rendered successfully. Their former public raw URLs return 404. They are deliberately not active: visual approval, real replacement-version rollback, archived-output/attachment verification, PostgreSQL staging execution, and stakeholder acceptance remain incomplete. Removing the fallback now would still make any definition without an approved active version fail.

## Acceptance evidence

- The combined document and protected-workflow backend gate passed **48/48**.
- All six core definitions uploaded, activated, generated, and archived through dynamic templates in isolated tests.
- Activation and rollback preserve immutable versions and switch publication state correctly.
- Legacy generation remains available and archives provenance when no active version exists.
- Custom registration, typed fields, generation, attachments, capability isolation, and private downloads pass.
- Quotation acceptance/revision, deposit enforcement, dispatch restrictions, Sales Records integration, contract persistence, commissioning, turnover, client confirmation, completed history, and document ownership protections pass.
- A new representative-layout regression proves body, table, header, and footer placeholders render while `styles.xml` and an embedded logo remain byte-for-byte unchanged.
- Admin Documents browser journeys passed **2/2** in 2.3 minutes against the isolated E2E database. They cover custom registration/field setup, quotation draft save/reload, and all core editor stages saving and reloading canonical records or printable drafts.
- The production frontend build passed with **2,547 modules**.
- Django system check, migration drift, and migration plan checks pass.
- The dry-run-first `import_legacy_document_templates` command validates all six repository sources, requires a named administrator for `--apply`, is checksum-idempotent, and never activates a version.
- Local development now has six valid draft baseline versions uploaded by `iman`, zero active versions, zero document instances, zero archived outputs, and zero attachments. One unrelated custom definition already exists locally, so the total definition count is seven.
- Configured Cloudinary raw-file upload succeeded for all six baselines. A first read attempt encountered a transient TLS connection reset; a one-file retry matched the stored byte count, and the complete six-file retry rendered valid DOCX ZIPs with zero unresolved tokens. No output/archive record was created by this in-memory check.
- A dry-run-first authenticated-storage migration classified and moved all six baseline objects without changing database references. Two transient provider/verification interruptions stopped safely and idempotent reruns completed the work. Final private reads matched every stored byte count, rendered all six DOCX files successfully, and every former public URL returned 404.
- The placeholder catalog now publishes key, label, description, canonical/custom source, value type, formatting rule, document applicability, required state, and scalar/repeating status. The template manager exposes this metadata for both core and custom definitions.
- The focused Admin Documents browser journey passes 1/1 with the core catalog/source visible and custom-field changes refreshing the catalog without reopening the manager.
- Marker-only Word table rows or paragraphs now support repeating sections. Focused rendering coverage includes two expanded rows, Unicode, escaped XML characters, a 5,000-character value, missing optional data, and zero unresolved tokens.
- Publication now locks the shared design row before switching versions. A real competing-activation regression is present in the PostgreSQL staging suite and correctly skips on local SQLite.

Expected development notification WebSocket `ECONNABORTED` proxy teardown messages occurred during browser tests and did not fail either journey.

## Dependency review

No currently removable presentation path was found:

- `AdminDocuments.jsx` preview components remain the editable canonical-form interface and browser-print compatibility view.
- `adminDocumentsSupport.js` and `adminDocumentsBuilders.js` are imported by the active Admin Documents workflow.
- Technician inspection/checklist pages and shared quotation/turnover modals still consume the focused document form components.
- `document_generation.py` remains imported by the dynamic adapter for canonical context mapping and the required legacy fallback.
- `dynamic_document_generation.py` remains the active template/version/archive adapter.

Deleting these paths now would remove active editing, technician, print, mapping, or fallback behavior rather than dead presentation duplicates.

## Gates still required before compatibility removal

1. Replace or explicitly approve the six imported repository baselines as the company-approved Standard designs.
2. Download and visually inspect each actual Word test render; structural rendering alone is not visual approval.
3. Activate each approved version locally, run the six workflows, upload a validated replacement version, and prove rollback using those real approved files.
4. Verify configured-storage generation, archived-output and attachment download authorization, and retention behavior in a deployment-shaped environment. Template-object public delivery is now closed; provider/network retry behavior still requires release monitoring.
5. Decide and document retention and malware-scanning policy for uploaded supporting files.
6. Migrate staging only with explicit authorization and a verified backup, run the PostgreSQL competing-activation regression, then repeat non-destructive acceptance/UAT.
7. Record stakeholder acceptance and an operational rollback procedure.
8. Only then identify presentation-only duplicates that have no remaining imports or runtime responsibility.

## Phase F decision

Keep the legacy fallback, JSX editor/print views, canonical builders, and mapping logic. No source path was removed merely because the isolated acceptance suite passed. This preserves rollback readiness and follows the explicit controlled-migration contract.

