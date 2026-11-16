import { apiRequest, backendUrl } from "../services/apiClient";

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const adminApi = {
  overview: () => apiRequest("/admin/overview"),
  analytics: (days = 30) => apiRequest(`/admin/analytics?days=${days}`),
  reports: (days = 90) => apiRequest(`/admin/reports?days=${days}`),
  crmVoiceStatus: () => apiRequest("/admin/crm/voice/status"),
  crmVoiceAssistant: (messages) =>
    apiRequest("/admin/crm/voice/assistant", json("POST", { messages })),
  confirmCrmVoiceFollowUp: (proposal) =>
    apiRequest("/admin/crm/voice/assistant/follow-up", json("POST", { ...proposal, confirmed: true })),
  startCrmVoiceCall: (leadReference) =>
    apiRequest("/admin/crm/voice/calls", json("POST", { lead_reference: leadReference, confirmed: true })),
  crmVoiceCalls: (leadReference) => {
    const query = leadReference ? `?lead_reference=${encodeURIComponent(leadReference)}` : "";
    return apiRequest(`/admin/crm/voice/calls${query}`);
  },
  crmSummary: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined),
    ).toString();
    return apiRequest(`/admin/crm/summary${query ? `?${query}` : ""}`);
  },
  customers: (q = "") => apiRequest(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  followUpsDue: (scope = "all") => apiRequest(`/leads/follow-ups/due?scope=${scope}`),
  leadFollowUps: (reference) => apiRequest(`/leads/${encodeURIComponent(reference)}/follow-ups`),
  addFollowUp: (reference, body) => apiRequest(`/leads/${encodeURIComponent(reference)}/follow-ups`, json("POST", body)),

  properties: () => apiRequest("/admin/properties"),
  createProperty: (body) => apiRequest("/admin/properties", json("POST", body)),
  updateProperty: (id, body) => apiRequest(`/admin/properties/${id}`, json("PUT", body)),
  deleteProperty: (id) => apiRequest(`/admin/properties/${id}`, { method: "DELETE" }),

  team: () => apiRequest("/admin/team"),
  addMember: (body) => apiRequest("/admin/team", json("POST", body)),
  updateMember: (id, body) => apiRequest(`/admin/team/${id}`, json("PATCH", body)),

  settings: () => apiRequest("/admin/settings"),
  saveSettings: (body) => apiRequest("/admin/settings", json("PUT", body)),
  health: () => apiRequest("/health"),
  backendUrl,
};
