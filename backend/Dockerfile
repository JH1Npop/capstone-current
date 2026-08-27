# ─── Django Backend Dockerfile ───────────────────────────────────────────────
FROM python:3.13.15-slim

# Prevent .pyc files and enable unbuffered logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=afn_service_management.settings

WORKDIR /app

# System deps (needed by some Python packages)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies from requirements.txt
# channels-redis is kept in requirements.txt but won't be used
# when USE_REDIS=False (settings fall back to InMemoryChannelLayer)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy project source
COPY . .

# Ensure data / media / staticfiles directories exist
RUN mkdir -p /app/data /app/media /app/staticfiles

# Collect static assets
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# Run DB migrations then start Daphne (ASGI server for Channels)
CMD ["sh", "-c", \
  "python manage.py migrate --noinput && \
   daphne -b 0.0.0.0 -p 8000 afn_service_management.asgi:application"]
