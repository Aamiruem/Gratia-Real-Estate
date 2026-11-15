/*
 * Consent-based analytics: Google Analytics 4 (when VITE_GA_MEASUREMENT_ID is
 * set) plus first-party events for the admin dashboard.
 *
 * Nothing is recorded until the visitor clicks "Accept" in the cookie banner.
 * No names, phone numbers, emails or form contents are ever sent: events
 * carry only the page path, a property slug and a short label.
 */
import { backendUrl } from "../services/apiClient";

const CONSENT_KEY = "gratia-consent"; // "granted" | "denied"
const VISITOR_KEY = "gratia-visitor";
const SESSION_KEY = "gratia-session";
const SOURCE_KEY = "gratia-source";
const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim();
const PRIVATE_PATHS = /^\/(admin|video-admin)(\/|$)/;

const store = {
  get(storage, key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  },
  set(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch {
      // ignore
    }
  },
};

const randomId = () =>
  (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

export const getConsent = () => store.get(localStorage, CONSENT_KEY);

/* ---------- traffic source (no identifiers; also attached to leads) ---------- */

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia)\./;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|lnkd|youtube|pinterest|reddit|threads|telegram)\.(com|co|me|net|org|in)$/;

function detectSource() {
  const params = new URLSearchParams(window.location.search);
  const medium = (params.get("utm_medium") || "").toLowerCase();
  const utmSource = (params.get("utm_source") || "").toLowerCase();
  if (params.get("source") === "pwa" || window.matchMedia?.("(display-mode: standalone)").matches) return { source: "app", host: "" };
  if (/cpc|ppc|paid|ads/.test(medium) || params.has("gclid")) return { source: "paid", host: utmSource };
  if (medium === "email" || utmSource === "email") return { source: "email", host: utmSource };
  if (medium === "social" || SOCIAL.test(`${utmSource}.com`)) return { source: "social", host: utmSource };
  let host = "";
  try {
    host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }
  if (!host || host === window.location.hostname.replace(/^www\./, "")) return { source: "direct", host: "" };
  if (/whatsapp/.test(host)) return { source: "whatsapp", host };
  if (SEARCH.test(host)) return { source: "organic", host };
  if (SOCIAL.test(host)) return { source: "social", host };
  return { source: "referral", host };
}

/** The visit's traffic source, decided on the first page of the session. */
export function getTrafficSource() {
  const saved = store.get(sessionStorage, SOURCE_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // fall through
    }
  }
  const detected = detectSource();
  store.set(sessionStorage, SOURCE_KEY, JSON.stringify(detected));
  return detected;
}

/* ---------- Google Analytics 4 ---------- */

let gaLoaded = false;
function loadGoogleAnalytics() {
  if (!GA_ID || gaLoaded) return;
  gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
  };
  window.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false, anonymize_ip: true });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);
}

/* ---------- first-party events ---------- */

let queue = [];
let flushTimer = null;

function ids() {
  let visitor = store.get(localStorage, VISITOR_KEY);
  if (!visitor) {
    visitor = randomId();
    store.set(localStorage, VISITOR_KEY, visitor);
  }
  let session = store.get(sessionStorage, SESSION_KEY);
  if (!session) {
    session = randomId();
    store.set(sessionStorage, SESSION_KEY, session);
  }
  return { visitor, session };
}

function device() {
  const width = window.innerWidth;
  return width < 640 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}

function flush() {
  window.clearTimeout(flushTimer);
  flushTimer = null;
  if (!queue.length || getConsent() !== "granted") return;
  const { visitor, session } = ids();
  const { source, host } = getTrafficSource();
  const body = JSON.stringify({
    visitor_id: visitor,
    session_id: session,
    source,
    referrer_host: host,
    device: device(),
    events: queue.splice(0, 25),
  });
  const url = `${backendUrl}/analytics/events`;
  // sendBeacon survives page unloads; fall back to fetch.
  const sent = navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }));
  if (!sent) fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  if (queue.length) flush();
}

// Removes anything that looks like a phone number or email from free text.
const scrub = (text) =>
  String(text || "")
    .replace(/\S+@\S+/g, "[email]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]")
    .slice(0, 100);

/**
 * Records an interaction. `params` may contain: property_slug, detail.
 * Ignored until the visitor accepts analytics, and on private admin pages.
 */
export function track(name, params = {}) {
  if (getConsent() !== "granted") return;
  const path = window.location.pathname;
  if (PRIVATE_PATHS.test(path)) return;
  const event = { name, path, property_slug: params.property_slug || null, detail: scrub(params.detail) };
  queue.push(event);
  if (!flushTimer) flushTimer = window.setTimeout(flush, 4000);
  if (gaLoaded && window.gtag) {
    const gaName = { lead_submit: "generate_lead", page_view: "page_view" }[name] || name;
    const gaParams =
      name === "page_view"
        ? { page_path: path, page_location: `${window.location.origin}${path}`, page_title: document.title }
        : { page_path: path, property_slug: event.property_slug || undefined, label: event.detail || undefined };
    window.gtag("event", gaName, gaParams);
  }
}

export function trackPageView() {
  // Let the page set its title first.
  window.setTimeout(() => track("page_view"), 0);
}

/* ---------- consent ---------- */

const CONSENT_EVENT = "gratia-consent-changed";

export function setConsent(value) {
  store.set(localStorage, CONSENT_KEY, value);
  if (value === "granted") {
    loadGoogleAnalytics();
    trackPageView();
  } else {
    queue = [];
    store.set(localStorage, VISITOR_KEY, "");
    try {
      localStorage.removeItem(VISITOR_KEY);
    } catch {
      // ignore
    }
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

export function onConsentChange(listener) {
  window.addEventListener(CONSENT_EVENT, listener);
  return () => window.removeEventListener(CONSENT_EVENT, listener);
}

export function openCookieSettings() {
  window.dispatchEvent(new Event("gratia-open-cookie-settings"));
}

/* ---------- start-up ---------- */

let started = false;
export function initAnalytics() {
  if (started) return;
  started = true;
  getTrafficSource(); // remember the landing source for lead attribution
  if (getConsent() === "granted") loadGoogleAnalytics();

  // Phone, WhatsApp and email clicks anywhere on the site.
  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest?.("a[href]");
      if (!link) return;
      const href = link.getAttribute("href") || "";
      if (href.startsWith("tel:")) track("call_click");
      else if (/wa\.me|api\.whatsapp\.com|whatsapp:\/\//.test(href)) track("whatsapp_click");
      else if (href.startsWith("mailto:") && !href.startsWith("mailto:?")) track("email_click");
    },
    { capture: true },
  );
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  window.addEventListener("pagehide", flush);
}
