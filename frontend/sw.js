/* Therapify - Service Worker para PWA (instalar en pantalla de inicio) */
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', function () {
  /* Todas las peticiones pasan al servidor */
});
