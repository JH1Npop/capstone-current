import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  FiActivity,
  FiBell,
  FiCalendar,
  FiClipboard,
  FiFileText,
  FiGlobe,
  FiHome,
  FiLayers,
  FiMap,
  FiMessageSquare,
  FiPackage,
  FiRefreshCw,
  FiSettings,
  FiSun,
    FiTool,
    FiTrendingUp,
  FiUser,
  FiUsers
} from 'react-icons/fi';
import { fetchDashboardStats } from '../../api/api';
import ConfirmationDialog from '../shared/ConfirmationDialog';
import {
  ADMIN_JOB_HISTORY_CAPABILITIES,
  COMMUNICATIONS_STAFF_VIEW_CAPABILITIES,
  COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES,
  INVENTORY_VIEW_CAPABILITIES,
  DOCUMENTS_VIEW_CAPABILITIES,
  ANALYTICS_VIEW_CAPABILITIES,
  REPORTS_VIEW_CAPABILITIES,
  AUDIT_VIEW_CAPABILITIES,
  SERVICE_CATALOG_VIEW_CAPABILITIES,
  SYSTEM_SETTINGS_VIEW_CAPABILITIES,
  PUBLIC_SITE_VIEW_CAPABILITIES,
  AFTER_SALES_CASE_CAPABILITIES,
  AFTER_SALES_DASHBOARD_CAPABILITIES,
  SUPERVISOR_DASHBOARD_CAPABILITIES,
  SUPERVISOR_TICKETS_CAPABILITIES,
  SUPERVISOR_DISPATCH_CAPABILITIES,
  SUPERVISOR_TRACKING_CAPABILITIES,
  TECHNICIAN_CHECKLIST_CAPABILITIES,
  TECHNICIAN_DASHBOARD_CAPABILITIES,
  TECHNICIAN_JOBS_CAPABILITIES,
  TECHNICIAN_MESSAGES_CAPABILITIES,
  TECHNICIAN_NAVIGATION_CAPABILITIES,
  TECHNICIAN_PROFILE_CAPABILITIES,
  TECHNICIAN_SCHEDULE_CAPABILITIES,
  canAccessAfterSalesFeatures,
  canViewAdminUserDirectory,
  hasAnyCapability
} from '../../rbac';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';

/* ─── Menu builders (unchanged logic, same as before) ─── */

const getAfterSalesItems = (stats, user) => {
  const canViewDashboard = hasAnyCapability(user, AFTER_SALES_DASHBOARD_CAPABILITIES);
  const canViewCases = hasAnyCapability(user, AFTER_SALES_CASE_CAPABILITIES);

  const items = [];

  if (canViewDashboard || canViewCases) {
    items.push({
      label: 'After-Sales Cases',
      path: '/admin/after-sales-cases',
      icon: FiHome
    });
  }

  return items;
};


const getAdminMenu = (user, afterSalesItems) => {
  const canViewJobHistory = hasAnyCapability(user, ADMIN_JOB_HISTORY_CAPABILITIES);
  const canViewInventory = hasAnyCapability(user, INVENTORY_VIEW_CAPABILITIES);
  const canViewDocuments = hasAnyCapability(user, DOCUMENTS_VIEW_CAPABILITIES);
  const canViewServices = hasAnyCapability(user, SERVICE_CATALOG_VIEW_CAPABILITIES);
  const canViewDashboard = hasAnyCapability(user, SUPERVISOR_DASHBOARD_CAPABILITIES);
  const canViewAnalytics = hasAnyCapability(user, ANALYTICS_VIEW_CAPABILITIES);
  const canViewReports = hasAnyCapability(user, REPORTS_VIEW_CAPABILITIES);
  const canViewAudit = hasAnyCapability(user, AUDIT_VIEW_CAPABILITIES);
  const canViewTickets = hasAnyCapability(user, SUPERVISOR_TICKETS_CAPABILITIES);
  const canViewDispatch = hasAnyCapability(user, SUPERVISOR_DISPATCH_CAPABILITIES);
  const canViewTracking = hasAnyCapability(user, SUPERVISOR_TRACKING_CAPABILITIES);
  const canViewStaffMessages = hasAnyCapability(user, COMMUNICATIONS_STAFF_VIEW_CAPABILITIES);
  const canViewClientSupport = hasAnyCapability(user, COMMUNICATIONS_SUPPORT_VIEW_CAPABILITIES);
  const canViewSystemSettings = hasAnyCapability(user, SYSTEM_SETTINGS_VIEW_CAPABILITIES);

  const overviewItems = [
    canViewDashboard ? { label: 'Dashboard', path: '/admin/dashboard', icon: FiHome } : null,
    canViewAnalytics ? { label: 'Analytics', path: '/admin/analytics', icon: FiTrendingUp } : null,
    canViewReports ? { label: 'Reports', path: '/admin/reports', icon: FiFileText } : null
  ].filter(Boolean);
  const serviceOperationsItems = [
    canViewDispatch ? { label: 'Calendar', path: '/admin/calendar', icon: FiCalendar } : null,
    canViewTickets ? { label: 'Service Tickets', path: '/admin/service-tickets', icon: FiClipboard } : null,
    canViewDispatch ? { label: 'Dispatch Board', path: '/admin/dispatch-board', icon: FiLayers } : null,
    canViewTracking ? { label: 'Technician Tracking', path: '/admin/technician-tracking', icon: FiMap } : null,
    canViewTracking ? { label: 'Coverage Heatmap', path: '/admin/coverage-heatmap', icon: FiTrendingUp } : null,
    canViewJobHistory ? { label: 'Job History', path: '/admin/job-history', icon: FiFileText } : null
  ].filter(Boolean);
  const serviceSetupItems = [
    canViewServices ? { label: 'Services', path: '/admin/services', icon: FiTool } : null,
    canViewInventory ? { label: 'Inventory', path: '/admin/inventory', icon: FiPackage } : null,
    canViewDocuments ? { label: 'Documents', path: '/admin/documents', icon: FiFileText } : null,
    canViewDocuments ? { label: 'Sales Records', path: '/admin/sales-records', icon: FiFileText } : null
  ].filter(Boolean);
  const communicationItems = [];
  if (canViewStaffMessages) communicationItems.push({ label: 'Messages', path: '/admin/messages', icon: FiMessageSquare });
  if (canViewClientSupport) communicationItems.push({ label: 'Client Support', path: '/admin/client-support', icon: FiMessageSquare });
  communicationItems.push({ label: 'Notifications', path: '/admin/notifications', icon: FiBell });
  const adminControlItems = [];
  const canViewDirectory = canViewAdminUserDirectory(user);
  const canViewLandingPage = hasAnyCapability(user, PUBLIC_SITE_VIEW_CAPABILITIES);
  if (canViewDirectory) {
    adminControlItems.push({
      label: 'User Management',
      path: '/admin/user-management',
      icon: FiUsers
    });
  }
  adminControlItems.push(
    canViewLandingPage ? { label: 'Landing Page', path: '/admin/landing-page', icon: FiGlobe } : null,
    canViewAudit ? { label: 'Activity Logs', path: '/admin/activity-logs', icon: FiActivity } : null,
    canViewSystemSettings ? { label: 'Settings', path: '/admin/settings', icon: FiSettings } : null,
    { label: 'Profile', path: '/admin/profile', icon: FiUser }
  );
  const visibleAdminControlItems = adminControlItems.filter(Boolean);

  const sections = [
      { title: 'Overview', items: overviewItems },
      { title: 'Service Operations', items: serviceOperationsItems },
      { title: 'Service Setup', items: serviceSetupItems },
      ...(afterSalesItems.length > 0 ? [{ title: 'After-Sales', items: afterSalesItems }] : []),
      ...(communicationItems.length > 0 ? [{ title: 'Communication', items: communicationItems }] : []),
      { title: 'Admin Controls', items: visibleAdminControlItems }
    ].filter((section) => section.items.length > 0);

  return {
    label: 'Admin',
    description:
      user.role === 'superadmin'
        ? 'Same operations hub as admins, plus full user and access control.'
        : 'Run day-to-day service operations and keep tickets moving.',
    sections
  };
};

const getTechnicianMenu = (user) => {
  const homeItems = [];
  const workItems = [];
  const communicationItems = [];
  const accountItems = [];

  if (hasAnyCapability(user, TECHNICIAN_DASHBOARD_CAPABILITIES)) homeItems.push({ label: 'Dashboard', path: '/technician/dashboard', icon: FiHome });
  if (hasAnyCapability(user, TECHNICIAN_JOBS_CAPABILITIES)) workItems.push({ label: 'Jobs', path: '/technician/my-jobs', icon: FiClipboard });
  if (hasAnyCapability(user, TECHNICIAN_SCHEDULE_CAPABILITIES)) workItems.push({ label: 'Schedule', path: '/technician/schedule', icon: FiCalendar });
  if (hasAnyCapability(user, TECHNICIAN_NAVIGATION_CAPABILITIES)) workItems.push({ label: 'Navigation', path: '/technician/map-navigation', icon: FiMap });
  if (hasAnyCapability(user, TECHNICIAN_CHECKLIST_CAPABILITIES)) workItems.push({ label: 'Checklist', path: '/technician/checklist', icon: FiClipboard });
  if (hasAnyCapability(user, TECHNICIAN_MESSAGES_CAPABILITIES)) communicationItems.push({ label: 'Messages', path: '/technician/messages', icon: FiMessageSquare });
  communicationItems.push({ label: 'Notifications', path: '/technician/notifications', icon: FiBell });
  if (hasAnyCapability(user, TECHNICIAN_PROFILE_CAPABILITIES)) accountItems.push({ label: 'Profile', path: '/technician/profile', icon: FiSettings });

  return {
    label: '',
    description: "Today's jobs, routes, and updates at a glance.",
    sections: [
      { title: 'Home', items: homeItems },
      { title: 'My Work', items: workItems },
      { title: 'Communication', items: communicationItems },
      { title: 'Account', items: accountItems }
    ].filter((section) => section.items.length > 0)
  };
};

const roleMenu = {
  client: {
    label: 'Client',
    description: 'Request service, track progress, and stay informed.',
    sections: [
      { title: 'Home', items: [{ label: 'Dashboard', path: '/client/dashboard', icon: FiHome }] },
      {
        title: 'Service',
        items: [
          { label: 'New Request', path: '/client/service-requests', icon: FiClipboard },
          { label: 'Solar Estimates', path: '/client/solar-estimates', icon: FiSun },
          { label: 'My Requests', path: '/client/requests', icon: FiClipboard },
          { label: 'Service History', path: '/client/service-history', icon: FiFileText },
          { label: 'Purchase Records', path: '/client/purchase-records', icon: FiPackage },
          { label: 'Client Support', path: '/client/support', icon: FiMessageSquare }
        ]
      },
      {
        title: 'Account',
        items: [
          { label: 'Notifications', path: '/client/notifications', icon: FiBell },
          { label: 'Profile', path: '/client/profile', icon: FiSettings }
        ]
      }
    ]
  }
};

/* ─── Badge color mapping ─── */
const badgeColors = {
  sky:     'bg-sky-400/20 text-sky-300',
  rose:    'bg-rose-400/20 text-rose-300',
  red:     'bg-red-500/25 text-red-100',
  emerald: 'bg-emerald-400/20 text-emerald-300',
  amber:   'bg-amber-400/20 text-amber-300',
  orange:  'bg-orange-400/20 text-orange-300',
  violet:  'bg-violet-400/20 text-violet-300',
  slate:   'bg-slate-400/20 text-slate-300',
};

let cachedAfterSalesStats = null;
let cachedAfterSalesStatsAt = 0;
const AFTER_SALES_STATS_TTL_MS = 60000;

const normalizeText = (value) => String(value || '').toLowerCase();

const notificationText = (notification) => normalizeText([
  notification?.title,
  notification?.message,
  notification?.type
].filter(Boolean).join(' '));

const routeForUnreadNotification = (notification, role) => {
  const text = notificationText(notification);

  if (role === 'client') {
    if (text.includes('completed')) return '/client/service-history';
    if (text.includes('support')) return '/client/support';
    return '/client/requests';
  }

  if (role === 'technician') {
    if (text.includes('message')) return '/technician/messages';
    if (text.includes('rescheduled') || text.includes('schedule')) return '/technician/schedule';
    return '/technician/my-jobs';
  }

  if (role === 'admin' || role === 'superadmin') {
    if (text.includes('message')) return '/admin/messages';
    if (text.includes('support')) return '/admin/client-support';
    if (text.includes('completed') || text.includes('job completed')) return '/admin/job-history';
    if (
      text.includes('dispatch') ||
      text.includes('assignment') ||
      text.includes('assign technician') ||
      text.includes('ready for service') ||
      text.includes('ready for assignment')
    ) {
      return '/admin/dispatch-board';
    }
    if (
      text.includes('pending review') ||
      text.includes('new service request') ||
      text.includes('reschedule') ||
      text.includes('equipment') ||
      text.includes('awaiting materials') ||
      text.includes('status updated') ||
      text.includes('in progress')
    ) {
      return '/admin/service-tickets';
    }
  }

  return null;
};

const notificationPathForRole = (role) => {
  if (role === 'client') return '/client/notifications';
  if (role === 'technician') return '/technician/notifications';
  if (role === 'admin' || role === 'superadmin') return '/admin/notifications';
  return null;
};

const buildUnreadBadges = (notifications, role, unreadCount = 0) => {
  const counts = {};
  const notificationsPath = notificationPathForRole(role);
  if (notificationsPath && unreadCount > 0) counts[notificationsPath] = unreadCount;
  (notifications || [])
    .filter((notification) => notification?.status === 'unread')
    .forEach((notification) => {
      const path = routeForUnreadNotification(notification, role);
      if (!path) return;
      counts[path] = (counts[path] || 0) + 1;
    });
  return counts;
};

const withUnreadBadges = (menu, unreadBadges) => ({
  ...menu,
  sections: menu.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const count = unreadBadges[item.path] || 0;
      if (!count) return item;
      return {
        ...item,
        badge: count > 99 ? '99+' : count,
        badgeTone: 'red',
      };
    }),
  })),
});

/* ─── Component ─── */

export default function Sidebar({ user, isOpen, onClose, collapsed = false, animate = false }) {
  const { logout } = useAuth();
  const {
    notifications,
    unreadCount,
    markAllNotificationsRead,
    markNotificationsRead,
  } = useNotifications();
  const navRef = useRef(null);
  const logoutButtonRef = useRef(null);
  const location = useLocation();
  const [afterSalesStats, setAfterSalesStats] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const role = user?.role;
  const afterSalesItems = canAccessAfterSalesFeatures(user) ? getAfterSalesItems(afterSalesStats, user) : [];
  const shouldLoadAfterSalesStats =
    canAccessAfterSalesFeatures(user) && hasAnyCapability(user, AFTER_SALES_DASHBOARD_CAPABILITIES);

  const closeLogoutConfirm = () => {
    if (logoutPending) return;
    setShowLogoutConfirm(false);
    window.requestAnimationFrame(() => logoutButtonRef.current?.focus());
  };

  const confirmLogout = async () => {
    setLogoutPending(true);
    try {
      await logout();
    } finally {
      setLogoutPending(false);
      setShowLogoutConfirm(false);
    }
  };

  useEffect(() => {
  const savedPosition = sessionStorage.getItem(
    'sidebarScrollPosition'
  );

  if (navRef.current && savedPosition) {
    navRef.current.scrollTop = Number(savedPosition);
  }
}, [location.pathname]);

  useEffect(() => {
    let isMounted = true;

    if (!shouldLoadAfterSalesStats) {
      setAfterSalesStats(null);
      return () => { isMounted = false; };
    }

    const now = Date.now();
    if (cachedAfterSalesStats && now - cachedAfterSalesStatsAt < AFTER_SALES_STATS_TTL_MS) {
      setAfterSalesStats(cachedAfterSalesStats);
      return () => { isMounted = false; };
    }

    fetchDashboardStats('admin')
      .then((data) => {
        cachedAfterSalesStats = data;
        cachedAfterSalesStatsAt = Date.now();
        if (isMounted) setAfterSalesStats(data);
      })
      .catch(() => { if (isMounted) setAfterSalesStats(null); });

    return () => { isMounted = false; };
  }, [shouldLoadAfterSalesStats]);

  if (!role) return null;

  const menu = role === 'admin' || role === 'superadmin'
    ? getAdminMenu(user, afterSalesItems)
    : role === 'technician'
      ? getTechnicianMenu(user)
      : roleMenu[role];

  if (!menu) return null;

  const displayMenu = withUnreadBadges(menu, buildUnreadBadges(notifications, role, unreadCount));

  const clearUnreadBadgeForPath = (path) => {
    if (path === notificationPathForRole(role)) {
      if (unreadCount > 0) {
        void markAllNotificationsRead().catch(() => {});
      }
      return;
    }

    const notificationIds = notifications
      .filter((notification) => (
        notification?.status === 'unread' &&
        routeForUnreadNotification(notification, role) === path
      ))
      .map((notification) => notification.id);

    if (notificationIds.length > 0) {
      void markNotificationsRead(notificationIds);
    }
  };

  const isItemActive = (item) => {
    const [pathWithSearch, hashFragment = ''] = item.path.split('#');
    const [pathname, searchFragment = ''] = pathWithSearch.split('?');

    if (searchFragment || hashFragment) {
      const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search;
      const currentHash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
      return location.pathname === pathname && currentSearch === searchFragment && currentHash === hashFragment;
    }

    return location.pathname === pathname;
  };

  const displayName = user?.first_name?.trim() || user?.username || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-20 bg-slate-950/40 backdrop-blur-sm transition-opacity lg:hidden ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => {
          sessionStorage.setItem(
            'sidebarScrollPosition',
            navRef.current?.scrollTop || 0
          );

          onClose?.();
        }}
      />

      {/* Sidebar */}
      {/* Sidebar */}
<aside
  className={`fixed top-0 left-0 z-40 flex h-screen w-[min(17rem,calc(100vw-2rem))] flex-col border-r border-brand-800/40 bg-brand-900 transition-transform duration-300 ease-in-out ${animate ? 'lg:transition-[transform,width]' : 'lg:transition-transform'} ${collapsed ? 'lg:w-14' : 'lg:w-64'} ${
    isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
  }`}
>
  {/* Logo area */}
  <div className={`shrink-0 px-4 pb-4 pt-5 ${collapsed ? 'lg:px-2 lg:pb-3 lg:pt-4' : ''}`}>
    <div className="flex items-start justify-center">
      <img
        src="/logo.png"
        alt="AFN Solar Power Engineering Services"
        className={`h-auto ${animate ? 'transition-all duration-300' : ''} ${collapsed ? 'lg:w-8' : 'w-[92px]'}`}
      />

      <button
        className="absolute right-4 top-4 rounded-lg p-1.5 text-brand-100 transition hover:bg-white/10 hover:text-white lg:hidden"
        onClick={() => {
          sessionStorage.setItem(
            'sidebarScrollPosition',
            navRef.current?.scrollTop || 0
          );

          onClose?.();
        }}
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </div>

  {/* Scrollable Navigation */}
  <nav ref={navRef} className={`flex-1 min-h-0 overflow-y-auto px-3 py-1 ${collapsed ? 'lg:px-1.5' : ''}`}
>
    <div className="space-y-3 pb-3">
      {displayMenu.sections.map((section) => (
        <div key={section.title}>
          <div className={`mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-200/70 ${collapsed ? 'lg:sr-only' : ''}`}>
            {section.title}
          </div>

          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const itemIsActive = isItemActive(item) && !item.disabled;

              if (item.disabled) {
                return (
                  <div
                    key={item.path}
                    title={item.title || ''}
                    className={`flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-slate-300 ${collapsed ? 'lg:justify-center lg:px-1.5' : ''}`}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span className={`min-w-0 truncate ${collapsed ? 'lg:sr-only' : ''}`}>
                      {item.label}
                    </span>
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => {
                    sessionStorage.setItem(
                      'sidebarScrollPosition',
                      navRef.current?.scrollTop || 0
                    );

                    clearUnreadBadgeForPath(item.path);
                    onClose?.();
                  }}
                  title={item.label}
                  className={() =>
                    `group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${collapsed ? 'lg:justify-center lg:px-1.5' : ''} ${
                      itemIsActive
                        ? 'bg-white/12 text-white'
                        : 'text-brand-100/70 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  {itemIsActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-300" />
                  )}

                  <span className="relative grid h-[18px] w-[18px] shrink-0 place-items-center">
                    <Icon
                      size={15}
                      className={`transition-colors duration-200 ${
                        itemIsActive
                          ? 'text-brand-200'
                          : 'text-brand-100/60 group-hover:text-brand-100'
                      }`}
                    />
                  </span>

                  <span className={`min-w-0 truncate ${collapsed ? 'lg:sr-only' : ''}`}>
                    {item.label}
                  </span>

                  {item.badge !== undefined &&
                    item.badge !== null && (
                      <span
                        className={`${collapsed ? 'lg:absolute lg:right-1 lg:top-0 lg:min-w-[16px] lg:px-1 lg:text-[9px]' : 'ml-auto'} inline-flex min-w-[22px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          itemIsActive && item.badgeTone === 'red'
                            ? 'bg-red-500 text-white'
                            : itemIsActive
                            ? 'bg-brand-300/20 text-brand-100'
                            : badgeColors[item.badgeTone] ||
                              'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </nav>

  {/* Fixed Bottom User Section */}
  <div className={`shrink-0 border-t border-white/10 bg-brand-800 px-4 py-3 ${collapsed ? 'lg:px-1.5 lg:py-2.5' : ''}`}>
    <div className={`flex items-center gap-2.5 ${collapsed ? 'lg:justify-center' : ''}`}>
      {user?.profile_image_url ? (
        <img
          src={user.profile_image_url}
          alt=""
          className={`shrink-0 rounded-full object-cover ${collapsed ? 'h-7 w-7' : 'h-8 w-8'}`}
        />
      ) : (
        <img
          src="/user-icon.png"
          alt=""
          className={`shrink-0 rounded-full ${collapsed ? 'h-7 w-7' : 'h-8 w-8'}`}
        />
      )}

      <div className={`min-w-0 flex-1 ${collapsed ? 'lg:sr-only' : ''}`}>
        <p className="truncate text-[12px] font-medium text-white">
          {displayName}
        </p>
        <p className="truncate text-[10px] uppercase text-brand-100/75">
          {role}
        </p>
      </div>
    </div>

    <button
      ref={logoutButtonRef}
      type="button"
      onClick={() => setShowLogoutConfirm(true)}
      className={`mt-2.5 w-full rounded-[8px] bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white ring-1 ring-white/10 transition hover:bg-white/15 ${collapsed ? 'lg:px-2 lg:text-[0px]' : ''}`}
      title={collapsed ? 'Logout' : undefined}
      aria-haspopup="dialog"
      aria-expanded={showLogoutConfirm}
    >
      <span className={collapsed ? 'lg:sr-only' : ''}>Logout</span>
      <span className={`hidden text-[11px] ${collapsed ? 'lg:inline' : ''}`}>Out</span>
    </button>
  </div>
</aside>
      {showLogoutConfirm ? (
        <ConfirmationDialog
          title="Log out?"
          message="You'll need to sign in again to access your account."
          tone="danger"
          icon="warning"
          confirmLabel="Log out"
          loading={logoutPending}
          onConfirm={confirmLogout}
          onCancel={closeLogoutConfirm}
        />
      ) : null}
    </>
  );
}
