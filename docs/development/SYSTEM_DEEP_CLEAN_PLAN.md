**System Deep Clean Plan**

This project now has enough working functionality that cleanup should happen in controlled passes, not as one large rewrite.

**Goals**

- keep ticket, document, and autofill flows stable
- improve code structure and file structure
- reduce duplicate logic and legacy clutter
- keep database and migration state safe

**Current High-Value Targets**

1. `frontend/src/pages/admin/AdminDocuments.jsx`
- Largest frontend hotspot
- Should be split into:
  - config/constants
  - form factories
  - data mappers
  - preview components
  - page container logic

2. Migration history
- Squashed baselines now exist for `services`, `users`, and `notifications`
- Old migrations should remain for compatibility until all environments are aligned

3. Document autofill flow
- Keep source-of-truth clear between:
  - real saved models
  - ticket/client/location context
  - saved document drafts

4. Backend app boundaries
- `services` currently carries a lot of responsibilities:
  - ticket workflow
  - documents
  - commissioning
  - quotations/contracts
  - analytics
- Future cleanup can separate these by domain modules while preserving imports

**Recommended Cleanup Order**

1. Frontend structure cleanup
2. Backend service-module cleanup
3. Document source-of-truth cleanup
4. Dead file / archive / backup review
5. Old migration deletion only after environment confirmation

**Rules For Safe Cleanup**

- prefer extraction over behavior rewrite
- keep response shapes stable
- test after each pass
- do not remove compatibility bridges until replacements are verified

**Already Started**

- Shared Admin Documents template config was extracted to:
  - `frontend/src/pages/admin/adminDocumentsSupport.js`
- Migration deep-clean notes were added to:
  - `docs/development/MIGRATION_DEEP_CLEAN.md`
