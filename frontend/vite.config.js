import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// When running inside Docker, Vite's dev server proxies to the 'backend'
// service name (resolved by Docker's internal DNS).
// When running locally (npm run dev), it falls back to Django's default
// runserver port. Set VITE_BACKEND_HOST if you intentionally run another port.
const BACKEND_HOST = process.env.VITE_BACKEND_HOST || 'http://127.0.0.1:8000';

export default defineConfig(({ mode }) => {
  const isPythonAnywhereBuild = mode === 'pythonanywhere';

  return {
    plugins: [react()],
    base: isPythonAnywhereBuild ? '/static/frontend/' : '/',
    build: isPythonAnywhereBuild
      ? {
          outDir: '../backend/static/frontend',
          emptyOutDir: true,
        }
      : undefined,
    server: {
      host: '0.0.0.0',
      port: Number(process.env.VITE_DEV_SERVER_PORT || 5174),
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: BACKEND_HOST,
          changeOrigin: true,
        },
        '/media': {
          target: BACKEND_HOST,
          changeOrigin: true,
        },
        '/static': {
          target: BACKEND_HOST,
          changeOrigin: true,
        },
        '/ws': {
          target: BACKEND_HOST.replace('http', 'ws'),
          changeOrigin: true,
          ws: true, // WebSocket proxy for Django Channels
        },
      },
    },
  };
});
