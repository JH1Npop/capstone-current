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
