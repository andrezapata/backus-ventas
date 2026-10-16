const CACHE_NAME = 'backus-ventas-cache-v2';

const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/polyfills.js',
  '/styles.css',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/data/catalogo.json',
  '/data/precios.json',
  '/real-cristal.jpg',
  '/real-pilsen.jpg',
  '/real-cusquena.jpg',
  '/real-san-mateo-sin-gas.jpg',
  '/san-mateo-con-gas.png'
];

// 1. INSTALACIÓN: Pre-cachear todos los activos críticos individualmente
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usar Promise.allSettled para que si un activo falla, los demás sí se guarden
      return Promise.all(
        CRITICAL_ASSETS.map((url) => {
          return fetch(url)
            .then((res) => {
              if (res.ok) {
                return cache.put(url, res);
              }
            })
            .catch((err) => console.warn('[SW] No se pudo pre-cachear:', url, err));
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVACIÓN: Eliminar cachés antiguas y tomar control de clientes inmediatamente
self.addEventListener('activate', (event) => {
  console.log('[SW] Activado. Tomando control de clientes...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Eliminando caché previa:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH: Estrategia Stale-While-Revalidate / Cache con Fallback seguro
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo peticiones GET HTTP(S)
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Evitar interceptar WebSockets de Vite/HMR
  if (url.pathname.includes('/@vite/') || url.pathname.includes('vite-hmr')) {
    return;
  }

  // Para peticiones de navegación (recargar página o abrir URL)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(async () => {
          console.log('[SW] Modo offline: recuperando página principal de caché...');
          const cached = await caches.match(req, { ignoreSearch: true })
            || await caches.match('/', { ignoreSearch: true })
            || await caches.match('/index.html', { ignoreSearch: true });
          
          if (cached) {
            return cached;
          }

          // Fallback HTML de emergencia si por alguna razón no estaba en caché
          return new Response(
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Backus Ventas PWA - Offline</title></head><body style="background:#070b14;color:#f8fafc;font-family:sans-serif;padding:20px;text-align:center;"><h2>Backus Ventas PWA - Modo Offline</h2><p>La aplicación está cargando desde la copia local guardada.</p><button onclick="location.reload()" style="padding:10px 20px;background:#f59e0b;color:#000;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">Reintentar</button></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Para todo lo demás (JSON de datos, scripts, estilos, imágenes)
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {
      // Si está en caché, lo devolvemos inmediatamente y actualizamos en segundo plano si hay red
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Error de red esperado en modo offline
          return null;
        });

      if (cachedResponse) {
        return cachedResponse;
      }

      // Si no estaba en caché, esperar la red
      return fetchPromise.then((netRes) => {
        if (netRes) return netRes;
        // Si no hay red ni caché, retornar respuesta segura para evitar ERR_FAILED
        if (url.pathname.endsWith('.json')) {
          return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('', { status: 404, statusText: 'Not found in offline cache' });
      });
    })
  );
});
