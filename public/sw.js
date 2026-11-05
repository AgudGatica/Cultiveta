// Service Worker de Cultiveta
// 1. Caché del "shell" de la app para que abra sin conexión (los datos ya son offline-first).
// 2. Avisos al celular (push del servidor, aunque la app esté cerrada) y notificaciones de la app abierta.

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

// Avisos al celular: el servidor manda { title, body, url, tag } (src/server/push/pushService.ts)
// - Con la app abierta y a la vista no aparece notificación: la app lo muestra adentro.
// - Si llegan varios de golpe (el celular estuvo sin señal), suena solo el primero; los demás entran callados.
// - El de clima es uno solo en la bandeja: reemplaza a los de clima anteriores (también a los viejos, uno por planta).
const BURST_MS = 60 * 1000;
let lastSoundAt = 0;

async function showPush(data) {
  const title = data.title || 'Cultiveta';
  const body =
    data.body ||
    data.description ||
    (data.task ? `${data.task.cultivationName}: ${data.task.description}` : 'Revisá el estado de tu cultivo.');
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : data.task && data.task.cultivationId ? `/cultivos/${encodeURIComponent(data.task.cultivationId)}` : '/';
  const tag = data.tag || data.id || (data.task && data.task.id) || `cultiveta-${Date.now()}`;

  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = windows.find((c) => c.visibilityState === 'visible');
  if (visible) {
    visible.postMessage({ type: 'PUSH_IN_APP', msg: { title, body, url, tag } });
    return;
  }

  if (String(tag).startsWith('clima') && self.registration.getNotifications) {
    const old = await self.registration.getNotifications();
    old.filter((n) => n.tag !== tag && /^(clima-|env-alert-)/.test(n.tag || '')).forEach((n) => n.close());
  }

  const now = Date.now();
  const quiet = now - lastSoundAt < BURST_MS;
  if (!quiet) lastSoundAt = now;

  await self.registration.showNotification(title, {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    vibrate: [200, 100, 200],
    tag,
    renotify: !quiet,
    silent: quiet,
    data: { url },
  });
}

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  event.waitUntil(showPush(data));
});

// Al tocar el aviso: la app abierta va a ese lugar; si estaba cerrada, se abre ahí
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : data.cultivationId ? `/cultivos/${encodeURIComponent(data.cultivationId)}` : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICKED', data: { ...data, url } });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
