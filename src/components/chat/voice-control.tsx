"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronUp, Lock, Mic, SendHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { VoiceRecording } from "@/hooks/use-media-sender";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";
import { vibrate } from "@/lib/client-utils";
import { formatDuration } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const CANCEL_DISTANCE = 110; // px towards the inline start
const LOCK_DISTANCE = 80; // px upwards
const TAP_MS = 300;

// Mic button for the composer (shown when the textarea is empty):
// press and hold to record, release to send, slide towards the inline start
// to cancel, slide up to lock (hands-free, with "Cancel" / "Send").
// Renders the recording bar over the composer row (its parent is `relative`).
export function VoiceControl({ onSend }: { onSend: (recording: VoiceRecording) => void }) {
  const recorder = useVoiceRecorder(onSend);
  const [drag, setDrag] = useState({ towardStart: 0, up: 0 });
  const [locked, setLocked] = useState(false);
  const gesture = useRef<{ x: number; y: number; at: number; sign: number; done: boolean } | null>(null);
  const active = recorder.state !== "idle";

  function finish(send: boolean) {
    recorder.stop(send);
    gesture.current = null;
    setLocked(false);
    setDrag({ towardStart: 0, up: 0 });
  }

  return (
    <>
      {active && (
        <div className="absolute inset-y-0 start-0 end-14 z-10 flex animate-in items-center gap-3 overflow-hidden bg-background ps-3 fade-in-0 duration-150">
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="w-12 shrink-0 text-sm font-medium tabular-nums" aria-live="off">
            {formatDuration(recorder.elapsed)}
          </span>
          <span dir="ltr" aria-hidden className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden">
            {recorder.levels.map((level, index) => (
              <span key={index} className="w-[3px] shrink-0 rounded-full bg-red-500/70" style={{ height: `${Math.max(10, level * 100)}%` }} />
            ))}
          </span>
          {locked ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => finish(false)}
              className="h-11 shrink-0 gap-1.5 rounded-full px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Cancel
            </Button>
          ) : (
            <span
              className="flex shrink-0 items-center gap-1 pe-2 text-sm text-muted-foreground transition-opacity"
              style={{ opacity: 1 - drag.towardStart / CANCEL_DISTANCE }}
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
              Slide to cancel
            </span>
          )}
        </div>
      )}

      {active && !locked && (
        <span
          aria-hidden
          className="absolute end-2 bottom-16 z-10 flex flex-col items-center gap-0.5 rounded-full border bg-background px-2 py-2 text-muted-foreground shadow-md"
          style={{ transform: `translateY(${-Math.min(drag.up, LOCK_DISTANCE) / 2}px)` }}
        >
          <Lock className="size-4" />
          <ChevronUp className="size-4 animate-bounce" />
        </span>
      )}

      {locked ? (
        <Button
          type="button"
          size="icon-lg"
          aria-label="Send voice message"
          onClick={() => finish(true)}
          className="relative z-10 size-11 shrink-0 rounded-full"
        >
          <SendHorizontal className="size-5 rtl:-scale-x-100" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon-lg"
          aria-label="Record voice message (hold)"
          className={cn(
            "relative z-10 size-11 shrink-0 touch-none rounded-full transition-transform select-none",
            active && "scale-125 bg-red-500 text-white hover:bg-red-500",
          )}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
            gesture.current = { x: event.clientX, y: event.clientY, at: performance.now(), sign: rtl ? 1 : -1, done: false };
            void recorder.start();
          }}
          onPointerMove={(event) => {
            const current = gesture.current;
            if (!current || current.done) return;
            const towardStart = Math.max(0, (event.clientX - current.x) * current.sign);
            const up = Math.max(0, current.y - event.clientY);
            setDrag({ towardStart, up });
            if (towardStart > CANCEL_DISTANCE) {
              current.done = true;
              vibrate(10);
              finish(false);
            } else if (up > LOCK_DISTANCE) {
              current.done = true;
              vibrate(10);
              setLocked(true);
              setDrag({ towardStart: 0, up: 0 });
            }
          }}
          onPointerUp={() => {
            const current = gesture.current;
            if (!current || current.done) return;
            if (performance.now() - current.at < TAP_MS) {
              finish(false);
              toast.info("Hold the button to record");
              return;
            }
            finish(true);
          }}
          onPointerCancel={() => {
            if (gesture.current && !gesture.current.done) finish(false);
          }}
        >
          <Mic className="size-5" />
        </Button>
      )}
    </>
  );
}
