const CACHE_NAME = 'knesset-pwa-v3';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js'
].map((url) => new URL(url).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await Promise.all(CDN_ASSETS.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const request = new Request(url, { mode: 'no-cors' });
        const response = await fetch(request, { signal: controller.signal });
        if (!response.ok && response.type !== 'opaque') {
          throw new Error(`HTTP ${response.status}`);
        }
        await cache.put(request, response);
      } catch (error) {
        console.warn('Bibliothèque indisponible hors ligne :', url, error);
      } finally {
        clearTimeout(timeout);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith('knesset-pwa-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const appRoot = new URL('./', self.location);
  const appIndex = new URL('./index.html', self.location);
  if (request.mode === 'navigate' &&
      url.origin === appRoot.origin &&
      (url.pathname === appRoot.pathname || url.pathname === appIndex.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('./index.html', response.clone());
          } catch (error) {
            console.warn('Impossible de mettre la page en cache :', error);
          }
        }
        return response;
      } catch (error) {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        throw error;
      }
    })());
    return;
  }

  if (CDN_ASSETS.includes(request.url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn('Impossible de mettre la bibliothèque en cache :', request.url, error);
        }
      }
      return response;
    })());
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith((async () => (await caches.match(request)) || fetch(request))());
  }
});
