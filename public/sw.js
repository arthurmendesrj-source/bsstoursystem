// Service Worker — Web Push only (no offline cache, no navigation interception)
// Mantido mínimo para evitar conflitos com o preview do Lovable.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Recebe push do servidor e exibe notificação mesmo com a aba fechada
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: "Alerta", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Novo alerta";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: payload.badge || "/favicon.ico",
    tag: payload.tag || "lead-alert",
    data: {
      url: payload.url || "/alerts",
      leadId: payload.leadId,
    },
    requireInteraction: payload.requireInteraction === true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Ao clicar na notificação, foca a aba existente ou abre nova
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/alerts";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientsArr) => {
        for (const client of clientsArr) {
          if ("focus" in client) {
            client.navigate(targetUrl).catch(() => {});
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});
