"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

// Mouse/trackpad devices: hover menus, Enter-to-send, emoji popover.
export function useIsDesktop() {
  return useMediaQuery("(hover: hover) and (pointer: fine)");
}
