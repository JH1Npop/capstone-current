export const CAPABILITIES = {
  afterSalesDashboardView: 'after_sales.dashboard.view',
  afterSalesCasesView: 'after_sales.cases.view',
  afterSalesCasesManage: 'after_sales.cases.manage',
  adminOperationsDashboardView: 'supervisor.dashboard.view',
  adminTicketsView: 'supervisor.tickets.view',
  serviceRequestsReview: 'services.requests.review',
  serviceTicketsManage: 'services.tickets.manage',
  adminDispatchView: 'supervisor.dispatch.view',
  adminTrackingView: 'supervisor.tracking.view',
  technicianDashboardView: 'technician.dashboard.view',
  technicianJobsView: 'technician.jobs.view',
  technicianScheduleView: 'technician.schedule.view',
  technicianNavigationView: 'technician.navigation.view',
  technicianChecklistView: 'technician.checklist.view',
  technicianMessagesView: 'technician.messages.view',
  technicianHistoryView: 'technician.history.view',
  technicianProfileView: 'technician.profile.view',
  manageStaffCapabilities: 'users.capabilities.manage_staff',
  userDirectoryView: 'users.directory.view',
  manageUsers: 'users.directory.manage',
  adminJobHistoryView: 'admin.job_history.view',
  publicSiteView: 'public_site.view',
  publicSiteManage: 'public_site.manage',
  inventoryView: 'inventory.view',
  inventoryManage: 'inventory.manage',
  serviceCatalogView: 'services.catalog.view',
  serviceCatalogManage: 'services.catalog.manage',
  documentsView: 'documents.view',
  documentsManage: 'documents.manage',
  analyticsView: 'analytics.view',
  reportsView: 'reports.view',
  reportsExport: 'reports.export',
  auditView: 'audit.view',
  adminConfigured: 'admin.configured'
};

export const AFTER_SALES_DASHBOARD_CAPABILITIES = [
  CAPABILITIES.afterSalesDashboardView
];

export const AFTER_SALES_CASE_CAPABILITIES = [
  CAPABILITIES.afterSalesCasesView,
  CAPABILITIES.afterSalesCasesManage
];

export const AFTER_SALES_NAV_CAPABILITIES = [
  ...AFTER_SALES_DASHBOARD_CAPABILITIES,
  ...AFTER_SALES_CASE_CAPABILITIES
];

export const SUPERVISOR_DASHBOARD_CAPABILITIES = [
  CAPABILITIES.adminOperationsDashboardView
];

export const SUPERVISOR_TICKETS_CAPABILITIES = [
  CAPABILITIES.adminTicketsView,
  CAPABILITIES.serviceRequestsReview,
  CAPABILITIES.serviceTicketsManage
];

export const SERVICE_REQUEST_REVIEW_CAPABILITIES = [
  CAPABILITIES.serviceRequestsReview
];

export const SERVICE_TICKET_MANAGE_CAPABILITIES = [
  CAPABILITIES.serviceTicketsManage
];

export const DOCUMENTS_VIEW_CAPABILITIES = [
  CAPABILITIES.documentsView,
  CAPABILITIES.documentsManage
];

export const DOCUMENTS_MANAGE_CAPABILITIES = [
  CAPABILITIES.documentsManage
];

export const ANALYTICS_VIEW_CAPABILITIES = [
  CAPABILITIES.analyticsView
];

export const REPORTS_VIEW_CAPABILITIES = [
  CAPABILITIES.reportsView,
  CAPABILITIES.reportsExport
];

export const REPORTS_EXPORT_CAPABILITIES = [
  CAPABILITIES.reportsExport
];

export const AUDIT_VIEW_CAPABILITIES = [
  CAPABILITIES.auditView
];

export const SUPERVISOR_DISPATCH_CAPABILITIES = [
  CAPABILITIES.adminDispatchView
];

export const SUPERVISOR_TRACKING_CAPABILITIES = [
  CAPABILITIES.adminTrackingView
];

export const SUPERVISOR_USER_ACCESS_CAPABILITIES = [
  CAPABILITIES.manageStaffCapabilities
];

export const USER_DIRECTORY_CAPABILITIES = [
  CAPABILITIES.userDirectoryView
];

export const USER_MANAGEMENT_CAPABILITIES = [
  CAPABILITIES.manageUsers
];

export const ADMIN_JOB_HISTORY_CAPABILITIES = [
  CAPABILITIES.adminJobHistoryView
];

export const PUBLIC_SITE_VIEW_CAPABILITIES = [
  CAPABILITIES.publicSiteView,
  CAPABILITIES.publicSiteManage
];

export const PUBLIC_SITE_MANAGE_CAPABILITIES = [
  CAPABILITIES.publicSiteManage
];

export const INVENTORY_VIEW_CAPABILITIES = [
  CAPABILITIES.inventoryView,
  CAPABILITIES.inventoryManage
];

export const INVENTORY_MANAGE_CAPABILITIES = [
  CAPABILITIES.inventoryManage
];

export const SERVICE_CATALOG_VIEW_CAPABILITIES = [
  CAPABILITIES.serviceCatalogView,
  CAPABILITIES.serviceCatalogManage
];

export const SERVICE_CATALOG_MANAGE_CAPABILITIES = [
  CAPABILITIES.serviceCatalogManage
];

export const TECHNICIAN_DASHBOARD_CAPABILITIES = [
  CAPABILITIES.technicianDashboardView
];

export const TECHNICIAN_JOBS_CAPABILITIES = [
  CAPABILITIES.technicianJobsView
];

export const TECHNICIAN_SCHEDULE_CAPABILITIES = [
  CAPABILITIES.technicianScheduleView
];

export const TECHNICIAN_NAVIGATION_CAPABILITIES = [
  CAPABILITIES.technicianNavigationView
];

export const TECHNICIAN_CHECKLIST_CAPABILITIES = [
  CAPABILITIES.technicianChecklistView
];

export const TECHNICIAN_MESSAGES_CAPABILITIES = [
  CAPABILITIES.technicianMessagesView
];

export const TECHNICIAN_HISTORY_CAPABILITIES = [
  CAPABILITIES.technicianHistoryView
];

export const TECHNICIAN_PROFILE_CAPABILITIES = [
  CAPABILITIES.technicianProfileView
];

export const TECHNICIAN_ACCESS_CAPABILITIES = [
  ...TECHNICIAN_DASHBOARD_CAPABILITIES,
  ...TECHNICIAN_JOBS_CAPABILITIES,
  ...TECHNICIAN_SCHEDULE_CAPABILITIES,
  ...TECHNICIAN_NAVIGATION_CAPABILITIES,
  ...TECHNICIAN_CHECKLIST_CAPABILITIES,
  ...TECHNICIAN_MESSAGES_CAPABILITIES,
  ...TECHNICIAN_HISTORY_CAPABILITIES,
  ...TECHNICIAN_PROFILE_CAPABILITIES
];

export const ADMIN_WORKSPACE_ROLES = ['superadmin', 'admin'];
export const ADMIN_SCOPED_ROLES = [...ADMIN_WORKSPACE_ROLES];
export const DELEGATED_AUTHORITY_ROLES = ['admin'];

const getRoleValue = (roleOrUser) =>
  (typeof roleOrUser === 'string' ? roleOrUser : roleOrUser?.role) || '';

export const hasCapability = (user, capability) => {
  if (user?.role === 'superadmin') return true;
  return Array.isArray(user?.capabilities) && user.capabilities.includes(capability);
};

export const hasAnyCapability = (user, capabilities = []) =>
  capabilities.some((capability) => hasCapability(user, capability));

export const hasRoleCapability = (user, role, capabilities = []) =>
  user?.role === role && hasAnyCapability(user, capabilities);

export const canAccessAfterSalesFeatures = (user) =>
  (user?.role === 'superadmin' || user?.role === 'admin') && hasAnyCapability(user, AFTER_SALES_NAV_CAPABILITIES);

export const canAccessSupervisorFeatures = (user) =>
  (user?.role === 'superadmin' || user?.role === 'admin') && hasAnyCapability(user, [
    ...SUPERVISOR_DASHBOARD_CAPABILITIES,
    ...SUPERVISOR_TICKETS_CAPABILITIES,
    ...SUPERVISOR_DISPATCH_CAPABILITIES,
    ...SUPERVISOR_TRACKING_CAPABILITIES,
    ...SUPERVISOR_USER_ACCESS_CAPABILITIES
  ]);

export const canAccessTechnicianWorkspace = (user) =>
  hasRoleCapability(user, 'technician', TECHNICIAN_ACCESS_CAPABILITIES);

export const canAccessAdminWorkspace = (user) =>
  ADMIN_WORKSPACE_ROLES.includes(user?.role);

export const isAdminScopedRole = (roleOrUser) =>
  ADMIN_SCOPED_ROLES.includes(getRoleValue(roleOrUser));

export const canReceiveDelegatedAuthority = (roleOrUser) =>
  DELEGATED_AUTHORITY_ROLES.includes(getRoleValue(roleOrUser));

export const isSuperadmin = (user) =>
  user?.role === 'superadmin';

export const canViewAdminUserDirectory = (user) =>
  isSuperadmin(user) || (user?.role === 'admin' && hasAnyCapability(user, USER_DIRECTORY_CAPABILITIES));

export const canManageStaffAccess = (user) =>
  isSuperadmin(user);

export const canManageStaffTargetRole = (roleOrUser) =>
  getRoleValue(roleOrUser) === 'admin';
