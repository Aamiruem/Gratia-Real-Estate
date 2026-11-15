// Shared checks for every enquiry form (the backend validates again).

export const BUDGET_OPTIONS = [
  "Under ₹1 Cr",
  "₹1 Cr – ₹2 Cr",
  "₹2 Cr – ₹3 Cr",
  "₹3 Cr – ₹5 Cr",
  "₹5 Cr – ₹10 Cr",
  "₹10 Cr+",
  "Not decided yet",
];

export const TIME_OPTIONS = [
  "Morning (10 AM – 12 PM)",
  "Afternoon (12 PM – 4 PM)",
  "Evening (4 PM – 7 PM)",
];

// Indian mobile (optionally +91 / 0) or an international number starting with +.
export function isValidPhone(value) {
  const compact = String(value || "").replace(/[\s()-]/g, "");
  return /^(?:\+?91|0)?[6-9]\d{9}$/.test(compact) || /^\+(?!91)\d{10,15}$/.test(compact);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Returns { field: message } for the given values. */
export function validateLead(values, { requireDate = false, requireMessage = false } = {}) {
  const errors = {};
  const name = String(values.name || "").trim();
  if (name.length < 2 || !/\p{L}/u.test(name)) errors.name = "Please enter your full name.";
  if (!isValidPhone(values.phone)) errors.phone = "Enter a valid 10-digit mobile number.";
  if (values.email && !isValidEmail(values.email)) errors.email = "Enter a valid email address.";
  if (requireDate && !values.visit_date) errors.visit_date = "Please choose a preferred date.";
  if (values.visit_date && values.visit_date < todayIso()) errors.visit_date = "Please choose today or a later date.";
  if (requireMessage && !String(values.message || "").trim()) errors.message = "Please tell us a little about your requirement.";
  return errors;
}
