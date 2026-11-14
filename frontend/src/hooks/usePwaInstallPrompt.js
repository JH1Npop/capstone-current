import { useEffect, useState } from 'react';

// The browser fires `beforeinstallprompt` once, early. Keep it at module level so a button that
// mounts later (login page, signed-in top bar) still gets it.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

const isStandalone = () => typeof window !== 'undefined' && (
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
);

const isIos = () => typeof navigator !== 'undefined' && (
  /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

export default function usePwaInstallPrompt() {
  const [, setVersion] = useState(0);

  useEffect(() => {
    const update = () => setVersion((value) => value + 1);
    listeners.add(update);
    return () => listeners.delete(update);
  }, []);

  const install = async () => {
    if (!deferredPrompt) {
      return false;
    }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    notify();
    promptEvent.prompt();
    const result = await promptEvent.userChoice;
    return result?.outcome === 'accepted';
  };

  return {
    // True only when the browser can show its own install dialog right now.
    canInstall: Boolean(deferredPrompt) && !isStandalone(),
    // False once the app is open as an installed app, so the button disappears there.
    isInstalled: isStandalone(),
    isIos: isIos(),
    install,
  };
}
