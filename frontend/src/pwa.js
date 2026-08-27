export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  if (!import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});

      if ('caches' in window) {
        caches.keys()
          .then((keys) => Promise.all(keys.filter((key) => key.startsWith('afn-serve-')).map((key) => caches.delete(key))))
          .catch(() => {});
      }
    });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
