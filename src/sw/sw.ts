/// <reference lib="webworker" />
// Service worker (Serwist). Bundled after `next build` by scripts/build-sw.mjs
// into public/sw.js, with the precache manifest injected at self.__SW_MANIFEST.
// Registered in production only (src/components/pwa/service-worker.tsx).
import {
  CacheableResponsePlugin,
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;
const MEDIA_THUMB = /^\/api\/media\/[0-9a-f-]{36}\/thumb$/i;

const serwist = new Serwist({
  // /_next/static (hashed, immutable), the offline page, icons and the logo.
  precacheEntries: self.__SW_MANIFEST,
  // Updates wait until the user taps "Update" (SKIP_WAITING below).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  // Order matters: the first matching rule wins. Only GET requests are routed;
  // everything else (Server Action POSTs, uploads) always goes to the network.
  runtimeCaching: [
    {
      // Never cache: realtime, uploads, and full-size media (video/voice use
      // Range requests and must stream from the server).
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith("/socket.io") ||
          url.pathname.startsWith("/api/upload") ||
          (url.pathname.startsWith("/api/media/") && !MEDIA_THUMB.test(url.pathname))),
      handler: new NetworkOnly(),
    },
    {
      // Image/video thumbnails and avatar thumbs: cache-first to save mobile data.
      matcher: ({ url, sameOrigin }) => sameOrigin && MEDIA_THUMB.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "media-thumbs",
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY, purgeOnQuotaError: true }),
        ],
      }),
    },
    {
      // Build assets, fonts, icons: immutable.
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.startsWith("/_next/static/") ||
          url.pathname.startsWith("/icons/") ||
          url.pathname.startsWith("/emojibase/") ||
          /\.(?:woff2?|svg|ico)$/.test(url.pathname)),
      handler: new CacheFirst({
        cacheName: "static-assets",
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 200 })],
      }),
    },
    {
      // Page navigations: network-first (3s), then the cached page, then /~offline.
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages",
        networkTimeoutSeconds: 3,
        plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 30 })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: "/~offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

// "Update" in the update toast: activate the waiting worker now.
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

serwist.addEventListeners();
