"use client";

import { useSyncExternalStore } from "react";
import { Download, Pause, Play, RotateCw, X } from "lucide-react";
import { shortFileName } from "@/components/chat/message-preview";
import { audioManager } from "@/lib/media/client/audio-manager";
import { formatBytes, formatNumber } from "@/lib/numbers";
import { useInstallState } from "@/lib/pwa/install";
import type { ChatMessage, LocalUpload } from "@/lib/types/chat";
import { canPlayAudio, FILE_KIND_STYLE, fileKind } from "@/lib/upload/file-kind";
import { cn } from "@/lib/utils";

const noop = () => () => {};

// FILE bubble: a type icon (or the image thumbnail), the name, the size and a
// download link. Bytes are served exactly as uploaded, always as a download
// (/api/media sends Content-Disposition: attachment). While uploading the icon
// becomes a progress ring with cancel; a paused upload offers "Resume".
export function FileMedia({
  message,
  isMine,
  onCancel,
  onResume,
}: {
  message: ChatMessage;
  isMine: boolean;
  onCancel: () => void;
  onResume: () => void;
}) {
  const media = message.media!;
  const name = media.originalName || "File";
  const kind = fileKind(media.mime, name);
  const { icon: Icon, className: tone } = FILE_KIND_STYLE[kind];
  const local = message.local;
  const ready = message.status === "sent" && media.url !== "";

  const { standalone, ios } = useInstallState();
  // Client-only checks (no hydration mismatch): playable audio.
  const playable = useSyncExternalStore(noop, () => kind === "audio" && canPlayAudio(media.mime), () => false);
  const audio = useSyncExternalStore(audioManager.subscribe, audioManager.getState, audioManager.getServerState);
  const playing = playable && audio.src === media.url && audio.playing;

  return (
    <div className="flex w-72 max-w-full items-center gap-3 py-1">
      <div className="relative size-12 shrink-0">
        {media.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img draggable={false} src={media.thumbUrl} alt="" loading="lazy" className="size-12 rounded-xl object-cover" />
        ) : (
          <span className={cn("flex size-12 items-center justify-center rounded-xl", tone)}>
            <Icon className="size-6" />
          </span>
        )}

        {local && local.phase !== "paused" && <ProgressRing local={local} onCancel={onCancel} />}
        {local?.phase === "paused" && (
          <button
            type="button"
            onClick={onResume}
            aria-label="Resume upload"
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-viewer/45 text-overlay-foreground"
          >
            <RotateCw className="size-5" />
          </button>
        )}
        {!local && ready && playable && (
          <button
            type="button"
            onClick={() => (playing ? audioManager.pause() : void audioManager.play(media.url))}
            aria-label={playing ? "Pause" : "Play"}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-viewer/25 text-overlay-foreground"
          >
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p dir="auto" title={name} className="truncate text-sm font-medium">
          {shortFileName(name, 32)}
        </p>
        <p className={cn("truncate text-xs", isMine ? "text-bubble-out-meta" : "text-bubble-in-meta")}>
          <Status local={local} size={media.size} onCancel={onCancel} />
        </p>
      </div>

      {ready && !local && (
        <a
          href={media.url}
          download={name}
          // iOS home-screen apps have no download UI: a new tab shows the
          // system viewer / share sheet instead.
          {...(standalone && ios ? { target: "_blank", rel: "noopener" } : {})}
          aria-label={`Download ${name}`}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
            isMine ? "hover:bg-bubble-out-foreground/15" : "text-link hover:bg-primary/10",
          )}
        >
          <Download className="size-5" />
        </a>
      )}
    </div>
  );
}

function Status({ local, size, onCancel }: { local: LocalUpload | undefined; size: number; onCancel: () => void }) {
  if (!local) return <>{formatBytes(size)}</>;
  const total = local.total ?? size;
  const sent = local.sent ?? Math.round(local.progress * total);
  switch (local.phase) {
    case "waiting":
      return <>Waiting for connection… {formatNumber(Math.floor(local.progress * 100))}%</>;
    case "paused":
      return (
        <>
          Upload paused · {formatBytes(sent)} of {formatBytes(total)} ·{" "}
          <button type="button" onClick={onCancel} className="underline underline-offset-2">
            Cancel
          </button>
        </>
      );
    case "processing":
      return <>Finishing…</>;
    default:
      return (
        <>
          Uploading {formatNumber(Math.floor(local.progress * 100))}% · {formatBytes(sent)} of {formatBytes(total)}
        </>
      );
  }
}

function ProgressRing({ local, onCancel }: { local: LocalUpload; onCancel: () => void }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const spinning = local.phase === "processing" || local.phase === "waiting";
  return (
    <button
      type="button"
      onClick={onCancel}
      aria-label="Cancel upload"
      className="absolute inset-0 flex items-center justify-center rounded-xl bg-viewer/45 text-overlay-foreground"
    >
      <svg viewBox="0 0 44 44" className={cn("absolute inset-0.5", spinning ? "animate-spin" : "-rotate-90")}>
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
        <circle
          cx="22"
          cy="22"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={spinning ? circumference * 0.7 : circumference * (1 - Math.max(0.03, local.progress))}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
      <X className="size-4" />
    </button>
  );
}
