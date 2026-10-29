"use client";

import { useSyncExternalStore } from "react";
import { Loader2, Pause, Play, X } from "lucide-react";
import { Waveform } from "@/components/chat/media/waveform";
import { audioManager } from "@/lib/media/client/audio-manager";
import { markPlayed, useIsUnplayed } from "@/lib/media/client/played";
import { formatDuration } from "@/lib/format-date";
import type { ChatMessage } from "@/lib/types/chat";
import { cn } from "@/lib/utils";

const RATE_LABEL: Record<number, string> = { 1: "1x", 1.5: "1.5x", 2: "2x" };

// Telegram-like width: grows with the length up to 30 s, then stays at the max.
// The bubble's own max width (85% of the row) still wins on narrow screens.
const MIN_WIDTH = 200;
const MAX_WIDTH = 320;
const FULL_WIDTH_SECONDS = 30;
const voiceWidth = (seconds: number) =>
  Math.round(MIN_WIDTH + Math.min(1, seconds / FULL_WIDTH_SECONDS) * (MAX_WIDTH - MIN_WIDTH));

function usePlayback(message: ChatMessage) {
  const media = message.media!;
  const audio = useSyncExternalStore(audioManager.subscribe, audioManager.getState, audioManager.getServerState);
  const active = audio.src === media.url;
  const duration = (active && audio.duration) || media.duration || 0;
  const position = active ? audio.currentTime : 0;
  return {
    audio,
    active,
    playing: active && audio.playing,
    loading: active && audio.loading,
    duration,
    position,
    progress: duration ? Math.min(1, position / duration) : 0,
    started: active && (audio.playing || position > 0),
  };
}

// Row 1 of a voice bubble: play/pause + waveform. Row 2 (duration, speed) is
// `VoiceMeta`, rendered in the bubble's footer line next to the time.
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
  const { audio, active, playing, loading, duration, position, progress } = usePlayback(message);
  const uploading = message.local !== undefined;
  // `link` is the contrast-checked accent on both bubbles (primary fails on bright themes).
  const buttonClass = cn(
    "relative flex size-11 shrink-0 items-center justify-center rounded-full bg-link",
    isMine ? "text-bubble-out" : "text-bubble-in",
  );

  function play() {
    if (!isMine) markPlayed(message.id);
    void audioManager.play(media.url);
  }
  function seek(fraction: number) {
    if (!duration) return;
    if (!isMine) markPlayed(message.id);
    audioManager.seek(media.url, fraction * duration);
  }

  return (
    <div className="flex items-center gap-2 py-0.5" style={{ width: voiceWidth(media.duration ?? 0), maxWidth: "100%" }}>
      {uploading ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel sending"
          className={buttonClass}
        >
          <Loader2 className="absolute size-12 text-link motion-safe:animate-spin" strokeWidth={1.5} />
          <X className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => (playing ? audioManager.pause() : play())}
          aria-label={playing ? "Pause" : "Play voice message"}
          className={buttonClass}
        >
          {loading && (
            <Loader2
              aria-hidden
              className="absolute size-[3.25rem] text-link motion-safe:animate-spin"
              strokeWidth={1.25}
            />
          )}
          {playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 translate-x-px fill-current rtl:-translate-x-px" />
          )}
        </button>
      )}

      <Waveform
        values={media.waveform}
        progress={progress}
        onSeek={seek}
        onStep={(seconds) =>
          audioManager.seek(media.url, Math.min(duration, Math.max(0, (active ? audio.currentTime : 0) + seconds)))
        }
        disabled={uploading}
        playedClass={isMine ? "text-bubble-out-foreground" : "text-link"}
        restClass={isMine ? "text-bubble-out-meta/40" : "text-bubble-in-meta/40"}
        label="Playback position"
        valueNow={Math.round(position)}
        valueMax={Math.round(duration)}
      />
    </div>
  );
}

// Left side of the footer line: unplayed dot, duration (position / total
// while playing) and the speed toggle once playback has started.
export function VoiceMeta({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const { duration, position, started } = usePlayback(message);
  const unplayed = useIsUnplayed(message.id, !isMine && message.status === "sent");
  return (
    <span className="me-auto flex min-w-0 items-center gap-1.5">
      <span className="truncate tabular-nums" dir="ltr">
        {started ? `${formatDuration(position)} / ${formatDuration(duration)}` : formatDuration(duration)}
      </span>
      {unplayed && <span aria-label="Not played yet" className="size-2 shrink-0 rounded-full bg-link" />}
      {started && <SpeedToggle isMine={isMine} />}
    </span>
  );
}

function SpeedToggle({ isMine }: { isMine: boolean }) {
  const rate = useSyncExternalStore(
    audioManager.subscribe,
    () => audioManager.getState().rate,
    () => 1,
  );
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        audioManager.cycleRate();
      }}
      aria-label="Playback speed"
      className={cn(
        "rounded-full px-1.5 text-[length:inherit] font-semibold leading-4",
        isMine ? "bg-bubble-out-foreground/15" : "bg-bubble-in-meta/15",
      )}
    >
      {RATE_LABEL[rate]}
    </button>
  );
}
