self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data.json(); } catch {}
  const title = data.title || 'Portero eléctrico';
  const options = {
    body: data.body || 'Hay alguien en la puerta',
    icon: 'icon.png',
    tag: 'portero-' + (data.unit || ''),
    requireInteraction: true,
    data: { unit: data.unit },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const unit = event.notification.data?.unit;
  const targetUrl = self.registration.scope + 'vecino.html?unit=' + encodeURIComponent(unit || '');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('vecino.html') && client.url.includes(unit) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
