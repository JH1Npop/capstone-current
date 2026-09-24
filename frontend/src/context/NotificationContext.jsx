import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteAllNotifications as deleteAllNotificationsApi,
  fetchNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../api/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const requestVersion = useRef(0);

  const refreshNotifications = useCallback(async () => {
    if (!user?.id) return;
    const version = ++requestVersion.current;
    try {
      const [items, count] = await Promise.all([
        fetchNotifications(),
        getUnreadNotificationCount(),
      ]);
      if (version !== requestVersion.current) return;
      setNotifications(
        [...items].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0)),
      );
      setUnreadCount(Number(count) || 0);
    } catch {
      // Preserve the last known shell state through a transient refresh failure.
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      requestVersion.current += 1;
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    refreshNotifications();
    const intervalId = window.setInterval(refreshNotifications, 45000);
    window.addEventListener('afn:notifications-updated', refreshNotifications);
    return () => {
      requestVersion.current += 1;
      window.clearInterval(intervalId);
      window.removeEventListener('afn:notifications-updated', refreshNotifications);
    };
  }, [refreshNotifications, user?.id]);

  const markNotificationRead = useCallback(async (notificationId) => {
    await markNotificationAsRead(notificationId);
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, status: 'read' } : item
    )));
    setUnreadCount((current) => Math.max(0, current - 1));
  }, []);

  const markNotificationsRead = useCallback(async (notificationIds) => {
    const requestedIds = new Set((notificationIds || []).map(String));
    const unreadIds = notifications
      .filter((item) => item.status === 'unread' && requestedIds.has(String(item.id)))
      .map((item) => item.id);

    if (unreadIds.length === 0) return;

    requestVersion.current += 1;
    const unreadIdSet = new Set(unreadIds.map(String));
    setNotifications((current) => current.map((item) => (
      unreadIdSet.has(String(item.id)) ? { ...item, status: 'read' } : item
    )));
    setUnreadCount((current) => Math.max(0, current - unreadIds.length));

    const results = await Promise.allSettled(unreadIds.map(markNotificationAsRead));
    if (results.some((result) => result.status === 'rejected')) {
      await refreshNotifications();
    }
  }, [notifications, refreshNotifications]);

  const markAllNotificationsRead = useCallback(async () => {
    await markAllNotificationsAsRead();
    setNotifications((current) => current.map((item) => ({ ...item, status: 'read' })));
    setUnreadCount(0);
  }, []);

  const deleteAllNotifications = useCallback(async () => {
    await deleteAllNotificationsApi();
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    refreshNotifications,
    markNotificationRead,
    markNotificationsRead,
    markAllNotificationsRead,
    deleteAllNotifications,
  }), [
    deleteAllNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    markNotificationsRead,
    notifications,
    refreshNotifications,
    unreadCount,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider.');
  return context;
}
