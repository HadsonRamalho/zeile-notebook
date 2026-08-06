"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteNotification as apiDelete,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationDTO,
} from "@/lib/api/notifications-service";

const POLL_INTERVAL_MS = 30000;

export function useNotifications() {
  const [items, setItems] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    return fetchNotifications()
      .then((data) => {
        if (data) {
          setItems(data.items);
          setUnreadCount(data.unreadCount);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const markRead = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    markNotificationRead(id).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);
    markAllNotificationsRead().catch(() => {});
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.readAt) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.id !== id);
    });
    apiDelete(id).catch(() => {});
  }, []);

  return {
    items,
    unreadCount,
    loading,
    refresh,
    markRead,
    markAllRead,
    remove,
  };
}
