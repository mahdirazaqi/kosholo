"use client";

import { Play } from "lucide-react";
import { MediaFrame } from "@/components/chat/media/media-frame";
import { UploadProgress } from "@/components/chat/media/upload-progress";
import { formatDuration } from "@/lib/format-date";
import type { ChatMessage } from "@/lib/types/chat";

export function VideoMedia({
  message,
  overlay,
  onOpen,
  onCancel,
}: {
  message: ChatMessage;
  overlay?: React.ReactNode;
  onOpen: () => void;
  onCancel: () => void;
}) {
  const media = message.media!;
  const local = message.local !== undefined;

  return (
    <MediaFrame
      width={media.width}
      height={media.height}
      placeholder={media.placeholder}
      src={local ? null : media.thumbUrl}
      alt="ویدیو"
    >
      {local && (
        // Optimistic bubble: the local file's first frame as the poster.
        <video src={`${media.url}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
      )}
      {media.duration !== null && (
        <span className="absolute start-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {formatDuration(media.duration)}
        </span>
      )}
      {message.local ? (
        <UploadProgress upload={message.local} onCancel={onCancel} />
      ) : (
        <button
          type="button"
          aria-label="پخش ویدیو"
          onClick={onOpen}
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            {/* Playback icons keep their LTR direction (universal media convention). */}
            <Play className="size-6 translate-x-px fill-current" />
          </span>
        </button>
      )}
      {overlay}
    </MediaFrame>
  );
}
