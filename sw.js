/* Trabajo sin internet: guarda en la computadora los archivos del CRM (y las librerías que usa)
   para que abra aunque se corte la conexión. Primero intenta la red (para tener siempre la versión
   nueva) y, si no hay internet, usa la copia guardada. Los datos los guarda Firebase por su cuenta. */
const CACHE = 'crm-mg-v1';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'css/styles.css', 'js/firebase-config.js', 'js/cloud.js', 'data/operaciones.js', 'js/model.js',
  'js/evolta.js', 'js/clausula.js', 'js/constancia.js', 'js/devolucion.js', 'js/app.js', 'vendor/xlsx.full.min.js'];
// solo se guardan copias de estos sitios (archivos del CRM y librerías); nunca de los datos ni del inicio de sesión
const GUARDA = (u) => u.origin === self.location.origin || /^(www\.gstatic\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com)$/.test(u.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (!GUARDA(u)) return;
  e.respondWith(fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)).catch(() => null); }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match(req, { ignoreSearch: true })).then(r => r || (req.mode === 'navigate' ? caches.match('index.html', { ignoreSearch: true }) : undefined))
    .then(r => r || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
});
