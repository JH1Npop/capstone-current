import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteAllNotifications as deleteAllNotificationsApi,
  fetchNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../api/api';
import { useAuth } from './AuthContext';
import { API_BASE_URL } from '../api/core';
import { startVisibleInterval } from '../utils/visibleInterval';
import { MESSAGES_CHANGED_EVENT, setLiveUpdatesConnected } from '../utils/liveUpdates';

const NotificationContext = createContext(null);
const NOTIFICATION_REFRESH_MS = 5_000;
// While the live socket is connected, polling only runs as a slow safety net.
const LIVE_SAFETY_POLL_MS = 120_000;

function notificationSocketUrl() {
  const base = /^https?:\/\//i.test(API_BASE_URL) ? new URL(API_BASE_URL) : window.location;
  const protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${base.host}/ws/notifications/`;
}

export function NotificationProvider({ children }) {
  const { user, token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const requestVersion = useRef(0);
  const unreadCountRef = useRef(null);
  const socketLiveRef = useRef(false);
  const lastPollRef = useRef(0);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

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
      unreadCountRef.current = Number(count) || 0;
    } catch {
      // Preserve the last known shell state through a transient refresh failure.
    }
  }, [user?.id]);

  const pollNotifications = useCallback(async () => {
    if (!user?.id) return;
    if (socketLiveRef.current && Date.now() - lastPollRef.current < LIVE_SAFETY_POLL_MS) return;
    lastPollRef.current = Date.now();
    try {
      const count = Number(await getUnreadNotificationCount()) || 0;
      if (count !== unreadCountRef.current) await refreshNotifications();
    } catch {
      // Keep the current list; the next poll retries.
    }
  }, [refreshNotifications, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      requestVersion.current += 1;
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }

    refreshNotifications();
    const stopPolling = startVisibleInterval(pollNotifications, NOTIFICATION_REFRESH_MS);
    window.addEventListener('afn:notifications-updated', refreshNotifications);
    return () => {
      requestVersion.current += 1;
      stopPolling();
      window.removeEventListener('afn:notifications-updated', refreshNotifications);
    };
  }, [pollNotifications, refreshNotifications, user?.id]);

  // Live updates: the server pushes the new unread count whenever this user's
  // notifications change; reload the list only when the count actually differs.
  useEffect(() => {
    if (!user?.id || !token || typeof WebSocket === 'undefined') return undefined;
    let socket = null;
    let retryTimer = null;
    let attempts = 0;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(notificationSocketUrl(), ['afn.token', token]);
      socket.onopen = () => {
        attempts = 0;
        socketLiveRef.current = true;
        setLiveUpdatesConnected(true);
        refreshNotifications();
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload?.type === 'notifications.changed' && Number(payload.unread_count) !== unreadCountRef.current) {
            refreshNotifications();
          } else if (payload?.type === 'messages.changed') {
            window.dispatchEvent(new CustomEvent(MESSAGES_CHANGED_EVENT));
          }
        } catch {
          // Ignore malformed frames; polling remains as a fallback.
        }
      };
      socket.onclose = () => {
        socketLiveRef.current = false;
        setLiveUpdatesConnected(false);
        if (stopped) return;
        attempts += 1;
        retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts));
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      stopped = true;
      socketLiveRef.current = false;
      setLiveUpdatesConnected(false);
      window.clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, [refreshNotifications, token, user?.id]);

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
