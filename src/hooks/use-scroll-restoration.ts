"use client";

import { useEffect, type RefObject } from "react";

// pathname → scrollTop of the shell's scroller, for this session.
const positions = new Map<string, number>();

// Coming back to a page (the chat list after a chat) puts the scroller where it
// was. The content may still be streaming in, so the restore retries for about
// a second, and gives up as soon as the user scrolls.
export function useScrollRestoration(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const key = window.location.pathname;
    const target = positions.get(key) ?? 0;
    let touched = false;
    let tries = 0;
    let frame = 0;

    const restore = () => {
      if (touched || target === 0) return;
      if (element.scrollHeight - element.clientHeight >= target || tries++ > 60) {
        element.scrollTop = target;
        return;
      }
      frame = requestAnimationFrame(restore);
    };
    restore();

    const save = () => positions.set(key, element.scrollTop);
    const stop = () => {
      touched = true;
    };
    element.addEventListener("scroll", save, { passive: true });
    element.addEventListener("touchstart", stop, { passive: true });
    element.addEventListener("wheel", stop, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      positions.set(key, element.scrollTop);
      element.removeEventListener("scroll", save);
      element.removeEventListener("touchstart", stop);
      element.removeEventListener("wheel", stop);
    };
  }, [ref]);
}
