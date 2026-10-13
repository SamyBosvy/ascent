self.addEventListener('push', (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (!payload || typeof payload.body !== 'string') return;
  const path = /^\/routes\/[0-9a-f-]{36}$/.test(payload.data?.url ?? '') ? payload.data.url : '/today';
  event.waitUntil(self.registration.showNotification('Ascent', {
    body: payload.body, tag: payload.tag, icon: '/icon-192.png', badge: '/favicon.png', data: { url: path },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = /^\/routes\/[0-9a-f-]{36}$/.test(event.notification.data?.url ?? '') ? event.notification.data.url : '/today';
  const url = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    try {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        try { await existing.focus(); } catch { /* focus not guaranteed */ }
        // postMessage is enough for the app to route itself; navigate() can reject
        // or resolve null for uncontrolled clients, so it is best-effort only.
        try { existing.postMessage({ type: 'ascent:navigate', path }); } catch { /* ignore */ }
        if ('navigate' in existing) {
          try { await existing.navigate(url); } catch { /* ignore */ }
        }
      } else {
        await self.clients.openWindow(url);
      }
    } catch {
      try { await self.clients.openWindow(url); } catch { /* nothing more to do */ }
    }
  })());
});