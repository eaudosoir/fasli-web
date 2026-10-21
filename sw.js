/* فصلي — العمل بدون إنترنت على الآيفون والمتصفح */
const VERSION = 'fasli-web-202610212220';
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'img/brand-white.png', 'img/brand-navy.png', 'img/logo.png', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-512-solid.png', 'img/apple-touch-icon.png',
  'js/jszip.min.js', 'js/db.js', 'js/data.js', 'js/util.js', 'js/curriculum.js', 'js/app.js', 'js/session.js', 'js/screens.js', 'js/screens2.js',
  'js/tools.js', 'js/motivate.js', 'js/school.js', 'js/questions.js', 'js/class.js', 'js/care.js', 'js/smart.js', 'js/platform.js', 'js/plus.js', 'js/reset.js', 'js/portal.js', 'js/gradebook.js', 'js/pwa.js', 'js/sync-config.js', 'js/sync.js', 'js/web.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // خطوط Google: من الذاكرة أولًا ثم الشبكة
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION + '-fonts').then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // ملفات التطبيق: الشبكة أولًا ليصل التحديث، والذاكرة عند انقطاع الإنترنت
  // no-cache: يتحقق من الخادم في كل مرة (GitHub Pages يحفظ الملفات في المتصفح ١٠ دقائق فيتأخر وصول التحديث)
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())));
});
