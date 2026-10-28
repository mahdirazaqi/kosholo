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
// Replaced at bundle time by scripts/build-sw.mjs (esbuild `define`).
declare const process: { env: Record<string, string | undefined> };

const DAY = 24 * 60 * 60;
const MEDIA_THUMB = /^\/api\/media\/[0-9a-f-]{36}\/thumb$/i;

// Map tiles (NEXT_PUBLIC_MAP_TILE_URL, injected by scripts/build-sw.mjs): a
// request is a tile if it matches the template with {s}/{z}/{x}/{y} filled in.
// Nothing else from the tile host is cached.
const TILE_TEMPLATE = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_PATTERN = tilePattern(TILE_TEMPLATE);

function tilePattern(template: string) {
  const escaped = template.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .replace("{s}", "[a-z0-9-]+")
    .replace(/\{[zxy]\}/g, "\\d+")
    .replace("{r}", "(?:@2x)?");
  return new RegExp(`^${pattern}$`, "i");
}

const serwist = new Serwist({
  // /_next/static (hashed, immutable), the offline page, icons and the logo.
  precacheEntries: self.__SW_MANIFEST,
  // Updates wait until the user taps "Update" (SKIP_WAITING below).
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  // Order matters: the first matching rule wins. Only GET requests are routed;
  // everything else (Server Action POSTs, upload chunks) always goes to the
  // network. Requests no rule matches aren't intercepted at all: /api/upload/*
  // and full-size /api/media/* (big files, video/voice Range requests,
  // resumable downloads) go straight to the server.
  runtimeCaching: [
    {
      // Realtime: never cached.
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/socket.io"),
      handler: new NetworkOnly(),
    },
    {
      // Map tiles: cache-first, bounded. Tiles load as plain <img>s, so
      // responses may be opaque (status 0) when the provider sends no CORS headers.
      matcher: ({ url, sameOrigin }) => !sameOrigin && TILE_PATTERN.test(url.href),
      handler: new CacheFirst({
        cacheName: "map-tiles",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 7 * DAY, purgeOnQuotaError: true }),
        ],
      }),
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
      // Page navigations: network-first (3s), then the cached page, then
      // /~offline. Never /api/* (e.g. a file download is a navigation too).
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && request.mode === "navigate" && !url.pathname.startsWith("/api/"),
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
