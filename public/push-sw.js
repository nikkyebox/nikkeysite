// Service worker dedicado a Web Push (VAPID) — registrado em escopo próprio
// ("/push/", que não corresponde a nenhuma rota real) para nunca competir com
// o service worker principal gerado pelo vite-plugin-pwa/Workbox (esse cuida do
// cache/offline da SPA; este aqui só existe para receber notificações push em
// segundo plano). Fica fora do pipeline do Vite/Workbox de propósito — script
// plano, sem precache, sem build step.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'NikkeyBox', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'NikkeyBox';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/icon-96x96.png',
    image: data.image || undefined,
    data: { url: data.url || '/' },
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação: foca uma aba já aberta na URL de destino, ou abre uma nova.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const target = new URL(url, self.location.origin).href;
      const existing = clientsArr.find((c) => c.url === target);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
