/* Service Worker for Web Push Notifications */
/* v4 – native-like, role-aware, deep-linked notifications */

const CACHE_VERSION = "v4";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

/* Role visual dictionary — kept in sync with the client. */
const ROLE_META = {
  CON:      { prefix: "[CONSTRUCTOR]", vibrate: [120, 60, 120] },
  DO:       { prefix: "[DO]",          vibrate: [120, 60, 120] },
  DEM:      { prefix: "[DEM]",         vibrate: [120, 60, 120] },
  CSS:      { prefix: "[CSS]",         vibrate: [200, 100, 200, 100, 200] },
  PRO:      { prefix: "[PROMOTOR]",    vibrate: [120, 60, 120] },
  PROMOTOR: { prefix: "[PROMOTOR]",    vibrate: [120, 60, 120] },
};

self.addEventListener("push", (event) => {
  let data = { title: "TEKTRA", body: "Nueva notificación", url: "/" };
  try {
    data = event.data.json();
  } catch (e) {
    // fallback
  }

  const role = (data.senderRole || "").toUpperCase();
  const meta = ROLE_META[role];
  const senderName = data.senderName || "";
  const rawBody = data.body || data.message || "Nueva notificación";

  // Body format: "[ROL] Nombre — contenido"
  // Avoid duplication if the body already contains the sender name (e.g. "Pedro ha registrado…")
  let body = rawBody;
  const bodyStartsWithName =
    senderName && rawBody.toLowerCase().startsWith(senderName.toLowerCase());
  if (senderName && !bodyStartsWithName) {
    body = `${senderName} — ${rawBody}`;
  }
  if (meta && !body.startsWith(meta.prefix)) {
    body = `${meta.prefix} ${body}`;
  }

  // Tag groups notifications by project (or message id as fallback)
  const tag = data.projectId
    ? `tektra-project-${data.projectId}`
    : data.id || "tektra-notification";

  event.waitUntil(
    self.registration.showNotification(data.title || "TEKTRA", {
      body,
      icon: "/tektra-icon-192.png",
      badge: "/tektra-icon-192.png",
      tag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      lang: "es",
      vibrate: meta?.vibrate || [120, 60, 120],
      timestamp: Date.now(),
      actions: [
        { action: "open", title: "Abrir" },
        { action: "dismiss", title: "Descartar" },
      ],
      data: {
        url: data.url || "/",
        projectId: data.projectId || null,
        notificationId: data.id || null,
      },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const url = event.notification.data?.url || "/";
  // Build full URL for deep linking
  const fullUrl = url.startsWith("http") ? url : `${self.location.origin}${url}`;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(fullUrl);
          return client.focus();
        }
      }
      return clients.openWindow(fullUrl);
    })
  );
});

/* Allow the app to ask the SW to clear delivered notifications when it gains focus. */
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_NOTIFICATIONS") {
    event.waitUntil(
      self.registration.getNotifications().then((notifs) => {
        notifs.forEach((n) => n.close());
      })
    );
  }
});
