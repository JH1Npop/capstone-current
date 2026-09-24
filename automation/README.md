# Operational automation

All scripts resolve the repository from their own location. They do not depend
on a developer-specific absolute path.

## Automation groups

| Mode | Recommended schedule | Work performed |
| --- | --- | --- |
| `frequent` | Every 30 minutes | SLA warnings/escalations and pending-ticket auto-dispatch |
| `daily` | Once daily | Maintenance reminders, service analytics, technician performance, location retention, and validated demand-forecast refresh |
| `all` | Manual verification only | Both groups in sequence |

The Django entry point is:

```powershell
cd backend
..\venv\Scripts\python.exe manage.py run_operational_automations --mode frequent
..\venv\Scripts\python.exe manage.py run_operational_automations --mode daily
```

Run these from a deployment scheduler, not from the web process. A failed
component stops the group and returns a non-zero process exit code. SLA alerts
are deduplicated for 24 hours per recipient, record, and breach type.

## Windows

From the repository root:

```powershell
.\automation\run_operational_automations.ps1 -Mode frequent
.\automation\run_operational_automations.ps1 -Mode daily
```

For Windows Task Scheduler, open an administrator PowerShell and run:

```powershell
.\automation\setup_task_scheduler.ps1
```

The setup script registers the existing daily task name for compatibility and
adds `AFN Operations - Frequent`. Logs are written under `logs/`.

The analytics-only `run_analytics.ps1` and `run_analytics.bat` remain available
for daily/manual backfill/force operations. After aggregate and technician
snapshots, they run `generate_demand_forecasts`, which reconciles completed
monthly predictions and publishes a refreshed outlook only for service models
that pass the genuine-history and holdout-validation gates. Both scripts are
repository-relative and return a failure exit code when a command fails.

## Linux or a hosting platform

Configure two scheduler jobs using the Django commands above. Ensure each job
uses the same environment variables and virtual environment as the backend.
Never put secrets directly in cron command text or source control.

After deployment, monitor the last successful run and alert on non-zero exit
codes. Do not run overlapping copies of the same mode.
