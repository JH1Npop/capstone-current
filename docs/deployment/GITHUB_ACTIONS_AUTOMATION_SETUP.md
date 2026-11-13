# Free GitHub Actions Automation Setup

The repository includes `.github/workflows/daily-operational-automations.yml` as
the free, once-daily scheduler for maintenance reminders and daily operational
maintenance. It runs at **8:17 AM Asia/Manila** and can also be started manually
from the GitHub Actions page.

The workflow is inert until it exists on the repository's default branch and
all required secrets are configured. Never copy secret values into this file,
the workflow, an issue, or a commit.

## What it runs

```text
python manage.py run_operational_automations --mode daily
```

This processes maintenance reminder stages, creates due maintenance follow-up
cases, sends enabled in-app/email reminders, refreshes daily analytics and
technician performance, purges expired technician locations, and refreshes
validated demand forecasts. It does not run migrations.

This free workflow intentionally does **not** run the separate frequent group
for SLA checks and pending-ticket auto-dispatch. Running a Python environment
every 30 minutes can exhaust the included minutes of a private GitHub Free
repository. Use a paid deployment scheduler for the documented 30-minute SLA
and auto-dispatch cadence.

## Required GitHub secrets

Open the GitHub repository, then **Settings -> Secrets and variables -> Actions
-> New repository secret**. Create the following secrets from the matching
values on the intended deployed backend. Use staging values for the first test.

| GitHub secret | Source / expected value |
| --- | --- |
| `AUTOMATION_DEPLOYMENT_STAGE` | Exactly `staging` or `production` |
| `AUTOMATION_SECRET_KEY` | Deployed Django `SECRET_KEY` |
| `AUTOMATION_ALLOWED_HOSTS` | Deployed backend hostname list |
| `AUTOMATION_CORS_ALLOWED_ORIGINS` | Deployed frontend HTTPS origin list |
| `AUTOMATION_CSRF_TRUSTED_ORIGINS` | Deployed frontend HTTPS origin list |
| `AUTOMATION_FRONTEND_BASE_URL` | Deployed frontend HTTPS URL |
| `AUTOMATION_DATABASE_URL` | Intended Aiven PostgreSQL connection URL |
| `AUTOMATION_AIVEN_CA_PEM` | Complete plaintext contents of `aiven-ca.pem` |
| `AUTOMATION_CLOUDINARY_CLOUD_NAME` | Deployed Cloudinary cloud name |
| `AUTOMATION_CLOUDINARY_API_KEY` | Deployed Cloudinary API key |
| `AUTOMATION_CLOUDINARY_API_SECRET` | Deployed Cloudinary API secret |
| `AUTOMATION_REDIS_URL` | Intended deployed Redis TLS URL |
| `AUTOMATION_BREVO_API_KEY` | Deployed Brevo API key |
| `AUTOMATION_DEFAULT_FROM_EMAIL` | Verified deployed sender, including name if used |

The workflow fails before connecting to the database if a required secret is
empty or if the deployment stage is not explicitly `staging` or `production`.
GitHub masks configured secrets in logs, and the workflow writes the CA
certificate only to the runner's temporary directory.

## Activate and prove it

1. Commit this workflow and setup document only after reviewing the diff.
2. Push them to the repository's **default branch**. GitHub scheduled workflows
   do not run from a feature branch.
3. Add all secrets above, initially pointing to staging.
4. Open **Actions -> Daily operational automations -> Run workflow**.
5. Confirm `Validate Django configuration` passes.
6. Confirm the final step ends with `Completed daily operational automations`.
7. Confirm the run is green, then inspect the staging application for eligible
   maintenance reminders/follow-up cases. A zero-reminder result is valid when
   no maintenance schedule is at a reminder boundary.
8. Keep GitHub Actions failure notifications enabled and review the workflow's
   run history regularly.

Do not use a production database for the first run. Moving from staging to
production is a separate deployment decision: replace every automation secret
as one reviewed set, manually run once, and verify the result.

## Free-tier limitations

- Standard runners are free for public repositories. Private GitHub Free
  repositories receive a monthly included-minute allowance.
- Scheduled runs can be delayed or, under heavy load, dropped. This is suitable
  for daily capstone reminders, not an exact real-time guarantee.
- A scheduled workflow must remain on the default branch. Public-repository
  schedules are disabled after 60 days without repository activity.
- If Aiven restricts inbound connections, its allowlist must permit the GitHub
  runner. GitHub-hosted runner addresses are not intended as a small stable
  allowlist.

For a dependable production SLA, use deployment-native cron jobs and monitoring.
