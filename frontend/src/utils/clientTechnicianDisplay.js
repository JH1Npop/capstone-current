/**
 * Normalize technician label for client UI and merged request payloads.
 * Ignores numeric ids mistaken for names.
 */
export function clientTechnicianDisplayString(row) {
  if (!row || typeof row !== 'object') return '';
  const v =
    row.technician_full_name ||
    row.technician_fullname ||
    row.technician_name ||
    row.technician;
  if (v == null || v === '') return '';
  if (typeof v === 'number') return '';
  const s = String(v).trim();
  if (!s || /^\d+$/.test(s)) return '';
  return s;
}

export function clientTechnicianDisplayOrDash(row) {
  return clientTechnicianDisplayString(row) || '—';
}
