const CACHE_NAME = "baby-life-log-v3.3";
const CACHE_PREFIX = "baby-life-log-";
const LEGACY_CACHE_NAME = "baby-life-log-v3.3-legacy";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./cloud-config.js",
  "./cloud-supabase.js",
  "./supabase_phase3_3_family_baby_sync.sql",
  "./supabase_phase3_1_records.sql",
  "./PHASE3_1_SUPABASE_SETUP.md",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        return Promise.allSettled(
          APP_SHELL.map(function (asset) {
            return cache.add(asset);
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (cacheNames) {
        return Promise.all(
          cacheNames.map(function (cacheName) {
            if (
              cacheName.indexOf(CACHE_PREFIX) === 0 &&
              cacheName !== CACHE_NAME &&
              cacheName !== LEGACY_CACHE_NAME
            ) {
              return caches.delete(cacheName);
            }
            return Promise.resolve();
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put("./index.html", responseClone).catch(function () {});
          });
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request)
        .then(function (response) {
          if (!response || response.status !== 200) {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, responseClone).catch(function () {});
          });
          return response;
        })
        .catch(function () {
          return caches.match("./index.html");
        });
    })
  );
});
