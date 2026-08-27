const ROLE_PREFIXES = {
  superadmin: 'SA',
  admin: 'ADM',
  technician: 'TECH',
  client: 'CL',
  ticket: 'TCK',
  case: 'CASE'
};

export const formatRoleId = (role, id) => {
  if (id == null || id === '') return '-';
  const prefix = ROLE_PREFIXES[role] || String(role || 'ID').toUpperCase().slice(0, 4);
  return `${prefix}-${String(id).padStart(4, '0')}`;
};

export const formatTicketId = (id) => formatRoleId('ticket', id);
export const formatClientId = (id) => formatRoleId('client', id);
export const formatTechnicianId = (id) => formatRoleId('technician', id);
export const formatCaseId = (id) => formatRoleId('case', id);
