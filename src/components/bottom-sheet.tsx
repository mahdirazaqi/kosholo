"use client";

import { useRef } from "react";
import { SheetContent } from "@/components/ui/sheet";
import { closeWithEscape } from "@/lib/back-stack";
import { cn } from "@/lib/utils";

const DISMISS_DISTANCE = 100; // px dragged down
const DISMISS_VELOCITY = 0.6; // px/ms flick

// Bottom sheet sized to the app column (centered on desktop), with a grab
// handle: drag it down to dismiss (a flick works too), like a native sheet.
export function BottomSheetContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof SheetContent>, "side">) {
  return (
    <SheetContent
      side="bottom"
      className={cn("mx-auto max-h-[90dvh] w-full max-w-md gap-2 overflow-y-auto rounded-t-3xl", className)}
      {...props}
    >
      <SheetHandle />
      {children}
    </SheetContent>
  );
}

function SheetHandle() {
  const drag = useRef<{ startY: number; startTime: number; sheet: HTMLElement } | null>(null);

  function reset(sheet: HTMLElement) {
    sheet.style.transition = "transform 160ms ease-out";
    sheet.style.transform = "";
  }

  return (
    <div
      aria-hidden
      className="mx-auto flex h-7 w-28 shrink-0 touch-none items-start justify-center pt-2.5"
      onPointerDown={(event) => {
        const sheet = event.currentTarget.closest<HTMLElement>('[data-slot="sheet-content"]');
        if (!sheet) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startY: event.clientY, startTime: event.timeStamp, sheet };
        sheet.style.transition = "none";
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const dy = Math.max(0, event.clientY - current.startY);
        current.sheet.style.transform = `translateY(${dy}px)`;
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        drag.current = null;
        if (!current) return;
        const dy = Math.max(0, event.clientY - current.startY);
        const velocity = dy / Math.max(event.timeStamp - current.startTime, 1);
        if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) {
          current.sheet.style.transition = "transform 150ms ease-in";
          current.sheet.style.transform = "translateY(100%)";
          closeWithEscape();
        } else {
          reset(current.sheet);
        }
      }}
      onPointerCancel={() => {
        if (drag.current) reset(drag.current.sheet);
        drag.current = null;
      }}
    >
      <span className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
    </div>
  );
}
