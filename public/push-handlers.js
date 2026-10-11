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
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(url); await existing.focus(); }
    else await self.clients.openWindow(url);
  })());
});