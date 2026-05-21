const CACHE_NAME = 'baby-life-log-v3.2-legacy';
const CACHE_PREFIX = 'baby-life-log-';
const PRIMARY_CACHE_NAME = 'baby-life-log-v3.2';
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './sw.js',
  './cloud-config.js',
  './cloud-supabase.js',
  './supabase_phase3_1_records.sql',
  './PHASE3_1_SUPABASE_SETUP.md',
  './icon-192.svg',
  './icon-512.svg'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(key) {
          if (
            key.indexOf(CACHE_PREFIX) === 0 &&
            key !== CACHE_NAME &&
            key !== PRIMARY_CACHE_NAME
          ) {
            return caches.delete(key);
          }
          return undefined;
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).catch(function(error) {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw error;
      });
    })
  );
});
