const CACHE_VERSION = "fw-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Static assets to pre-cache
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/icon.png",
  "/images/icon-512.png",
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter(
            (name) =>
              name.startsWith("fw-") &&
              name !== STATIC_CACHE &&
              name !== DYNAMIC_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch: strategy depends on request type
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip API mutations
  if (
    url.pathname.includes("/users/session") ||
    request.method === "PUT" ||
    request.method === "POST" ||
    request.method === "DELETE"
  ) {
    return;
  }

  // Static assets (JS, CSS, fonts, images): Cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // API GET requests: Stale-while-revalidate
  if (isApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
    return;
  }

  // Navigation / other: Network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, STATIC_CACHE));
    return;
  }
});

function isStaticAsset(url) {
  return (
    /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|ttf|eot)(\?.*)?$/.test(
      url.pathname,
    ) || url.pathname.startsWith("/_nuxt/")
  );
}

function isApiRequest(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/sources") ||
    url.pathname.includes("/items") ||
    url.pathname.includes("/summary") ||
    url.pathname.includes("/processors") ||
    url.pathname.includes("/rules") ||
    url.pathname.includes("/lists")
  );
}

// Cache-first: try cache, fall back to network (and cache response)
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

// Network-first: try network, fall back to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response("Offline", { status: 503 });
  }
}

// Stale-while-revalidate: return cache immediately, update in background
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
