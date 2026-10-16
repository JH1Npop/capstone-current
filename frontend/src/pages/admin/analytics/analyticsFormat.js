// Shared display formatting for the Analytics workspaces.

const MISSING_PLACE = new Set(['', 'null', 'none', 'undefined', 'unknown']);

export function plural(count, singular, pluralWord = `${singular}s`) {
  const value = Number(count || 0);
  return `${value.toLocaleString('en-PH')} ${value === 1 ? singular : pluralWord}`;
}

export function placeLabel(...parts) {
  const names = parts
    .map((part) => String(part ?? '').trim())
    .filter((part) => !MISSING_PLACE.has(part.toLowerCase()));
  return names.length ? [...new Set(names)].join(', ') : 'Unspecified location';
}

export function shortDate(value, { withYear = true } = {}) {
  if (!value) return '—';
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00`) : new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(date);
}

export function compactNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '';
  return new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value));
}
