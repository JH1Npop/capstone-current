# ─── React / Vite Frontend Dockerfile ────────────────────────────────────────
# React / Vite development image for local Docker Compose with hot reload.
FROM node:20-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

RUN npm ci

# Copy the rest of the source
COPY . .

EXPOSE 5174

# Start Vite dev server (host 0.0.0.0 so Docker can expose the port).
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
