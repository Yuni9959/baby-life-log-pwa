const CACHE_NAME = "baby-life-log-v4.1-20260525";
const CACHE_PREFIX = "baby-life-log-";
const LEGACY_CACHE_NAME = "baby-life-log-v3.8-legacy";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./service-worker.js",
  "./cloud-config.js",
  "./cloud-supabase.js",
  "./phase4_1_google_login_setup_notes.md",
  "./supabase_phase4_0_auth_identity_foundation.sql",
  "./supabase_phase3_8_family_identity.sql",
  "./PHASE3_8_MULTI_DEVICE_TEST_REPORT.md",
  "./supabase_phase3_7_1_type_sync_fix.sql",
  "./PHASE3_7_1_BROWSER_VERIFICATION_REPORT.md",
  "./supabase_phase3_7_sync_stabilization.sql",
  "./supabase_phase3_6_connection_diagnostics.sql",
  "./PHASE3_6_SUPABASE_CONNECTION_CHECKLIST.md",
  "./supabase_phase3_5_family_baby_hardening.sql",
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

  if (
    requestUrl.pathname.endsWith("/cloud-config.js") ||
    requestUrl.pathname.endsWith("/cloud-supabase.js") ||
    requestUrl.pathname.endsWith("/service-worker.js")
  ) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(function (response) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(request, responseClone).catch(function () {});
          });
          return response;
        })
        .catch(function () {
          return caches.match(request);
        })
    );
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
