# Windows Task Scheduler setup

Run the automated setup from an administrator PowerShell opened at the
repository root:

```powershell
.\automation\setup_task_scheduler.ps1
```

It creates or updates:

- `AFN Analytics - Daily Generation`: runs the `daily` group at 2:00 AM.
- `AFN Operations - Frequent`: runs the `frequent` group every 30 minutes.

The scripts derive all paths from the repository and write daily log files to
`logs/`. The virtual environment must exist at `venv\Scripts\python.exe`.

Verify the tasks:

```powershell
Get-ScheduledTask -TaskName 'AFN Analytics - Daily Generation'
Get-ScheduledTask -TaskName 'AFN Operations - Frequent'
Get-ScheduledTaskInfo -TaskName 'AFN Operations - Frequent'
```

Test the underlying commands before enabling production schedules:

```powershell
.\automation\run_operational_automations.ps1 -Mode frequent
.\automation\run_operational_automations.ps1 -Mode daily
```

Do not run these tests against production until the environment variables and
database target have been verified. A zero exit code means the whole selected
group completed; a non-zero exit code identifies a failed group in the log.
