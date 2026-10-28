"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const EDGE_PX = 20; // the grab zone at the inline-start edge
const OPEN_FRACTION = 0.3; // dragged this far (of the width) = go back
const FLICK_VELOCITY = 0.5; // px/ms

// iOS standalone PWAs have no back gesture: on phones, a swipe from the
// inline-start edge drags the page along with the finger (with a shadow) and
// goes back past ~30% of the width or on a fast flick; otherwise it springs
// back. The strip is only 20px wide and `touch-action: none`, so it never
// competes with swipe-to-reply on bubbles (that starts inside the page).
export function EdgeSwipeBack() {
  const router = useRouter();
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const zone = strip.current;
    const shell = zone?.closest<HTMLElement>("[data-swipe-shell]");
    if (!zone || !shell) return;
    const phone = window.matchMedia("(max-width: 767px)");
    const rtl = () => getComputedStyle(shell).direction === "rtl";
    let gesture: { x: number; y: number; time: number; id: number; dragging: boolean } | null = null;

    const reset = () => {
      shell.style.transition = "transform 180ms ease-out, box-shadow 180ms ease-out";
      shell.style.transform = "";
      shell.style.boxShadow = "";
    };

    const onDown = (event: PointerEvent) => {
      if (!phone.matches || event.pointerType === "mouse") return;
      if (document.querySelector('[role="dialog"], .yarl__root')) return; // a layer is open: back closes that
      zone.setPointerCapture(event.pointerId);
      gesture = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId, dragging: false };
    };
    const onMove = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const sign = rtl() ? -1 : 1;
      const dx = (event.clientX - gesture.x) * sign;
      const dy = event.clientY - gesture.y;
      if (!gesture.dragging) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return void (gesture = null); // a vertical scroll
        if (dx < 8) return;
        gesture.dragging = true;
        shell.style.transition = "none";
        shell.style.boxShadow = "0 0 24px rgb(0 0 0 / 0.25)";
      }
      shell.style.transform = `translateX(${Math.max(0, dx) * sign}px)`;
    };
    const onUp = (event: PointerEvent) => {
      const current = gesture;
      gesture = null;
      if (!current?.dragging) return;
      const sign = rtl() ? -1 : 1;
      const dx = Math.max(0, (event.clientX - current.x) * sign);
      const velocity = dx / Math.max(event.timeStamp - current.time, 1);
      if (dx > shell.offsetWidth * OPEN_FRACTION || velocity > FLICK_VELOCITY) {
        shell.style.transition = "transform 180ms ease-out";
        shell.style.transform = `translateX(${100 * sign}%)`;
        setTimeout(() => (window.history.length > 1 ? router.back() : router.push("/")), 170);
        // If the route doesn't change (e.g. blocked), don't stay off-screen.
        setTimeout(() => shell.isConnected && reset(), 1200);
      } else {
        reset();
      }
    };
    const onCancel = () => {
      if (gesture?.dragging) reset();
      gesture = null;
    };

    zone.addEventListener("pointerdown", onDown);
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerup", onUp);
    zone.addEventListener("pointercancel", onCancel);
    return () => {
      zone.removeEventListener("pointerdown", onDown);
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerup", onUp);
      zone.removeEventListener("pointercancel", onCancel);
    };
  }, [router]);

  return (
    <div
      ref={strip}
      aria-hidden
      style={{ width: EDGE_PX }}
      className="absolute inset-y-0 start-0 z-40 touch-none md:hidden"
    />
  );
}
