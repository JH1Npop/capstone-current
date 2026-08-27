# Implementation Baseline - 2026-08-27

Status: Snapshot

This document records the validation baseline for the first phased remediation
checkpoint. It is a dated result, not a permanent claim that later commits pass.

## Repository state before the checkpoint

- Branch: `main`, synchronized with `origin/main`
- Starting commit: `142ecad`
- Tracked working tree: clean
- Local environment files, SQLite data, uploads, dependencies, builds, and test
  reports remained ignored and were not added to Git.

## Phase 0/1 scope

- Establish the documentation status and authority convention.
- Enforce owned read access for client ticket progress.
- Allow progress creation only for assigned lead/crew technicians and admins.
- Keep progress records append-only.
- Set the progress actor from the authenticated request.
- Add direct API regression coverage for those rules.

## Validation commands

The checkpoint is accepted only when all of the following pass:

```powershell
cd backend
..\venv\Scripts\python.exe manage.py check
..\venv\Scripts\python.exe manage.py makemigrations --check --dry-run
..\venv\Scripts\python.exe -W error::RuntimeWarning manage.py test
cd ..
npm run build
```

Focused progress authorization tests: 6 passed.

## Checkpoint results

| Validation | Result |
| --- | --- |
| Django system check | Passed; no issues |
| Migration drift | Passed; no changes detected |
| Python dependency consistency | Passed; no broken requirements |
| Focused progress authorization tests | Passed; 6 tests |
| Full discovered Django suite | Passed; 247 tests |
| Frontend production build | Passed with Vite 8.2.2 |

The full test output includes expected 400, 401, 403, 404, 405, 409, and 429
responses exercised by negative-path tests. No tracked build artifacts were
created because production output remains ignored by Git.
