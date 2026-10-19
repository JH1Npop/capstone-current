// One routing contract for notifications: the sidebar badge (section) and the click destination
// always agree. Titles are matched first because they are system-written; the free-text message
// (which can quote a technician's reason or a client's subject) is only a fallback for older
// notifications that were created without a title.

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

const SECTION_LABELS = {
  '/admin/messages': 'Open messages',
  '/admin/client-support': 'Open Client Support',
  '/admin/inventory': 'Review equipment request',
  '/admin/service-tickets': 'Open ticket',
  '/admin/dispatch-board': 'Open Dispatch Board',
  '/admin/job-history': 'Open job history',
  '/technician/messages': 'Open messages',
  '/technician/my-jobs': 'Open job',
  '/technician/schedule': 'Open schedule',
  '/client/support': 'Open Client Support',
  '/client/service-history': 'Open service history',
  '/client/requests': 'Open request',
};

const lower = (value) => String(value || '').toLowerCase();

const matchesAny = (text, patterns) => patterns.some((pattern) => pattern.test(text));

function adminSection(title, message, type) {
  if (title) {
    if (/^new message from /.test(title) || /after-sales message/.test(title)) return '/admin/messages';
    if (/customer service|customer support|support case/.test(title)) return '/admin/client-support';
    if (/equipment requested/.test(title)) return '/admin/inventory';
    if (/inspection report submitted|on hold|equipment|awaiting materials|reschedul|status updated|in progress/.test(title)) {
      return '/admin/service-tickets';
    }
    if (/job completed|completed ticket/.test(title)) return '/admin/job-history';
    if (/dispatch|assign|ready for service/.test(title)) return '/admin/dispatch-board';
  }
  if (type === 'customer_inquiry') return /after-sales/.test(message) ? '/admin/messages' : '/admin/client-support';

  // Legacy, title-less notifications: order matters so specific phrases win over generic words.
  if (matchesAny(message, [/customer service/, /support case/])) return '/admin/client-support';
  if (/sent you a direct message|after-sales message/.test(message)) return '/admin/messages';
  if (/completed the checklist for ticket/.test(message)) return '/admin/service-tickets';
  if (matchesAny(message, [/ on hold/, /equipment/, /awaiting materials/, /reschedule/, /status updated/, /pending review/, /new service request/, /started work/, /in progress/])) {
    return '/admin/service-tickets';
  }
  if (/completed ticket|job completed/.test(message)) return '/admin/job-history';
  if (matchesAny(message, [/dispatch/, /assignment/, /assign technician/, /ready for service/, /ready for assignment/])) {
    return '/admin/dispatch-board';
  }
  return null;
}

function technicianSection(title, message) {
  const text = `${title} ${message}`;
  // The inspection team is released after the office decision, so the job is no longer in My Jobs.
  if (/inspection decision/.test(title)) return null;
  if (/^new message from /.test(title) || /after-sales message/.test(title) || /message/.test(text)) return '/technician/messages';
  if (/reschedul|schedule/.test(text)) return '/technician/schedule';
  return '/technician/my-jobs';
}

function clientSection(title, message) {
  if (/support/.test(title) || /customer support|support case/.test(message)) return '/client/support';
  // "Inspection completed" is an early step, not finished work.
  if (/inspection/.test(`${title} ${message}`)) return '/client/requests';
  if (/completed/.test(`${title} ${message}`)) return '/client/service-history';
  return '/client/requests';
}

/** Sidebar section that owns an unread notification's badge, or null for bell-only notifications. */
export const getNotificationSection = (notification, role) => {
  const title = lower(notification?.title);
  const message = lower(notification?.message);
  if (ADMIN_ROLES.has(role)) return adminSection(title, message, notification?.type);
  if (role === 'technician') return technicianSection(title, message);
  if (role === 'client') return clientSection(title, message);
  return null;
};

/** Where clicking a notification should go: the specific record when known, else its section. */
export const getNotificationDestination = (notification, role) => {
  const section = getNotificationSection(notification, role);
  if (!section) return null;

  const ticketId = Number(notification?.related_ticket || notification?.ticket || 0);
  const requestId = Number(notification?.related_request || notification?.request || 0);
  const title = lower(notification?.title);

  if (section === '/admin/inventory' && ticketId) {
    return { path: `/admin/inventory?ticketId=${ticketId}#pending-equipment-requests`, label: SECTION_LABELS[section] };
  }
  if (section === '/admin/service-tickets' && ticketId) {
    return { path: `/admin/service-tickets?ticketId=${ticketId}`, label: SECTION_LABELS[section] };
  }
  if (section === '/technician/my-jobs' && ticketId) {
    const label = /equipment/.test(title) ? 'Open ticket' : SECTION_LABELS[section];
    return { path: `/technician/my-jobs?ticketId=${ticketId}`, label };
  }
  if (section === '/client/requests' && requestId) {
    return { path: `/client/requests/${requestId}?entity=request`, label: SECTION_LABELS[section] };
  }
  return { path: section, label: SECTION_LABELS[section] || 'Open' };
};
