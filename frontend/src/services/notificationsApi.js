import { apiRequest, backendUrl } from "./apiClient";
import { getDeviceKey } from "../utils/deviceKey";

const device = () => ({ "X-Device-Token": getDeviceKey() || "" });

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
  // This visitor's own notifications (enquiry confirmations and updates), saved in the database.
  mine: () => apiRequest("/notifications/mine", { headers: device() }),
  mineRead: (id) =>
    apiRequest(`/notifications/mine/${id}`, { method: "PATCH", body: JSON.stringify({ is_read: true }), headers: device() }),
  mineReadAll: () => apiRequest("/notifications/mine/read-all", { method: "POST", headers: device() }),
  mineRemove: (id) => apiRequest(`/notifications/mine/${id}`, { method: "DELETE", headers: device() }),
  pushConfig: () => apiRequest("/push/config"),
  pushSubscribe: (subscription, audience) =>
    apiRequest("/push/subscribe", { method: "POST", body: JSON.stringify({ ...subscription, audience }) }),
  pushUnsubscribe: (endpoint) => apiRequest("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),
};
