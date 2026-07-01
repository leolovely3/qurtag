/* QurTag service worker. Handles incoming Web Push and routes the click.
 *
 * Updated only when the file's content changes (vite revs via cache busting).
 */

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { title: 'QurTag', body: event.data.text() };
    }
  }

  const title = payload.title || 'QurTag';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.tag || 'qurtag-message',
    data: {
      url: payload.url || '/app/inbox',
      threadId: payload.threadId || null,
    },
    requireInteraction: false,
    silent: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/app/inbox';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Reuse an existing tab if one is open.
      for (const client of windowClients) {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          client.focus();
          if (client.navigate) {
            return client.navigate(target);
          }
          return;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
