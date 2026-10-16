# Technology Stack

Pinned/declared stack: Python 3.13.15 on Render; Django 6.0.8; DRF 3.17.2; Channels 4.3.2; channels-redis 4.3.0; Daphne 4.2.2; psycopg2 2.9.12; React 18.3.1; React Router 7.18.2; Vite 8.2.2; Tailwind 3.4.4; Axios, Leaflet/React-Leaflet, Recharts, localforage, Lucide, and Playwright 1.61.1. Sources: `backend/requirements.txt`, `backend/runtime.txt`, `frontend/package.json`, root `package.json`.

Persistence is Django ORM over SQLite for normal local development and isolated tests, PostgreSQL for staging/production. Redis backs production Channels, Cloudinary durable media, WhiteNoise static assets, python-docx document generation, cryptography protected MFA secrets, and OpenRouteService routing. Brevo HTTPS email is configured for Render staging; SMTP is also supported. Gemini summaries are optional and have local fallback. There is no Celery worker: scheduled work is implemented as management commands invoked externally.
