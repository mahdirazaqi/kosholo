// Builds public/sw.js after `next build` (npm run build:sw):
// 1. bundle src/sw/sw.ts (Serwist runtime) with esbuild,
// 2. inject the precache manifest (hashed /_next/static files, the offline
//    page, icons) with @serwist/build.
// Framework-agnostic on purpose: works with Turbopack builds, cacheComponents
// and the custom server (sw.js is just a static file in /public).
import { readFile, rm } from "node:fs/promises";
import { injectManifest } from "@serwist/build";
import { build } from "esbuild";

const tmp = ".next/sw.bundle.js";

const buildId = (await readFile(".next/BUILD_ID", "utf8")).trim();

await build({
  entryPoints: ["src/sw/sw.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  outfile: tmp,
  define: {
    "process.env.NODE_ENV": '"production"',
    // Which cross-origin requests are map tiles (cached by the worker).
    "process.env.NEXT_PUBLIC_MAP_TILE_URL": JSON.stringify(process.env.NEXT_PUBLIC_MAP_TILE_URL || ""),
  },
  logLevel: "warning",
});

const { count, size, warnings } = await injectManifest({
  swSrc: tmp,
  swDest: "public/sw.js",
  globDirectory: ".next",
  // Small on purpose (mobile data): styles and fonts. JS chunks are cached at
  // runtime as they're used (CacheFirst "static-assets" in src/sw/sw.ts).
  globPatterns: ["static/**/*.{css,woff2}"],
  maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
  modifyURLPrefix: { "static/": "/_next/static/" },
  dontCacheBustURLsMatching: /^\/_next\/static\//,
  additionalPrecacheEntries: [
    { url: "/~offline", revision: buildId },
    { url: "/favicon.ico", revision: buildId },
    { url: "/logo.svg", revision: buildId },
    { url: "/icons/icon-192.png", revision: buildId },
    { url: "/manifest.webmanifest", revision: buildId },
  ],
});
await rm(tmp, { force: true });
for (const warning of warnings) console.warn(`[sw] ${warning}`);
console.log(`[sw] public/sw.js: ${count} precache entries (${(size / 1024).toFixed(0)} KiB)`);
