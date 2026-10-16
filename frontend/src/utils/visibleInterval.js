// Polling that pauses while the browser tab is hidden and catches up as soon as it
// becomes visible again. Drop-in for setInterval: returns a cleanup function.
export function startVisibleInterval(callback, delayMs, { refreshOnVisible = true } = {}) {
  let intervalId = null;
  const start = () => {
    if (intervalId === null) intervalId = window.setInterval(callback, delayMs);
  };
  const stop = () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      stop();
      return;
    }
    if (refreshOnVisible) callback();
    start();
  };

  if (document.visibilityState !== 'hidden') start();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    stop();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
