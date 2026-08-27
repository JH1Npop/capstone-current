# AFN Service Management (Frontend)

Enterprise front-end for AFN Solar Power Engineering Services.

## Tech stack
- React + Vite
- TailwindCSS
- React Router
- Axios (Django REST API)
- Leaflet (GIS map)
- React Icons

## Features
- Role-based screens: admin / supervisor / technician / client
- Routing: `/admin/dashboard`, `/supervisor/dashboard`, `/technician/dashboard`, `/client/dashboard`
- Reusable layout (sidebar + topbar + content)
- Live service requests, dispatch, tracking, job updates, and admin settings
- Leaflet map with technicians + service locations

## Start
```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5174`.

Run the Django API on **port 8000** (this must match `vite.config.js`; otherwise `/api` may hit a different project):

```bash
cd backend
python manage.py runserver 127.0.0.1:8000
```

Or start both together from `frontend`: `npm run dev:full` (PowerShell). That script can still use a custom backend port through `BACKEND_PORT` because it passes `VITE_BACKEND_HOST` automatically.

## Authentication
- Use real accounts created through the Django backend.
- For first-time bootstrap, set `AFN_BOOTSTRAP_ADMIN_PASSWORD` and run `python backend/scripts/create_admin.py` from the repository root.

## Build
```bash
npm run build
```

## Production Notes
- Set the frontend API base URL to your deployed Django API.
- Configure backend env vars for `SECRET_KEY`, `ALLOWED_HOSTS`, CORS, database, SMTP email, and OpenRouteService.
- Keep demo seed commands out of production environments.
