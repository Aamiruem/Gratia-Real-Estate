import { apiRequest, backendUrl } from "./apiClient";

const qs = (params = {}) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v !== undefined && v !== null && v !== false),
  ).toString();
  return query ? `?${query}` : "";
};
const json = (method, body) => ({ method, body: JSON.stringify(body) });

// Every call needs a signed-in staff account (owner, admin or agent); the
// backend enforces the role for each action.
export const adminApi = {
  overview: () => apiRequest("/admin/overview"),
  analytics: (days = 30) => apiRequest(`/admin/analytics${qs({ days })}`),
  reports: (days = 90) => apiRequest(`/admin/reports${qs({ days })}`),
  customers: (q = "") => apiRequest(`/admin/customers${qs({ q })}`),

  properties: () => apiRequest("/admin/properties"),
  createProperty: (data) => apiRequest("/admin/properties", json("POST", data)),
  updateProperty: (id, data) => apiRequest(`/admin/properties/${id}`, json("PUT", data)),
  deleteProperty: (id) => apiRequest(`/admin/properties/${id}`, { method: "DELETE" }),

  leads: (params) => apiRequest(`/leads${qs(params)}`),
  lead: (reference) => apiRequest(`/leads/${encodeURIComponent(reference)}`),
  updateLead: (reference, changes) => apiRequest(`/leads/${encodeURIComponent(reference)}`, json("PATCH", changes)),
  followUps: (reference) => apiRequest(`/leads/${encodeURIComponent(reference)}/follow-ups`),
  addFollowUp: (reference, data) => apiRequest(`/leads/${encodeURIComponent(reference)}/follow-ups`, json("POST", data)),
  dueFollowUps: (scope = "all") => apiRequest(`/leads/follow-ups/due${qs({ scope })}`),
  exportUrl: (kind = "") => `${backendUrl}/leads/export.csv${qs({ kind })}`,

  notifications: () => apiRequest("/notifications?limit=100"),
  announce: (data) => apiRequest("/notifications/announce", json("POST", data)),

  team: () => apiRequest("/admin/team"),
  addMember: (data) => apiRequest("/admin/team", json("POST", data)),
  updateMember: (id, data) => apiRequest(`/admin/team/${id}`, json("PATCH", data)),

  settings: () => apiRequest("/admin/settings"),
  saveSettings: (data) => apiRequest("/admin/settings", json("PUT", data)),
};
