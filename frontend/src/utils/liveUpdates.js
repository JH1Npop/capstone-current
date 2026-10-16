import { startVisibleInterval } from './visibleInterval';

// Shared state for the per-user live socket opened by NotificationContext.
let liveConnected = false;

export const MESSAGES_CHANGED_EVENT = 'afn:messages-changed';

export function setLiveUpdatesConnected(value) {
  liveConnected = Boolean(value);
}

export function isLiveUpdatesConnected() {
  return liveConnected;
}

// Refresh immediately when the server pushes `eventName`; poll every `fallbackMs`
// only while the live socket is down, and every `liveSafetyMs` as a safety net.
export function startLiveRefresh(refresh, { eventName, fallbackMs = 5000, liveSafetyMs = 30000 }) {
  let lastRun = Date.now();
  const run = () => {
    lastRun = Date.now();
    refresh();
  };
  const tick = () => {
    if (liveConnected && Date.now() - lastRun < liveSafetyMs) return;
    run();
  };
  const stopInterval = startVisibleInterval(tick, fallbackMs);
  window.addEventListener(eventName, run);
  return () => {
    stopInterval();
    window.removeEventListener(eventName, run);
  };
}
