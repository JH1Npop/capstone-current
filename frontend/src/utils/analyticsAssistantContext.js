const STORAGE_KEY = 'afn_analytics_assistant_filters';
const EVENT_NAME = 'afn:analytics-assistant-filters';

function localDate(value = new Date()) {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function defaultFilters() {
  const endDate = localDate();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return {
    startDate: localDate(start),
    endDate,
    groupBy: 'day',
    comparison: 'previous_period',
    workspace: 'overview',
  };
}

export function getAnalyticsAssistantFilters() {
  if (typeof window === 'undefined') return defaultFilters();
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null');
    return stored && typeof stored === 'object' ? { ...defaultFilters(), ...stored } : defaultFilters();
  } catch {
    return defaultFilters();
  }
}

export function setAnalyticsAssistantFilters(filters) {
  if (typeof window === 'undefined') return;
  const next = { ...defaultFilters(), ...(filters || {}) };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: next }));
}

export function subscribeToAnalyticsAssistantFilters(listener) {
  if (typeof window === 'undefined') return () => {};
  const handleChange = (event) => listener(event.detail || getAnalyticsAssistantFilters());
  window.addEventListener(EVENT_NAME, handleChange);
  return () => window.removeEventListener(EVENT_NAME, handleChange);
}
