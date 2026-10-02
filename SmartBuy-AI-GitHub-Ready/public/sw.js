const CACHE = "smartbuy-v6.0.2-shell";
const SHELL = ["/", "/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || (await caches.match("/offline"))));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});

// v5.0 — true Web Push. This runs in the service worker even when no SmartBuy tab is open.
self.addEventListener("push", event => {
  let payload = { title: "SmartBuy", body: "Є нове сповіщення", url: "/?tab=notifications", tag: "smartbuy" };
  try { if (event.data) payload = { ...payload, ...event.data.json() }; } catch {
    try { payload.body = event.data?.text() || payload.body; } catch {}
  }
  event.waitUntil(self.registration.showNotification(payload.title || "SmartBuy", {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "smartbuy",
    renotify: false,
    data: { url: payload.url || "/?tab=notifications", kind: payload.kind || "info" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/?tab=notifications", self.location.origin).toString();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    for (const client of clients) {
      if ("focus" in client) {
        try { if ("navigate" in client) await client.navigate(target); } catch {}
        return client.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
  }));
});
