const CACHE_VERSION = 'afn-serve-v11';
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const IS_LOCAL_DEV = ['localhost', '127.0.0.1', '0.0.0.0'].includes(self.location.hostname);
const APP_SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/offline.html',
  '/favicon.ico',
  '/logo.png',
  '/afn-serve-icon-192-v2.png',
  '/afn-serve-icon-512-v2.png',
];

const isStaticAsset = (url) => {
  return (
    url.origin === self.location.origin &&
    (
      url.pathname.startsWith('/assets/') ||
      url.pathname.startsWith('/static/frontend/assets/') ||
      /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?)$/i.test(url.pathname)
    )
  );
};

const isNavigationRequest = (request) => {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
};

self.addEventListener('install', (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  if (IS_LOCAL_DEV) {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((key) => key.startsWith('afn-serve-')).map((key) => caches.delete(key))))
        .then(() => self.registration.unregister())
        .then(() => self.clients.matchAll())
        .then((clients) => Promise.all(clients.map((client) => client.navigate(client.url))))
    );
    return;
  }

  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('afn-serve-') && !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (IS_LOCAL_DEV) {
    return;
  }

  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.pathname.endsWith('/manifest.webmanifest') || url.pathname === '/manifest.webmanifest') {
    return;
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/') || caches.match('/index.html') || caches.match('/offline.html'))
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => {
          if (request.destination === 'document') {
            return caches.match('/') || caches.match('/index.html');
          }
          return new Response('', {
            status: 504,
            statusText: 'Asset unavailable',
            headers: { 'Content-Type': 'text/plain' },
          });
        });
      })
    );
  }
});
