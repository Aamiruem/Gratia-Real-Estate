import { apiRequest, backendUrl } from "./apiClient";
import { addLocalNotification } from "../hooks/useNotifications";
import { getTrafficSource, track } from "../analytics/analytics";

const KIND_LABELS = {
  contact: "enquiry",
  visit: "site visit request",
  callback: "callback request",
  property_enquiry: "property enquiry",
  consultation: "consultation request",
  whatsapp: "WhatsApp enquiry",
};

// Turns form values into the API body; empty strings are left out.
function body(kind, fields) {
  // Source = how the visitor arrived (organic, social, direct...): no personal data.
  const payload = { kind, source_page: window.location.pathname, source: getTrafficSource().source };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const text = typeof value === "string" ? value.trim() : value;
    if (text !== "") payload[key] = text;
  }
  return payload;
}

/**
 * Saves an enquiry to the backend and returns { reference, duplicate }.
 * Adds a confirmation to the visitor's own notification bell.
 * Throws an Error with a readable message when the server rejects it.
 */
export async function submitLead(kind, fields) {
  const result = await apiRequest("/leads", {
    method: "POST",
    body: JSON.stringify(body(kind, fields)),
  });
  if (result?.reference) {
    track("lead_submit", { detail: kind, property_slug: fields.property_slug });
    const label = KIND_LABELS[kind] ?? "enquiry";
    addLocalNotification({
      id: `lead-${result.reference}`,
      kind: `lead.${kind}`,
      title: `We received your ${label}`,
      body: `Reference ${result.reference}. Our advisor will contact you shortly.`,
      link: kind === "visit" ? "/book-visit" : "/contact",
    });
  }
  return result;
}

/**
 * For forms that continue to WhatsApp: the WhatsApp window must open
 * immediately (browsers block pop-ups opened after a network wait), so the
 * lead is saved in parallel and never blocks the customer.
 */
export function saveLeadInBackground(kind, fields) {
  return submitLead(kind, fields).catch((error) => {
    console.warn("The enquiry could not be saved on the server.", error);
    return null;
  });
}

export const leadsAdminApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value !== "" && value !== undefined && value !== false),
    ).toString();
    return apiRequest(`/leads${query ? `?${query}` : ""}`);
  },
  stats: () => apiRequest("/leads/stats"),
  update: (reference, changes) =>
    apiRequest(`/leads/${encodeURIComponent(reference)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  exportUrl: (kind = "") => `${backendUrl}/leads/export.csv${kind ? `?kind=${kind}` : ""}`,
};
