import { apiRequest, backendUrl } from "./apiClient";

export const notificationsApi = {
  publicFeed: () => apiRequest("/notifications/public"),
  ownerFeed: () => apiRequest("/notifications"),
  markRead: (id, isRead = true) =>
    apiRequest(`/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ is_read: isRead }) }),
  markAllRead: () => apiRequest("/notifications/read-all", { method: "POST" }),
  remove: (id) => apiRequest(`/notifications/${id}`, { method: "DELETE" }),
  announce: (announcement) =>
    apiRequest("/notifications/announce", { method: "POST", body: JSON.stringify(announcement) }),
  streamUrl: () => `${backendUrl}/notifications/stream`,
};
