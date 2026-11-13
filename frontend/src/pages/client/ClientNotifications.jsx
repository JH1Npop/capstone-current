import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState, ErrorState } from '../../components/ui/StateDisplay';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { FiAlertCircle, FiBell, FiCheckCircle, FiInfo, FiTrash2 } from 'react-icons/fi';
import { api } from '../../api/api';
import { useNavigate } from 'react-router-dom';
import { getNotificationDestination } from '../../utils/notificationNavigation';

const ITEMS_PER_PAGE = 10;

// Every server type belongs to one tab: assignments, status changes, reminders and messages are "Updates".
const categoryOf = (type) => {
  if (['success', 'task_completed'].includes(type)) return 'success';
  if (['warning', 'urgent', 'error'].includes(type)) return 'warning';
  return 'info';
};

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// "Today, 12:01 PM", "Yesterday, 3:15 PM", "Mon, Nov 3, 3:15 PM" or "Jun 18, 2025, 3:15 PM".
const formatWhen = (value) => {
  const date = toDate(value);
  if (!date) return '';
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startOf = (day) => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const ago = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  if (ago === 0) return `Today, ${time}`;
  if (ago === 1) return `Yesterday, ${time}`;
  const day = date.getFullYear() === new Date().getFullYear()
    ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${day}, ${time}`;
};
const formatFullDateTime = (value) => toDate(value)?.toLocaleString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) || '';
const announceNotificationsUpdated = () => window.dispatchEvent(new Event('afn:notifications-updated'));

const extractNotifications = (data) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data?.results)) {
    return data.results;
  }
  if (Array.isArray(data?.notifications)) {
    return data.notifications;
  }
  return [];
};

export default function ClientNotifications() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  // One page of the chosen tab, loaded from the server (accounts collect thousands of notices over the years).
  const [notifications, setNotifications] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [allCount, setAllCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);
  // One delete per notification at a time: a double tap must not fail with "not found".
  const [deletingIds, setDeletingIds] = useState(() => new Set());
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  // Errors from actions (mark read, delete) are a short message, not the full-page load error.
  const [actionError, setActionError] = useState('');
  const [deleteAllError, setDeleteAllError] = useState('');
  const [notice, setNotice] = useState('');
  // The shell's live unread count (pushed by the server) refreshes this list too.
  const { unreadCount: liveUnreadCount } = useNotifications();
  const lastLiveCount = useRef(null);
  const loadVersion = useRef(0);

  const tabParams = (tab) => {
    if (tab === 'unread') return { status: 'unread' };
    if (['success', 'warning', 'info'].includes(tab)) return { category: tab };
    return {};
  };

  const loadNotifications = async ({ silent = false } = {}) => {
    const version = ++loadVersion.current;
    if (!silent) setLoading(true);
    try {
      const [pageResponse, unreadResponse, allResponse] = await Promise.all([
        api.get('/notifications/', { params: { page: currentPage, ...tabParams(filter) } }),
        api.get('/notifications/unread_count/'),
        // The "Delete all" button needs to know whether any notice exists outside this tab.
        filter === 'all' ? Promise.resolve(null) : api.get('/notifications/'),
      ]);
      if (version !== loadVersion.current) return;
      const rows = extractNotifications(pageResponse.data);
      const count = Number.isFinite(pageResponse.data?.count) ? pageResponse.data.count : rows.length;
      setNotifications(rows);
      setTotalCount(count);
      setAllCount(allResponse ? (allResponse.data?.count ?? extractNotifications(allResponse.data).length) : count);
      setUnreadCount(Number(unreadResponse.data?.unread_count) || 0);
      setError('');
    } catch (loadError) {
      if (version !== loadVersion.current) return;
      // The page no longer exists (notices were deleted elsewhere): show the page before it.
      if (loadError?.response?.status === 404 && currentPage > 1) {
        setCurrentPage((page) => Math.max(1, page - 1));
        return;
      }
      if (!silent) {
        setNotifications([]);
        setError(loadError.message || 'Unable to load notifications.');
      }
    } finally {
      if (version === loadVersion.current && !silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (user && token) {
      loadNotifications();
    }
  }, [user, token, filter, currentPage]);

  const chooseFilter = (value) => {
    setFilter(value);
    setCurrentPage(1);
  };

  // New notifications appear without reloading the page.
  useEffect(() => {
    if (lastLiveCount.current !== null && liveUnreadCount !== lastLiveCount.current && !loading) {
      loadNotifications({ silent: true });
    }
    lastLiveCount.current = liveUnreadCount;
  }, [liveUnreadCount]);

  const done = (message) => {
    setActionError('');
    setNotice(message);
  };
  const failed = (message) => {
    setNotice('');
    setActionError(message);
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.post(`/notifications/${notifId}/mark_read/`);
      loadVersion.current += 1;
      const wasUnread = notifications.some((notification) => notification.id === notifId && notification.status === 'unread');
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notifId ? { ...notification, status: 'read' } : notification
        )
      );
      if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
      announceNotificationsUpdated();
      setActionError('');
    } catch (markError) {
      failed(markError.message || 'Unable to mark notification as read.');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.post('/notifications/mark_all_read/');
      loadVersion.current += 1;
      setNotifications((current) => current.map((notification) => ({ ...notification, status: 'read' })));
      setUnreadCount(0);
      announceNotificationsUpdated();
      done('All notifications marked as read.');
    } catch (markAllError) {
      failed(markAllError.message || 'Unable to update notifications.');
    }
  };

  const handleDeleteNotification = async (notifId) => {
    if (deletingIds.has(notifId)) return;
    const title = notifications.find((notification) => notification.id === notifId)?.title || 'Notification';
    setDeletingIds((current) => new Set(current).add(notifId));
    try {
      await api.delete(`/notifications/${notifId}/`);
      setNotifications((current) => current.filter((notification) => notification.id !== notifId));
      announceNotificationsUpdated();
      done(`Deleted "${title}".`);
      // The next notice moves up into this page; an emptied last page steps back one.
      if (notifications.length === 1 && currentPage > 1) {
        setCurrentPage((page) => Math.max(1, page - 1));
      } else {
        loadNotifications({ silent: true });
      }
    } catch (deleteError) {
      failed(deleteError.message || 'Unable to delete notification.');
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(notifId);
        return next;
      });
    }
  };

  const handleDeleteAllNotifications = async () => {
    if (allCount === 0) return;

    setDeletingAll(true);
    try {
      await api.delete('/notifications/delete_all/');
      loadVersion.current += 1;
      setNotifications([]);
      setTotalCount(0);
      setAllCount(0);
      setUnreadCount(0);
      announceNotificationsUpdated();
      setCurrentPage(1);
      setDeleteAllConfirmOpen(false);
      setDeleteAllError('');
      done('All notifications deleted.');
    } catch (requestError) {
      setDeleteAllError(requestError.message || 'Unable to delete notifications.');
    } finally {
      setDeletingAll(false);
    }
  };

  const getIcon = (type) => {
    switch (categoryOf(type)) {
      case 'success':
        return <FiCheckCircle className="text-green-600" size={20} />;
      case 'warning':
        return <FiAlertCircle className="text-yellow-600" size={20} />;
      case 'info':
        return <FiInfo className="text-blue-600" size={20} />;
      default:
        return <FiBell className="text-slate-600" size={20} />;
    }
  };

  const getBackgroundColor = (type, status) => {
    const unreadBg = status === 'unread' ? 'bg-blue-50' : 'bg-white';
    const baseColor = {
      success: 'border-green-200',
      warning: 'border-yellow-200',
      urgent: 'border-yellow-200',
      error: 'border-yellow-200',
      info: 'border-blue-200',
      default: 'border-slate-200'
    };
    return `${unreadBg} border ${baseColor[categoryOf(type)] || baseColor.default}`;
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));
  const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  return (
    <Layout>
      <div className="py-2">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex flex-wrap items-center justify-start gap-2 sm:ml-auto sm:justify-end">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className="min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
                >
                  Mark all as read
                </button>
              )}
              {allCount > 0 && (
                <button
                  type="button"
                  onClick={() => { setDeleteAllError(''); setDeleteAllConfirmOpen(true); }}
                  disabled={deletingAll}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FiTrash2 size={16} />
                  {deletingAll ? 'Deleting...' : 'Delete all'}
                </button>
              )}
            </div>
          </div>

          {error && (
            <ErrorState
              error={error}
              onRetry={() => loadNotifications()}
            />
          )}
          {actionError ? (
            <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
          ) : null}
          {notice ? (
            <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="-my-2 min-h-11 px-2 font-semibold">Dismiss</button>
            </div>
          ) : null}

          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { label: 'All', value: 'all' },
              { label: 'Unread', value: 'unread', count: unreadCount },
              { label: 'Success', value: 'success' },
              { label: 'Warnings', value: 'warning' },
              { label: 'Updates', value: 'info' }
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => chooseFilter(tab.value)}
                aria-pressed={filter === tab.value}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
                  filter === tab.value
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <ListSkeleton rows={6} compact />
            ) : error ? null : notifications.length === 0 ? (
              <EmptyState
                title="No notifications"
                description={filter !== 'all' ? "No notifications match this category." : "You have no new notifications right now."}
                onAction={filter !== 'all' ? () => chooseFilter('all') : undefined}
                actionLabel={filter !== 'all' ? "View all notifications" : undefined}
              />
            ) : (
              notifications.map((notification) => {
                const destination = getNotificationDestination(notification, user?.role);
                return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 rounded-lg p-4 transition-shadow hover:shadow-md ${
                    getBackgroundColor(notification.type, notification.status)
                  }`}
                >
                  <div className="mt-1 flex-shrink-0">{getIcon(notification.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-slate-900 ${notification.status === 'unread' ? 'font-bold' : 'font-semibold'}`}>
                          {notification.title || 'Notification'}
                        </h3>
                        <p className="mt-1 break-words text-sm text-slate-700">{notification.message}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          <time dateTime={notification.created_at} title={formatFullDateTime(notification.created_at)}>{formatWhen(notification.created_at)}</time>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteNotification(notification.id)}
                        disabled={deletingIds.has(notification.id)}
                        className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                        aria-label={`Delete notification: ${notification.title || 'Notification'}`}
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                    {notification.status === 'unread' || destination ? (
                      <div className="mt-1 flex flex-wrap gap-x-5">
                        {notification.status === 'unread' && (
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(notification.id)}
                            aria-label={`Mark as read: ${notification.title || 'Notification'}`}
                            className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 hover:text-blue-700"
                          >
                            Mark as read
                          </button>
                        )}
                        {destination && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (notification.status === 'unread') await handleMarkAsRead(notification.id);
                              navigate(destination.path);
                            }}
                            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-600 hover:text-brand-700"
                          >
                            {destination.label}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
                );
              })
            )}
          </div>

          {!loading && !error && totalCount > ITEMS_PER_PAGE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="text-slate-500">
                Showing {pageStartIndex + 1}-{pageStartIndex + notifications.length} of {totalCount} notifications
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <span className="text-slate-500">Page {currentPage} of {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
              </div>
            </div>
          )}

        </div>
      </div>
      {deleteAllConfirmOpen && (
        <ConfirmationDialog
          title="Delete all notifications?"
          message="This will permanently remove every notification in your list. This action cannot be undone."
          tone="danger"
          icon="danger"
          confirmLabel="Delete all"
          cancelLabel="Keep notifications"
          loading={deletingAll}
          onCancel={() => { setDeleteAllConfirmOpen(false); setDeleteAllError(''); }}
          onConfirm={handleDeleteAllNotifications}
        >
          {deleteAllError ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteAllError}</p> : null}
        </ConfirmationDialog>
      )}
    </Layout>
  );
}
