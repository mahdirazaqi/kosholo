"use client";

import { useRef, useSyncExternalStore } from "react";
import { Loader2, Pause, Play, X } from "lucide-react";
import { audioManager } from "@/lib/media/client/audio-manager";
import { formatDuration } from "@/lib/format-date";
import type { ChatMessage } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

const RATE_LABEL: Record<number, string> = { 1: "۱x", 1.5: "۱٫۵x", 2: "۲x" };

// Voice bubble: play/pause, waveform bars that double as the seek bar,
// current time / length and a speed toggle. Playback goes through the global
// audio manager, so only one voice plays at a time.
export function VoiceMedia({
  message,
  isMine,
  onCancel,
}: {
  message: ChatMessage;
  isMine: boolean;
  onCancel: () => void;
}) {
  const media = message.media!;
  const audio = useSyncExternalStore(audioManager.subscribe, audioManager.getState, audioManager.getServerState);
  const active = audio.src === media.url;
  const duration = (active && audio.duration) || media.duration || 0;
  const position = active ? audio.currentTime : 0;
  const progress = duration ? Math.min(1, position / duration) : 0;
  const bars = media.waveform ?? Array(48).fill(0.15);
  const barsRef = useRef<HTMLDivElement>(null);

  function seekFromPointer(clientX: number) {
    const rect = barsRef.current?.getBoundingClientRect();
    if (!rect || !duration) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    audioManager.seek(media.url, fraction * duration);
  }

  const uploading = message.local !== undefined;

  return (
    <div className="flex w-60 max-w-full items-center gap-2 py-0.5">
      {uploading ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label="لغو ارسال"
          className={cn(
            "relative flex size-11 shrink-0 items-center justify-center rounded-full",
            isMine ? "bg-primary-foreground/20" : "bg-primary/10 text-primary",
          )}
        >
          <Loader2 className="absolute size-11 animate-spin opacity-60" strokeWidth={1.5} />
          <X className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (active && audio.playing ? audioManager.pause() : audioManager.play(media.url))}
          aria-label={active && audio.playing ? "توقف" : "پخش پیام صوتی"}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            isMine ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground",
          )}
        >
          {active && audio.playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 translate-x-px fill-current" />
          )}
        </button>
      )}

      <div className="min-w-0 flex-1">
        {/* Timeline runs left→right like every media player. */}
        <div
          ref={barsRef}
          dir="ltr"
          role="slider"
          aria-label="موقعیت پخش"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(position)}
          tabIndex={uploading ? -1 : 0}
          onPointerDown={(event) => {
            if (uploading) return;
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFromPointer(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event.clientX);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") audioManager.seek(media.url, Math.min(duration, position + 5));
            if (event.key === "ArrowLeft") audioManager.seek(media.url, Math.max(0, position - 5));
          }}
          className="flex h-8 touch-none cursor-pointer items-center gap-[2px]"
        >
          {bars.map((value, index) => (
            <span
              key={index}
              className={cn(
                "w-[3px] shrink-0 rounded-full transition-colors",
                index / bars.length < progress
                  ? isMine
                    ? "bg-primary-foreground"
                    : "bg-primary"
                  : isMine
                    ? "bg-primary-foreground/40"
                    : "bg-foreground/25",
              )}
              style={{ height: `${Math.max(12, value * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] leading-4 opacity-80">
          <span className="tabular-nums">
            {active && (audio.playing || position > 0) ? formatDuration(position) : formatDuration(duration)}
          </span>
          {active && (
            <button
              type="button"
              onClick={() => audioManager.cycleRate()}
              aria-label="سرعت پخش"
              className="rounded-full bg-current/15 px-1.5 font-semibold"
            >
              {RATE_LABEL[audio.rate]}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
