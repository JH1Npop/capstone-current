const ADMIN_ROLES = new Set(['admin', 'superadmin']);

export const getNotificationDestination = (notification, role) => {
  const ticketId = Number(notification?.related_ticket || notification?.ticket || 0);
  if (!ticketId) return null;

  const title = String(notification?.title || '');
  if (ADMIN_ROLES.has(role) && /equipment requested/i.test(title)) {
    return {
      path: `/admin/inventory?ticketId=${ticketId}#pending-equipment-requests`,
      label: 'Review equipment request',
    };
  }

  if (role === 'technician' && /equipment (approved|request rejected)/i.test(title)) {
    return {
      path: `/technician/my-jobs?ticketId=${ticketId}`,
      label: 'Open ticket',
    };
  }

  return null;
};
