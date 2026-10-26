"use client";

// Logout: drop every service-worker cache that can hold account data (pages,
// media thumbnails) so the next person on this device sees nothing of the
// previous account. Serwist's precache only holds build assets, icons and the
// offline page, so it's kept: deleting it would break the offline fallback
// until the next worker update.
export async function clearAppCaches() {
  try {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !key.includes("precache")).map((key) => caches.delete(key)));
  } catch {
    // Storage may be unavailable (private mode); nothing to clear then.
  }
}
