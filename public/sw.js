// Cultiveta Service Worker para Notificaciones de Navegador y Push
// Permite al usuario recibir alertas críticas de 'env_alert' generadas por el cron job incluso fuera de la pestaña

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Manejo de mensajes directos desde la aplicación (por ejemplo, desde el listener de SSE o Firestore en segundo plano)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    const notificationOptions = {
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌱</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>',
      vibrate: [300, 100, 300, 100, 300],
      requireInteraction: true,
      tag: options?.tag || `env-alert-${Date.now()}`,
      renotify: true,
      ...options,
    };

    event.waitUntil(
      self.registration.showNotification(title, notificationOptions)
    );
  }
});

// Manejo de eventos Push del navegador
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { description: event.data.text() };
    }
  }

  const title = data.title || '🚨 Alerta Climática Crítica (Cultiveta)';
  const body =
    data.description ||
    data.body ||
    (data.task ? `${data.task.cultivationName}: ${data.task.description}` : 'Alerta detectada por el cron job agronómico.');

  const options = {
    body,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🌱</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🚨</text></svg>',
    vibrate: [300, 150, 300, 150, 400],
    requireInteraction: true,
    tag: data.id || (data.task && data.task.id) || `env-alert-${Date.now()}`,
    renotify: true,
    data: data.task || data,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Al hacer clic en la notificación del sistema operativo: enfocar o reabrir la aplicación
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si la ventana ya existe (incluso en segundo plano), enfocarla y notificarla
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data,
          });
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir la aplicación
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});
