const ROLE_PREFIXES = {
  superadmin: 'SA',
  admin: 'ADM',
  technician: 'TECH',
  client: 'CL',
  request: 'REQ',
  ticket: 'TKT',
  case: 'ASC',
  support_case: 'CSC',
  quotation: 'QUO',
  transaction: 'ITX',
  reservation: 'RSV',
  document: 'DOC',
  estimate: 'EST'
};

const ID_WIDTHS = {
  transaction: 6,
  reservation: 6
};

export const formatRoleId = (role, id) => {
  if (id == null || id === '') return '-';
  const prefix = ROLE_PREFIXES[role] || String(role || 'ID').toUpperCase().slice(0, 4);
  const rawValue = String(id).trim();
  const prefixedNumericMatch = rawValue.match(/^[A-Za-z]+-(\d+)$/);
  const identityValue = prefixedNumericMatch ? prefixedNumericMatch[1] : rawValue;
  const width = ID_WIDTHS[role] || 4;
  const displayValue = /^\d+$/.test(identityValue)
    ? identityValue.padStart(width, '0')
    : identityValue;
  return `${prefix}-${displayValue}`;
};

export const formatRequestId = (id) => formatRoleId('request', id);
export const formatTicketId = (id) => formatRoleId('ticket', id);
export const formatClientId = (id) => formatRoleId('client', id);
export const formatTechnicianId = (id) => formatRoleId('technician', id);
export const formatCaseId = (id) => formatRoleId('case', id);
export const formatSupportCaseId = (id) => formatRoleId('support_case', id);
export const formatQuotationId = (id) => formatRoleId('quotation', id);
export const formatTransactionId = (id) => formatRoleId('transaction', id);
export const formatReservationId = (id) => formatRoleId('reservation', id);
export const formatDocumentId = (id) => formatRoleId('document', id);
export const formatEstimateId = (id) => formatRoleId('estimate', id);
