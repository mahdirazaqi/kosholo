"use client";

import { useCallback, useEffect, useState } from "react";

export type StorageGroup = "media" | "maps" | "pages" | "app";
export type StorageStats = { usage: number; quota: number; groups: Record<StorageGroup, number> };

const OPAQUE_TILE_BYTES = 15 * 1024; // cross-origin map tiles have no readable size
const MAX_ENTRIES = 600; // per cache: sizes come from Content-Length, no body is read

async function cacheBytes(cache: Cache, opaqueBytes = 0) {
  let total = 0;
  const requests = (await cache.keys()).slice(0, MAX_ENTRIES);
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const length = Number(response.headers.get("content-length"));
    total += length > 0 ? length : response.type === "opaque" ? opaqueBytes : 0;
  }
  return total;
}

export async function readStorageStats(): Promise<StorageStats> {
  const groups: Record<StorageGroup, number> = { media: 0, maps: 0, pages: 0, app: 0 };
  let usage = 0;
  let quota = 0;
  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? 0;
    quota = estimate?.quota ?? 0;
  } catch {
    // ignore
  }
  try {
    if ("caches" in window) {
      for (const key of await caches.keys()) {
        if (key.includes("precache")) continue;
        const cache = await caches.open(key);
        if (key.includes("tile")) groups.maps += await cacheBytes(cache, OPAQUE_TILE_BYTES);
        else if (key.includes("media")) groups.media += await cacheBytes(cache);
        else if (key.includes("pages") || key.includes("shell")) groups.pages += await cacheBytes(cache);
      }
    }
  } catch {
    // Storage may be unavailable: show what we have.
  }
  groups.app = Math.max(usage - groups.media - groups.maps - groups.pages, 0);
  return { usage, quota, groups };
}

// Used space and the cache breakdown (from the Cache API and navigator.storage).
export function useStorageStats() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const refresh = useCallback(async () => setStats(await readStorageStats()), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return { stats, refresh };
}

// Just the total, for the value on the settings root.
export function useStorageUsage() {
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    navigator.storage
      ?.estimate?.()
      .then((estimate) => live && setUsage(estimate.usage ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return usage;
}
