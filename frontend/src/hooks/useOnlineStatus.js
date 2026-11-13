import { useEffect, useState } from 'react';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
const hasLocalRuntime = () => (
  typeof window !== 'undefined' && LOOPBACK_HOSTS.has(window.location.hostname)
);
const readOnlineStatus = () => (
  typeof navigator === 'undefined' || hasLocalRuntime() || navigator.onLine
);

export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(readOnlineStatus);

  useEffect(() => {
    const updateStatus = () => setIsOnline(readOnlineStatus());

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);

    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  return isOnline;
}
