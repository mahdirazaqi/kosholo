"use client";

import { useEffect } from "react";

// iOS Safari ignores `interactive-widget=resizes-content`: the keyboard overlays
// the page instead of resizing it. Track the visual viewport height in
// --app-height (used by AppShell) so the composer stays above the keyboard.
export function useVisualViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;

    const update = () => {
      root.style.setProperty("--app-height", `${viewport.height}px`);
      // iOS scrolls the whole page to reveal the focused input; undo that.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--app-height");
    };
  }, []);
}
