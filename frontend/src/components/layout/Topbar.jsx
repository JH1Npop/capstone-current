import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  FiAlertCircle,
  FiBell,
  FiDownload,
  FiMenu
} from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import usePwaInstallPrompt from '../../hooks/usePwaInstallPrompt';
const routeMeta = [
  { prefix: '/admin/dashboard', section: 'Home', title: 'Dashboard', subtitle: '' },
  { prefix: '/admin/calendar', section: 'Operations', title: 'Service Calendar', subtitle: '' },
  { prefix: '/admin/service-tickets', section: 'Operations', title: 'Service Tickets', subtitle: '' },
  { prefix: '/admin/dispatch-board', section: 'Operations', title: 'Dispatch Board', subtitle: '' },
  { prefix: '/admin/analytics', section: 'Home', title: 'Analytics', subtitle: '' },
  { prefix: '/admin/operations-report', section: 'Operations', title: 'Operations Report', subtitle: '' },
  { prefix: '/admin/reports', section: 'Home', title: 'Reports', subtitle: '' },
  { prefix: '/admin/technician-tracking', section: 'Operations', title: 'Technician Tracking', subtitle: '' },
  { prefix: '/admin/coverage-heatmap', section: 'Operations', title: 'Coverage Heatmap', subtitle: '' },
  { prefix: '/admin/services', section: 'Operations', title: 'Services', subtitle: '' },
  { prefix: '/admin/documents', section: 'Operations', title: 'Documents', subtitle: '' },
  { prefix: '/admin/sales-records', section: 'Operations', title: 'Sales Records', subtitle: '' },
  { prefix: '/admin/inventory', section: 'Operations', title: 'Inventory' },
  { prefix: '/admin/user-management', section: 'People', title: 'User Management', subtitle: '' },
  { prefix: '/admin/activity-logs', section: 'Setup', title: 'Activity Logs', subtitle: '' },
  { prefix: '/admin/settings', section: 'Setup', title: 'Settings', subtitle: '' },
  { prefix: '/admin/landing-page', section: 'Setup', title: 'Landing Page Editor', subtitle: '' },
  { prefix: '/admin/profile', section: 'Account', title: 'Profile', subtitle: '' },
  { prefix: '/admin/notifications', section: 'Communication', title: 'Notifications', subtitle: '' },
  { prefix: '/admin/messages', section: 'Communication', title: 'Messages', subtitle: '' },
  { prefix: '/admin/client-support', section: 'Communication', title: 'Client Support', subtitle: '' },
  { prefix: '/admin/job-history', section: 'Operations', title: 'Job History', subtitle: '' },
  { prefix: '/admin/after-sales-cases', section: 'After Sales', title: 'After-Sales Follow-Ups', subtitle: '' },
  { prefix: '/technician/dashboard', section: 'Home', title: 'Dashboard', subtitle: '' },
  { prefix: '/technician/my-jobs', section: 'My Work', title: 'Jobs', subtitle: '' },
  { prefix: '/technician/schedule', section: 'My Work', title: 'Schedule', subtitle: '' },
  { prefix: '/technician/map-navigation', section: 'My Work', title: 'Navigation', subtitle: '' },
  { prefix: '/technician/checklist', section: 'My Work', title: 'Checklist', subtitle: '' },
  { prefix: '/technician/notifications', section: 'Communication', title: 'Notifications', subtitle: '' },
  { prefix: '/technician/messages', section: 'Communication', title: 'Messages', subtitle: '' },
  { prefix: '/technician/job-history', section: 'My Work', title: 'History', subtitle: '' },
  { prefix: '/technician/profile', section: 'Account', title: 'Profile', subtitle: '' },
  { prefix: '/client/dashboard', section: 'Home', title: 'Dashboard', subtitle: '' },
  { prefix: '/client/service-requests', section: 'Service', title: 'New Request', subtitle: '' },
  { prefix: '/client/solar-estimates', section: 'Service', title: 'Solar Estimates', subtitle: '' },
  { prefix: '/client/requests', section: 'Service', title: 'My Requests', subtitle: '' },
  { prefix: '/client/service-history', section: 'Service', title: 'Service History', subtitle: '' },
  { prefix: '/client/purchase-records', section: 'Service', title: 'Purchase Records', subtitle: '' },
  { prefix: '/client/support', section: 'Service', title: 'Client Support', subtitle: '' },
  { prefix: '/client/notifications', section: 'Account', title: 'Notifications', subtitle: '' },
  { prefix: '/client/profile', section: 'Account', title: 'Profile', subtitle: 'Manage your contact details and account.' }
];

const getRoleMeta = (workspaceRole) => {
  switch (workspaceRole) {
    case 'superadmin':
    case 'admin':
      return {
        workspace: 'Admin',
        notificationsTarget: { label: 'Open notifications', path: '/admin/notifications' }
      };
    case 'technician':
      return {
        workspace: 'Technician',
        notificationsTarget: { label: 'Open notifications', path: '/technician/notifications' }
      };
    case 'client':
      return { workspace: 'Client', notificationsTarget: { label: 'Open notifications', path: '/client/notifications' } };
    default:
      return null;
  }
};

const getWorkspaceRole = (pathname, fallbackRole) => {
  if (pathname.startsWith('/technician/')) return 'technician';
  return fallbackRole;
};

const formatNotificationTime = (value) => {
  if (!value) return 'Just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Just now';
  return parsed.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function Topbar({
  toggleSidebar,
  toggleSidebarCollapsed,
  sidebarCollapsed = false,
  canCollapseSidebar = false
}) {
  const { user, logout } = useAuth();
  const {
    notifications: allNotifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const notificationPanelRef = useRef(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { canInstall, install } = usePwaInstallPrompt();

  const activeRoute = useMemo(
    () => routeMeta.find((item) => location.pathname.startsWith(item.prefix)),
    [location.pathname]
  );
  
  const activeRole = getRoleMeta(getWorkspaceRole(location.pathname, user?.role));
  const notificationsTarget = activeRole?.notificationsTarget || null;
  const displayName = user?.first_name?.trim() || user?.username || user?.email || 'Team member';
  const initials = (displayName || 'U').slice(0, 2).toUpperCase();
  const notifications = allNotifications.slice(0, 5);

  useEffect(() => { setNotificationsOpen(false); }, [location.pathname, location.search]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!notificationPanelRef.current?.contains(event.target)) setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleNotificationClick = async (notification) => {
    if (notification?.status === 'unread') {
      try {
        await markNotificationRead(notification.id);
      } catch { /* keep usable */ }
    }
    if (notificationsTarget?.path) navigate(notificationsTarget.path);
    setNotificationsOpen(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
    } catch { /* ignore */ }
  };

  return (
    <header className="sticky top-0 z-20 bg-transparent px-2 py-2 sm:px-5 lg:px-6">
      <div className="rounded-[14px] px-2 py-2 sm:px-5 sm:py-3 lg:px-6">
        <div className="flex items-start justify-between gap-3">
        {/* Left: hamburger + breadcrumb */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={() => {
              if (canCollapseSidebar && window.matchMedia('(min-width: 1024px)').matches) {
                toggleSidebarCollapsed?.();
                return;
              }
              toggleSidebar?.();
            }}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-brand-50 hover:text-brand-700"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <FiMenu size={18} />
          </button>

         <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-600 sm:text-[11px] sm:tracking-[0.22em]">
              {activeRoute?.section || activeRole?.workspace || 'Portal'}
            </p>

            <h1 className="mt-1 truncate text-[20px] font-bold leading-tight text-slate-950 sm:text-[28px]">
              {activeRoute?.title || 'AFN SERVE'}
            </h1>

            {activeRoute?.subtitle && (
              <p className="mt-1 hidden text-sm text-slate-500 sm:block">
                {activeRoute.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-2">
          {canInstall && (
            <button
              type="button"
              onClick={install}
              className="hidden h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-brand-50 hover:text-brand-700 sm:inline-flex"
            >
              <FiDownload size={16} />
              Install
            </button>
          )}
          {/* Notification bell */}
          <div className="relative" ref={notificationPanelRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((c) => !c)}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-[12px] border border-slate-200 bg-white text-slate-600 transition hover:bg-brand-50 hover:text-brand-700 sm:h-auto sm:w-auto sm:px-3 sm:py-2.5"
              aria-label="Open notifications"
            >
              <FiBell size={17} />
              {unreadCount > 0 && (
                <>
                  <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                  <span className="absolute -right-1 -top-1 h-[18px] min-w-[18px] animate-ping rounded-full bg-red-400 opacity-40" />
                </>
              )}
            </button>

            {/* Notification dropdown */}
            {notificationsOpen && (
              <div className="fixed left-3 right-3 top-20 z-30 overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-elevated animate-fade-in sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[min(22rem,calc(100vw-2rem))]">
                <div className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                    <p className="text-[12px] text-slate-500">{unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'}</p>
                  </div>
                  {unreadCount > 0 && (
                    <button type="button" onClick={handleMarkAllRead} className="text-[12px] font-medium text-red-600 hover:text-red-700">
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-[22rem] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">No recent notifications.</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`block w-full border-b border-surface-200/60 px-4 py-3 text-left transition hover:bg-surface-50 ${
                          n.status === 'unread' ? 'bg-red-50/50' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${
                            n.status === 'unread' ? 'bg-red-500' : 'bg-slate-300'
                          }`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold text-slate-800">{n.title || 'Notification'}</p>
                              {n.status === 'unread' && <FiAlertCircle className="mt-0.5 shrink-0 text-red-500" size={14} />}
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-[13px] text-slate-600">{n.message}</p>
                            <p className="mt-1.5 text-[11px] text-slate-400">{formatNotificationTime(n.created_at)}</p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {notificationsTarget?.path && (
                  <div className="border-t border-surface-200 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => { navigate(notificationsTarget.path); setNotificationsOpen(false); }}
                      className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600"
                    >
                      {notificationsTarget.label}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </header>
  );
}
