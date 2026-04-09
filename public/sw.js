const CACHE_NAME = 'giftmind-v1';
const PRECACHE_URLS = [
  '/',
  '/offline.html',
];

// Install: precache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls (supabase, anthropic): network-only (never cache)
// - Static assets (JS, CSS, images): stale-while-revalidate
// - HTML pages: network-first, fall back to cache, then offline page
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip API calls — never cache these
  if (url.hostname.includes('supabase.co') || 
      url.hostname.includes('anthropic.com') ||
      url.hostname.includes('api.')) {
    return;
  }
  
  // Static assets: stale-while-revalidate
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetched = fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            // Check if response is ok
            if (response.ok) {
                cache.put(event.request, clone);
            }
          });
          return response;
        });
        return cached || fetched;
      })
    );
    return;
  }
  
  // HTML pages: network-first
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
            if (response.ok) {
                cache.put(event.request, clone);
            }
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request)
          .then((cached) => cached || caches.match('/offline.html'));
      })
  );
});
