"use client";

import { useEffect } from "react";
import { applyToDom, getCurrentAppearance, watchMode } from "@/lib/appearance/runtime";

// Mounted once in the root layout: re-applies the cached appearance after
// hydration (it also corrects an unknown id the boot script let through) and keeps
// the status-bar colour in step with the display mode.
export function AppearanceWatcher() {
  useEffect(() => {
    applyToDom(getCurrentAppearance());
    return watchMode();
  }, []);
  return null;
}
