/*
 * Klinik SaaS — Service worker
 * Yalnızca uygulama kabuğunu (CSS, JS, ikonlar) ve çevrimdışı sayfasını önbelleğe alır.
 * Hasta verisi içeren sayfalar, API yanıtları ve dosyalar KVKK gereği cihazda saklanmaz.
 */
var SURUM = 'klinik-kabuk-v1';
var ONCEDEN = ['/cevrimdisi', '/static/css/klinik.css', '/static/ikon/ikon-192.png', '/static/ikon/favicon-48.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SURUM).then(function (c) { return c.addAll(ONCEDEN); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (anahtarlar) {
    return Promise.all(anahtarlar.filter(function (a) { return a !== SURUM; }).map(function (a) { return caches.delete(a); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var istek = e.request;
  if (istek.method !== 'GET') return;
  var url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;

  // Sayfa geçişleri: her zaman ağdan; bağlantı yoksa çevrimdışı sayfası
  if (istek.mode === 'navigate') {
    e.respondWith(fetch(istek).catch(function () { return caches.match('/cevrimdisi'); }));
    return;
  }
  // Statik dosyalar: önbellekten hızlı aç, arkada güncelle
  if (url.pathname.indexOf('/static/') === 0 && url.pathname !== '/static/sw.js') {
    e.respondWith(caches.open(SURUM).then(function (c) {
      return c.match(istek).then(function (onbellek) {
        var ag = fetch(istek).then(function (y) { if (y.ok) c.put(istek, y.clone()); return y; }).catch(function () { return onbellek; });
        return onbellek || ag;
      });
    }));
  }
  // API, hasta dosyaları ve diğer her şey: yalnızca ağ (önbelleğe alınmaz)
});
