import { useEffect, useSyncExternalStore } from "react";
import { notificationsApi } from "../services/notificationsApi";
import { toast } from "../components/Toaster";
import { parseApiDate } from "../utils/format";

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
  mine: [],
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
  const mine = state.mine.map((item) => ({
    key: `m-${item.id}`,
    id: item.id,
    source: "mine",
    kind: item.kind,
    title: item.title,
    body: item.body,
    link: item.link,
    reference: item.lead_reference,
    createdAt: item.created_at,
    read: item.is_read,
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
  const items = [...server, ...mine, ...local].sort(
    (a, b) => parseApiDate(b.createdAt).getTime() - parseApiDate(a.createdAt).getTime(),
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
    const requestedMode = state.mode;
    try {
      const [feed, mineFeed] = await Promise.all([
        requestedMode === "owner" ? notificationsApi.ownerFeed() : notificationsApi.publicFeed(),
        notificationsApi.mine().catch(() => null),
      ]);
      // The mode changed while loading (e.g. the owner session was recognised):
      // drop this result so it can't mark the other feed's items as "new". The
      // queued refresh loads the right feed.
      if (state.mode !== requestedMode) {
        refreshQueued = true;
        return;
      }
      if (mineFeed) {
        const knownMine = new Set(state.mine.map((item) => item.id));
        if (state.mine.length || latestSeen !== null) {
          mineFeed.items.filter((item) => !knownMine.has(item.id) && !item.is_read).forEach(showSystemAlert);
        }
        state.mine = mineFeed.items;
      }
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
  window.setInterval(() => document.visibilityState === "visible" && refresh(), 60_000);
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
  } else if (item.source === "mine") {
    state.mine = state.mine.map((m) => (m.id === item.id ? { ...m, is_read: true } : m));
    emit();
    notificationsApi.mineRead(item.id).catch(() => refresh());
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
  if (state.mine.some((m) => !m.is_read)) {
    state.mine = state.mine.map((m) => ({ ...m, is_read: true }));
    notificationsApi.mineReadAll().catch(() => refresh());
  }
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
  } else if (item.source === "mine") {
    state.mine = state.mine.filter((m) => m.id !== item.id);
    emit();
    notificationsApi.mineRemove(item.id).catch(() => refresh());
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

function base64ToBytes(base64) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** Registers for Web Push (alerts even when the site is closed) when the server supports it. */
async function subscribePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false; // service worker runs on the live site only
    const config = await notificationsApi.pushConfig();
    if (!config?.enabled || !config.public_key) return false;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(config.public_key) }));
    await notificationsApi.pushSubscribe(subscription.toJSON(), state.mode === "owner" ? "staff" : "public");
    return true;
  } catch (error) {
    console.warn("Push subscription failed", error);
    return false;
  }
}

async function unsubscribePush() {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) {
      await notificationsApi.pushUnsubscribe(subscription.endpoint).catch(() => {});
      await subscription.unsubscribe();
    }
  } catch {
    // ignore
  }
}

/**
 * Must be called from a click after the benefit was explained: asks for
 * permission once. A visitor who declines is never asked again.
 */
export async function enableAlerts() {
  if (typeof Notification === "undefined") return "unsupported";
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  const alerts = permission === "granted" ? "on" : "declined";
  save(ALERTS_KEY, alerts);
  set({ permission, alerts });
  if (permission === "granted") {
    import("../analytics/analytics").then(({ track }) => track("notification_optin"));
    subscribePush();
  }
  return permission;
}

export function disableAlerts() {
  save(ALERTS_KEY, "off");
  set({ alerts: "off" });
  unsubscribePush();
}

/** "Not now": hides the prompt for good on this device. */
export function dismissAlerts() {
  save(ALERTS_KEY, "declined");
  set({ alerts: "declined" });
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
