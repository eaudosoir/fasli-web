/* إلغاء تسجيل عامل الخدمة القديم لتطبيق «فصلي» بعد انتقاله إلى fasli.weyasmo.com */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (_) {}
    try { await self.registration.unregister(); } catch (_) {}
    try { const cs = await self.clients.matchAll({ type: 'window' }); cs.forEach(c => c.navigate(c.url)); } catch (_) {}
  })());
});
