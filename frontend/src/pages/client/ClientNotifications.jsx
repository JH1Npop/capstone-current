import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';
import { ListSkeleton } from '../../components/ui/LoadingSkeleton';
import { EmptyState, ErrorState } from '../../components/ui/StateDisplay';
import ConfirmationDialog from '../../components/shared/ConfirmationDialog';
import { FiAlertCircle, FiBell, FiCheckCircle, FiInfo, FiTrash2 } from 'react-icons/fi';
import { api, fetchAllPages } from '../../api/api';

const ITEMS_PER_PAGE = 10;
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
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && token) {
      loadNotifications();
    }
  }, [user, token]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const notifArray = await fetchAllPages('/notifications/');
      const sorted = [...notifArray].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setNotifications(sorted);
      setError('');
    } catch (loadError) {
      setNotifications([]);
      setError(loadError.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notifId) => {
    try {
      await api.post(`/notifications/${notifId}/mark_read/`);
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notifId ? { ...notification, status: 'read' } : notification
        )
      );
      announceNotificationsUpdated();
    } catch (markError) {
      setError(markError.message || 'Unable to mark notification as read.');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.post('/notifications/mark_all_read/');
      setNotifications((current) => current.map((notification) => ({ ...notification, status: 'read' })));
      announceNotificationsUpdated();
    } catch (markAllError) {
      setError(markAllError.message || 'Unable to update notifications.');
    }
  };

  const handleDeleteNotification = async (notifId) => {
    try {
      await api.delete(`/notifications/${notifId}/`);
      setNotifications((current) => current.filter((notification) => notification.id !== notifId));
      announceNotificationsUpdated();
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete notification.');
    }
  };

  const handleDeleteAllNotifications = async () => {
    if (notifications.length === 0) return;

    setDeletingAll(true);
    try {
      await api.delete('/notifications/delete_all/');
      setNotifications([]);
      announceNotificationsUpdated();
      setCurrentPage(1);
      setDeleteAllConfirmOpen(false);
      setError('');
    } catch (deleteAllError) {
      setError(deleteAllError.message || 'Unable to delete notifications.');
    } finally {
      setDeletingAll(false);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return <FiCheckCircle className="text-green-600" size={20} />;
      case 'warning':
      case 'urgent':
      case 'error':
        return <FiAlertCircle className="text-yellow-600" size={20} />;
      case 'info':
        return <FiInfo className="text-blue-600" size={20} />;
      default:
        return <FiBell className="text-slate-600" size={20} />;
    }
  };

  const getBackgroundColor = (type, status) => {
    const unreadBg = status === 'unread' ? 'bg-blue-50' : '';
    const baseColor = {
      success: 'border-green-200',
      warning: 'border-yellow-200',
      urgent: 'border-yellow-200',
      error: 'border-yellow-200',
      info: 'border-blue-200',
      default: 'border-slate-200'
    };
    return `${unreadBg} border ${baseColor[type] || baseColor.default}`;
  };

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'unread') return notification.status === 'unread';
    if (filter === 'success') return notification.type === 'success';
    if (filter === 'warning') return ['warning', 'urgent', 'error'].includes(notification.type);
    if (filter === 'info') return notification.type === 'info';
    return true;
  });

  const unreadCount = notifications.filter((notification) => notification.status === 'unread').length;
  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const paginatedNotifications = filteredNotifications.slice(pageStartIndex, pageStartIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  return (
    <Layout>
      <div className="py-2">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">Alerts, updates, reminders, and request activity.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50"
                >
                  Mark all as read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDeleteAllConfirmOpen(true)}
                  disabled={deletingAll}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
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
              onRetry={loadNotifications}
            />
          )}

          <div className="mb-6 flex flex-wrap gap-2">
            {[
              { label: 'All', value: 'all' },
              { label: 'Unread', value: 'unread', count: unreadCount },
              { label: 'Success', value: 'success' },
              { label: 'Warnings', value: 'warning' },
              { label: 'Info', value: 'info' }
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
                  filter === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {loading ? (
              <ListSkeleton rows={6} compact />
            ) : filteredNotifications.length === 0 ? (
              <EmptyState
                title="No notifications"
                description={filter !== 'all' ? "No notifications match this category." : "You have no new notifications right now."}
                onAction={filter !== 'all' ? () => setFilter('all') : undefined}
                actionLabel={filter !== 'all' ? "View all notifications" : undefined}
              />
            ) : (
              paginatedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`flex items-start gap-4 rounded-lg p-4 transition-shadow hover:shadow-md ${
                    getBackgroundColor(notification.type, notification.status)
                  }`}
                >
                  <div className="mt-1 flex-shrink-0">{getIcon(notification.type)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h3 className={`text-slate-900 ${notification.status === 'unread' ? 'font-bold' : 'font-semibold'}`}>
                          {notification.title || 'Notification'}
                        </h3>
                        <p className="mt-1 text-sm text-slate-700">{notification.message}</p>
                        <p className="mt-2 text-xs text-slate-500">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteNotification(notification.id)}
                        className="text-slate-400 transition-colors hover:text-slate-600"
                        aria-label="Delete notification"
                      >
                        <FiTrash2 size={18} />
                      </button>
                    </div>
                    {notification.status === 'unread' && (
                      <button
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {filteredNotifications.length > ITEMS_PER_PAGE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
              <span className="text-slate-500">
                Showing {pageStartIndex + 1}-{Math.min(pageStartIndex + ITEMS_PER_PAGE, filteredNotifications.length)} of {filteredNotifications.length} notifications
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
                <span className="text-slate-500">Page {safeCurrentPage} of {totalPages}</span>
                <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
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
          onCancel={() => setDeleteAllConfirmOpen(false)}
          onConfirm={handleDeleteAllNotifications}
        />
      )}
    </Layout>
  );
}
