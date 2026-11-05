const normalize = (value) => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const tokens = (value) => new Set(normalize(value).split(' ').filter((item) => item.length > 1));

export const FIELD_ALIASES = Object.freeze({
  client_name: ['client', 'client name', 'customer', 'customer name', 'customer full name'],
  client_address: ['client address', 'customer address', 'billing address', 'address'],
  client_contact_number: ['contact', 'contact number', 'phone', 'phone number', 'mobile number'],
  client_email: ['email', 'email address', 'client email'],
  ticket_number: ['ticket', 'ticket number', 'ticket no', 'reference number', 'job number'],
  service_type: ['service', 'service type', 'type of service', 'work performed'],
  technician_name: ['technician', 'assigned technician', 'service personnel', 'field technician'],
  quotation_number: ['quotation number', 'quotation no', 'quote number', 'proposal number'],
  quotation_date: ['quotation date', 'quote date', 'proposal date', 'date'],
  total_price: ['grand total', 'total amount', 'total price', 'project cost', 'quotation total'],
  total_contract_amount: ['contract amount', 'total contract amount', 'contract price', 'project cost'],
  payment_terms: ['payment terms', 'terms of payment'],
  scope_of_work: ['scope of work', 'work scope', 'project scope'],
  service_date: ['service date', 'date of service', 'visit date'],
  commissioned_date: ['commissioning date', 'date commissioned'],
  date_of_turnover: ['turnover date', 'date of turnover', 'handover date'],
  company_signer: ['authorized representative', 'company representative', 'prepared by'],
  client_signer_name: ['client signature', 'customer signature', 'accepted by'],
  recommendation: ['recommendation', 'recommendations', 'action required'],
  bom_rows: ['bill of materials', 'equipment list', 'materials', 'equipment and materials'],
  price_rows: ['price schedule', 'pricing', 'quotation items'],
  service_rows: ['equipment readings', 'service readings', 'equipment serviced'],
  checklist_rows: ['commissioning checklist', 'inspection checklist', 'checks'],
  load_schedule_rows: ['load schedule', 'appliance schedule', 'electrical loads'],
  component_rows: ['system components', 'components', 'installed components'],
});

export const REQUIRED_COMPONENTS = Object.freeze({
  field_service_report: ['ticket_number', 'client_name', 'service_type', 'service_rows'],
  quotation_proposal: ['client_name', 'price_rows', 'bom_rows'],
  installation_contract: ['client_name', 'scope_of_work', 'total_contract_amount'],
  technical_data_sheet: ['client_name', 'load_schedule_rows'],
  commissioning_checklist: ['client_name', 'checklist_rows'],
  turnover_acceptance: ['client_name', 'component_rows', 'date_of_turnover'],
});

const scoreAlias = (detected, alias) => {
  const left = normalize(detected);
  const right = normalize(alias);
  if (!left || !right) return 0;
  if (left === right) return 0.98;
  if (Math.min(left.length, right.length) >= 4 && (left.includes(right) || right.includes(left))) return 0.84;
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const overlap = [...leftTokens].filter((item) => rightTokens.has(item)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union && overlap / union >= 0.5 ? 0.7 : 0;
};

export const suggestFieldMappings = (detectedLabel, approvedFields = [], documentCode = '') => {
  const candidates = approvedFields
    .filter((field) => !field.is_collection)
    .map((field) => {
      const aliases = [field.label, field.key.replaceAll('_', ' '), ...(FIELD_ALIASES[field.key] || [])];
      const score = Math.max(...aliases.map((alias) => scoreAlias(detectedLabel, alias)));
      return { ...field, score, matchedLabel: detectedLabel, documentCode };
    })
    .filter((field) => field.score >= 0.7)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));

  return candidates.slice(0, 3).map((field, index) => {
    const nextScore = candidates[index + 1]?.score || 0;
    const ambiguous = index === 0 && nextScore > 0 && field.score - nextScore < 0.08;
    return {
      ...field,
      confidence: field.score >= 0.95 ? 'high' : field.score >= 0.8 ? 'medium' : 'low',
      needsConfirmation: true,
      ambiguous,
      explanation: field.score >= 0.95
        ? `“${detectedLabel}” exactly matches a known label for ${field.label}.`
        : `“${detectedLabel}” is similar to a known label for ${field.label}. Please confirm it.`,
    };
  });
};

export const findNearbyPdfLabel = (items = [], point, maximumDistance = 0.18) => {
  if (!point) return null;
  return items
    .map((item) => {
      const centerX = item.x + (item.width || 0) / 2;
      const centerY = item.y + (item.height || 0) / 2;
      return { ...item, distance: Math.hypot(centerX - point.x, centerY - point.y) };
    })
    .filter((item) => item.text && item.distance <= maximumDistance)
    .sort((left, right) => left.distance - right.distance)[0] || null;
};

export const getMissingRequiredMappings = (documentCode, mappedKeys = []) => {
  const mapped = new Set(mappedKeys.map((key) => String(key).split('.')[0]));
  return (REQUIRED_COMPONENTS[documentCode] || []).filter((key) => !mapped.has(key));
};

export const humanizeFieldKey = (key, approvedFields = []) => (
  approvedFields.find((field) => field.key === key)?.label
  || String(key || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
);
