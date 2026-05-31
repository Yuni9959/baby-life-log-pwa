const APP_VERSION = "5.0.0";
const CACHE_NAME = `babylog-cache-${APP_VERSION}`;
const ASSETS_TO_CACHE = [
  "./index.html",
  "./manifest.json",
  `./sw.js?v=${APP_VERSION}`,
  `./service-worker.js?v=${APP_VERSION}`,
  `./cloud-config.js?v=${APP_VERSION}`,
  `./cloud-supabase.js?v=${APP_VERSION}`,
  `./phase5-analysis.js?v=${APP_VERSION}`,
  "./phase4_3_cloud_backup_notes.md",
  "./phase4_3_sql_migration.sql",
  "./phase4_1_google_login_setup_notes.md",
  "./phase4_2_kakao_login_notes.md",
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
  "./icon-192.svg",
  "./icon-512.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return Promise.allSettled(ASSETS_TO_CACHE.map(function (asset) {
        return cache.add(asset);
      }));
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          return key === CACHE_NAME ? Promise.resolve() : caches.delete(key);
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
      appVersion: APP_VERSION,
      cacheName: CACHE_NAME
    });
  }
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin === self.location.origin &&
    (
      requestUrl.pathname.endsWith("/cloud-config.js") ||
      requestUrl.pathname.endsWith("/cloud-supabase.js") ||
      requestUrl.pathname.endsWith("/phase5-analysis.js") ||
      requestUrl.pathname.endsWith("/service-worker.js") ||
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

  if (event.request.mode === "navigate") {
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

  event.respondWith(
    caches.match(event.request).then(function (cachedResponse) {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).catch(function (error) {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        throw error;
      });
    })
  );
});
