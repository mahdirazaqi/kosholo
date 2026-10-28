"use client";

import { useEffect, useRef, useState } from "react";
import { avatarTint } from "@/lib/colors";
import type { ProfilePhotoItem } from "@/lib/types/profile";
import { cn } from "@/lib/utils";

const TAP_SLOP = 8; // px: less than this is a tap, not a swipe
const SWIPE_FRACTION = 0.25; // of the width: dragged this far changes the photo
const FLICK_VELOCITY = 0.4; // px/ms
const MAX_SEGMENTS = 10;
const BAR_HEIGHT = 64; // px that stay pinned when the header collapses

function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join("‌");
}

// Telegram-style profile header: a big square-ish photo with the name and
// status over a gradient. 2+ photos: segmented bars on top; tap the inline-end
// third for the next photo, the inline-start third for the previous one (the
// center opens the full-screen viewer); a horizontal swipe follows the finger.
// Scrolling the page collapses it (sticky) into a slim bar with the name.
export function ProfilePhotoHeader({
  photos,
  user,
  subtitle,
  stickyTop,
  onOpenViewer,
}: {
  photos: ProfilePhotoItem[];
  user: { id: string; name: string };
  subtitle?: React.ReactNode;
  stickyTop: string; // CSS length where the collapsed bar pins (below the page header)
  onOpenViewer: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [height, setHeight] = useState(0);
  const drag = useRef<{ x: number; y: number; time: number; id: number; moved: boolean } | null>(null);

  const count = photos.length;
  const current = Math.min(index, Math.max(count - 1, 0));
  const photo = photos[current];
  const prev = photos[(current - 1 + count) % count];
  const next = photos[(current + 1) % count];

  // Collapse: the header is sticky with a negative top, so only its bottom bar
  // stays pinned. --p (0 → 1) is the scroll progress over the collapsing
  // distance and drives the cross-fades (gradient → solid bar, bars fade out).
  useEffect(() => {
    const element = root.current;
    const scroller = element?.closest<HTMLElement>(".overflow-y-auto");
    if (!element || !scroller) return;
    const update = () => {
      setHeight(element.offsetHeight);
      const span = Math.max(element.offsetHeight - BAR_HEIGHT, 1);
      element.style.setProperty("--p", String(Math.min(1, Math.max(0, scroller.scrollTop / span))));
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [count]);

  // The app is LTR today; this keeps the gestures right if the direction ever flips.
  const isRtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  function go(delta: number) {
    if (count > 1) setIndex((current + delta + count) % count);
  }

  // direction: +1 = towards the next photo. The strip is physically LTR: the
  // next slide is on the right (LTR) or on the left (RTL).
  function commit(direction: 1 | -1) {
    const width = root.current?.offsetWidth ?? 0;
    setAnimating(true);
    setOffset(direction * width * (isRtl ? 1 : -1));
    setTimeout(() => {
      setIndex((current + direction + count) % count);
      setAnimating(false);
      setOffset(0);
    }, 200);
  }

  const segments = Math.min(count, MAX_SEGMENTS);
  const activeSegment = count <= MAX_SEGMENTS ? current : Math.floor((current * MAX_SEGMENTS) / count);

  const slide = (item: ProfilePhotoItem | undefined, key: string) => (
    <div
      key={key}
      className="relative h-full w-full shrink-0 overflow-hidden"
      style={item?.placeholder ? { backgroundImage: `url(${item.placeholder})`, backgroundSize: "cover" } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {item && <img draggable={false} src={item.mediumUrl} alt="" className="absolute inset-0 size-full object-cover" />}
    </div>
  );

  return (
    <div
      ref={root}
      style={{ top: `calc(${stickyTop} - ${Math.max(height - BAR_HEIGHT, 0)}px)`, "--p": 0 } as React.CSSProperties}
      className="sticky z-10 aspect-square max-h-[60dvh] w-full overflow-hidden bg-muted"
    >
      {photo ? (
        <div
          dir="ltr"
          className="absolute inset-0 touch-pan-y"
          onPointerDown={(event) => {
            if (animating) return;
            drag.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const gesture = drag.current;
            if (!gesture || gesture.id !== event.pointerId) return;
            const dx = event.clientX - gesture.x;
            if (!gesture.moved) {
              if (count < 2 || Math.abs(dx) < TAP_SLOP || Math.abs(dx) < Math.abs(event.clientY - gesture.y)) return;
              gesture.moved = true;
            }
            setOffset(dx);
          }}
          onPointerUp={(event) => {
            const gesture = drag.current;
            drag.current = null;
            if (!gesture) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (!gesture.moved) {
              // A tap: the inline-end third → next, the inline-start third → previous, else the viewer.
              const zone = (event.clientX - bounds.left) / bounds.width;
              const atEnd = isRtl ? zone < 1 / 3 : zone > 2 / 3;
              const atStart = isRtl ? zone > 2 / 3 : zone < 1 / 3;
              if (count > 1 && atEnd) go(1);
              else if (count > 1 && atStart) go(-1);
              else onOpenViewer(current);
              return;
            }
            const dx = event.clientX - gesture.x;
            const velocity = Math.abs(dx) / Math.max(event.timeStamp - gesture.time, 1);
            if (Math.abs(dx) > bounds.width * SWIPE_FRACTION || velocity > FLICK_VELOCITY) {
              // Dragging right reveals the left slide: the previous photo in LTR, the next in RTL.
              commit(dx > 0 ? (isRtl ? 1 : -1) : isRtl ? -1 : 1);
            } else {
              setAnimating(true);
              setOffset(0);
              setTimeout(() => setAnimating(false), 200);
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
            setOffset(0);
          }}
        >
          <div
            className={cn("flex h-full", animating && "transition-transform duration-200 ease-out")}
            style={{
              width: count > 1 ? "300%" : "100%",
              transform: count > 1 ? `translateX(calc(-33.3333% + ${offset}px))` : undefined,
            }}
          >
            {count > 1
              ? (isRtl ? [next, photo, prev] : [prev, photo, next]).map((item, i) => slide(item, `${item?.id}-${i}`))
              : slide(photo, photo.id)}
          </div>
        </div>
      ) : (
        <div className={cn("absolute inset-0 flex items-center justify-center text-8xl font-bold", avatarTint(user.id))}>
          {initialsOf(user.name)}
        </div>
      )}

      {count > 1 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 flex gap-1 px-3 pt-2"
          style={{ opacity: "calc(1 - var(--p) * 3)" }}
        >
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className={cn("h-0.5 flex-1 rounded-full", i === activeSegment ? "bg-white" : "bg-white/40")} />
          ))}
        </div>
      )}

      {/* Name and status over a gradient that turns into a solid bar when collapsed. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: BAR_HEIGHT * 2 }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" style={{ opacity: "calc(1 - var(--p))" }} />
        <div className="absolute inset-x-0 bottom-0 bg-background" style={{ height: BAR_HEIGHT, opacity: "var(--p)" }} />
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col justify-center px-4"
          style={{ height: BAR_HEIGHT, color: "color-mix(in oklab, white calc((1 - var(--p)) * 100%), var(--foreground))" }}
        >
          <p dir="auto" className="truncate text-xl leading-tight font-bold">
            {user.name}
          </p>
          {subtitle && <p className="truncate text-sm opacity-80">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}
