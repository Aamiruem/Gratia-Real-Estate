/* Gratia Estates service worker.
 *
 *  - Pages: network first, so visitors always get the latest site; the last
 *    copy is used offline, then the app shell, then /offline.html.
 *  - Built JS/CSS (hashed file names): cache first (they never change).
 *  - Images, fonts, icons: stale-while-revalidate with size limits.
 *  - /api/*: never cached (enquiries, sign-in and owner data stay private).
 */
const VERSION = "2026-11-15";
const PRECACHE = `gratia-precache-${VERSION}`;
const PAGES = "gratia-pages";
const ASSETS = "gratia-assets";
const IMAGES = "gratia-images";
const FONTS = "gratia-fonts";
const KEEP = [PRECACHE, PAGES, ASSETS, IMAGES, FONTS];

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/assets/logo-primary.png",
];

const HASHED = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?)$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith("gratia-") && !KEEP.includes(name)).map((name) => caches.delete(name)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

async function trim(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - maxEntries; i += 1) await cache.delete(keys[i]);
}

async function networkFirstPage(event) {
  const { request } = event;
  try {
    const response = (await event.preloadResponse) || (await fetch(request));
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(PAGES).then((cache) => cache.put(request, copy).then(() => trim(PAGES, 40)));
    }
    return response;
  } catch {
    return (
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match("/", { cacheName: PAGES })) ||
      (await caches.match("/", { cacheName: PRECACHE })) ||
      (await caches.match("/offline.html"))
    );
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    caches.open(cacheName).then((cache) => cache.put(request, copy).then(() => trim(cacheName, maxEntries)));
  }
  return response;
}

async function staleWhileRevalidate(event, cacheName, maxEntries) {
  const { request } = event;
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      // Opaque (no-cors) image responses are kept too, so photos show offline.
      if (response.ok || response.type === "opaque") {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy).then(() => trim(cacheName, maxEntries)));
      }
      return response;
    })
    .catch(() => cached);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return; // always live
    if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(event));
      return;
    }
    if (HASHED.test(url.pathname)) {
      event.respondWith(cacheFirst(request, ASSETS, 150));
      return;
    }
    if (request.destination === "image" || /\.(?:png|jpe?g|webp|avif|svg|ico)$/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, IMAGES, 80));
    }
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(event, FONTS, 30));
    return;
  }
  if (url.hostname === "images.unsplash.com" && request.destination === "image") {
    event.respondWith(staleWhileRevalidate(event, IMAGES, 80));
  }
});

// Clicking a notification focuses an open tab (or opens one) at its link.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) return client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// Ready for server push (Web Push) if it is enabled later: shows the payload.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "Gratia Estates", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Gratia Estates", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/notifications" },
    }),
  );
});
