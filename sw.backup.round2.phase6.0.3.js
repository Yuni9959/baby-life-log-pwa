const CACHE_NAME = "baby-life-log-v6.0.3-7day-charts";
const CACHE_PREFIX = "babylog-cache-";
const OLD_CACHE_PREFIX = "baby-life-log-";
const PRIMARY_CACHE_NAME = CACHE_NAME;
const ASSETS_TO_CACHE = [
  "./manifest.json",
  "./sw.js",
  "./cloud-config.js",
  "./cloud-supabase.js",
  "./phase4_3_sql_migration.sql",
  "./supabase_phase4_0_auth_identity_foundation.sql",
  "./supabase_phase3_8_family_identity.sql",
  "./supabase_phase3_7_1_type_sync_fix.sql",
  "./supabase_phase3_7_sync_stabilization.sql",
  "./supabase_phase3_6_connection_diagnostics.sql",
  "./supabase_phase3_5_family_baby_hardening.sql",
  "./supabase_phase3_3_family_baby_sync.sql",
  "./supabase_phase3_1_records.sql"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(function (asset) {
          return cache.add(asset);
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (
            (key.indexOf(CACHE_PREFIX) === 0 || key.indexOf(OLD_CACHE_PREFIX) === 0) &&
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

self.addEventListener("message", function (event) {
  if (!event.data || event.data.type !== "GET_VERSION") return;
  const target = event.ports && event.ports[0] ? event.ports[0] : event.source;
  if (target && typeof target.postMessage === "function") {
    target.postMessage({
      type: "VERSION_INFO",
      appVersion: "6.0.0",
      cacheName: CACHE_NAME
    });
  }
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isNavigation =
    event.request.mode === "navigate" ||
    requestUrl.pathname.endsWith("/") ||
    requestUrl.pathname.endsWith("/index.html");

  if (requestUrl.origin === self.location.origin && isNavigation) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then(function (response) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put("./index.html", responseClone).catch(function () {});
        });
        return response;
      }).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }

  if (
    requestUrl.origin === self.location.origin &&
    (
      requestUrl.pathname.endsWith("/cloud-config.js") ||
      requestUrl.pathname.endsWith("/cloud-supabase.js") ||
      requestUrl.pathname.endsWith("/sw.js")
    )
  ) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then(function (response) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, responseClone).catch(function () {});
        });
        return response;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(function (response) {
        if (!response || response.status !== 200 || requestUrl.origin !== self.location.origin) {
          return response;
        }
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, responseClone).catch(function () {});
        });
        return response;
      }).catch(function (error) {
        throw error;
      });
    })
  );
});
