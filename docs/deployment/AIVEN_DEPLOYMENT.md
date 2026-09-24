# Aiven Deployment Guide

This project is already configured to use PostgreSQL through `DATABASE_URL`, which is the easiest way to connect to Aiven.

## 1. Create the Aiven database

1. Create a PostgreSQL service in Aiven.
2. Copy the service connection string.
3. Download the Aiven project CA certificate for certificate-verified production connections.

Example:

```text
postgresql://avnadmin:your-password@your-project.aivencloud.com:12345/defaultdb?sslmode=verify-full
```

## 2. Set environment variables

In your production environment, set:

```env
DJANGO_ENV=production
DEBUG=False
SECRET_KEY=your-production-secret
ALLOWED_HOSTS=your-domain.com,www.your-domain.com
DATABASE_URL=postgresql://avnadmin:your-password@your-project.aivencloud.com:12345/defaultdb?sslmode=verify-full
DB_SSLMODE=verify-full
DB_SSLROOTCERT=/absolute/path/to/aiven-ca.pem
CORS_ALLOWED_ORIGINS=https://your-domain.com
CSRF_TRUSTED_ORIGINS=https://your-domain.com
FRONTEND_BASE_URL=https://your-domain.com
ENABLE_HTTPS=True
USE_REDIS=True
REDIS_URL=rediss://default:password@your-managed-redis-host:6379/0
```

If you use a separate frontend domain, add it to `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`.

## 2b. Configure Cloudinary media storage

For uploads, use Cloudinary instead of Render local disk.

Set these backend environment variables in Render:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

The backend now switches to Cloudinary automatically when all three values are present. If they are missing, it falls back to local filesystem storage for development.

Production startup fails when Cloudinary is absent because ephemeral host disks
can lose profile images and proof media. If the host provides a mounted,
persistent media volume, set `ALLOW_LOCAL_MEDIA_IN_PRODUCTION=True`
intentionally and include that volume in backups.

## 3. Run Django migrations

After the backend is pointed at Aiven, run:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
```

## 3b. Move local SQLite data to Aiven

If you already have real local accounts in `backend/db.sqlite3`, export them before
switching the backend to Aiven:

```powershell
cd backend
..\venv\Scripts\python.exe manage.py dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --indent 2 > local-data.json
```

Back up both databases before importing. Test the import in staging first and
do not run it against a populated production database. Then set `DATABASE_URL`
to the Aiven PostgreSQL URI and load the schema/data:

```powershell
cd backend
$env:DATABASE_URL="postgresql://avnadmin:your-password@your-project.aivencloud.com:12345/defaultdb?sslmode=verify-full"
$env:DB_SSLMODE="verify-full"
$env:DB_SSLROOTCERT="C:\secure\aiven-ca.pem"
..\venv\Scripts\python.exe manage.py migrate
..\venv\Scripts\python.exe manage.py loaddata local-data.json
```

After loading, verify the active database and superadmin:

```powershell
..\venv\Scripts\python.exe manage.py shell -c "from django.conf import settings; from users.models import User; print(settings.DATABASES['default']['ENGINE']); print(User.objects.filter(role='superadmin').values_list('username','email'))"
```

If you do not want to migrate local sample data, skip `dumpdata`/`loaddata` and
bootstrap only the production owner account:

```powershell
$env:AFN_BOOTSTRAP_ADMIN_USERNAME="iman"
$env:AFN_BOOTSTRAP_ADMIN_PASSWORD="change-this-password"
..\venv\Scripts\python.exe scripts\create_admin.py
```

## 4. Deploy the backend

The backend can run on any host that supports Python:

- Render
- Railway
- Fly.io
- A VPS with Docker or Gunicorn

The repo already includes Docker and a `Procfile`, so you can choose either container-based or process-based deployment.

## 5. Frontend recommendation

For this project, the cleanest path is:

- deploy the React app as a web app or PWA,
- keep the backend on Django,
- use Cordova only if you need an app-store wrapper.

## 6. Verify before routing traffic

Run the production configuration check and then call the probes on the deployed backend:

```bash
python manage.py check --deploy
curl --fail https://your-backend.example.com/api/health/liveness/
curl --fail https://your-backend.example.com/api/health/readiness/
```

Readiness verifies the database, configured cache, Redis-backed Channels path,
and media storage. See [Production deployment checklist](PRODUCTION_DEPLOYMENT_CHECKLIST.md)
for the complete release and rollback sequence.

Before production migration, run the guarded `npm run quality:staging` gate
with a separate disposable `test_...` PostgreSQL database. See
[Production-shaped staging validation](STAGING_VALIDATION.md) for the required
environment markers, concurrency checks, and perimeter probes.

`sslmode=require` encrypts the database connection but does not verify the
server certificate. Aiven recommends `verify-ca` or `verify-full` plus the
project CA for production: https://aiven.io/docs/products/postgresql/howto/connect-python
