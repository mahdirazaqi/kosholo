"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// Registers /sw.js in production only (`npm run build` generates it), after
// the page has loaded so installing the worker never competes with first
// paint. In development, any worker left over from a production run on the
// same origin is removed so it can't serve stale files.
// When an update is waiting, a toast offers "Update" → SKIP_WAITING → reload.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
      return;
    }

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    const promptUpdate = (worker: ServiceWorker) => {
      toast("A new version is available", {
        id: "sw-update",
        duration: Infinity,
        action: {
          label: "Update",
          onClick: () => {
            navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        // Only an *update* waits; the first install activates right away.
        if (registration.waiting && navigator.serviceWorker.controller) promptUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) promptUpdate(worker);
          });
        });
        // Check for updates when the app comes back to the foreground.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") void registration.update().catch(() => {});
        });
      } catch (error) {
        console.warn("[sw] registration failed", error);
      }
    };

    if (document.readyState === "complete") void register();
    else window.addEventListener("load", () => void register(), { once: true });
  }, []);

  return null;
}
