// Service Worker de Cultiveta
// 1. Caché del "shell" de la app para que abra sin conexión (los datos ya son offline-first).
// 2. Notificaciones del navegador para alertas climáticas.

const CACHE_VERSION = 'cultiveta-v2';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];
const NOTIFICATION_ICON = '/icons/icon-192.png';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // Si algún recurso falla, el SW se instala igual (se reintenta en la próxima carga)
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Solo recursos propios; nunca la API (datos privados y siempre frescos) ni Firebase.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navegación: red primero; sin conexión, el index cacheado (la app es una SPA).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // JS/CSS con hash del build: caché primero (el nombre cambia con cada versión).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
    return;
  }

  // Íconos y manifest: se sirve lo cacheado y se actualiza en segundo plano.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.json') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Mensajes desde la app (por ejemplo, alertas recibidas por SSE o Firestore)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const notificationOptions = {
      icon: NOTIFICATION_ICON,
      badge: NOTIFICATION_ICON,
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: (options && options.tag) || `env-alert-${Date.now()}`,
      renotify: true,
      ...options,
    };

    event.waitUntil(self.registration.showNotification(title, notificationOptions));
  }
});

// Eventos Push del navegador
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { description: event.data.text() };
    }
  }

  const title = data.title || 'Alerta climática (Cultiveta)';
  const body =
    data.description ||
    data.body ||
    (data.task ? `${data.task.cultivationName}: ${data.task.description}` : 'Revisá el estado de tu cultivo.');

  const options = {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    vibrate: [300, 150, 300, 150, 400],
    requireInteraction: true,
    tag: data.id || (data.task && data.task.id) || `env-alert-${Date.now()}`,
    renotify: true,
    data: data.task || data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: enfocar la app o abrirla
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
