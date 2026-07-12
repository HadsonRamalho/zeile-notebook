import { api } from "./base";

export interface NotificationDTO {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  notebookId: string | null;
  teamId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items: NotificationDTO[];
  unreadCount: number;
}

export async function fetchNotifications() {
  return api.get<NotificationsResponse>("/notifications/");
}

export async function markNotificationRead(id: string) {
  return api.post<void>(`/notifications/${id}/read`);
}

export async function markAllNotificationsRead() {
  return api.post<void>("/notifications/read-all");
}

export async function deleteNotification(id: string) {
  return api.delete<void>(`/notifications/${id}`);
}
