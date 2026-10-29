"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useVisualViewportHeight } from "@/hooks/use-visual-viewport-height";

// Containers that keep their own pinch/zoom (the image lightbox, the maps).
const ZOOM_ZONE = "[data-allow-zoom], .yarl__root, .leaflet-container";
// Where the native context menu stays.
const NATIVE_MENU_ZONE = "input, textarea, [contenteditable='true'], .selectable-always, [data-native-menu]";

const inZoomZone = (target: EventTarget | null) => target instanceof Element && target.closest(ZOOM_ZONE) !== null;

// Page-wide guards that CSS can't express (CLAUDE.md, "Native feel rules").
export function NativeBehaviors() {
  // The shell follows the visual viewport (iOS keyboard) on every page.
  useVisualViewportHeight();
  useGuards();
  useOverflowDetector();
  return (
    <Suspense fallback={null}>
      <ViewTransitions />
    </Suspense>
  );
}

function useGuards() {
  useEffect(() => {
    // iOS pinch: Safari ignores user-scalable=no in some cases.
    const onGesture = (event: Event) => {
      if (!inZoomZone(event.target)) event.preventDefault();
    };
    // Desktop: Ctrl/Cmd + wheel, Ctrl/Cmd + + - 0.
    const onWheel = (event: WheelEvent) => {
      if ((event.ctrlKey || event.metaKey) && !inZoomZone(event.target)) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !["+", "=", "-", "_", "0"].includes(event.key)) return;
      if (document.querySelector(ZOOM_ZONE)) return; // a viewer/map is open: it zooms itself
      event.preventDefault();
    };
    // No native context menu, except where it's useful: inputs, and selected
    // message text with a mouse. Our own menus handle right-click themselves.
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(NATIVE_MENU_ZONE)) return;
      const fine = window.matchMedia("(pointer: fine)").matches;
      if (fine && target?.closest(".selectable-text") && window.getSelection()?.toString()) return;
      event.preventDefault();
    };
    // No dragging of images and links.
    const onDragStart = (event: DragEvent) => {
      if (event.target instanceof Element && event.target.closest("img, a, svg")) event.preventDefault();
    };
    // Never show the browser's broken-image icon.
    const onError = (event: Event) => {
      if (event.target instanceof HTMLImageElement) event.target.style.visibility = "hidden";
    };

    const gestures = ["gesturestart", "gesturechange", "gestureend"] as const;
    for (const name of gestures) document.addEventListener(name, onGesture, { passive: false });
    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("error", onError, true);
    return () => {
      for (const name of gestures) document.removeEventListener(name, onGesture);
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("error", onError, true);
    };
  }, []);
}

function useOverflowDetector() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@/lib/dev/overflow-detector").then((module) => {
      if (!cancelled) stop = module.startOverflowDetector();
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);
}

// Navigation depth: tabs and the chat list are 0, a chat is 1, its info page 2.
function depth(path: string) {
  if (path === "/" || path === "/contacts" || path === "/settings") return 0;
  return Math.max(path.split("/").filter(Boolean).length - 1, 0);
}

// Phones: link navigation slides (a chat opens from the inline end, going back
// slides out) with the View Transitions API; browsers without it, and reduced
// motion, navigate without animation. The transition waits for the new route.
function ViewTransitions() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const finish = useRef<(() => void) | null>(null);

  useEffect(() => {
    current.current = pathname;
    const done = finish.current;
    finish.current = null;
    if (done) requestAnimationFrame(() => requestAnimationFrame(done));
  }, [pathname]);

  useEffect(() => {
    if (!("startViewTransition" in document)) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!window.matchMedia("(max-width: 767px)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === current.current) return;
      const from = depth(current.current);
      const to = depth(url.pathname);
      if (from === to) return; // tab switches don't slide
      const root = document.documentElement;
      root.dataset.nav = to > from ? "forward" : "back";
      const transition = (document as Document & { startViewTransition: (cb: () => Promise<void>) => { finished: Promise<void> } }).startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            finish.current = resolve;
            setTimeout(resolve, 700); // never hang on a slow route
          }),
      );
      void transition.finished.finally(() => delete root.dataset.nav);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
