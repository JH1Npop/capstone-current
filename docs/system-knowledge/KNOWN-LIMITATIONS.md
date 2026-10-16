# Known Limitations and Verification Gaps

**UNVERIFIED/pending:** deployed Brevo end-to-end delivery after environment-group rollout; disposable PostgreSQL concurrency gate; real PostgreSQL backup and restore drill; external scheduler execution; production monitoring/alerts; administrator MFA enrollment/stable provider key; malware scanning; SAST and penetration testing; deployed PSGC reliability; Docker image build; diagram rendering; production UAT.

**Known product boundaries:** no payments/accounting, procurement suite, serialized asset tracking, unified background retry queue, server-side cross-device checklist drafts, immutable dispatch-time checklist template snapshot, strict collision detection for TBD/cross-midnight work, contractual GPS freshness/accuracy, or explicit notification destination field. Forecast publication is blocked by insufficient genuine history. Free Render staging is disposable and can sleep; its Redis is non-persistent.

**Contradictory/stale risk:** archived documentation may describe retired models or earlier routes. Current source/migrations and `CURRENT_SYSTEM_AUDIT_AND_HANDOFF.md` override archive material. The local dirty worktree contains user changes, so this report describes the inspected working tree, not necessarily the last commit.
