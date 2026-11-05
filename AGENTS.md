# Repository Agent Instructions

Before inspecting or changing this repository, read
`docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md`. It is the canonical living
handoff for architecture, active changes, validation evidence, known risks,
deployment assumptions, and next actions. Use the narrower contract documents
linked from that file only when the task touches their area.

## Required living-document update

Every repository change must include a matching update to
`docs/quality/CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md` in the same work session.
This includes code, configuration, environment contracts, dependencies,
migrations, tests, routes, deployment behavior, and documentation changes.

At minimum, maintain:

- `Last updated` and `Current objective`;
- the architecture, route, schema, environment, or deployment section affected;
- `Current worktree manifest` when changed paths are added or removed;
- `Validation ledger`, recording only commands actually run and their results;
- `Known risks and pending decisions`;
- `Change ledger`, with a concise summary and affected paths.

Do not replace a dated validation result with an assumption. Mark evidence as
stale when later changes invalidate it, and add the new result only after the
check runs. Never copy secret values into documentation.

## Worktree safety

The worktree is intentionally dirty and contains user and prior-agent work.
Do not delete, overwrite, reset, stash, revert, or clean existing changes. Do
not run migrations against the user's development or production database
without explicit approval. Browser tests use the isolated E2E database.

No commit or push is authorized unless the user explicitly asks for it in the
current conversation.

## Engineering rules

Shared by Claude Code and Codex. `CLAUDE.md` holds commands and architecture;
do not duplicate them here. Verify docs against the code, because the code wins.

- **Scope:** inspect existing code first and reuse existing modules. Add no
  dependency or plugin without approval. Preserve existing behavior.
- **Django:** keep business rules in the standalone `backend/services/*.py`
  modules (scheduling, SLA, dispatch, deposits, ...), not in views. Keep
  models, serializers, and views in their existing packages.
- **Database:** every model change needs a migration that is reviewed but not
  applied to dev or production without approval. Follow
  `docs/development/DATABASE_NAMING_GUIDE.md` and update the schema section of
  the handoff. Local work stays on SQLite.
- **API consistency:** match the existing DRF serializer, error, and URL
  patterns. When a route or payload changes, update `frontend/src/api/*` and
  `docs/security/ROUTE_API_CAPABILITY_MATRIX.md`.
- **Permissions:** access is capability-based. Backend constants in
  `backend/users/rbac.py` and `permissions.py` are authoritative, and
  `frontend/src/rbac.js` mirrors them for UI gating. Never gate only in the
  UI. Change both sides together and keep the capability matrix current.
- **Workflows:** status changes follow `docs/security/WORKFLOW_STATE_MACHINES.md`.
  Update it with any new or changed transition.
- **React:** put new pages in the role folder under `frontend/src/pages/`,
  reuse `components/shared` and `components/ui`, and make API calls through
  `frontend/src/api/`, not inline axios.
- **Testing:** add or update a backend test near the changed code and run only
  the affected tests (single-test commands are in `CLAUDE.md`). UI or role
  flow changes need the matching Playwright spec plus seed data in
  `e2e/seed-test-data-exec.py`. Record only commands actually run.
