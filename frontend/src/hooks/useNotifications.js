import { useEffect, useSyncExternalStore } from "react";
import { notificationsApi } from "../services/notificationsApi";
import { toast } from "../components/Toaster";

/*
 * One shared notification store for the bell and the notifications page.
 *
 * Sources (all real events, nothing is invented):
 *  - owner (signed in): enquiries, visit requests, callbacks… from the backend
 *  - everyone: public announcements from the backend (new property, new video)
 *  - this visitor: confirmations of the enquiries they submitted (kept locally)
 *
 * Updates arrive through Server-Sent Events; if a proxy buffers the stream the
 * store falls back to polling. Browser (system) alerts are shown only after
 * the visitor clicks "Turn on alerts" and grants permission.
 */

const LOCAL_KEY = "gratia-local-notifications";
const READ_KEY = "gratia-read-notifications";
const HIDDEN_KEY = "gratia-hidden-notifications";
const ALERTS_KEY = "gratia-alerts";
const POLL_VISIBLE_MS = 30_000;
const POLL_HIDDEN_MS = 120_000;

function load(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: state still works for this visit.
  }
}

let state = {
  mode: "public",
  loading: true,
  error: "",
  server: [],
  ownerUnread: 0,
  local: load(LOCAL_KEY, []),
  readIds: new Set(load(READ_KEY, [])),
  hiddenIds: new Set(load(HIDDEN_KEY, [])),
  alerts: load(ALERTS_KEY, "off"),
  permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  live: false,
};
let snapshot = null;
const listeners = new Set();

function emit() {
  snapshot = null;
  listeners.forEach((listener) => listener());
}

function set(changes) {
  state = { ...state, ...changes };
  emit();
}

const keyOf = (item) => `s-${item.id}`;

function compute() {
  if (snapshot) return snapshot;
  const server = state.server
    .filter((item) => !state.hiddenIds.has(keyOf(item)))
    .map((item) => ({
      key: keyOf(item),
      id: item.id,
      source: item.audience === "owner" ? "owner" : "public",
      kind: item.kind,
      title: item.title,
      body: item.body,
      link: item.link,
      reference: item.lead_reference,
      createdAt: item.created_at,
      read: item.audience === "owner" ? item.is_read : state.readIds.has(keyOf(item)),
    }));
  const local = state.local.map((item) => ({
    key: item.id,
    id: item.id,
    source: "local",
    kind: item.kind,
    title: item.title,
    body: item.body,
    link: item.link,
    createdAt: item.created_at,
    read: Boolean(item.read),
  }));
  const items = [...server, ...local].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  snapshot = {
    ...state,
    items,
    unread: items.filter((item) => !item.read).length,
  };
  return snapshot;
}

function persistLocalState() {
  save(LOCAL_KEY, state.local.slice(0, 50));
  save(READ_KEY, [...state.readIds].slice(-300));
  save(HIDDEN_KEY, [...state.hiddenIds].slice(-300));
}

/* ---------- system alerts (only after explicit permission) ---------- */

function showSystemAlert(item) {
  if (state.alerts !== "on" || state.permission !== "granted") return;
  if (typeof document !== "undefined" && document.visibilityState === "visible") return;
  const options = {
    body: item.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `gratia-${item.id}`,
    data: { url: item.link || "/notifications" },
  };
  const fallback = () => {
    try {
      new Notification(item.title, options);
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
    }
  };
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistration().then((registration) => {
      if (registration) registration.showNotification(item.title, options);
      else fallback();
    }, fallback);
  } else fallback();
}

/* ---------- loading & live updates ---------- */

let latestSeen = null;
let refreshing = null;
let refreshQueued = false;

async function refresh() {
  if (refreshing) {
    refreshQueued = true;
    return refreshing;
  }
  refreshing = (async () => {
    try {
      const feed = state.mode === "owner" ? await notificationsApi.ownerFeed() : await notificationsApi.publicFeed();
      const items = feed?.items ?? [];
      if (latestSeen !== null) {
        items.filter((item) => item.id > latestSeen).reverse().forEach(showSystemAlert);
        const fresh = items.filter((item) => item.id > latestSeen && item.audience === "owner");
        if (fresh.length && document.visibilityState === "visible") {
          toast(fresh[0].title, "info");
        }
      }
      latestSeen = Math.max(latestSeen ?? 0, feed?.latest_id ?? 0, ...items.map((item) => item.id));
      set({ server: items, ownerUnread: feed?.unread ?? 0, loading: false, error: "" });
    } catch (error) {
      // Owner session ended: fall back to the public feed.
      if (state.mode === "owner" && (error.status === 401 || error.status === 403)) {
        state.mode = "public";
        latestSeen = null;
        refreshing = null;
        return refresh();
      }
      set({ loading: false, error: error.status === 0 ? "" : error.message });
    } finally {
      refreshing = null;
      if (refreshQueued) {
        refreshQueued = false;
        refresh();
      }
    }
  })();
  return refreshing;
}

let source = null;
let pollTimer = null;
let streamFailures = 0;
let usePolling = false;
let started = false;

function schedulePoll() {
  window.clearTimeout(pollTimer);
  if (!usePolling) return;
  const delay = document.visibilityState === "visible" ? POLL_VISIBLE_MS : POLL_HIDDEN_MS;
  pollTimer = window.setTimeout(async () => {
    await refresh();
    schedulePoll();
  }, delay);
}

function switchToPolling() {
  source?.close();
  source = null;
  usePolling = true;
  set({ live: false });
  schedulePoll();
}

function connect() {
  source?.close();
  source = null;
  if (usePolling || typeof EventSource === "undefined") {
    switchToPolling();
    return;
  }
  let ready = false;
  const es = new EventSource(notificationsApi.streamUrl(), { withCredentials: true });
  source = es;
  // A buffering proxy never delivers "ready": stop waiting and poll instead.
  const readyTimer = window.setTimeout(() => {
    if (!ready && source === es) switchToPolling();
  }, 12_000);
  es.addEventListener("ready", () => {
    ready = true;
    streamFailures = 0;
    window.clearTimeout(readyTimer);
    set({ live: true });
    refresh(); // catch anything that arrived while reconnecting
  });
  es.addEventListener("changed", () => refresh());
  es.onerror = () => {
    if (ready) return; // normal reconnect after the server's 10-minute cycle
    streamFailures += 1;
    if (streamFailures >= 2) {
      window.clearTimeout(readyTimer);
      switchToPolling();
    }
  };
}

function onVisibility() {
  if (document.visibilityState === "visible") refresh();
  if (usePolling) schedulePoll();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  refresh().then(connect);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("storage", (event) => {
    if ([LOCAL_KEY, READ_KEY, HIDDEN_KEY].includes(event.key)) {
      set({
        local: load(LOCAL_KEY, []),
        readIds: new Set(load(READ_KEY, [])),
        hiddenIds: new Set(load(HIDDEN_KEY, [])),
      });
    }
  });
}

/* ---------- public API ---------- */

export function setNotificationMode(isOwner) {
  const mode = isOwner ? "owner" : "public";
  if (mode === state.mode) return;
  state.mode = mode;
  latestSeen = null;
  set({ loading: true, server: [] });
  refresh();
  // The stream decides what to send from the session cookie: reconnect.
  if (started && !usePolling) connect();
}

export function addLocalNotification({ id, kind, title, body, link }) {
  if (state.local.some((item) => item.id === id)) return;
  state.local = [{ id, kind, title, body, link, created_at: new Date().toISOString(), read: false }, ...state.local];
  persistLocalState();
  emit();
}

export async function markRead(item) {
  if (item.read) return;
  if (item.source === "owner") {
    state.server = state.server.map((s) => (s.id === item.id ? { ...s, is_read: true } : s));
    emit();
    notificationsApi.markRead(item.id).catch(() => refresh());
  } else if (item.source === "public") {
    state.readIds = new Set(state.readIds).add(item.key);
    persistLocalState();
    emit();
  } else {
    state.local = state.local.map((l) => (l.id === item.id ? { ...l, read: true } : l));
    persistLocalState();
    emit();
  }
}

export async function markAllRead() {
  const { items } = compute();
  const readIds = new Set(state.readIds);
  items.filter((item) => item.source === "public").forEach((item) => readIds.add(item.key));
  state.readIds = readIds;
  state.local = state.local.map((l) => ({ ...l, read: true }));
  if (state.mode === "owner") {
    state.server = state.server.map((s) => ({ ...s, is_read: true }));
    notificationsApi.markAllRead().catch(() => refresh());
  }
  persistLocalState();
  emit();
}

export async function removeNotification(item) {
  if (item.source === "owner") {
    state.server = state.server.filter((s) => s.id !== item.id);
    emit();
    notificationsApi.remove(item.id).catch(() => refresh());
  } else if (item.source === "public") {
    state.hiddenIds = new Set(state.hiddenIds).add(item.key);
    persistLocalState();
    emit();
  } else {
    state.local = state.local.filter((l) => l.id !== item.id);
    persistLocalState();
    emit();
  }
}

/** Must be called from a click: asks for permission once, never automatically. */
export async function enableAlerts() {
  if (typeof Notification === "undefined") return "unsupported";
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  const alerts = permission === "granted" ? "on" : "off";
  save(ALERTS_KEY, alerts);
  set({ permission, alerts });
  return permission;
}

export function disableAlerts() {
  save(ALERTS_KEY, "off");
  set({ alerts: "off" });
}

export const refreshNotifications = refresh;

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export default function useNotifications() {
  useEffect(start, []);
  return useSyncExternalStore(subscribe, compute, compute);
}
